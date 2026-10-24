"""OCR of one document photo, Arabic + French, fully offline.

Pipeline:
  1. page orientation (0/90/180/270°) fixed with PP-LCNet doc orientation;
  2. contrast normalization, denoising of grainy photos;
  3. text lines detected (PP-OCRv5); if the page is slightly skewed, it is
     straightened and lines detected again;
  4. every line read by BOTH the Arabic and the Latin recognizer; the script of the
     line decides which reading is kept (Arabic lines with digits get a word-level
     pass, see arabic.py);
  5. lines put in reading order (top → bottom; right → left on Arabic rows);
  6. if PaddleOCR fails or finds nothing, Tesseract (ara+fra) is used instead.
"""

import logging
import os
import re
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from . import preprocess
from .arabic import ARABIC_CHAR, read_arabic_line_with_digits
from .config import CPU_THREADS, MAX_SIDE, MODELS, MODELS_DIR, TESSDATA_DIR

log = logging.getLogger("ocr")
LATIN_CHAR = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœ]")
DIGIT = re.compile(r"\d")


@dataclass
class Line:
    text: str
    confidence: float
    poly: np.ndarray
    script: str  # "ar" | "latin"

    @property
    def bbox(self) -> list[int]:
        xs, ys = self.poly[:, 0], self.poly[:, 1]
        return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


@dataclass
class OcrResult:
    text: str = ""
    language: str | None = None
    confidence: float = 0.0
    is_handwritten: bool = False
    handwriting_score: float = 0.0
    blocks: list[dict] = field(default_factory=list)
    engine: str = "paddle"
    rotation: int = 0
    skew: float = 0.0
    width: int = 0
    height: int = 0
    duration_ms: int = 0


def detect_device() -> str:
    """GPU if this build of Paddle has CUDA and a GPU is visible, otherwise CPU."""
    try:
        import paddle

        if paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0:
            return "gpu:0"
    except Exception:  # noqa: BLE001
        pass
    return "cpu"


