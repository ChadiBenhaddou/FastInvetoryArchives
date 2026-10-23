"""Builds a realistic phone export ZIP (shared/manifest.schema.json) whose photos are
rendered administrative pages in French / Arabic, degraded like phone photos.

Run in the OCR test image (it has the Arabic fonts):
    docker run --rm -v <out>:/out archive-inventory/ocr-worker:test \
        python -m tests.make_sample_export /out [DEVICE_LETTER]
"""

import hashlib
import json
import sys
import uuid
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from tests import synth

ALPHABET = "ACDEFGHJKLMNPQRTUVWXY"
WEIGHTS = [13, 8, 4, 2, 1]


def box_code(device: str, seq: int) -> str:
    values = [ALPHABET.index(device)] + [int(d) for d in f"{seq:04d}"]
    return f"{device}-{seq:04d}-{ALPHABET[sum(w * v for w, v in zip(WEIGHTS, values)) % 21]}"


def code_photo(code: str) -> np.ndarray:
    """Cardboard box side with the code written in marker."""
    img = Image.new("RGB", (1600, 1200), (176, 138, 92))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(synth.FONT_LA, 190)
    draw.text((140, 470), code, font=font, fill=(25, 25, 30))
    return synth.photo_like(cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR), seed=1)


EXTRA = {
    "decision_ar": [
        ("ar", "المملكة المغربية"),
        ("ar", "عمالة الرباط"),
        ("ar", "مقرر رقم 2019/77 بتاريخ 5 أبريل 2019"),
        ("ar", "يتعلق بالترخيص لجمعية الأمل"),
    ],
    "courrier_fr": [
        ("fr", "Préfecture de Rabat"),
        ("fr", "Service des Affaires Générales"),
        ("fr", "Rabat, le 14 février 2001"),
        ("fr", "Objet : demande de mutation"),
        ("fr", "Monsieur le Directeur,"),
    ],
}

BOXES = [
    # (pages, transformations) — one list per box
    [("fr", None), ("ar", "photo")],
    [("mixed", None), ("decision_ar", "skew"), ("courrier_fr", "rotate")],
    [("courrier_fr", "photo"), ("ar", None)],
]


def page_image(name: str, how: str | None) -> np.ndarray:
    lines = synth.PAGES.get(name) or EXTRA[name]
    img = synth.render(lines)
    if how == "photo":
        img = synth.photo_like(img, seed=7)
    elif how == "skew":
        img = synth.photo_like(synth.skewed(img, -4), seed=9)
    elif how == "rotate":
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)  # phone held sideways
    return img


def jpeg(img: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()


def main(out_dir: str, device: str = "K", selftest: bool = False) -> None:
    # Self-test variant (used by the verify script): one box numbered 9999, far from real
    # numbering; the search must then find "Benali" and "الداخلية".
    plan = [[("fr", None), ("ar", "photo")]] if selftest else BOXES
    first = 9999 if selftest else 1
    boxes, files = [], {}
    for i, pages in enumerate(plan, start=first):
        code = box_code(device, i)
        images = [code_photo(code)] + [page_image(name, how) for name, how in pages]
        photos = []
        for seq, img in enumerate(images):
            data = jpeg(img)
            name = f"boxes/{code}/{seq:03d}{'_code' if seq == 0 else ''}.jpg"
            files[name] = data
            photos.append({
                "sequence": seq, "type": "code_photo" if seq == 0 else "document", "file": name,
                "sha256": hashlib.sha256(data).hexdigest(), "width": img.shape[1], "height": img.shape[0],
                "taken_at": f"2026-10-22T10:{i % 60:02d}:{seq:02d}+01:00",
                "quality": {"sharpness": 120.0, "brightness": 180.0, "override": False, "cropped": False},
            })
        boxes.append({
            "code": code, "sequence": i,
            "location": {"room": "Salle 3", "shelf": f"É{i % 100}", "row": None},
            "created_at": f"2026-10-22T10:{i % 60:02d}:00+01:00", "closed_at": f"2026-10-22T10:{i % 60:02d}:59+01:00",
            "photos": photos,
        })

    last = first + len(plan) - 1
    manifest = {
        "format_version": 1, "export_id": str(uuid.uuid4()), "device_letter": device,
        "agent_name": "Vérification" if selftest else "Agent Exemple", "app_version": "1.0.0",
        "exported_at": "2026-10-22T18:00:00+01:00",
        "sequence_range": {"from": first, "to": last, "last_issued": last},
        "voided_sequences": [], "open_sequences": [], "boxes": boxes,
    }
    name = "selftest.zip" if selftest else f"{device}_20261022_1800_{len(plan)}boxes_exemple.zip"
    path = f"{out_dir}/{name}"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for name, data in files.items():
            z.writestr(name, data)
    print(path)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--selftest"]
    main(args[0], *(args[1:2]), selftest="--selftest" in sys.argv)
