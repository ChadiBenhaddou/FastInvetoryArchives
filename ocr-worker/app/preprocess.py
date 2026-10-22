"""Image clean-up before OCR: size limit, contrast normalization, light denoising, deskew."""

import cv2
import numpy as np


def limit_size(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale >= 1:
        return img
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def noise_sigma(gray: np.ndarray) -> float:
    """Fast noise estimate (Immerkær): std-dev of the high-frequency residual."""
    kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float32)
    residual = cv2.filter2D(gray.astype(np.float32), -1, kernel)
    h, w = gray.shape
    return float(np.sum(np.abs(residual)) * np.sqrt(0.5 * np.pi) / (6 * (w - 2) * (h - 2)))


def normalize(img: np.ndarray) -> np.ndarray:
    """Even out lighting and contrast (CLAHE on luminance); denoise only noisy photos."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    out = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    if noise_sigma(l) > 6:  # dim rooms → high ISO grain
        out = cv2.fastNlMeansDenoisingColored(out, None, 5, 5, 7, 21)
    return out


def rotate(img: np.ndarray, angle: float) -> np.ndarray:
    """Rotates around the centre, enlarging the canvas so nothing is cut (white fill)."""
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    m[0, 2] += nw / 2 - w / 2
    m[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(img, m, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))


def rotate_quarter(img: np.ndarray, angle: int) -> np.ndarray:
    """Undo a 90/180/270° page orientation as reported by PP-LCNet doc_ori
    (its angle is the clockwise rotation of the content, so it is undone counter-clockwise)."""
    return {
        0: img,
        90: cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE),
        180: cv2.rotate(img, cv2.ROTATE_180),
        270: cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE),
    }[angle]


def skew_angle(polys: list) -> float:
    """Median angle (degrees) of the long text lines found by the detector."""
    angles, weights = [], []
    for p in polys:
        p = np.asarray(p, dtype=np.float32)
        dx, dy = p[1] - p[0]
        length = float(np.hypot(dx, dy))
        height = float(np.linalg.norm(p[3] - p[0]))
        if length > 3 * height:
            angles.append(np.degrees(np.arctan2(dy, dx)))
            weights.append(length)
    if len(angles) < 3:
        return 0.0
    order = np.argsort(angles)
    cum = np.cumsum(np.asarray(weights)[order])
    return float(np.asarray(angles)[order][np.searchsorted(cum, cum[-1] / 2)])


def crop_line(img: np.ndarray, poly) -> np.ndarray:
    """Straightened crop of one detected (possibly slanted) text line."""
    p = np.asarray(poly, dtype=np.float32)
    w = int(max(np.linalg.norm(p[0] - p[1]), np.linalg.norm(p[3] - p[2])))
    h = int(max(np.linalg.norm(p[0] - p[3]), np.linalg.norm(p[1] - p[2])))
    w, h = max(w, 4), max(h, 4)
    m = cv2.getPerspectiveTransform(p, np.float32([[0, 0], [w, 0], [w, h], [0, h]]))
    return cv2.warpPerspective(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE, flags=cv2.INTER_CUBIC)
