const demoFrames = [
  {
    image:
      "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1200&q=80",
    imageName: "frame-20260402-1042.jpg",
    result: "bio",
    confidence: 0.96,
    detail: "Organic waste detected. Servo routes left.",
    frontDistance: "11 cm",
    binDistance: "38 cm",
    servoPosition: "Left Gate",
    queueState: "Settled",
    statusText: "Detection Confirmed",
    timestamp: "2026-04-02 10:42:11",
  },
  {
    image:
      "https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?auto=format&fit=crop&w=1200&q=80",
    imageName: "frame-20260402-1045.jpg",
    result: "nonbio",
    confidence: 0.91,
    detail: "Plastic-like object detected. Servo routes right.",
    frontDistance: "9 cm",
    binDistance: "36 cm",
    servoPosition: "Right Gate",
    queueState: "Cycle Complete",
    statusText: "Routing to Nonbio",
    timestamp: "2026-04-02 10:45:39",
  },
  {
    image:
      "https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1200&q=80",
    imageName: "frame-20260402-1048.jpg",
    result: "bio",
    confidence: 0.88,
    detail: "Compostable material detected. Gate returned to neutral.",
    frontDistance: "13 cm",
    binDistance: "34 cm",
    servoPosition: "Neutral",
    queueState: "Awaiting Object",
    statusText: "Idle Monitoring",
    timestamp: "2026-04-02 10:48:04",
  },
];

const state = {
  frameIndex: 0,
  history: [],
};

const cameraImage = document.querySelector("#cameraImage");
const imageName = document.querySelector("#imageName");
const resultPill = document.querySelector("#resultPill");
const resultDetail = document.querySelector("#resultDetail");
const confidenceValue = document.querySelector("#confidenceValue");
const confidenceBar = document.querySelector("#confidenceBar");
const frontDistance = document.querySelector("#frontDistance");
const binDistance = document.querySelector("#binDistance");
const fillPercentage = document.querySelector("#fillPercentage");
const fillBar = document.querySelector("#fillBar");
const fillDetail = document.querySelector("#fillDetail");
const servoPosition = document.querySelector("#servoPosition");
const queueState = document.querySelector("#queueState");
const statusText = document.querySelector("#statusText");
const lastSync = document.querySelector("#lastSync");
const historyList = document.querySelector("#historyList");
const backendHealthValue = document.querySelector("#backendHealthValue");
const backendHealthDetail = document.querySelector("#backendHealthDetail");
const deviceHealthValue = document.querySelector("#deviceHealthValue");
const deviceHealthDetail = document.querySelector("#deviceHealthDetail");
const bufferCountValue = document.querySelector("#bufferCountValue");
const bufferCountDetail = document.querySelector("#bufferCountDetail");
const imageUpload = document.querySelector("#imageUpload");
const previewShell = document.querySelector("#previewShell");
const previewImage = document.querySelector("#previewImage");
const uploadStatus = document.querySelector("#uploadStatus");
const analyzeButton = document.querySelector("#analyzeButton");
const bootScreen = document.querySelector("#bootScreen");
const activityOverlay = document.querySelector("#activityOverlay");
const activityTitle = document.querySelector("#activityTitle");
const activityDetail = document.querySelector("#activityDetail");
const modalBackdrop = document.querySelector("#modalBackdrop");
const detailModal = document.querySelector("#detailModal");
const modalClose = document.querySelector("#modalClose");
const modalImage = document.querySelector("#modalImage");
const modalTitle = document.querySelector("#modalTitle");
const modalClass = document.querySelector("#modalClass");
const modalConfidence = document.querySelector("#modalConfidence");
const modalDetail = document.querySelector("#modalDetail");

