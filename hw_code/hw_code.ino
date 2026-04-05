#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>

// ---------------- WIFI ----------------
const char *ssid = "SM";
const char *password = "vdus7030";
const char *serverBaseUrl = "http://192.168.124.215:5000";
const char *predictUrl = "http://192.168.124.215:5000/predict";
const char *heartbeatUrl = "http://192.168.124.215:5000/device/heartbeat";

// ---------------- PINS ----------------
#define TRIG 13
#define ECHO_FRONT 12
#define ECHO_BIN 14
#define SERVO_PIN 15

Servo myServo;
bool detected = false;
unsigned long lastHeartbeatSentAt = 0;
long lastValidBinDistance = -1;
int currentServoAngle = 90;

const unsigned long HEARTBEAT_INTERVAL_MS = 150000UL;
const float BIN_EMPTY_DISTANCE_CM = 10.5F;
const float BIN_FULL_DISTANCE_CM = 2.0F;
const float FRONT_OBJECT_DETECTED_CM = 4.5F;
const float FRONT_CLEAR_CM = 5.5F;
const int SERVO_LEFT_ANGLE = 20;
const int SERVO_CENTER_ANGLE = 90;
const int SERVO_RIGHT_ANGLE = 160;
const int SERVO_STEP_DELAY_MS = 18;
const int SERVO_STEP_SIZE = 2;

// ---------------- CAMERA PINS ----------------
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27

#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

// ---------------- DISTANCE FUNCTION ----------------
long getDistance(int echoPin)
{
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);

  if (duration == 0)
    return -1;

  return duration * 0.034 / 2;
}

int calculateBinFillPercent(long distanceCm)
{
  if (distanceCm <= 0)
  {
    return -1;
  }

  float ratio = (BIN_EMPTY_DISTANCE_CM - distanceCm) / (BIN_EMPTY_DISTANCE_CM - BIN_FULL_DISTANCE_CM);

  if (ratio < 0.0F)
  {
    ratio = 0.0F;
  }

  if (ratio > 1.0F)
  {
    ratio = 1.0F;
  }

  return (int)(ratio * 100.0F + 0.5F);
}

String buildDeviceStatus(bool wifiConnected, long binDistanceCm, int fillPercent)
{
  if (!wifiConnected)
  {
    return "wifi_disconnected";
  }

  if (binDistanceCm <= 0 || fillPercent < 0)
  {
    return "sensor_unavailable";
  }

  if (fillPercent >= 90)
  {
    return "bin_full";
  }

  if (fillPercent >= 65)
  {
    return "bin_high";
  }

  return "ready";
}

void sendHeartbeat(String deviceStatus, long binDistanceCm, int fillPercent)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("Heartbeat skipped: WiFi disconnected");
    return;
  }

  HTTPClient http;
  http.begin(heartbeatUrl);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"device_status\":\"" + deviceStatus + "\",";
  payload += "\"wifi_connected\":true,";
  payload += "\"bin_distance_cm\":" + String(binDistanceCm) + ",";
  payload += "\"bin_fill_percent\":" + String(fillPercent);
  payload += "}";

  int response = http.POST(payload);

  Serial.print("Heartbeat response: ");
  Serial.println(response);

  if (response > 0)
  {
    Serial.println(http.getString());
  }
  else
  {
    Serial.println("Heartbeat POST failed");
  }

  http.end();
}

void moveServoSmoothly(int targetAngle)
{
  targetAngle = constrain(targetAngle, 0, 180);

  if (targetAngle == currentServoAngle)
  {
    return;
  }

  int stepDirection = targetAngle > currentServoAngle ? SERVO_STEP_SIZE : -SERVO_STEP_SIZE;

  while ((stepDirection > 0 && currentServoAngle < targetAngle) ||
         (stepDirection < 0 && currentServoAngle > targetAngle))
  {
    currentServoAngle += stepDirection;

    if ((stepDirection > 0 && currentServoAngle > targetAngle) ||
        (stepDirection < 0 && currentServoAngle < targetAngle))
    {
      currentServoAngle = targetAngle;
    }

    myServo.write(currentServoAngle);
    delay(SERVO_STEP_DELAY_MS);
  }
}

// ---------------- CAMERA INIT ----------------
void initCamera()
{
  camera_config_t config;

  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

  if (esp_camera_init(&config) != ESP_OK)
  {
    Serial.println("Camera init failed");
    while (true)
      ;
  }
}

