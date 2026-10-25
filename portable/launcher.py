"""Portable Windows mode of the archive inventory: the whole PC side, without Docker, started by
ONE command. Only Python 3.12 is installed on the PC; everything else is unzipped in this folder:

  runtime\\php          PHP 8.4 (php-cgi for the web, php for the queue workers and the scheduler)
  runtime\\nginx        web server, on 127.0.0.1 only
  runtime\\meilisearch  search engine
  runtime\\python       Python packages of the two OCR services (Windows OCR, PaddleOCR)

This launcher prepares what is missing (settings, database, search index, admin account), starts
every process, restarts any that stops, and stops them all together. Its processes belong to a
Windows "job": if the launcher window is closed, nothing keeps running behind it.

  Demarrer.bat                      start everything (opens the browser)
  Arreter.bat                       stop everything (lets running jobs finish first)
  launcher.py etat                  what is running
  launcher.py admin [--username X]  create an administrator / reset its password
  launcher.py sauvegarde [DEST]     backup to a USB drive (database, search index, photos)
  launcher.py restauration DIR      restore a backup (application stopped)
  launcher.py verifier              end-to-end test with a sample export (application started)
  launcher.py envoyer [DEST]        copy this PC's donnees\\ to a USB drive (only what changed)
  launcher.py recevoir [SOURCE]     replace this PC's donnees\\ by the copy from another PC
  launcher.py artisan ...           any Laravel command, with the application's settings

Everything another PC needs is in ONE folder, donnees\\ (database, photos, search index, keys):
two PCs used one at a time stay in step by copying it, application stopped on both. What
belongs to one PC (settings, logs, Windows OCR files, import folders, nightly backups) stays out.
"""

import argparse
import base64
import ctypes
import datetime
import gzip
import json
import msvcrt
import os
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import closing
from ctypes import wintypes
from pathlib import Path

HERE = Path(__file__).resolve().parent          # <root>\app\portable
ROOT = HERE.parent.parent                       # the folder holding Demarrer.bat
APP = ROOT / "app"
RUNTIME = ROOT / "runtime"
SYSTEM = ROOT / "systeme"                       # this PC only: logs, caches, Windows OCR files
LOGS = SYSTEM / "journaux"
SETTINGS = ROOT / "parametres.env"              # this PC only: port, workers...
DATA = ROOT / "donnees"                         # what a second PC needs, nothing else
DATABASE = DATA / "base" / "archive.sqlite"
PHOTOS = DATA / "photos"
SEARCH_DATA = DATA / "recherche"
KEYS = DATA / "cles.env"                        # APP_KEY (phone PINs) and the search engine key
DATA_INFO = DATA / "INFO.json"                  # which PC used it last, running or stopped
SECRET_KEYS = ("APP_KEY", "MEILI_MASTER_KEY")
SYNC_FOLDER = "ArchiveInventory-Donnees"        # name of the copy on the USB drive
STOP_FILE = SYSTEM / "arret.demande"
STATE_FILE = SYSTEM / "etat.json"

PHP_DIR = RUNTIME / "php"
NGINX_DIR = RUNTIME / "nginx"
MEILI_EXE = RUNTIME / "meilisearch" / "meilisearch.exe"
PY_PACKAGES = RUNTIME / "python"
PADDLE_MODELS = RUNTIME / "paddle-models"
BACKEND = APP / "backend"
WINDOWS_OCR_FILES = ("oneocr.dll", "oneocr.onemodel", "onnxruntime.dll")
DATA_FOLDERS = ("import", "processing", "imported", "failed", "backups")

# Written to parametres.env on the first start; the user may change them there.
DEFAULTS = {
    "HTTP_PORT": "80",
    "PHP_WORKERS": "4",
    "PIPELINE_WORKERS": "3",
    "OCR_ENGINE": "windows",
    "PADDLE_OCR": "on",
    "OCR_PROCESSES": "1",
    "OCR_CPU_THREADS": "3",
    "WINDOWS_OCR_ENGINES": "2",
    "LOG_LEVEL": "info",
    "OPEN_BROWSER": "1",
}
SETTINGS_HELP = """\
# Paramètres de l'Inventaire des archives (mode portable, sans Docker).
# Modifier puis : Arreter.bat, Demarrer.bat.
#
# HTTP_PORT          port de la page web (http://localhost:<port>), sur ce PC seulement
# PHP_WORKERS        pages web servies en parallèle
# PIPELINE_WORKERS   photos lues (OCR) en parallèle
# OCR_ENGINE         windows = OCR de l'Outil Capture d'écran, PaddleOCR s'il est absent ; paddle = PaddleOCR seul
# PADDLE_OCR         on/off : PaddleOCR (secours de l'OCR Windows, ~1 Go de mémoire)
# OCR_PROCESSES      processus PaddleOCR (~1 Go de mémoire chacun)
# OPEN_BROWSER       1 = ouvrir le navigateur au démarrage
# PC_NAME            nom de ce PC dans les messages de synchronisation (par défaut : le nom Windows)
#
# Les clés secrètes ne sont pas ici mais dans donnees\\cles.env (elles suivent les données d'un PC à l'autre).
"""
KEYS_HELP = """\
# Clés secrètes de ces données, créées à la première installation. NE PAS MODIFIER :
# APP_KEY chiffre les codes PIN des téléphones (elle est aussi dans les sauvegardes USB).
"""

# Internal ports, all on 127.0.0.1. 8010 is the one the Docker mode's Windows OCR service uses too.
MEILI_PORT = 7771
PADDLE_PORT = 8771
WINDOWS_OCR_PORT = 8010
PHP_FIRST_PORT = 9171

CREATE_NO_WINDOW = 0x08000000
CREATE_NEW_PROCESS_GROUP = 0x00000200


# ------------------------------------------------------------------ console

def step(text): print(f"\n== {text}", flush=True)
def ok(text): print(f"   OK  {text}", flush=True)
def warn(text): print(f"   !!  {text}", flush=True)
def fail(text): print(f"   XX  {text}", flush=True)


def log_line(text):
    LOGS.mkdir(parents=True, exist_ok=True)
    with open(LOGS / "lanceur.log", "a", encoding="utf-8") as f:
        f.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {text}\n")


class Abort(Exception):
    """Startup cannot continue; the message tells the user what to do."""


# ------------------------------------------------------------------ settings

def read_env_file(path: Path) -> dict:
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def read_settings() -> dict:
    return read_env_file(SETTINGS) | read_env_file(KEYS)


def write_keys(keys: dict):
    KEYS.parent.mkdir(parents=True, exist_ok=True)
    KEYS.write_text(KEYS_HELP + "".join(f"{k}={keys[k]}\n" for k in SECRET_KEYS), encoding="utf-8")