class OcrEngine:
    def __init__(self) -> None:
        from paddleocr import DocImgOrientationClassification, TextDetection, TextRecognition

        self.device = detect_device()
        common = {"device": self.device, "cpu_threads": CPU_THREADS, "enable_mkldnn": True}

        def model(cls, role: str, **kw):
            name = MODELS[role]
            return cls(model_name=name, model_dir=os.path.join(MODELS_DIR, name), **common, **kw)

        t = time.time()
        self.orientation = model(DocImgOrientationClassification, "orientation")
        self.detector = model(TextDetection, "detection", limit_side_len=1600, limit_type="max")
        self.rec_arabic = model(TextRecognition, "arabic")
        self.rec_latin = model(TextRecognition, "latin")
        # Paddle predictors are not thread-safe: one request at a time per process.
        self.lock = threading.Lock()
        log.info("models loaded on %s in %.1fs", self.device, time.time() - t)

    # ---------------------------------------------------------------- public

    def ocr(self, image_bytes: bytes) -> OcrResult:
        started = time.time()
        img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("unreadable image")
        img = preprocess.limit_size(img, MAX_SIDE)

        with self.lock:
            try:
                result = self._paddle(img)
            except Exception:  # noqa: BLE001
                log.exception("PaddleOCR failed, falling back to Tesseract")
                result = None
            if result is None or not result.text.strip():
                fallback = self._tesseract(img)
                if fallback.text.strip() or result is None:
                    result = fallback

        result.duration_ms = int((time.time() - started) * 1000)
        return result

    # ---------------------------------------------------------------- PaddleOCR

    def _paddle(self, img: np.ndarray) -> OcrResult:
        rotation = self._page_rotation(img)
        result = self._paddle_read(img, rotation)
        if rotation:
            # The orientation model often says 180° for upright phone photos of Arabic pages
            # (a whole box came out as gibberish): the page is also read as photographed and
            # the more confident reading wins. Costs a second pass only on "rotated" pages.
            upright = self._paddle_read(img, 0)
            if upright.confidence >= result.confidence:
                log.info("orientation model said %d°, kept the photo as taken (%.2f vs %.2f)",
                         rotation, upright.confidence, result.confidence)
                result = upright
        return result

    def _paddle_read(self, img: np.ndarray, rotation: int) -> OcrResult:
        img = preprocess.normalize(preprocess.rotate_quarter(img, rotation))

        polys = self._detect(img)
        skew = preprocess.skew_angle(polys)
        if 0.8 <= abs(skew) <= 15:
            img = preprocess.rotate(img, skew)
            polys = self._detect(img)

        lines = self._recognize(img, polys)
        lines = self._reading_order(lines)

        result = OcrResult(engine="paddle", rotation=rotation, skew=round(skew, 2), height=img.shape[0], width=img.shape[1])
        self._summarize(result, lines)
        return result

    def _page_rotation(self, img: np.ndarray) -> int:
        try:
            label = list(self.orientation.predict(img))[0]["label_names"][0]
            return int(label) if str(label) in {"0", "90", "180", "270"} else 0
        except Exception:  # noqa: BLE001
            log.exception("orientation classification failed")
            return 0

    def _detect(self, img: np.ndarray) -> list:
        res = list(self.detector.predict(img))[0]
        return [np.asarray(p, dtype=np.float32) for p in res["dt_polys"]]

    def _recognize(self, img: np.ndarray, polys: list) -> list[Line]:
        if not polys:
            return []
        crops = [preprocess.crop_line(img, p) for p in polys]
        readings_ar = list(self.rec_arabic.predict(crops))
        readings_la = list(self.rec_latin.predict(crops))

        lines = []
        for poly, crop, r_ar, r_la in zip(polys, crops, readings_ar, readings_la):
            t_ar, s_ar = r_ar["rec_text"].strip(), float(r_ar["rec_score"])
            t_la, s_la = r_la["rec_text"].strip(), float(r_la["rec_score"])
            ar_letters = len(ARABIC_CHAR.findall(t_ar))
            nonspace = max(1, len(t_ar.replace(" ", "")))

            if ar_letters >= 2 and ar_letters / nonspace >= 0.5:
                text, conf = t_ar, s_ar
                if DIGIT.search(t_la) or DIGIT.search(t_ar):
                    better = read_arabic_line_with_digits(crop, self.rec_arabic, self.rec_latin)
                    if better:
                        text, conf = better
                lines.append(Line(text, conf, poly, "ar"))
            elif t_la:
                lines.append(Line(t_la, s_la, poly, "latin"))
        return [l for l in lines if l.text]

    @staticmethod
    def _reading_order(lines: list[Line]) -> list[Line]:
        """Top → bottom by rows; inside a row, right → left if the row is mostly Arabic."""
        if not lines:
            return lines
        lines = sorted(lines, key=lambda l: l.bbox[1])
        rows: list[list[Line]] = []
        for line in lines:
            top, bottom = line.bbox[1], line.bbox[3]
            if rows:
                r_top = min(l.bbox[1] for l in rows[-1])
                r_bottom = max(l.bbox[3] for l in rows[-1])
                overlap = min(bottom, r_bottom) - max(top, r_top)
                if overlap > 0.5 * min(bottom - top, r_bottom - r_top):
                    rows[-1].append(line)
                    continue
            rows.append([line])
        ordered = []
        for row in rows:
            arabic = sum(len(l.text) for l in row if l.script == "ar") > sum(len(l.text) for l in row) / 2
            ordered += sorted(row, key=lambda l: -l.bbox[0] if arabic else l.bbox[0])
        return ordered

    @staticmethod
    def _summarize(result: OcrResult, lines: list[Line]) -> None:
        result.blocks = [
            {"text": l.text, "bbox": l.bbox, "confidence": round(l.confidence, 4), "script": l.script} for l in lines
        ]
        result.text = "\n".join(l.text for l in lines)
        total = sum(len(l.text) for l in lines)
        result.confidence = round(sum(l.confidence * len(l.text) for l in lines) / total, 4) if total else 0.0
        result.language = language_of(result.text)
        result.handwriting_score, result.is_handwritten = handwriting(lines)

    # ---------------------------------------------------------------- Tesseract

    def _tesseract(self, img: np.ndarray) -> OcrResult:
        """Fallback engine: Tesseract 5 with the tessdata_best Arabic + French models."""
        result = OcrResult(engine="tesseract", height=img.shape[0], width=img.shape[1])
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            cv2.imwrite(tmp.name, gray)
            proc = subprocess.run(
                # tsv output via -c: the "tsv" config file lives in the system tessdata dir, not ours.
                ["tesseract", tmp.name, "-", "--tessdata-dir", TESSDATA_DIR, "-l", "ara+fra", "--psm", "3",
                 "-c", "tessedit_create_tsv=1"],
                capture_output=True, text=True, timeout=120,
            )
        lines: dict[tuple, list] = {}
        for row in proc.stdout.splitlines()[1:]:
            cols = row.split("\t")
            if len(cols) < 12 or not cols[11].strip() or float(cols[10]) < 0:
                continue
            key = (int(cols[2]), int(cols[3]), int(cols[4]))  # block, paragraph, line
            lines.setdefault(key, []).append(cols)
        blocks, texts, weights = [], [], []
        for words in lines.values():
            text = " ".join(w[11] for w in words)
            conf = sum(float(w[10]) for w in words) / len(words) / 100
            x1 = min(int(w[6]) for w in words)
            y1 = min(int(w[7]) for w in words)
            x2 = max(int(w[6]) + int(w[8]) for w in words)
            y2 = max(int(w[7]) + int(w[9]) for w in words)
            blocks.append({"text": text, "bbox": [x1, y1, x2, y2], "confidence": round(conf, 4),
                           "script": "ar" if ARABIC_CHAR.search(text) else "latin"})
            texts.append(text)
            weights.append((conf, len(text)))
        result.blocks = blocks
        result.text = "\n".join(texts)
        total = sum(n for _, n in weights)
        result.confidence = round(sum(c * n for c, n in weights) / total, 4) if total else 0.0
        result.language = language_of(result.text)
        return result


def language_of(text: str) -> str | None:
    ar = len(ARABIC_CHAR.findall(text))
    la = len(LATIN_CHAR.findall(text))
    if ar + la == 0:
        return None
    if ar / (ar + la) >= 0.8:
        return "ar"
    if la / (ar + la) >= 0.8:
        return "fr"
    return "mixed"


def handwriting(lines: list[Line]) -> tuple[float, bool]:
    """Heuristic "probably handwritten" score (0-1).

    Printed pages have lines of very regular height that are read with high
    confidence; handwriting gives irregular line heights and low recognition
    confidence. This is a heuristic, not a classifier: it only routes pages to
    human review, and its threshold should be checked on real archive photos.
    """
    if len(lines) < 3:
        return 0.0, False
    heights = np.array([l.bbox[3] - l.bbox[1] for l in lines], dtype=np.float32)
    cv_height = float(heights.std() / max(1.0, heights.mean()))
    weights = np.array([len(l.text) for l in lines], dtype=np.float32)
    conf = float(np.average([l.confidence for l in lines], weights=weights))
    score = 0.6 * min(1.0, max(0.0, (0.92 - conf) / 0.32)) + 0.4 * min(1.0, cv_height / 0.6)
    return round(score, 3), score >= 0.55
