import os

# Everything the worker needs is inside the image; nothing is ever downloaded at runtime.
MODELS_DIR = os.path.join(os.environ.get("PADDLE_PDX_CACHE_HOME", "/models/paddlex"), "official_models")
TESSDATA_DIR = os.environ.get("TESSDATA_DIR", "/models/tessdata")

MODELS = {
    "orientation": "PP-LCNet_x1_0_doc_ori",
    "detection": os.environ.get("OCR_DET_MODEL", "PP-OCRv5_mobile_det"),
    "arabic": "arabic_PP-OCRv5_mobile_rec",
    "latin": "latin_PP-OCRv5_mobile_rec",
}

# Requests processed at the same time by one worker process (the models are not
# thread-safe; run several processes with OCR_PROCESSES for more throughput).
CPU_THREADS = int(os.environ.get("OCR_CPU_THREADS", "4"))
MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "2600"))
MAX_UPLOAD_BYTES = 40 * 1024 * 1024
