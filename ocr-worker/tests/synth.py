"""Synthetic administrative pages (French / Arabic / mixed) with known text, rendered with
proper Arabic shaping, optionally degraded to look like a phone photo."""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_AR = "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"
FONT_LA = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"

PAGES = {
    "fr": [
        ("fr", "ROYAUME DU MAROC"),
        ("fr", "Ministère de l'Intérieur"),
        ("fr", "Direction des Affaires Rurales"),
        ("fr", "Arrêté n° 2019/145 du 12 mars 2019"),
        ("fr", "Objet : nomination de M. Karim Benali"),
        ("fr", "au poste de chef de service à Rabat."),
    ],
    "ar": [
        ("ar", "المملكة المغربية"),
        ("ar", "وزارة الداخلية"),
        ("ar", "قرار رقم 145 بتاريخ 12 مارس 2019"),
        ("ar", "بشأن تعيين السيد محمد العلوي"),
        ("ar", "رئيسا لمصلحة الأرشيف بالرباط"),
    ],
    "mixed": [
        ("fr", "Direction des Archives"),
        ("ar", "مديرية الأرشيف"),
        ("fr", "Dossier n° 77/B — Correspondance 1998"),
        ("ar", "الرباط في 3 يناير 1998"),
    ],
}


def render(lines: list[tuple[str, str]], width: int = 1700) -> np.ndarray:
    """White A4-like page, Arabic lines right-aligned, French lines left-aligned."""
    line_h = 95
    img = Image.new("RGB", (width, 220 + line_h * len(lines)), "white")
    draw = ImageDraw.Draw(img)
    y = 110
    for lang, text in lines:
        if lang == "ar":
            font = ImageFont.truetype(FONT_AR, 46)
            w = draw.textlength(text, font=font, direction="rtl", language="ar")
            draw.text((width - 120 - w, y), text, font=font, fill=(25, 25, 25), direction="rtl", language="ar")
        else:
            font = ImageFont.truetype(FONT_LA, 42)
            draw.text((120, y), text, font=font, fill=(25, 25, 25))
        y += line_h
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def photo_like(img: np.ndarray, seed: int = 0) -> np.ndarray:
    """Uneven lighting, slight blur, sensor noise and JPEG compression, like a phone shot."""
    rng = np.random.default_rng(seed)
    h, w = img.shape[:2]
    gradient = np.tile(np.linspace(0.75, 1.0, w, dtype=np.float32), (h, 1))[..., None]
    out = img.astype(np.float32) * gradient
    out = cv2.GaussianBlur(out, (3, 3), 0.8)
    out += rng.normal(0, 7, out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def skewed(img: np.ndarray, angle: float) -> np.ndarray:
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(img, m, (w, h), borderValue=(255, 255, 255))


def jpeg(img: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()


def expected_text(name: str) -> str:
    return "\n".join(text for _, text in PAGES[name])
