# OCR worker: PaddleOCR (Arabic + Latin) with Tesseract fallback.
# Built on a connected machine; every model is baked in, so the container starts and
# runs with no network at all (verified by tests run with --network none).
FROM python:3.11-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PADDLE_PDX_CACHE_HOME=/models/paddlex \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    TESSDATA_DIR=/models/tessdata \
    HF_HUB_OFFLINE=1 \
    OMP_NUM_THREADS=4

RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr libgl1 libglib2.0-0 libgomp1 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts
# Download models at build time (needs network) then forbid any further download.
RUN HF_HUB_OFFLINE=0 python scripts/download_models.py \
 && chmod -R a+rX /models

RUN useradd --system --uid 1000 ocr
USER ocr
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=10 \
    CMD curl -fsS http://127.0.0.1:8000/health | grep -q '"ok"' || exit 1
# One process per OCR_PROCESSES; each loads the models once (~1 GB RAM per process).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${OCR_PROCESSES:-2} --timeout-keep-alive 30"]

########## Tests (fonts to render synthetic Arabic/French pages) ##########
FROM base AS test
USER root
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-core libraqm0 libfribidi0 \
 && rm -rf /var/lib/apt/lists/*
COPY requirements-test.txt .
RUN pip install -r requirements-test.txt
COPY tests ./tests
USER ocr
CMD ["python", "-m", "pytest", "-q", "tests"]