let selectedFile = null;
document.body.classList.add("app-loading");

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractCentimeters(value) {
  const numeric = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function describeFillLevel(distanceText) {
  const distance = extractCentimeters(distanceText);

  if (distance === null) {
    return { percent: 0, detail: "Fill level unavailable.", color: "linear-gradient(90deg, #75e0bf, #84de96)" };
  }

  const emptyDistance = 40;
  const fullDistance = 5;
  const ratio = (emptyDistance - distance) / (emptyDistance - fullDistance);
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  if (percent >= 85) {
    return {
      percent,
      detail: "Bin is nearly full and should be emptied soon.",
      color: "linear-gradient(90deg, #ff9a52, #ff735b)",
    };
  }

  if (percent >= 55) {
    return {
      percent,
      detail: "Bin is over half full.",
      color: "linear-gradient(90deg, #ffb36a, #ffd36f)",
    };
  }

  return {
    percent,
    detail: "Bin has plenty of remaining space.",
    color: "linear-gradient(90deg, #75e0bf, #84de96)",
  };
}

function renderHistory() {
  historyList.innerHTML = "";

  if (state.history.length === 0) {
    const emptyState = document.createElement("article");
    emptyState.className = "history-item";
    emptyState.innerHTML = `
      <div></div>
      <div>
        <div class="history-name">No detections yet</div>
      </div>
      <div><span class="history-result">Waiting</span></div>
      <div class="history-score">--</div>
    `;
    historyList.appendChild(emptyState);
    return;
  }

  state.history.forEach((item) => {
    const row = document.createElement("article");
    row.className = "history-item";

    const resultClass = item.result === "nonbio" ? "history-result nonbio" : "history-result";

    row.innerHTML = `
      <img class="history-thumb" src="${item.image}" alt="${item.name}" />
      <div>
        <div class="history-name">${item.name}</div>
      </div>
      <div><span class="${resultClass}">${titleCase(item.result)}</span></div>
      <div class="history-score">${item.confidence}</div>
    `;
    row.addEventListener("click", () => openDetailModal(item));

    historyList.appendChild(row);
  });
}

function toHistoryItem(record) {
  return {
    name: record.saved_as,
    result: record.result,
    confidence: `${Math.round(Number(record.confidence || 0) * 100)}%`,
    image: `${getBaseUrl()}${record.received_url}`,
    detail: `Model returned ${String(record.result || "unknown").toUpperCase()} from label ${record.raw}.`,
  };
}

function setActivityState(title, detail) {
  activityTitle.textContent = title;
  activityDetail.textContent = detail;
}

function showActivity(title, detail) {
  setActivityState(title, detail);
  activityOverlay.classList.remove("hidden");
}

function hideActivity() {
  activityOverlay.classList.add("hidden");
}

function openDetailModal(item) {
  modalImage.src = item.image;
  modalTitle.textContent = item.name;
  modalClass.textContent = titleCase(item.result);
  modalConfidence.textContent = item.confidence;
  modalDetail.textContent = item.detail || "Saved detection preview from the recent detections log.";
  modalBackdrop.classList.remove("hidden");
  detailModal.classList.remove("hidden");
}

function closeDetailModal() {
  modalBackdrop.classList.add("hidden");
  detailModal.classList.add("hidden");
}

function renderFrame(frame) {
  cameraImage.src = frame.image;
  imageName.textContent = frame.imageName;
  resultPill.textContent = frame.result.toUpperCase();
  resultPill.className = frame.result === "nonbio" ? "result-pill nonbio" : "result-pill";
  resultDetail.textContent = frame.detail;
  confidenceValue.textContent = `${Math.round(frame.confidence * 100)}%`;
  confidenceBar.style.width = `${Math.round(frame.confidence * 100)}%`;
  confidenceBar.style.background =
    frame.result === "nonbio"
      ? "linear-gradient(90deg, #ff9a52, #f3c97b)"
      : "linear-gradient(90deg, #72d26d, #f3c97b)";

  frontDistance.textContent = frame.frontDistance;
  binDistance.textContent = frame.binDistance;
  const fillState = describeFillLevel(frame.binDistance);
  fillPercentage.textContent = `${fillState.percent}%`;
  fillBar.style.width = `${fillState.percent}%`;
  fillBar.style.background = fillState.color;
  fillDetail.textContent = fillState.detail;
  servoPosition.textContent = frame.servoPosition;
  queueState.textContent = frame.queueState;
  statusText.textContent = frame.statusText;
  lastSync.textContent = frame.timestamp;
}

function getBaseUrl() {
  if (window.location.origin && window.location.origin !== "null") {
    return window.location.origin;
  }

  return "http://127.0.0.1:5000";
}

async function checkHealth() {
  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/status`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Health check failed.");
    }

    applyStatus(payload);
  } catch (_error) {
    backendHealthValue.textContent = "Down";
    backendHealthDetail.textContent = "Backend status poll failed.";
  }
}

function applyStatus(payload) {
  const backendHealthy = Boolean(payload?.backend?.healthy);
  const checkedAt = payload?.backend?.checked_at || "unknown";
  const deviceOnline = Boolean(payload?.esp32?.online);
  const lastHeartbeat = payload?.esp32?.last_heartbeat_at;
  const timeoutSeconds = payload?.esp32?.timeout_seconds ?? 150;
  const captureCount = Number(payload?.capture_buffer?.count ?? 0);

  backendHealthValue.textContent = backendHealthy ? "Healthy" : "Down";
  backendHealthDetail.textContent = `Last status check: ${checkedAt}`;

  deviceHealthValue.textContent = deviceOnline ? "Online" : "Offline";
  deviceHealthDetail.textContent = lastHeartbeat
    ? `Last heartbeat: ${lastHeartbeat} | timeout ${timeoutSeconds}s`
    : `No heartbeat yet | timeout ${timeoutSeconds}s`;

  bufferCountValue.textContent = `${captureCount} item${captureCount === 1 ? "" : "s"}`;
  bufferCountDetail.textContent = "Saved image files currently present in `received/`.";
}

async function loadDetections() {
  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/detections`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load detections.");
    }

    const detections = Array.isArray(payload.detections) ? payload.detections : [];
    state.history = detections.slice(0, 6).map(toHistoryItem);
    renderHistory();

    if (detections.length > 0) {
      const latest = detections[0];
      renderFrame({
        image: `${baseUrl}${latest.received_url}`,
        imageName: latest.saved_as,
        result: latest.result,
        confidence: Number(latest.confidence || 0),
        detail: `Model returned ${String(latest.result || "unknown").toUpperCase()} from label ${latest.raw}.`,
        frontDistance: frontDistance.textContent,
        binDistance: binDistance.textContent,
        servoPosition:
          latest.result === "bio" ? "Left Gate" : latest.result === "nonbio" ? "Right Gate" : "Neutral",
        queueState: "Prediction Complete",
        statusText: `Live Result: ${String(latest.result || "unknown").toUpperCase()}`,
        timestamp: latest.created_at || lastSync.textContent,
      });
    }
  } catch (_error) {
    renderHistory();
  }
}

