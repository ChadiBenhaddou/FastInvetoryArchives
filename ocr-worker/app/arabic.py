"""Arabic lines that contain Western digits.

The Arabic PP-OCRv5 recognizer reads Arabic words very well but tends to drop the
Western digits inside an Arabic line ("قرار رقم 145 بتاريخ 12 مارس 2019" → no numbers),
and in archives the numbers (references, dates) matter most. Such lines are therefore
cut into words at the white gaps; each word is read by both recognizers, the Latin
reading is kept for numeric words, consecutive numeric pieces are re-read as one
number, and the words are put back in right-to-left order.
"""

import re

import cv2
import numpy as np

ARABIC_CHAR = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
NUMERIC = re.compile(r"^[\d\s./\-:,()°]+$")


def word_spans(line: np.ndarray) -> list[tuple[int, int]]:
    """Horizontal ink spans separated by gaps wider than the gaps inside words."""
    gray = cv2.cvtColor(line, cv2.COLOR_BGR2GRAY)
    _, ink = cv2.threshold(gray, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    rows = np.where(ink.sum(axis=1) > 0)[0]
    text_height = int(rows[-1] - rows[0] + 1) if len(rows) else line.shape[0]
    cols = ink.sum(axis=0) > 0

    runs = []  # (is_ink, start, end)
    x = 0
    while x < len(cols):
        start, value = x, cols[x]
        while x < len(cols) and cols[x] == value:
            x += 1
        runs.append((bool(value), start, x))

    # Word gaps are the wide ones: cut at the biggest jump between sorted gap widths.
    lo, hi = max(2, int(text_height * 0.08)), max(3, int(text_height * 0.5))
    gaps = sorted(e - s for v, s, e in runs[1:-1] if not v and lo <= e - s <= hi)
    cut = hi
    if len(gaps) >= 2:
        jump, i = max((gaps[i + 1] - gaps[i], i) for i in range(len(gaps) - 1))
        if jump >= 2:
            cut = gaps[i + 1]
    elif gaps:
        cut = gaps[0]

    spans, start = [], None
    for is_ink, s, e in runs:
        if is_ink and start is None:
            start = s
        elif not is_ink and start is not None and e - s >= cut and e < len(cols):
            spans.append((start, s))
            start = None
    if start is not None:
        spans.append((start, max(e for v, s, e in runs if v)))
    return spans


def read_arabic_line_with_digits(line: np.ndarray, rec_arabic, rec_latin) -> tuple[str, float] | None:
    """Returns (text, confidence) or None when the line cannot be split into words."""
    spans = word_spans(line)
    if len(spans) < 2:
        return None
    pad = max(2, line.shape[0] // 8)

    def piece(a: int, b: int) -> np.ndarray:
        return line[:, max(0, a - pad):min(line.shape[1], b + pad)]

    pieces = [piece(a, b) for a, b in spans]
    ar = list(rec_arabic.predict(pieces))
    la = list(rec_latin.predict(pieces))

    # Classify left → right, merging consecutive numeric pieces into one number.
    groups: list[list] = []  # [kind, [start, end], text, score]
    for (a, b), r_ar, r_la in zip(spans, ar, la):
        t_ar, t_la = r_ar["rec_text"].strip(), r_la["rec_text"].strip()
        numeric = bool(t_la) and bool(NUMERIC.match(t_la)) and any(c.isdigit() for c in t_la) and not ARABIC_CHAR.search(t_ar)
        if numeric and groups and groups[-1][0] == "num":
            groups[-1][1][1] = b
        elif numeric:
            groups.append(["num", [a, b], t_la, r_la["rec_score"]])
        else:
            groups.append(["ar", [a, b], t_ar, r_ar["rec_score"]])

    numbers = [g for g in groups if g[0] == "num"]
    if numbers:
        for g, r in zip(numbers, rec_latin.predict([piece(*g[1]) for g in numbers])):
            g[2], g[3] = r["rec_text"].strip(), r["rec_score"]

    words = [g for g in reversed(groups) if g[2]]  # Arabic reads right → left
    if not words:
        return None
    text = " ".join(g[2] for g in words)
    confidence = sum(g[3] * len(g[2]) for g in words) / max(1, sum(len(g[2]) for g in words))
    return text, float(confidence)
