"""OCR quality and API tests. Run inside the test image, with the network disabled:
    docker run --rm --network none archive-inventory/ocr-worker:test
"""

import os
import socket

import cv2
import pytest
from fastapi.testclient import TestClient

from app.arabic import ARABIC_CHAR
from app.engine import OcrEngine, language_of
from tests import synth


def cer(expected: str, actual: str) -> float:
    """Character error rate (Levenshtein distance / length), whitespace-insensitive."""
    a, b = "".join(expected.split()), "".join(actual.split())
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / max(1, len(a))


@pytest.fixture(scope="session")
def engine() -> OcrEngine:
    return OcrEngine()


def run(engine, img):
    return engine.ocr(synth.jpeg(img))


def test_runs_without_network():
    """The test container is started with --network none: nothing can be downloaded."""
    if os.environ.get("ALLOW_NETWORK"):
        pytest.skip("network allowed for this run")
    with pytest.raises(OSError):
        socket.create_connection(("1.1.1.1", 443), timeout=2)


@pytest.mark.parametrize("name,max_cer", [("fr", 0.03), ("ar", 0.05), ("mixed", 0.05)])
def test_clean_pages(engine, name, max_cer):
    result = run(engine, synth.render(synth.PAGES[name]))
    error = cer(synth.expected_text(name), result.text)
    print(f"\n[{name}] CER={error:.3f} conf={result.confidence} lang={result.language} {result.duration_ms}ms\n{result.text}")
    assert error <= max_cer
    assert result.engine == "paddle"
    assert result.language == name
    assert result.confidence >= 0.8
    assert not result.is_handwritten


def test_numbers_inside_arabic_lines_are_kept(engine):
    result = run(engine, synth.render(synth.PAGES["ar"]))
    line = next(l for l in result.text.splitlines() if "قرار" in l)
    for number in ("145", "12", "2019"):
        assert number in line, line


def test_references_with_slashes_inside_arabic_lines(engine):
    page = synth.render([("ar", "مقرر رقم 2019/77 بتاريخ 5 أبريل 2019"), ("ar", "ملف رقم 77/B بتاريخ 12/03/2020")])
    text = run(engine, page).text
    for reference in ("2019/77", "77/B", "12/03/2020"):
        assert reference in text, text


def test_reading_order_and_rtl_logical_order(engine):
    result = run(engine, synth.render(synth.PAGES["mixed"]))
    lines = result.text.splitlines()
    assert lines[0].startswith("Direction")
    # Arabic is stored in logical order: the first character is the first letter read (rightmost).
    assert lines[1].startswith("مديرية")
    assert [b["script"] for b in result.blocks] == ["latin", "ar", "latin", "ar"]


@pytest.mark.parametrize("name", ["fr", "ar"])
def test_phone_photo_quality(engine, name):
    result = run(engine, synth.photo_like(synth.render(synth.PAGES[name]), seed=3))
    error = cer(synth.expected_text(name), result.text)
    print(f"\n[photo {name}] CER={error:.3f} conf={result.confidence}")
    assert error <= 0.08


def test_skewed_page_is_straightened(engine):
    result = run(engine, synth.skewed(synth.render(synth.PAGES["fr"]), 6))
    print(f"\n[skew] detected={result.skew} CER={cer(synth.expected_text('fr'), result.text):.3f}")
    assert abs(abs(result.skew) - 6) < 1.5
    assert cer(synth.expected_text("fr"), result.text) <= 0.05


@pytest.mark.parametrize("rotate,expected", [
    (cv2.ROTATE_90_CLOCKWISE, {90, 270}),
    (cv2.ROTATE_180, {180}),
    (cv2.ROTATE_90_COUNTERCLOCKWISE, {90, 270}),
])
def test_sideways_photo_is_turned_upright(engine, rotate, expected):
    page = cv2.rotate(synth.render(synth.PAGES["fr"]), rotate)
    result = run(engine, page)
    print(f"\n[rotation] corrected by {result.rotation} → CER={cer(synth.expected_text('fr'), result.text):.3f}")
    assert result.rotation in expected
    assert cer(synth.expected_text("fr"), result.text) <= 0.05


def test_blank_page_gives_empty_text(engine):
    blank = synth.render([])
    result = run(engine, blank)
    assert result.text == ""
    assert result.language is None


def test_tesseract_fallback(engine):
    result = engine._tesseract(synth.render(synth.PAGES["fr"]))
    assert result.engine == "tesseract"
    assert cer(synth.expected_text("fr"), result.text) <= 0.05


def test_language_detection():
    assert language_of("Arrêté du 12 mars") == "fr"
    assert language_of("وزارة الداخلية") == "ar"
    assert language_of("Direction des Archives\nمديرية الأرشيف") == "mixed"
    assert language_of("2019 - 145") is None
    assert ARABIC_CHAR.search("ب")


def test_http_api():
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
        r = client.post("/ocr", files={"image": ("p.jpg", synth.jpeg(synth.render(synth.PAGES["mixed"])), "image/jpeg")})
        assert r.status_code == 200
        body = r.json()
        assert set(body) >= {"text", "language", "confidence", "is_handwritten", "blocks"}
        assert body["blocks"][0].keys() >= {"text", "bbox", "confidence"}
        assert client.post("/ocr", files={"image": ("x.jpg", b"not an image", "image/jpeg")}).status_code == 422