function handleImageUpload(event) {
  const [file] = event.target.files || [];

  if (!file) {
    selectedFile = null;
    previewImage.src = "";
    previewShell.classList.add("hidden");
    analyzeButton.disabled = true;
    uploadStatus.textContent = "No local file selected yet.";
    return;
  }

  selectedFile = file;
  const objectUrl = URL.createObjectURL(file);
  previewShell.classList.remove("hidden");
  previewImage.src = objectUrl;
  cameraImage.src = objectUrl;
  imageName.textContent = file.name;
  analyzeButton.disabled = false;
  uploadStatus.textContent = `Loaded local preview: ${file.name}`;
}

async function analyzeSelectedImage() {
  if (!selectedFile) {
    uploadStatus.textContent = "Choose an image first.";
    return;
  }

  const baseUrl = getBaseUrl();
  showActivity("Analyzing Image", "Uploading image to the Flask backend.");
  uploadStatus.textContent = `Uploading ${selectedFile.name} to ${baseUrl}/predict ...`;

  try {
    const response = await fetch(`${baseUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": selectedFile.type || "application/octet-stream",
      },
      body: selectedFile,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Prediction failed.");
    }

    const timestamp = new Date().toLocaleString();
    const result = payload.result || "unknown";
    const confidence = typeof payload.confidence === "number" ? payload.confidence : 0;
    const receivedImageUrl = payload.received_url ? `${baseUrl}${payload.received_url}` : previewImage.src;

    renderFrame({
      image: receivedImageUrl,
      imageName: payload.saved_as || selectedFile.name,
      result,
      confidence,
      detail: `Model returned ${result.toUpperCase()} from label ${payload.raw}.`,
      frontDistance: frontDistance.textContent,
      binDistance: binDistance.textContent,
      servoPosition: result === "bio" ? "Left Gate" : result === "nonbio" ? "Right Gate" : "Neutral",
      queueState: "Prediction Complete",
      statusText: `Live Result: ${result.toUpperCase()}`,
      timestamp,
    });

    await loadDetections();
    uploadStatus.textContent = `Prediction complete: ${result.toUpperCase()} (${Math.round(confidence * 100)}%)`;
    openDetailModal({
      name: payload.saved_as || selectedFile.name,
      result,
      confidence: `${Math.round(confidence * 100)}%`,
      image: receivedImageUrl,
      detail: `Model returned ${result.toUpperCase()} from label ${payload.raw}.`,
    });
  } catch (error) {
    uploadStatus.textContent = `Prediction failed: ${error.message}`;
  } finally {
    hideActivity();
  }
}

imageUpload.addEventListener("change", handleImageUpload);
analyzeButton.addEventListener("click", analyzeSelectedImage);
modalClose.addEventListener("click", closeDetailModal);
modalBackdrop.addEventListener("click", closeDetailModal);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDetailModal();
  }
});

renderFrame(demoFrames[state.frameIndex]);
renderHistory();
loadDetections();
checkHealth();
window.setInterval(checkHealth, 15000);
analyzeButton.disabled = true;
window.addEventListener("load", () => {
  window.setTimeout(() => {
    bootScreen.classList.add("hidden");
    document.body.classList.remove("app-loading");
  }, 1200);
});
window.addEventListener("load", () => {
  window.setTimeout(() => {
    bootScreen.classList.add("hidden");
    document.body.classList.remove("app-loading");
  }, 1200);
});
