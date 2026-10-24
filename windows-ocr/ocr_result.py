"""Converts a oneocr (Snipping Tool OCR) result into the app's OCR contract: the same fields
as the Docker ocr-worker (ocr-worker/app/engine.py), so the app stores both alike.

Pure functions, no DLL: tested on any machine (tests/test_ocr_result.py).
"""

import re
import statistics

ENGINE_NAME = "windows-oneocr"

# Same character classes and thresholds as the Docker ocr-worker.
ARABIC_CHAR = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
LATIN_CHAR = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœ]")


def to_app_result(raw: dict, width: int, height: int) -> dict:
    """oneocr returns lines (text in logical order, as read) with a quadrilateral and per-word
    confidences. Bounding boxes refer to the photo as taken: the engine handles rotation and
    skew itself, so rotation and skew are reported as 0 (nothing was applied to the photo)."""
    lines = []
    for line in raw.get("lines") or []:
        text = (line.get("text") or "").strip()
        if not text:
            continue
        lines.append({
            "text": text,
            "bbox": _bbox(line.get("bounding_rect")),
            "confidence": round(_line_confidence(line), 4),
            "script": "ar" if _is_arabic(text) else "latin",
        })

    text = "\n".join(l["text"] for l in lines)
    total = sum(len(l["text"]) for l in lines)
    confidence = round(sum(l["confidence"] * len(l["text"]) for l in lines) / total, 4) if total else 0.0
    score, handwritten = handwriting(lines)
    return {
        "text": text,
        "language": language_of(text),
        "confidence": confidence,
        "is_handwritten": handwritten,
        "handwriting_score": score,
        "blocks": lines,
        "engine": ENGINE_NAME,
        "rotation": 0,
        "skew": 0.0,
        "text_angle": _signed_angle(raw.get("text_angle")),
        "width": width,
        "height": height,
        "duration_ms": 0,
    }


def _bbox(rect: dict | None) -> list[int]:
    if not rect:
        return [0, 0, 0, 0]
    xs = [rect[f"x{i}"] for i in range(1, 5)]
    ys = [rect[f"y{i}"] for i in range(1, 5)]
    return [int(min(xs)), int(min(ys)), int(round(max(xs))), int(round(max(ys)))]


def _line_confidence(line: dict) -> float:
    """Mean of the word confidences, weighted by word length (long words count more)."""
    words = [w for w in line.get("words") or [] if w.get("confidence") is not None and w.get("text")]
    total = sum(len(w["text"]) for w in words)
    return sum(w["confidence"] * len(w["text"]) for w in words) / total if total else 0.0


def _is_arabic(text: str) -> bool:
    """Letters only: digits and punctuation ("قرار رقم 2019/145") must not make a line Latin."""
    arabic = len(ARABIC_CHAR.findall(text))
    return arabic >= 2 and arabic >= len(LATIN_CHAR.findall(text))


def _signed_angle(angle: float | None) -> float | None:
    """358.5° → -1.5° (the engine reports 0-360)."""
    if angle is None:
        return None
    angle %= 360
    return round(angle - 360 if angle > 180 else angle, 2)


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


def handwriting(lines: list[dict]) -> tuple[float, bool]:
    """Same "probably handwritten" heuristic as the Docker ocr-worker: irregular line heights
    and low recognition confidence. Only routes pages to human review."""
    if len(lines) < 3:
        return 0.0, False
    heights = [l["bbox"][3] - l["bbox"][1] for l in lines]
    cv_height = statistics.pstdev(heights) / max(1.0, statistics.fmean(heights))
    weights = [len(l["text"]) for l in lines]
    conf = sum(l["confidence"] * w for l, w in zip(lines, weights)) / sum(weights)
    score = 0.6 * min(1.0, max(0.0, (0.92 - conf) / 0.32)) + 0.4 * min(1.0, cv_height / 0.6)
    return round(score, 3), score >= 0.55
