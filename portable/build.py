"""Builds the PORTABLE Windows bundle (no Docker) on the connected development machine (Windows,
Python 3.12 64-bit). Output: bundle/out/ArchiveInventory-<version>-portable/ — copy the whole
folder to the PC (for example to C:\\ArchiveInventory) and double-click Demarrer.bat.

  py -3.12 portable/build.py                  # everything (~2.5 GB with PaddleOCR)
  py -3.12 portable/build.py --without-paddle # Windows OCR only (~0.6 GB)

Downloads (pinned versions, SHA-256 checked) are kept in bundle/out/cache/ for the next build.
Nothing in the bundle downloads anything at run time.
"""

import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "bundle" / "out" / "cache"

# Same versions as the Docker images where there is one (getmeili/meilisearch:v1.54.3).
DOWNLOADS = {
    # 8.4, not the 8.3 of the Docker image: Laravel applies the SQLite transaction_mode (IMMEDIATE)
    # only on PHP >= 8.4. On 8.3 the queue workers got "database is locked" taking jobs.
    "php": ("https://windows.php.net/downloads/releases/php-8.4.27-nts-Win32-vs17-x64.zip",
            "93bd8a815a52156606fb906d0573437908c61f96e2cc52c03a51e36a41bf5236"),
    "nginx": ("https://nginx.org/download/nginx-1.30.6.zip",
              "c6ee35edb0a861063323f709192ae50d1eefaf2ea7d00678bd2b22d8542dc61e"),
    "meilisearch": ("https://github.com/meilisearch/meilisearch/releases/download/v1.54.3/meilisearch-windows-amd64.exe",
                    "09266bd2c51747cebe908f7373cc6e2e546e3930886bb8c1427f402a0dc4c2dc"),
    "composer": ("https://getcomposer.org/download/2.10.3/composer.phar",
                 "7a2d379d5b8ffdaa028580ef26494c36d2feef4b178d3dd1473a4dbc5e17c8d6"),
    # Build only (the desktop screens): never shipped.
    "node": ("https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip",
             "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71"),
    # The one thing the PC installs. 3.12.10 is the last 3.12 release with an installer.
    "python": ("https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe",
               "67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb"),
}
# Visual C++ runtime of PHP (php_intl and ICU also need msvcp140), copied next to php.exe so the
# PC needs no "VC++ Redistributable" install. Microsoft allows this app-local deployment.
VC_RUNTIME = ("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll")
# What goes to app\ (tracked files of the working tree).
APP_SOURCES = ("backend", "shared", "ocr-worker/app", "ocr-worker/scripts", "windows-ocr/ocr_service.py",
               "windows-ocr/ocr_result.py", "windows-ocr/compare.py", "portable/launcher.py", "portable/pyrun.py",
               "portable/conf",
               "samples/selftest.zip")


def step(text):
    print(f"\n=== {text}", flush=True)


def run(cmd, **kw):
    print("  $", " ".join(map(str, cmd))[:200], flush=True)
    subprocess.run(list(map(str, cmd)), check=True, **kw)


def fetch(name: str) -> Path:
    url, sha = DOWNLOADS[name]
    target = CACHE / url.rsplit("/", 1)[1]
    if not target.exists() or sha256(target) != sha:
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"  download {url}", flush=True)
        part = target.with_suffix(target.suffix + ".part")
        for attempt in range(5):
            try:
                urllib.request.urlretrieve(url, part)
                break
            except OSError as e:
                if attempt == 4:
                    raise
                print(f"  retry ({e})", flush=True)
        if sha256(part) != sha:
            raise SystemExit(f"SHA-256 mismatch for {url}: {sha256(part)}")
        part.replace(target)
    return target


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def unzip(archive: Path, target: Path, strip_top: bool = False):
    with zipfile.ZipFile(archive) as z:
        for member in z.infolist():
            name = member.filename.split("/", 1)[1] if strip_top else member.filename
            if not name or name.endswith("/"):
                continue
            dest = target / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with z.open(member) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)


def copy_sources(app: Path):
    files = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "--", *APP_SOURCES], cwd=REPO,
                           capture_output=True, text=True, check=True).stdout.splitlines()
    for rel in files:
        src = REPO / rel
        if not src.is_file():
            continue  # deleted in the working tree
        dest = app / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)


