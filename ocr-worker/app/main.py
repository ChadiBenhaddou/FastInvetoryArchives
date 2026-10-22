"""OCR worker HTTP API (localhost / Docker internal network only).

POST /ocr     multipart "image" → {text, language, confidence, is_handwritten, blocks: [...], ...}
GET  /health  → {status, device, models}
"""

import logging
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from .config import MAX_UPLOAD_BYTES, MODELS
from .engine import OcrEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
engine: OcrEngine | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global engine
    engine = OcrEngine()  # models are loaded once, before the first request
    yield


app = FastAPI(title="Archive OCR worker", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"status": "ok" if engine else "loading", "device": engine.device if engine else None, "models": MODELS}


@app.post("/ocr")
async def ocr(image: UploadFile = File(...)):
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(422, "empty image")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "image too large")
    try:
        result = await run_in_threadpool(engine.ocr, data)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return asdict(result)
