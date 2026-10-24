"""Windows OCR service of the archive inventory: the Windows 11 Snipping Tool OCR engine
(oneocr.dll + oneocr.onemodel + onnxruntime.dll, through the `oneocr` package) behind the
same HTTP contract as the Docker ocr-worker.

It runs natively on Windows (the engine is a Windows DLL) and listens on 127.0.0.1 only.
The app containers have no route to the PC: they reach this service through the gateway
container (docker/app/gateway.conf, port 8010), the only container with access outside the
internal Docker network. Nothing is downloaded, ever.

  POST /ocr     body = the image bytes (JPEG/PNG)  → {text, language, confidence, blocks, ...}
  GET  /health  → {"status": "ok", "engine": "windows-oneocr"}

  pythonw ocr_service.py                 normal run (scheduled task created by setup.ps1)
  python  ocr_service.py --check [FILE]  loads the engine, reads FILE (default: a generated
                                         test image), prints the text; exit 1 if nothing is read
"""

import argparse
import io
import json
import logging
import os
import queue
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler

from ocr_result import ENGINE_NAME, to_app_result

HERE = os.path.dirname(os.path.abspath(__file__))
REQUIRED_FILES = ("oneocr.dll", "oneocr.onemodel", "onnxruntime.dll")
MAX_UPLOAD_BYTES = 40 * 1024 * 1024
log = logging.getLogger("windows-ocr")


class SnippingToolOcr:
    def __init__(self, data_dir: str, engines: int = 1):
        missing = [f for f in REQUIRED_FILES if not os.path.isfile(os.path.join(data_dir, f))]
        if missing:
            raise RuntimeError(f"Missing in {data_dir}: {', '.join(missing)} (run setup.ps1)")
        import oneocr  # imported here: it loads Windows-only modules

        oneocr.CONFIG_DIR = data_dir  # the package reads the DLL and the model from there
        started = time.time()
        # A pool of engines, each used by one request at a time (the DLL is not documented as
        # thread-safe). Measured on a 4-core i5: 2 engines read 20% more photos per second than
        # one (the 2 OCR workers of the app); more do not help.
        self.pool: queue.Queue = queue.Queue()
        for _ in range(max(1, engines)):
            self.pool.put(oneocr.OcrEngine())
        log.info("%d engine(s) loaded from %s in %.1fs", max(1, engines), data_dir, time.time() - started)

    def recognize(self, data: bytes) -> dict:
        from PIL import Image, ImageOps

        started = time.time()
        try:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
            img.load()
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"unreadable image: {e}") from e
        engine = self.pool.get()
        try:
            raw = engine.recognize_pil(img)
        finally:
            self.pool.put(engine)
        if raw.get("error"):
            raise ValueError(raw["error"])
        result = to_app_result(raw, img.width, img.height)
        result["duration_ms"] = int((time.time() - started) * 1000)
        return result


def make_handler(ocr: SnippingToolOcr):
    class Handler(BaseHTTPRequestHandler):
        server_version = "archive-windows-ocr"

        def do_GET(self):
            if self.path == "/health":
                self._json(200, {"status": "ok", "engine": ENGINE_NAME})
            else:
                self._json(404, {"detail": "not found"})

        def do_POST(self):
            if self.path != "/ocr":
                return self._json(404, {"detail": "not found"})
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                return self._json(422, {"detail": "empty image"})
            if length > MAX_UPLOAD_BYTES:
                return self._json(413, {"detail": "image too large"})
            data = self.rfile.read(length)
            try:
                result = ocr.recognize(data)
            except ValueError as e:
                return self._json(422, {"detail": str(e)})
            except Exception:  # noqa: BLE001
                log.exception("OCR failed")
                return self._json(500, {"detail": "OCR failed"})
            log.info("ocr %d bytes → %d lines, conf %.2f, %d ms", length, len(result["blocks"]),
                     result["confidence"], result["duration_ms"])
            self._json(200, result)

        def _json(self, status: int, body: dict):
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, fmt, *args):  # http.server writes to stderr, which pythonw lacks
            log.debug(fmt, *args)

    return Handler


def test_image() -> bytes:
    """A small page with printed text, for --check without a photo at hand."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (900, 200), "white")
    font = ImageFont.load_default(size=48)
    ImageDraw.Draw(img).text((40, 60), "Archives 2026 OCR test", fill="black", font=font)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def setup_logging(log_file: str | None):
    handlers: list[logging.Handler] = []
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        handlers.append(RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"))
    if sys.stderr is not None:  # None under pythonw
        handlers.append(logging.StreamHandler())
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=handlers)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=int(os.environ.get("WINDOWS_OCR_PORT", 8010)))
    parser.add_argument("--data-dir", default=os.path.join(HERE, "ocr_data"))
    parser.add_argument("--log-file", default=os.path.join(HERE, "logs", "ocr-service.log"))
    parser.add_argument("--engines", type=int, default=int(os.environ.get("WINDOWS_OCR_ENGINES", 2)),
                        help="photos read in parallel (default 2, one per OCR worker of the app)")
    parser.add_argument("--check", metavar="IMAGE", nargs="?", const="",
                        help="read one image (default: a generated test image), print the result, exit")
    args = parser.parse_args()
    checking = args.check is not None
    setup_logging(None if checking else args.log_file)

    ocr = SnippingToolOcr(args.data_dir, 1 if checking else args.engines)
    if checking:
        if args.check:
            with open(args.check, "rb") as f:
                data = f.read()
        else:
            data = test_image()
        result = ocr.recognize(data)
        print(f"{len(result['blocks'])} lines, confidence {result['confidence']}, {result['duration_ms']} ms")
        print(result["text"])
        sys.exit(0 if result["text"].strip() else 1)

    # Loopback only: the PC's network must never reach this service.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(ocr))
    log.info("listening on 127.0.0.1:%d", args.port)
    server.serve_forever()


if __name__ == "__main__":
    main()
