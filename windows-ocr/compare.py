"""Old OCR engine (PaddleOCR, Docker ocr-worker) vs new engine (Windows Snipping Tool OCR) on a
folder of photos: both texts side by side, to check the improvement on real documents.

    venv\\Scripts\\python.exe -X utf8 compare.py D:\\photos\\A-0002-D --html comparaison.html

The old engine is called inside its container (docker exec, nothing is published); the new one
runs here. Confidences of the two engines are not on the same scale: compare the texts.
"""

import argparse
import glob
import html
import itertools
import json
import os
import subprocess
import sys
import textwrap
import time

from ocr_service import HERE, SnippingToolOcr

PHOTO_TYPES = ("*.jpg", "*.jpeg", "*.png")


def old_engine(container: str, data: bytes) -> dict:
    started = time.time()
    proc = subprocess.run(
        ["docker", "exec", "-i", container, "curl", "-sS", "-m", "600",
         "-F", "image=@-;filename=photo.jpg", "http://127.0.0.1:8000/ocr"],
        input=data, capture_output=True, timeout=660,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace").strip() or f"docker exec: code {proc.returncode}")
    result = json.loads(proc.stdout)
    if "text" not in result:
        raise RuntimeError(json.dumps(result, ensure_ascii=False)[:300])
    result["seconds"] = round(time.time() - started, 1)
    return result


def new_engine(ocr: SnippingToolOcr, data: bytes) -> dict:
    started = time.time()
    result = ocr.recognize(data)
    result["seconds"] = round(time.time() - started, 1)
    return result


def summary(r: dict | None, error: str | None) -> str:
    if error:
        return f"ERREUR : {error}"
    return f"{r['engine']}  confiance {r['confidence']:.2f}  {len(r['blocks'])} lignes  {r['seconds']} s"


def side_by_side(left: list[str], right: list[str], width: int) -> list[str]:
    def wrap(lines):
        return [part for line in lines for part in (textwrap.wrap(line, width) or [""])]

    rows = itertools.zip_longest(wrap(left), wrap(right), fillvalue="")
    return [f"{a:<{width}} │ {b}" for a, b in rows]


def write_html(path: str, rows: list[dict]):
    def cell(r, error):
        if error:
            return f'<td class="err">{html.escape(error)}</td>'
        lines = "".join(f'<div dir="auto">{html.escape(l)}</div>' for l in r["text"].splitlines()) or "<em>(aucun texte)</em>"
        return f'<td><div class="meta">{html.escape(summary(r, None))}</div>{lines}</td>'

    body = "".join(
        f'<tr><th colspan="2">{html.escape(row["name"])}</th></tr>'
        f'<tr><td colspan="2"><img src="file:///{html.escape(row["path"].replace(os.sep, "/"))}" alt=""></td></tr>'
        f'<tr>{cell(row["old"], row["old_error"])}{cell(row["new"], row["new_error"])}</tr>'
        for row in rows
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"""<!doctype html><html lang="fr"><meta charset="utf-8"><title>Comparaison OCR</title>
<style>
body{{font-family:system-ui,sans-serif;margin:16px;color:#222}} table{{border-collapse:collapse;width:100%;table-layout:fixed}}
td,th{{border:1px solid #ccc;padding:8px;vertical-align:top}} th{{background:#eee;text-align:left}}
.meta{{font-size:12px;color:#666;margin-bottom:6px}} .err{{color:#b00}} img{{max-height:260px}}
td div[dir]{{font-size:15px;line-height:1.6}}
</style>
<h1>Comparaison OCR</h1>
<table><colgroup><col><col></colgroup>
<tr><th>Ancien moteur : PaddleOCR (Docker)</th><th>Nouveau moteur : OCR Windows (Outil Capture d'écran)</th></tr>
{body}</table></html>""")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", help="folder of photos (e.g. a box folder of the archive storage)")
    parser.add_argument("--html", help="also write an HTML report (Arabic displayed right to left)")
    parser.add_argument("--container", default="archive-inventory-ocr-worker-1", help="ocr-worker container")
    parser.add_argument("--data-dir", default=os.path.join(HERE, "ocr_data"))
    parser.add_argument("--width", type=int, default=60, help="column width in the terminal")
    args = parser.parse_args()

    photos = sorted(p for pattern in PHOTO_TYPES for p in glob.glob(os.path.join(args.folder, pattern)))
    if not photos:
        sys.exit(f"Aucune photo dans {args.folder}")
    ocr = SnippingToolOcr(args.data_dir)

    rows = []
    for i, path in enumerate(photos, 1):
        with open(path, "rb") as f:
            data = f.read()
        row = {"name": os.path.basename(path), "path": os.path.abspath(path),
               "old": None, "old_error": None, "new": None, "new_error": None}
        for side, run in (("new", lambda: new_engine(ocr, data)), ("old", lambda: old_engine(args.container, data))):
            try:
                row[side] = run()
            except Exception as e:  # noqa: BLE001
                row[f"{side}_error"] = str(e)
        rows.append(row)

        print(f"\n===== [{i}/{len(photos)}] {row['name']}")
        print(f"{'ANCIEN  ' + summary(row['old'], row['old_error']):<{args.width}} │ NOUVEAU  {summary(row['new'], row['new_error'])}")
        print("─" * args.width + "─┼─" + "─" * args.width)
        left = row["old"]["text"].splitlines() if row["old"] else []
        right = row["new"]["text"].splitlines() if row["new"] else []
        print("\n".join(side_by_side(left, right, args.width)))

    for side, label in (("old", "ANCIEN "), ("new", "NOUVEAU")):
        done = [r[side] for r in rows if r[side]]
        if done:
            print(f"\n{label} : {len(done)}/{len(rows)} photos lues, "
                  f"{sum(r['seconds'] for r in done) / len(done):.1f} s par photo en moyenne")
    if args.html:
        write_html(args.html, rows)
        print(f"\nRapport : {os.path.abspath(args.html)}")


if __name__ == "__main__":
    main()