def ensure_settings() -> dict:
    settings, keys = read_env_file(SETTINGS), read_env_file(KEYS)
    created = not SETTINGS.exists()
    # An earlier version kept the keys in parametres.env: they move to donnees\cles.env.
    old = {k: settings[k] for k in SECRET_KEYS if k in settings}
    if not all(k in keys for k in SECRET_KEYS):
        keys = old | keys
        keys.setdefault("APP_KEY", "base64:" + base64.b64encode(os.urandom(32)).decode())
        keys.setdefault("MEILI_MASTER_KEY", secrets.token_hex(24))
        write_keys(keys)
    if old:
        lines = SETTINGS.read_text(encoding="utf-8-sig").splitlines()
        SETTINGS.write_text("".join(l + "\n" for l in lines if l.split("=", 1)[0].strip() not in SECRET_KEYS
                                    and "APP_KEY et MEILI_MASTER_KEY" not in l and "ne pas les changer (APP_KEY" not in l),
                            encoding="utf-8")
        settings = {k: v for k, v in settings.items() if k not in SECRET_KEYS}
    missing = {k: v for k, v in DEFAULTS.items() if k not in settings}
    if missing:
        with open(SETTINGS, "a", encoding="utf-8") as f:
            if created:
                f.write(SETTINGS_HELP + "\n")
            for key, value in missing.items():
                f.write(f"{key}={value}\n")
        settings.update(missing)
    return settings | keys


def move_to_data_folder():
    """First start of this version on a PC set up by the previous one: database and index were in
    systeme\\, photos in storage\\. They move (same drive: instant) into donnees\\."""
    for old, new in ((SYSTEM / "base", DATABASE.parent), (SYSTEM / "recherche", SEARCH_DATA), (ROOT / "storage", PHOTOS)):
        if old.is_dir() and any(old.iterdir()) and not (new.exists() and any(new.iterdir())):
            new.parent.mkdir(parents=True, exist_ok=True)
            if new.exists():
                new.rmdir()
            old.rename(new)
            ok(f"Déplacé dans {DATA} : {old.name}")


def app_version() -> str:
    for candidate in (APP / "VERSION", ROOT / "VERSION"):
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    return "dev"


def posix(path: Path) -> str:
    return str(path).replace("\\", "/")


def http_port(cfg) -> int:
    return int(cfg["HTTP_PORT"])


def app_url(cfg) -> str:
    port = http_port(cfg)
    return "http://localhost" + ("" if port == 80 else f":{port}")


def php_env(cfg) -> dict:
    """Environment of every PHP process: what docker-compose.yml gives the app containers."""
    env = os.environ.copy()
    env.update({
        "APP_NAME": "Inventaire des archives",
        "APP_ENV": "production",
        "APP_KEY": cfg["APP_KEY"],
        "APP_DEBUG": "false",
        "APP_URL": app_url(cfg),
        "APP_VERSION": app_version(),
        "APP_LOCALE": "fr",
        "APP_FALLBACK_LOCALE": "en",
        "LARAVEL_STORAGE_PATH": str(SYSTEM / "laravel"),
        "SESSION_DRIVER": "file",
        "SESSION_LIFETIME": "480",
        "CACHE_STORE": "file",
        "QUEUE_CONNECTION": "database",
        "DB_QUEUE_RETRY_AFTER": "4000",
        "LOG_CHANNEL": "daily",
        "LOG_LEVEL": cfg["LOG_LEVEL"],
        "DB_CONNECTION": "sqlite",
        "DB_DATABASE": str(DATABASE),
        "DB_BUSY_TIMEOUT": "30000",
        "DB_JOURNAL_MODE": "wal",
        "DB_SYNCHRONOUS": "normal",
        "DB_TRANSACTION_MODE": "IMMEDIATE",
        "OCR_ENGINE": cfg["OCR_ENGINE"],
        "OCR_URL": f"http://127.0.0.1:{PADDLE_PORT}",
        "OCR_WINDOWS_URL": f"http://127.0.0.1:{WINDOWS_OCR_PORT}",
        "PIPELINE_WORKERS": cfg["PIPELINE_WORKERS"],
        "LLM_ENABLED": "false",
        "MEILISEARCH_HOST": f"http://127.0.0.1:{MEILI_PORT}",
        "MEILISEARCH_KEY": cfg["MEILI_MASTER_KEY"],
        "ARCHIVE_ROOT": posix(ROOT),
        "ARCHIVE_HOST_PATH": str(ROOT),
        "ARCHIVE_PHOTOS_PATH": posix(PHOTOS),
        "ARCHIVE_PHOTOS_HOST_PATH": str(PHOTOS),
        "MANIFEST_SCHEMA": str(APP / "shared" / "manifest.schema.json"),
    })
    return env


def python_cmd(*args) -> list[str]:
    """Python of the OCR services, isolated from the PC's own packages (see pyrun.py)."""
    py = str(Path(sys.executable).with_name("python.exe"))
    return [py, "-S", "-X", "utf8", str(HERE / "pyrun.py"), str(PY_PACKAGES), *map(str, args)]


def python_env(extra_path: Path | None = None) -> dict:
    env = os.environ.copy()
    env.pop("PYTHONHOME", None)
    env.update({
        "PYTHONPATH": str(extra_path) if extra_path else "",
        "PYTHONNOUSERSITE": "1",
        "PYTHONUTF8": "1",
        "PYTHONUNBUFFERED": "1",
    })
    return env


def php_exe(cgi: bool = False) -> str:
    return str(PHP_DIR / ("php-cgi.exe" if cgi else "php.exe"))


def artisan(cfg, *args, check=True, capture=False, interactive=False) -> subprocess.CompletedProcess:
    cmd = [php_exe(), "artisan", *args]
    kwargs = {"cwd": BACKEND, "env": php_env(cfg)}
    if capture:
        kwargs.update(capture_output=True, text=True, encoding="utf-8", errors="replace")
    elif not interactive:
        kwargs.update(stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    proc = subprocess.run(cmd, **kwargs)
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:] if not interactive else []
        raise Abort(f"php artisan {' '.join(args)} a échoué" + ("".join(f"\n      {l}" for l in detail)))
    return proc


# ------------------------------------------------------------------ checks

