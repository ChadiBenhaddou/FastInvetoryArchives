"""Build-time only (connected machine): downloads every model into MODELS_DIR so the
image can run with no network at all."""

import os
import sys
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.config import MODELS, MODELS_DIR, TESSDATA_DIR  # noqa: E402

TESSDATA_BEST = "https://github.com/tesseract-ocr/tessdata_best/raw/main/{lang}.traineddata"


def main() -> None:
    os.makedirs(TESSDATA_DIR, exist_ok=True)
    for lang in ("ara", "fra", "osd"):
        target = os.path.join(TESSDATA_DIR, f"{lang}.traineddata")
        if not os.path.exists(target):
            print(f"tessdata_best/{lang}")
            urllib.request.urlretrieve(TESSDATA_BEST.format(lang=lang), target)

    # Instantiating each model downloads it into PADDLE_PDX_CACHE_HOME/official_models.
    from paddleocr import DocImgOrientationClassification, TextDetection, TextRecognition

    classes = {"orientation": DocImgOrientationClassification, "detection": TextDetection}
    for role, name in MODELS.items():
        cls = classes.get(role, TextRecognition)
        print(f"{role}: {name}")
        cls(model_name=name, device="cpu")
        assert os.path.isdir(os.path.join(MODELS_DIR, name)), f"{name} not found in {MODELS_DIR}"
    print("all models ready in", MODELS_DIR)


if __name__ == "__main__":
    main()