// ---------------- SEND IMAGE ----------------
String sendImage()
{
  // flush old frames
  for (int i = 0; i < 2; i++)
  {
    camera_fb_t *tmp = esp_camera_fb_get();
    if (tmp)
      esp_camera_fb_return(tmp);
  }

  delay(300);

  camera_fb_t *fb = esp_camera_fb_get();

  if (!fb)
  {
    Serial.println("Camera capture failed");
    return "unknown";
  }

  HTTPClient http;
  http.begin(predictUrl);
  http.addHeader("Content-Type", "application/octet-stream");

  Serial.println("Sending image...");

  int response = http.POST(fb->buf, fb->len);

  String result = "unknown";

  if (response > 0)
  {
    String payload = http.getString();

    Serial.println(payload);

    if (payload.indexOf("bio") >= 0)
      result = "bio";
    if (payload.indexOf("nonbio") >= 0)
      result = "nonbio";
  }
  else
  {
    Serial.println("HTTP failed");
  }

  http.end();
  esp_camera_fb_return(fb);

  return result;
}

// ---------------- SETUP ----------------
void setup()
{
  Serial.begin(115200);
  delay(2000);

  pinMode(TRIG, OUTPUT);
  pinMode(ECHO_FRONT, INPUT);
  pinMode(ECHO_BIN, INPUT);

  myServo.attach(SERVO_PIN);
  myServo.write(currentServoAngle);

  WiFi.begin(ssid, password);

  Serial.print("Connecting...");
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");

  initCamera();

  long initialBin = getDistance(ECHO_BIN);
  if (initialBin > 0)
  {
    lastValidBinDistance = initialBin;
  }

  long reportedBinDistance = lastValidBinDistance > 0 ? lastValidBinDistance : initialBin;
  int binFillPercent = calculateBinFillPercent(reportedBinDistance);
  String deviceStatus = buildDeviceStatus(WiFi.status() == WL_CONNECTED, reportedBinDistance, binFillPercent);
  sendHeartbeat(deviceStatus, reportedBinDistance, binFillPercent);
  lastHeartbeatSentAt = millis();
}

// ---------------- LOOP ----------------
void loop()
{
  long front = getDistance(ECHO_FRONT);
  delay(100); // IMPORTANT: avoid sensor interference
  long bin = getDistance(ECHO_BIN);
  if (bin > 0)
  {
    lastValidBinDistance = bin;
  }

  long reportedBinDistance = lastValidBinDistance > 0 ? lastValidBinDistance : bin;
  int binFillPercent = calculateBinFillPercent(reportedBinDistance);
  String deviceStatus = buildDeviceStatus(WiFi.status() == WL_CONNECTED, reportedBinDistance, binFillPercent);

  Serial.print("Front: ");
  Serial.print(front);
  Serial.print(" | Bin: ");
  Serial.print(bin);
  Serial.print(" | FrontState: ");
  if (front > 0 && front <= FRONT_OBJECT_DETECTED_CM)
  {
    Serial.print("object");
  }
  else if (front >= FRONT_CLEAR_CM)
  {
    Serial.print("clear");
  }
  else
  {
    Serial.print("transition");
  }
  Serial.print(" | Fill: ");
  if (binFillPercent >= 0)
  {
    Serial.print(binFillPercent);
    Serial.println("%");
  }
  else
  {
    Serial.println("unavailable");
  }

  // -------- OBJECT DETECTION --------
  if (front > 0 && front <= FRONT_OBJECT_DETECTED_CM && !detected)
  {
    detected = true;

    Serial.println("Object detected");

    delay(1000);

    String prediction = sendImage();

    Serial.println("Prediction: " + prediction);

    if (prediction == "bio")
    {
      Serial.println("BIO → LEFT");
      moveServoSmoothly(SERVO_LEFT_ANGLE);
    }
    else if (prediction == "nonbio")
    {
      Serial.println("NONBIO → RIGHT");
      moveServoSmoothly(SERVO_RIGHT_ANGLE);
    }

    delay(2000);
    moveServoSmoothly(SERVO_CENTER_ANGLE);
  }

  if (front < 0 || front >= FRONT_CLEAR_CM)
  {
    detected = false;
  }

  // -------- BIN LEVEL CHECK --------
  if (binFillPercent >= 90)
  {
    Serial.println("⚠️ BIN FULL");
  }

  if (millis() - lastHeartbeatSentAt >= HEARTBEAT_INTERVAL_MS)
  {
    sendHeartbeat(deviceStatus, reportedBinDistance, binFillPercent);
    lastHeartbeatSentAt = millis();
  }

  delay(2000);
}