def check_layout():
    if sys.version_info[:2] != (3, 12) or sys.maxsize < 2**32:
        raise Abort(f"Python 3.12 64 bits est nécessaire (ici : {sys.version.split()[0]}). "
                    r"Installer prerequis\python-3.12.*-amd64.exe.")
    if not str(ROOT).isascii() or " " in str(ROOT):
        raise Abort(f"Le dossier {ROOT} contient des accents ou des espaces, que le serveur web ne sait pas lire. "
                    r"Le déplacer, par exemple vers C:\ArchiveInventory.")
    missing = [p for p in (php_exe(), php_exe(cgi=True), NGINX_DIR / "nginx.exe", MEILI_EXE, BACKEND / "vendor")
               if not Path(p).exists()]
    if missing:
        raise Abort("Fichiers manquants (copie de la clé incomplète ?) : " + ", ".join(map(str, missing)))


def port_in_use(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def http_json(url: str, timeout: float = 2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "null")
    except (OSError, ValueError):
        return None


def http_ok(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return 200 <= r.status < 300
    except (OSError, ValueError):
        return False


def wait_for(probe, seconds: float) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if probe():
            return True
        time.sleep(0.5)
    return False


# ------------------------------------------------------------------ preparation

def write_php_ini():
    """php.ini with the absolute extension folder: PHP would read a relative one from the current
    folder, and child processes (schedule:work runs php itself) get no -d options."""
    template = (PHP_DIR / "php-portable.ini").read_text(encoding="utf-8")
    ext = PHP_DIR / "ext"
    (PHP_DIR / "php.ini").write_text(f'extension_dir = "{ext}"\n' + template, encoding="utf-8")


def write_nginx_conf(cfg):
    workers = int(cfg["PHP_WORKERS"])
    conf_dir = SYSTEM / "nginx"
    for sub in ("logs", "temp"):
        (conf_dir / sub).mkdir(parents=True, exist_ok=True)
    upstream = "\n".join(f"        server 127.0.0.1:{PHP_FIRST_PORT + i};" for i in range(workers))
    template = (HERE / "conf" / "nginx.conf").read_text(encoding="utf-8")
    text = (template.replace("@PORT@", str(http_port(cfg)))
            .replace("@NGINX@", posix(NGINX_DIR))
            .replace("@PUBLIC@", posix(BACKEND / "public"))
            .replace("@UPSTREAM@", upstream))
    (conf_dir / "nginx.conf").write_text(text, encoding="utf-8")


def ensure_folders():
    for name in DATA_FOLDERS:
        (ROOT / name).mkdir(exist_ok=True)
    (ROOT / "backups" / ".search-dumps").mkdir(exist_ok=True)
    for sub in ("app", "framework/cache/data", "framework/sessions", "framework/views", "logs"):
        (SYSTEM / "laravel" / sub).mkdir(parents=True, exist_ok=True)
    for path in (DATABASE.parent, PHOTOS, SEARCH_DATA, LOGS, SYSTEM / "ocr-windows"):
        path.mkdir(parents=True, exist_ok=True)


def copy_windows_ocr_files() -> bool:
    """The Snipping Tool engine belongs to Microsoft: never shipped, copied from this PC's own
    Snipping Tool (see windows-ocr/setup.ps1, which does the same for the Docker mode)."""
    target = SYSTEM / "ocr-windows"
    if all((target / f).exists() for f in WINDOWS_OCR_FILES):
        return True
    sources = []
    ps = ("Get-AppxPackage -Name Microsoft.ScreenSketch | Sort-Object Version -Descending | "
          "Select-Object -First 1 -ExpandProperty InstallLocation")
    try:
        found = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True,
                               timeout=60, creationflags=CREATE_NO_WINDOW).stdout.strip()
        if found:
            sources.append(Path(found) / "SnippingTool")
    except (OSError, subprocess.SubprocessError):
        pass
    sources.append(APP / "windows-ocr" / "ocr_data")  # a developer's copy, if any
    for source in sources:
        if all((source / f).exists() for f in WINDOWS_OCR_FILES):
            try:
                for f in WINDOWS_OCR_FILES:
                    shutil.copy2(source / f, target / f)
                return True
            except OSError as e:
                warn(f"Copie depuis {source} impossible : {e}")
    return False


def ensure_vc_runtime():
    """PHP needs the Visual C++ runtime. build.py puts it next to php.exe; if that copy is missing
    and Windows has none, take the one installed with Python."""
    for dll in ("vcruntime140.dll", "vcruntime140_1.dll"):
        if not (PHP_DIR / dll).exists() and not (Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / dll).exists():
            source = Path(sys.base_prefix) / dll
            if source.exists():
                shutil.copy2(source, PHP_DIR / dll)


# sqlite3's "with connection" commits but does not close: closing() too, or the launcher itself would keep
# the database (and its -wal file) open, which Windows then refuses to replace on a restore.
def release_interrupted_jobs():
    """Jobs a killed worker left 'reserved' would wait DB_QUEUE_RETRY_AFTER (over an hour) before
    being retried. No worker runs yet, so any reservation is a leftover."""
    with closing(sqlite3.connect(DATABASE, timeout=30)) as db, db:
        has_jobs = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='jobs'").fetchone()
        if has_jobs:
            n = db.execute("UPDATE jobs SET reserved_at = NULL WHERE reserved_at IS NOT NULL").rowcount
            if n:
                ok(f"{n} tâche(s) interrompue(s) remise(s) en file")


def admin_exists() -> bool:
    try:
        with closing(sqlite3.connect(DATABASE, timeout=30)) as db, db:
            return db.execute("SELECT count(*) FROM users WHERE role = 'admin'").fetchone()[0] > 0
    except sqlite3.Error:
        return False


def database_ok() -> bool:
    with closing(sqlite3.connect(DATABASE, timeout=30)) as db:
        return db.execute("PRAGMA quick_check").fetchone()[0] == "ok"


def checkpoint_database():
    """Puts the WAL back into archive.sqlite and removes it (closing the last connection does):
    the database is then a single file, safe to copy. The PHP processes are killed, so SQLite
    would otherwise leave the latest changes in archive.sqlite-wal."""
    if DATABASE.exists():
        try:
            with closing(sqlite3.connect(DATABASE, timeout=30)) as db:
                db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except sqlite3.Error as e:
            warn(f"Base de données : {e}")


# ------------------------------------------------------------------ the data folder between PCs

def read_info(folder: Path = DATA) -> dict:
    try:
        return json.loads((folder / "INFO.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_info(**changes):
    info = read_info() | changes
    DATA.mkdir(parents=True, exist_ok=True)
    DATA_INFO.write_text(json.dumps(info, indent=2, ensure_ascii=False), encoding="utf-8")


def pc_name() -> str:
    """How this PC is named in donnees\\INFO.json: PC_NAME in parametres.env, or the Windows name."""
    return read_env_file(SETTINGS).get("PC_NAME") or socket.gethostname()


def now_iso() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


def last_use(info: dict) -> str:
    return info.get("stopped_at") or info.get("started_at") or ""


def version_key(version: str) -> tuple:
    return tuple(int(n) for n in re.findall(r"\d+", version)) or (0,)


def check_data_folder() -> bool:
    """At start: where does donnees\\ come from? Returns True when the search index must be rebuilt."""
    info, here = read_info(), pc_name()
    if not DATABASE.exists():
        return False
    other_pc = bool(info.get("pc")) and info["pc"] != here
    if other_pc:
        ok(f"Données venant du PC {info['pc']} (utilisées le {last_use(info).replace('T', ' à ')})")
        if info.get("running"):
            warn(f"Elles ont été copiées pendant que l'application tournait sur {info['pc']} : "
                 "le travail des dernières minutes peut manquer. La prochaine fois, l'arrêter avant de copier.")
    if other_pc or info.get("running"):
        if not database_ok():
            raise Abort("La base de données est abîmée (copie interrompue ou faite application démarrée ?). "
                        "Recopier le dossier donnees depuis l'autre PC, application arrêtée, ou restaurer une sauvegarde.")
        ok("Base de données vérifiée")
    data_version = info.get("version")
    if data_version and version_key(data_version) > version_key(app_version()):
        raise Abort(f"Ces données viennent d'une version plus récente ({data_version}) que celle de ce PC "
                    f"({app_version()}) : mettre ce PC à jour d'abord.")
    if not (SEARCH_DATA / "data.ms").exists() or (data_version and data_version != app_version()):
        # Another version of the search engine may not read this index: rebuilt from the database.
        shutil.rmtree(SEARCH_DATA, ignore_errors=True)
        SEARCH_DATA.mkdir(parents=True, exist_ok=True)
        return True
    return False


# ------------------------------------------------------------------ processes

class Job:
    """A Windows job object holding this launcher and, by inheritance, every process it starts:
    when the launcher ends (window closed, crash), Windows kills them all."""

    def __init__(self):
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.GetCurrentProcess.restype = wintypes.HANDLE
        k32.SetInformationJobObject.argtypes = (wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD)
        k32.AssignProcessToJobObject.argtypes = (wintypes.HANDLE, wintypes.HANDLE)
        self.handle = k32.CreateJobObjectW(None, None)

        class BasicLimits(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class IoCounters(ctypes.Structure):
            _fields_ = [(n, ctypes.c_uint64) for n in ("r", "w", "o", "rb", "wb", "ob")]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [("Basic", BasicLimits), ("Io", IoCounters), ("ProcessMemoryLimit", ctypes.c_size_t),
                        ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t),
                        ("PeakJobMemoryUsed", ctypes.c_size_t)]

        info = ExtendedLimits()
        info.Basic.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(self.handle, 9, ctypes.byref(info), ctypes.sizeof(info))
        if not k32.AssignProcessToJobObject(self.handle, k32.GetCurrentProcess()):
            warn("Les processus ne seront pas arrêtés automatiquement si cette fenêtre est fermée.")


def kill_tree(pid: int):
    subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=CREATE_NO_WINDOW)


class Service:
    def __init__(self, name, cmd, cwd, env, ready_url=None):
        self.name, self.cmd, self.cwd, self.env, self.ready_url = name, cmd, cwd, env, ready_url
        self.proc: subprocess.Popen | None = None
        self.started_at = 0.0
        self.restarts = 0
        self.next_start = 0.0
        self.backoff = 1

    def start(self):
        log = LOGS / f"{self.name}.log"
        if log.exists() and log.stat().st_size > 10 * 1024 * 1024:
            log.replace(log.with_suffix(".log.1"))
        out = open(log, "ab")
        out.write(f"\n--- {datetime.datetime.now():%Y-%m-%d %H:%M:%S} start\n".encode())
        out.flush()
        # No console: Ctrl+C in the launcher window must not reach them (the launcher stops them in order).
        self.proc = subprocess.Popen(self.cmd, cwd=self.cwd, env=self.env, stdin=subprocess.DEVNULL, stdout=out,
                                     stderr=subprocess.STDOUT, creationflags=CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        out.close()
        self.started_at = time.time()

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def ready(self) -> bool:
        return self.alive() and (self.ready_url is None or http_ok(self.ready_url))

    def watch(self):
        """Restarts the process if it stopped, waiting longer after each quick failure."""
        if self.proc is None or self.alive():
            return
        now = time.time()
        if not self.next_start:
            code = self.proc.returncode
            if code == 0:
                # On purpose: queue workers every hour (--max-time), php-cgi after PHP_FCGI_MAX_REQUESTS.
                self.next_start = now
            else:
                self.backoff = 1 if now - self.started_at > 60 else min(self.backoff * 2, 60)
                self.next_start = now + self.backoff
                log_line(f"{self.name} arrêté (code {code}), redémarrage dans {self.backoff} s")
                warn(f"{self.name} s'est arrêté (code {code}) : redémarrage. Journal : {LOGS / (self.name + '.log')}")
        if self.next_start and now >= self.next_start:
            self.next_start = 0.0
            self.restarts += 1
            self.start()

    def stop(self):
        if self.alive():
            kill_tree(self.proc.pid)
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                pass
        self.proc = None


def build_services(cfg, windows_ocr: str) -> dict[str, list[Service]]:
    """Groups in start order. windows_ocr: "own" (started here), "external" (already running) or "none"."""
    env = php_env(cfg)
    worker = [php_exe(), "artisan", "queue:work", "--sleep=2", "--tries=3", "--timeout=3700", "--max-time=3600"]
    php_cgi_env = dict(env, PHP_FCGI_MAX_REQUESTS="10000")
    groups = {
        "recherche": [Service("recherche", [str(MEILI_EXE), "--db-path", str(SEARCH_DATA / "data.ms"),
                                            "--http-addr", f"127.0.0.1:{MEILI_PORT}", "--env", "production",
                                            "--master-key", cfg["MEILI_MASTER_KEY"], "--no-analytics",
                                            "--dump-dir", str(ROOT / "backups" / ".search-dumps"),
                                            # The PC is shared with the OCR: bounded while indexing.
                                            "--max-indexing-memory", "1Gb", "--max-indexing-threads", "2"],
                              SEARCH_DATA, os.environ.copy(), f"http://127.0.0.1:{MEILI_PORT}/health")],
        "ocr": [],
        "web": [Service(f"php-{i + 1}", [php_exe(cgi=True), "-b", f"127.0.0.1:{PHP_FIRST_PORT + i}"],
                        BACKEND / "public", php_cgi_env) for i in range(int(cfg["PHP_WORKERS"]))]
               + [Service("nginx", [str(NGINX_DIR / "nginx.exe"), "-p", posix(SYSTEM / "nginx") + "/",
                                    "-c", posix(SYSTEM / "nginx" / "nginx.conf")],
                          NGINX_DIR, os.environ.copy(), f"http://127.0.0.1:{http_port(cfg)}/up")],
        "travail": [Service("import", worker + ["--queue=imports,default"], BACKEND, env)]
                   + [Service(f"traitement-{i + 1}", worker + ["--queue=index,ocr"], BACKEND, env)
                      for i in range(int(cfg["PIPELINE_WORKERS"]))]
                   + [Service("planificateur", [php_exe(), "artisan", "schedule:work"], BACKEND, env)],
    }
    if windows_ocr == "own":
        groups["ocr"].append(Service(
            "ocr-windows", python_cmd(APP / "windows-ocr" / "ocr_service.py", "--port", WINDOWS_OCR_PORT,
                                      "--data-dir", SYSTEM / "ocr-windows", "--log-file", LOGS / "ocr-windows-service.log",
                                      "--engines", cfg["WINDOWS_OCR_ENGINES"]),
            APP / "windows-ocr", python_env(), f"http://127.0.0.1:{WINDOWS_OCR_PORT}/health"))
    paddle_wanted = cfg["PADDLE_OCR"].lower() not in ("off", "0", "non", "no", "false")
    if paddle_wanted or windows_ocr == "none" or cfg["OCR_ENGINE"] == "paddle":
        # Without the Windows OCR, PaddleOCR reads every photo: at least 2 processes.
        processes = str(int(cfg["OCR_PROCESSES"]) if windows_ocr != "none" else max(int(cfg["OCR_PROCESSES"]), 2))
        paddle_env = dict(python_env(APP / "ocr-worker"), PADDLE_PDX_CACHE_HOME=str(PADDLE_MODELS),
                          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="True", HF_HUB_OFFLINE="1",
                          OMP_NUM_THREADS=cfg["OCR_CPU_THREADS"], OCR_CPU_THREADS=cfg["OCR_CPU_THREADS"])
        cmd = python_cmd("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", PADDLE_PORT,
                         "--timeout-keep-alive", "30", "--workers", processes)
        if int(processes) > 1:
            cmd += ["--timeout-worker-healthcheck", "600"]
        groups["ocr"].append(Service("ocr-paddle", cmd, APP / "ocr-worker", paddle_env,
                                     f"http://127.0.0.1:{PADDLE_PORT}/health"))
    return groups


# ------------------------------------------------------------------ lock

class Lock:
    """One launcher at a time: an OS lock on systeme\\lanceur.lock (released if it crashes)."""

    def __init__(self):
        SYSTEM.mkdir(parents=True, exist_ok=True)
        self.file = open(SYSTEM / "lanceur.lock", "a+")

    def acquire(self) -> bool:
        try:
            self.file.seek(0)
            msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False

    def release(self):
        try:
            self.file.seek(0)
            msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
        except OSError:
            pass


def launcher_running() -> bool:
    lock = Lock()
    if lock.acquire():
        lock.release()
        return False
    return True


# ------------------------------------------------------------------ start

def start(args):
    print(f"Inventaire des archives — mode portable ({ROOT})", flush=True)
    lock = Lock()
    if not lock.acquire():
        cfg = read_settings()
        ok("L'application est déjà démarrée.")
        if cfg.get("HTTP_PORT"):
            os.startfile(app_url(cfg))
        return 0
    job = Job()  # noqa: F841 (kept alive for the whole run)
    code = 0
    STOP_FILE.unlink(missing_ok=True)

    step("1. Vérifications")
    check_layout()
    ok(f"Python {sys.version.split()[0]}")
    move_to_data_folder()
    cfg = ensure_settings()
    ok(f"Paramètres : {SETTINGS}")
    ensure_folders()
    reindex = check_data_folder()
    ensure_vc_runtime()
    write_php_ini()
    write_nginx_conf(cfg)
    busy = [p for p in [http_port(cfg), MEILI_PORT, PADDLE_PORT] + [PHP_FIRST_PORT + i for i in range(int(cfg["PHP_WORKERS"]))]
            if port_in_use(p)]
    if busy:
        hint = " (le port 80 est peut-être pris par l'application Docker : l'arrêter, ou mettre HTTP_PORT=8080 dans parametres.env)" \
            if http_port(cfg) in busy else ""
        raise Abort(f"Port(s) déjà utilisé(s) sur ce PC : {', '.join(map(str, busy))}{hint}")
    free = shutil.disk_usage(ROOT).free
    (ok if free > 5 * 1024**3 else warn)(f"Espace libre : {free / 1024**3:.1f} Go")

    windows_ocr = "none"
    if cfg["OCR_ENGINE"] == "windows":
        health = http_json(f"http://127.0.0.1:{WINDOWS_OCR_PORT}/health")
        if health and health.get("status") == "ok":
            windows_ocr = "external"
            ok(f"OCR Windows déjà en service sur 127.0.0.1:{WINDOWS_OCR_PORT}")
        elif port_in_use(WINDOWS_OCR_PORT):
            warn(f"Port {WINDOWS_OCR_PORT} occupé par un autre programme : OCR Windows désactivé, PaddleOCR utilisé.")
        elif copy_windows_ocr_files():
            windows_ocr = "own"
            ok("OCR Windows (Outil Capture d'écran)")
        else:
            warn("OCR Windows introuvable (Outil Capture d'écran récent, avec « Actions de texte ») : PaddleOCR utilisé.")

    step("2. Base de données et recherche")
    first_run = not DATABASE.exists()
    DATABASE.touch(exist_ok=True)
    groups = build_services(cfg, windows_ocr)
    services: list[Service] = []
    try:
        write_info(pc=pc_name(), running=True, started_at=now_iso(), version=app_version())
        for s in groups["recherche"]:
            s.start()
            services.append(s)
        artisan(cfg, "optimize")
        artisan(cfg, "migrate", "--force")
        ok("Base de données " + ("créée" if first_run else "à jour") + f" : {DATABASE}")
        release_interrupted_jobs()
        if not wait_for(groups["recherche"][0].ready, 60):
            raise Abort(f"Le moteur de recherche ne démarre pas. Journal : {LOGS / 'recherche.log'}")
        if reindex:
            print("      index de recherche reconstruit depuis la base (quelques minutes pour beaucoup de documents)…", flush=True)
            artisan(cfg, "archive:search-setup", "--reindex", check=False)
        else:
            artisan(cfg, "archive:search-setup", check=False)
        ok("Moteur de recherche")

        step("3. Démarrage des services")
        for name in ("ocr", "web", "travail"):
            for s in groups[name]:
                s.start()
                services.append(s)
        nginx = next(s for s in groups["web"] if s.name == "nginx")
        if not wait_for(nginx.ready, 60):
            raise Abort(f"La page web ne répond pas. Journaux : {LOGS}")
        ok(f"Application : {app_url(cfg)}")
        for s in groups["ocr"]:
            label = {"ocr-windows": "OCR Windows", "ocr-paddle": "PaddleOCR"}[s.name]
            if wait_for(s.ready, 20 if s.name == "ocr-windows" else 5):
                ok(label)
            else:
                ok(f"{label} : en cours de chargement")

        if not admin_exists():
            step("4. Compte administrateur")
            if args.admin_password:  # unattended install / tests
                artisan(cfg, "archive:create-admin", f"--password={args.admin_password}")
            else:
                print("   Choisir le mot de passe du compte « admin » (8 caractères minimum, à noter en lieu sûr).")
                while artisan(cfg, "archive:create-admin", check=False, interactive=True).returncode != 0:
                    print("   Recommencer.")

        save_state(cfg, services, windows_ocr)
        if cfg.get("OPEN_BROWSER", "1") == "1" and not args.no_browser:
            os.startfile(app_url(cfg))
        print(f"\nL'application est prête : {app_url(cfg)}  (identifiant : admin)")
        print("NE PAS FERMER CETTE FENÊTRE. Pour arrêter : Arreter.bat, ou Ctrl+C ici.\n", flush=True)
        log_line(f"démarré ({len(services)} processus)")
        supervise(cfg, services, windows_ocr)
    except KeyboardInterrupt:
        pass
    except Abort as e:
        fail(str(e))
        log_line(f"échec : {e}")
        code = 1
    finally:
        stop_all(cfg, services)
        STATE_FILE.unlink(missing_ok=True)
        STOP_FILE.unlink(missing_ok=True)
        lock.release()
    return code


def supervise(cfg, services, windows_ocr):
    last_state = 0.0
    while not STOP_FILE.exists():
        for s in services:
            s.watch()
        if time.time() - last_state > 30:
            save_state(cfg, services, windows_ocr)
            last_state = time.time()
        time.sleep(1)


def stop_all(cfg, services):
    if not services:
        write_info(running=False, stopped_at=now_iso())
        return
    print("\nArrêt en cours…", flush=True)
    by_name = {s.name: s for s in services}
    if "planificateur" in by_name:
        by_name["planificateur"].stop()
    workers = [s for s in services if s.name == "import" or s.name.startswith("traitement-")]
    if any(w.alive() for w in workers):
        # Workers finish the job in hand, then exit. An import may take long: not waited for (it is
        # put back in the queue at the next start).
        artisan(cfg, "queue:restart", check=False)
        wait_for(lambda: not any(w.alive() for w in workers), 30)
    for s in reversed(services):
        s.stop()
    checkpoint_database()
    write_info(running=False, stopped_at=now_iso())
    log_line("arrêté")
    ok("Tout est arrêté.")


def save_state(cfg, services, windows_ocr):
    state = {
        "pid": os.getpid(),
        "url": app_url(cfg),
        "updated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "windows_ocr": windows_ocr,
        "services": {s.name: {"running": s.alive(), "restarts": s.restarts} for s in services},
    }
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


# ------------------------------------------------------------------ other commands

def stop(args):
    if not launcher_running():
        ok("L'application n'est pas démarrée.")
        return 0
    STOP_FILE.touch()
    print("Arrêt demandé…", flush=True)
    if wait_for(lambda: not launcher_running(), 90):
        ok("Tout est arrêté.")
        return 0
    state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    if state.get("pid"):
        kill_tree(state["pid"])
        ok("Arrêt forcé.")
        return 0
    fail("Le lanceur ne répond pas : fermer sa fenêtre.")
    return 1


def status(args):
    if not launcher_running() or not STATE_FILE.exists():
        print("L'application n'est pas démarrée.")
        return 1
    state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    print(f"Démarrée : {state['url']} (état du {state['updated_at']})")
    for name, s in state["services"].items():
        print(f"   {'OK' if s['running'] else 'XX'}  {name:<16} {'' if not s['restarts'] else str(s['restarts']) + ' redémarrage(s)'}")
    print(f"   OCR Windows : {dict(own='oui', external='oui (service déjà installé)', none='non')[state['windows_ocr']]}")
    return 0


def prepared_cfg() -> dict:
    check_layout()
    cfg = ensure_settings()
    ensure_folders()
    ensure_vc_runtime()
    write_php_ini()
    return cfg


def admin(args):
    cfg = prepared_cfg()
    if not DATABASE.exists():
        raise Abort("Démarrer l'application une première fois (Demarrer.bat).")
    return artisan(cfg, "archive:create-admin", f"--username={args.username}", check=False, interactive=True).returncode


def run_artisan(args):
    cfg = prepared_cfg()
    return subprocess.run([php_exe(), "artisan", *args.rest], cwd=BACKEND, env=php_env(cfg)).returncode


def robocopy(source: Path, target: Path, mirror: bool = False) -> bool:
    """Copies only what changed. Without mirror (/E), nothing is ever deleted from the target: a
    photo stays in the backup even if it disappeared from the PC."""
    code = subprocess.run(["robocopy", str(source), str(target), "/MIR" if mirror else "/E", "/R:2", "/W:2",
                           "/NFL", "/NDL", "/NP", "/NJH", "/NJS"], capture_output=True).returncode
    return code < 8


def pick_folder(given: str | None, description: str) -> Path | None:
    if given:
        return Path(given)
    ps = ("Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; "
          f"$d.Description = '{description}'; $d.ShowNewFolderButton = $true; "
          "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }")
    chosen = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps], capture_output=True, text=True).stdout.strip()
    return Path(chosen) if chosen else None


def backup(args):
    """Same layout as the Docker mode's backup.ps1, with the SQLite copy instead of the MySQL dump."""
    cfg = prepared_cfg()
    if not launcher_running():
        raise Abort("Démarrer l'application (Demarrer.bat) avant de sauvegarder.")
    destination = pick_folder(args.destination, "Choisir le disque USB (ou le dossier) de sauvegarde")
    if not destination:
        return 1
    target = destination / "ArchiveInventory-Sauvegarde"
    step(f"Sauvegarde vers {target}")
    out = artisan(cfg, "archive:backup", capture=True, check=False)
    folder = next((l.strip() for l in reversed(out.stdout.splitlines()) if l.strip()[:4].isdigit()), None)
    if out.returncode != 0 or not folder:
        raise Abort("La sauvegarde de la base a échoué : " + (out.stdout + out.stderr).strip()[-500:])
    ok(f"Base et index sauvegardés ({folder})")
    if not robocopy(ROOT / "backups" / folder, target / "base" / folder):
        raise Abort("Copie de la base impossible (disque plein ou retiré ?)")
    ok("Base copiée")
    print("      photos (seules les nouvelles sont copiées)…", flush=True)
    if not robocopy(PHOTOS, target / "photos"):
        raise Abort("Copie des photos impossible (disque plein ou retiré ?)")
    ok("Photos copiées")
    (target / "app-key.txt").write_text(cfg["APP_KEY"] + "\n", encoding="ascii")
    (target / "LISEZMOI.txt").write_text(
        "Sauvegarde de l'Inventaire des archives — CONFIDENTIEL, à conserver en lieu sûr.\n"
        f"Dernière sauvegarde : {folder}\n\n"
        "base\\<date>\\database.sqlite.gz   base de données\n"
        "base\\<date>\\search.dump          index de recherche\n"
        "base\\<date>\\photos.csv           liste de contrôle des photos (empreintes SHA-256)\n"
        "photos\\                          toutes les photos des boîtes\n"
        "app-key.txt                      clé de l'application (pour relire les codes PIN des téléphones)\n\n"
        "Restauration : sur le PC où l'application est installée, application ARRÊTÉE :\n"
        f"  Restaurer.bat \"{target}\"\n", encoding="utf-8")
    ok(f"Terminé : {target}")
    print("\nRetirer le disque avec « Retirer le périphérique en toute sécurité ».")
    return 0


def restore(args):
    if launcher_running():
        raise Abort("Arrêter l'application (Arreter.bat) avant de restaurer.")
    move_to_data_folder()
    cfg = prepared_cfg()
    source = Path(args.source)
    bases = source / "base" if (source / "base").is_dir() else source
    dumps = [p for p in bases.iterdir() if (p / "database.sqlite.gz").exists()]
    name = args.backup or max(dumps, key=lambda p: (p / "database.sqlite.gz").stat().st_mtime, default=Path("?")).name
    dump = bases / (name or "?") / "database.sqlite.gz"
    if not dump.exists():
        raise Abort(f"Sauvegarde introuvable : {dump}")
    print(f"Restaurer la sauvegarde du {name} ?\nLa base de données actuelle sera REMPLACÉE. Les photos de la sauvegarde seront recopiées.")
    if not args.yes and input("Taper RESTAURER pour confirmer : ").strip() != "RESTAURER":
        return 1

    step("1. Copie de sécurité de la base actuelle")
    if DATABASE.exists():
        keep = ROOT / "backups" / f"avant-restauration-{datetime.datetime.now():%Y-%m-%d_%H%M%S}"
        keep.mkdir(parents=True)
        with closing(sqlite3.connect(DATABASE)) as db, db:
            db.execute("VACUUM INTO ?", (str(keep / "archive.sqlite"),))
        with open(keep / "archive.sqlite", "rb") as f, gzip.open(keep / "database.sqlite.gz", "wb", 6) as g:
            shutil.copyfileobj(f, g)
        (keep / "archive.sqlite").unlink()
        ok(f"Faite : {keep}  (Restaurer.bat \"{ROOT / 'backups'}\" -Backup {keep.name} pour y revenir)")

    step("2. Base de données")
    tmp = DATABASE.with_suffix(".restore")
    with gzip.open(dump, "rb") as g, open(tmp, "wb") as f:
        shutil.copyfileobj(g, f)
    with closing(sqlite3.connect(tmp)) as db, db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            tmp.unlink()
            raise Abort("La sauvegarde est abîmée (contrôle d'intégrité SQLite).")
    for leftover in (DATABASE.with_name(DATABASE.name + "-wal"), DATABASE.with_name(DATABASE.name + "-shm")):
        leftover.unlink(missing_ok=True)
    tmp.replace(DATABASE)
    ok("Base restaurée")

    step("3. Photos")
    if (source / "photos").is_dir():
        if not robocopy(source / "photos", PHOTOS):
            raise Abort("Copie des photos impossible")
        ok("Photos recopiées")
    else:
        ok("Pas de photos dans cette sauvegarde : celles du PC sont gardées")
    key_file = source / "app-key.txt"
    if key_file.exists() and key_file.read_text(encoding="ascii").strip() != cfg["APP_KEY"]:
        write_keys(read_env_file(KEYS) | {"APP_KEY": key_file.read_text(encoding="ascii").strip()})
        ok("Clé de l'application reprise de la sauvegarde (codes PIN lisibles)")

    step("4. Index de recherche")
    # Rebuilt from the restored database; needs the search engine, started here for that.
    cfg = ensure_settings()
    search = build_services(cfg, "none")["recherche"][0]
    search.start()
    try:
        if not wait_for(search.ready, 60):
            raise Abort("Le moteur de recherche ne démarre pas : l'index sera à reconstruire (launcher.py artisan archive:search-setup --reindex).")
        artisan(cfg, "optimize")
        artisan(cfg, "migrate", "--force")
        artisan(cfg, "archive:search-setup", "--reindex")
    finally:
        search.stop()
    ok("Restauration terminée : Demarrer.bat")
    return 0


def stop_for_copy() -> bool:
    """Stops the application if it runs (a copy of a live database is not safe). True if it ran."""
    if not launcher_running():
        return False
    print("L'application est arrêtée pendant la copie, puis redémarrée.", flush=True)
    if stop(argparse.Namespace()) != 0 or not wait_for(lambda: not launcher_running(), 30):
        raise Abort("Impossible d'arrêter l'application : fermer sa fenêtre puis recommencer.")
    return True


def start_in_new_window():
    subprocess.Popen(["cmd", "/c", "start", "Inventaire des archives", str(ROOT / "Demarrer.bat")], cwd=ROOT)
    ok("Application redémarrée dans une nouvelle fenêtre.")


def copy_data_folder(source: Path, target: Path):
    """Copies only what changed. INFO.json goes last and is removed first: a copy interrupted
    halfway (drive pulled out) has none, and recevoir refuses it."""
    (target / "INFO.json").unlink(missing_ok=True)
    print("      base de données et index de recherche…", flush=True)
    for sub in ("base", "recherche"):
        if not robocopy(source / sub, target / sub, mirror=True):
            raise Abort(f"Copie de {source / sub} impossible (disque plein ou retiré ?)")
    print("      photos (seules les nouvelles sont copiées)…", flush=True)
    if not robocopy(source / "photos", target / "photos"):
        raise Abort("Copie des photos impossible (disque plein ou retiré ?)")
    shutil.copy2(source / "cles.env", target / "cles.env")
    shutil.copy2(source / "INFO.json", target / "INFO.json")


def send(args):
    """This PC → USB drive (or any folder): a copy of donnees\\ that recevoir, or a plain folder
    copy, puts on the other PC."""
    prepared_cfg()
    if not DATABASE.exists():
        raise Abort("Pas encore de données sur ce PC.")
    destination = pick_folder(args.destination, "Choisir la clé USB (ou le dossier) où copier les données de ce PC")
    if not destination:
        return 1
    target = destination / SYNC_FOLDER
    was_running = stop_for_copy()
    try:
        step(f"Copie des données de ce PC vers {target}")
        checkpoint_database()
        write_info(running=False, stopped_at=last_use(read_info()) or now_iso())
        copy_data_folder(DATA, target)
        (target / "LISEZMOI.txt").write_text(
            "Données de l'Inventaire des archives — CONFIDENTIEL.\n"
            f"Copiées depuis le PC {pc_name()} le {now_iso().replace('T', ' à ')}.\n\n"
            "Sur l'autre PC : Recevoir-donnees.bat, puis choisir ce dossier (ou la clé).\n"
            "Ou à la main, application ARRÊTÉE : remplacer le dossier donnees de l'autre PC par ce dossier\n"
            f"(renommé donnees).\n", encoding="utf-8")
        ok(f"Terminé : {target}")
    finally:
        if was_running:
            start_in_new_window()
    print("\nRetirer la clé avec « Retirer le périphérique en toute sécurité », puis sur l'autre PC : Recevoir-donnees.bat")
    return 0


def receive(args):
    """USB drive → this PC: replaces donnees\\ by the copy made on the other PC (envoyer)."""
    source = pick_folder(args.source, "Choisir la clé USB (ou le dossier) contenant les données de l'autre PC")
    if not source:
        return 1
    if (source / SYNC_FOLDER).is_dir():
        source = source / SYNC_FOLDER
    if source.resolve() == DATA.resolve():
        raise Abort("C'est le dossier de données de ce PC lui-même.")
    if not all((source / p).exists() for p in ("base/archive.sqlite", "cles.env", "INFO.json")):
        raise Abort(f"{source} n'est pas une copie complète des données (copie interrompue ?) : refaire Envoyer-donnees.bat sur l'autre PC.")
    incoming, local = read_info(source), read_info()
    if incoming.get("running"):
        raise Abort(f"Ces données ont été copiées pendant que l'application tournait sur {incoming.get('pc')} : "
                    "l'y arrêter (Arreter.bat) puis refaire la copie.")
    if version_key(incoming.get("version", "0")) > version_key(app_version()):
        raise Abort(f"Ces données viennent d'une version plus récente ({incoming.get('version')}) : mettre ce PC à jour d'abord.")

    step("Données reçues")
    print(f"   de : PC {incoming.get('pc', '?')}, utilisées en dernier le {last_use(incoming).replace('T', ' à ')}")
    if DATABASE.exists():
        print(f"   remplacent celles de ce PC, utilisées en dernier le {last_use(local).replace('T', ' à ') or '?'}")
        newer_here = last_use(local) > last_use(incoming) and local.get("pc") == pc_name()
        if newer_here:
            warn("CE PC A ÉTÉ UTILISÉ APRÈS l'autre : le travail fait ici depuis sera PERDU "
                 "(une copie de sécurité de la base est gardée dans backups\\).")
        if not args.yes and input("Taper REMPLACER pour confirmer : ").strip() != "REMPLACER":
            return 1
    was_running = stop_for_copy()
    try:
        move_to_data_folder()
        if DATABASE.exists():
            keep = ROOT / "backups" / f"avant-reception-{datetime.datetime.now():%Y-%m-%d_%H%M%S}"
            keep.mkdir(parents=True)
            checkpoint_database()
            with open(DATABASE, "rb") as f, gzip.open(keep / "database.sqlite.gz", "wb", 6) as g:
                shutil.copyfileobj(f, g)
            for f in (KEYS, DATA_INFO):
                if f.exists():
                    shutil.copy2(f, keep / f.name)
            ok(f"Copie de sécurité de la base de ce PC : {keep}")
        step(f"Copie depuis {source}")
        DATA.mkdir(exist_ok=True)
        copy_data_folder(source, DATA)
        ok("Données de ce PC remplacées")
    finally:
        if was_running:
            start_in_new_window()
    if not was_running:
        print("\nDémarrer l'application : Demarrer.bat")
    return 0


def verify(args):
    cfg = prepared_cfg()
    if not launcher_running():
        raise Abort("Démarrer l'application (Demarrer.bat) avant la vérification.")
    report = [f"Vérification du {datetime.datetime.now():%Y-%m-%d %H:%M} (mode portable)"]
    step("Traitement complet d'un export d'exemple (quelques minutes)")
    sample = APP / "samples" / "selftest.zip"
    proc = subprocess.run([php_exe(), "artisan", "archive:selftest", str(sample), "--query=Benali", "--query=الداخلية",
                           f"--timeout={args.timeout}"], cwd=BACKEND, env=php_env(cfg),
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    print(proc.stdout + proc.stderr)
    report += (proc.stdout + proc.stderr).splitlines()
    file = ROOT / f"verification-{datetime.datetime.now():%Y%m%d-%H%M}.txt"
    file.write_text("\n".join(report) + "\n", encoding="utf-8")
    (ok if proc.returncode == 0 else fail)(f"VÉRIFICATION {'RÉUSSIE' if proc.returncode == 0 else 'ÉCHOUÉE'} — rapport : {file}")
    return proc.returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command")
    p = sub.add_parser("demarrer")
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--admin-password", help="first start without a prompt (tests)")
    sub.add_parser("arreter")
    sub.add_parser("etat")
    p = sub.add_parser("admin")
    p.add_argument("--username", default="admin")
    p = sub.add_parser("sauvegarde")
    p.add_argument("destination", nargs="?")
    p = sub.add_parser("restauration")
    p.add_argument("source")
    p.add_argument("-Backup", "--backup", dest="backup")
    p.add_argument("--yes", action="store_true")
    p = sub.add_parser("verifier")
    p.add_argument("--timeout", type=int, default=1800)
    p = sub.add_parser("envoyer")
    p.add_argument("destination", nargs="?")
    p = sub.add_parser("recevoir")
    p.add_argument("source", nargs="?")
    p.add_argument("--yes", action="store_true")
    p = sub.add_parser("artisan")
    p.add_argument("rest", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command is None:
        args = parser.parse_args(["demarrer", *sys.argv[1:]])
    handler = {"demarrer": start, "arreter": stop, "etat": status, "admin": admin, "sauvegarde": backup,
               "restauration": restore, "verifier": verify, "envoyer": send, "recevoir": receive,
               "artisan": run_artisan}[args.command]
    try:
        return handler(args)
    except Abort as e:
        fail(str(e))
        log_line(f"échec : {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