def php_ini_for(php: Path):
    """Same as the launcher: php.ini with the absolute extension folder (composer runs php itself)."""
    template = (php / "php-portable.ini").read_text(encoding="utf-8")
    (php / "php.ini").write_text(f'extension_dir = "{php / "ext"}"\n' + template, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--without-paddle", action="store_true", help="no PaddleOCR (Windows OCR only)")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12) or os.name != "nt":
        raise SystemExit("Run with Python 3.12 on Windows (py -3.12): the packages are installed for the target PC.")

    version = (REPO / "VERSION").read_text(encoding="utf-8").strip()
    out = args.out or REPO / "bundle" / "out" / f"ArchiveInventory-{version}-portable"
    step(f"Portable bundle {version} → {out}")
    if out.exists():
        shutil.rmtree(out)
    app, runtime = out / "app", out / "runtime"
    for d in (app, runtime, out / "prerequis"):
        d.mkdir(parents=True)

    step("PHP 8.4 (+ Visual C++ runtime)")
    php = runtime / "php"
    unzip(fetch("php"), php)
    shutil.copy2(REPO / "portable" / "conf" / "php.ini", php / "php-portable.ini")
    system32 = Path(os.environ["SystemRoot"]) / "System32"
    for dll in VC_RUNTIME:
        shutil.copy2(system32 / dll, php / dll)
    for unused in ("php.ini-development", "php.ini-production", "phpdbg.exe", "deplister.exe"):
        (php / unused).unlink(missing_ok=True)
    php_ini_for(php)

    step("nginx, Meilisearch")
    unzip(fetch("nginx"), runtime / "nginx", strip_top=True)
    shutil.rmtree(runtime / "nginx" / "html", ignore_errors=True)
    (runtime / "meilisearch").mkdir()
    shutil.copy2(fetch("meilisearch"), runtime / "meilisearch" / "meilisearch.exe")

    step("Application (backend, OCR services, launcher)")
    copy_sources(app)
    (app / "VERSION").write_text(version + "\n", encoding="utf-8")
    backend = app / "backend"
    run([php / "php.exe", fetch("composer"), "install", "--no-dev", "--no-interaction", "--prefer-dist",
         "--optimize-autoloader", "--classmap-authoritative", "--no-progress"], cwd=backend)
    for leftover in ("tests", "node_modules", ".env", "phpunit.xml"):
        path = backend / leftover
        shutil.rmtree(path, ignore_errors=True) if path.is_dir() else path.unlink(missing_ok=True)

    step("Desktop screens (vite build, Node only on this machine)")
    node = CACHE / "node-v22"
    if not (node / "node.exe").exists():
        unzip(fetch("node"), node, strip_top=True)
    assets = CACHE / "assets-build"
    shutil.rmtree(assets / "resources", ignore_errors=True)
    shutil.rmtree(assets / "public", ignore_errors=True)
    assets.mkdir(parents=True, exist_ok=True)
    for f in ("package.json", "package-lock.json", "vite.config.js"):
        shutil.copy2(REPO / "backend" / f, assets / f)
    shutil.copytree(REPO / "backend" / "resources", assets / "resources")
    env = dict(os.environ, PATH=f"{node};{os.environ['PATH']}")
    run([node / "npm.cmd", "ci", "--no-audit", "--no-fund"], cwd=assets, env=env, shell=False)
    run([node / "npm.cmd", "run", "build"], cwd=assets, env=env)
    shutil.copytree(assets / "public" / "build", backend / "public" / "build")

    step("Python packages of the OCR services (installed on THIS machine, for Python 3.12 x64)")
    requirements = REPO / "windows-ocr" / "requirements.txt" if args.without_paddle else REPO / "portable" / "requirements.txt"
    run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-warn-script-location",
         "--only-binary=:all:", "--target", runtime / "python", "-r", requirements])

    if not args.without_paddle:
        step("PaddleOCR models")
        # Through pyrun.py, as on the PC: only runtime\python, never this machine's own packages.
        env = dict(os.environ, PYTHONPATH=str(app / "ocr-worker"), PADDLE_PDX_CACHE_HOME=str(runtime / "paddle-models"),
                   TESSDATA_DIR=str(CACHE / "tessdata"), HF_HUB_OFFLINE="0")
        run([sys.executable, "-S", "-X", "utf8", REPO / "portable" / "pyrun.py", runtime / "python",
             app / "ocr-worker" / "scripts" / "download_models.py"], env=env)
    shutil.rmtree(app / "ocr-worker" / "scripts")

    step("Root of the bundle")
    for bat in (REPO / "portable" / "bat").glob("*.bat"):
        shutil.copy2(bat, out / bat.name)
    shutil.copy2(REPO / "README.md", out / "LISEZMOI.md")
    (out / "VERSION").write_text(version + "\n", encoding="utf-8")
    shutil.copy2(fetch("python"), out / "prerequis" / "python-3.12.10-amd64.exe")
    apk = REPO / "bundle" / "out" / f"ArchiveInventory-{version}" / "android"
    if apk.is_dir():
        shutil.copytree(apk, out / "android")
    else:
        print(f"  (no APK: build the Docker bundle first to get {apk})")

    step("Checksums")
    lines = []
    for path in sorted(p for p in out.rglob("*") if p.is_file()):
        rel = path.relative_to(out).as_posix()
        if "__pycache__" not in rel:
            lines.append(f"{sha256(path)}  {rel}")
    (out / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"\nBundle ready: {out} ({size / 1024**3:.2f} GB)")


if __name__ == "__main__":
    main()
