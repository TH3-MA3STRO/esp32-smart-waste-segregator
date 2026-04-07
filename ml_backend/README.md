# Teachable Machine Flask Server

Project layout:

- `server/` holds the Python code
- `configs/` holds configuration
- `models/` holds `keras_model.h5` and `labels.txt`
- `images/` holds images you want to classify locally
- `.venv/` is created by `uv sync`
- `.python/` is optional local Python storage if you use `uv python install`

## Environment setup with `uv`

This project is locked for Python `3.11` because the TensorFlow model-serving stack used here is not compatible with Python `3.14`.

Fresh clone setup on Linux, macOS, or Windows PowerShell:

```bash
cd ml_backend
uv python install 3.11
uv sync
```

That will:

- install or select Python `3.11`
- create `.venv`
- install the exact locked dependencies from `uv.lock`

Put these Teachable Machine export files in `models/`:

- `models/keras_model.h5`
- `models/labels.txt`

Put any sample images you want to test in `images/`.

## Run

```bash
uv run python server/main.py
```

The API starts on `http://127.0.0.1:5000`.

## Test

```bash
curl -X POST http://127.0.0.1:5000/predict \
  --data-binary @images/your-image.jpg
```

You can also predict by filename for an image already stored in `images/`:

```bash
curl -X POST http://127.0.0.1:5000/predict-file \
  -H "Content-Type: application/json" \
  -d '{"filename":"your-image.jpg"}'
```

## Bulk Test

Run predictions on every image in `images/` in random order:

```bash
uv run python server/bulk_test.py
```

Use a fixed shuffle order if needed:

```bash
uv run python server/bulk_test.py --seed 42
```

## Notes

- Do not rely on the checked-in `.venv/` or `.python/` folders when recreating the environment.
- The source of truth is `[project.dependencies]` in `pyproject.toml` plus the locked resolution in `uv.lock`.
