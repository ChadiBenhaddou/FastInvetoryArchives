#!/usr/bin/env bash
# Builds the OFFLINE INSTALL BUNDLE on the connected development machine.
# Output: bundle/out/ArchiveInventory-<version>/  → copy the whole folder to a USB drive.
#
#   bundle/build-bundle.sh                      # version from ./VERSION
#   bundle/build-bundle.sh --with-installers    # + Docker Desktop and WSL installers (~1 GB)
#   bundle/build-bundle.sh --with-ubuntu=noble   # + Docker Engine .deb packages for that Ubuntu release
#   bundle/build-bundle.sh --skip-tests --skip-apk
#
# Windows: run it from Git Bash (docker and docker compose must work there).
set -euo pipefail
export MSYS_NO_PATHCONV=1 COMPOSE_PROJECT_NAME=archive-inventory

# Windows form (D:/...) under Git Bash: understood by docker build and docker run -v alike.
ROOT="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd; })"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
OUT="$ROOT/bundle/out/ArchiveInventory-$VERSION"
WITH_INSTALLERS=0 SKIP_TESTS=0 SKIP_APK=0 UBUNTU=""
for arg in "$@"; do
  case "$arg" in
    --with-installers) WITH_INSTALLERS=1 ;;
    --with-ubuntu=*) UBUNTU="${arg#*=}" ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --skip-apk) SKIP_APK=1 ;;
    *) echo "unknown option $arg"; exit 2 ;;
  esac
done

IMAGES=(
  "archive-inventory/app:$VERSION"
  "archive-inventory/ocr-worker:$VERSION"
  "mysql:8.4.9"
  "getmeili/meilisearch:v1.54.3"
  "ollama/ollama:0.40.8"
)
LLM_MODELS="qwen3:4b-instruct-2507-q4_K_M phi4-mini:3.8b-q4_K_M"
step() { echo; echo "=== $*"; }

step "Bundle $VERSION → $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"/{images,models,android,app/scripts,app/samples,prerequis}

if [ "$SKIP_TESTS" = 0 ]; then
  step "Tests: backend"
  docker build -q -f "$ROOT/docker/app/Dockerfile" --target test -t archive-inventory/app:test "$ROOT" >/dev/null
  docker run --rm archive-inventory/app:test php artisan test
  step "Tests: OCR (network disabled)"
  docker build -q --target test -t archive-inventory/ocr-worker:test "$ROOT/ocr-worker" >/dev/null
  docker run --rm --network none archive-inventory/ocr-worker:test
fi

step "Images"
(cd "$ROOT" && APP_VERSION="$VERSION" docker compose build app ocr-worker)
for image in "${IMAGES[@]}"; do
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
  file="$OUT/images/$(echo "$image" | tr '/:' '__').tar.gz"
  echo "  $image → $(basename "$file")"
  docker save "$image" | gzip -1 > "$file"
done

step "LLM models: $LLM_MODELS"
sh "$ROOT/scripts/pull-llm-models.sh" $LLM_MODELS
# Only the listed models (the volume may hold others tried during development): for each,
# its manifests (both layouts Ollama keeps), the blobs they reference and the blob metadata.
docker run --rm -v archive-inventory_ollama-models:/data:ro -v "$OUT/models:/out" -w /data \
  --entrypoint sh "archive-inventory/app:$VERSION" -c '
    set -e; files=""
    for m in "$@"; do
      name=${m%%:*} tag=${m#*:} found=""
      for manifest in "models/manifests/registry.ollama.ai/library/$name/$tag" "models/manifests-v2/ollama.com/library/$name/$tag"; do
        [ -f "$manifest" ] || continue
        found=1 files="$files $manifest"
        for d in $(grep -o "sha256:[0-9a-f]*" "$manifest" | sort -u); do
          files="$files models/blobs/sha256-${d#sha256:}"
          [ -f "models/metadata/sha256-${d#sha256:}.json" ] && files="$files models/metadata/sha256-${d#sha256:}.json"
        done
      done
      [ -n "$found" ] || { echo "missing model $m" >&2; exit 1; }
    done
    tar -cf /out/ollama-models.tar $(echo $files | tr " " "\n" | sort -u)' sh $LLM_MODELS

step "Android APK"
if [ "$SKIP_APK" = 0 ]; then sh "$ROOT/scripts/build-apk.sh"; fi
cp "$ROOT"/mobile/release/archive-capture-*.apk* "$OUT/android/"
cp "$ROOT/mobile/INSTALL-TELEPHONE.md" "$OUT/android/"

step "Sample exports"
cp "$ROOT"/samples/* "$OUT/app/samples/"

step "Application files"
# Production compose: the same file without the "build:" sections (no source code on the PC).
PYTHON=""
for candidate in python3 python "py -3"; do
  if $candidate -c 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)' 2>/dev/null; then PYTHON="$candidate"; break; fi
done
[ -n "$PYTHON" ] || { echo "Python 3 is required"; exit 1; }
$PYTHON - "$ROOT/docker-compose.yml" "$OUT/app/docker-compose.yml" <<'PY'
import sys
lines, out, skip = open(sys.argv[1], encoding="utf-8").read().splitlines(), [], None
for line in lines:
    indent = len(line) - len(line.lstrip())
    if skip is not None and (not line.strip() or indent > skip):
        continue
    skip = None
    if line.strip() == "build:":
        skip = indent
        continue
    out.append(line)
open(sys.argv[2], "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
PY
cp "$ROOT/docker-compose.gpu.yml" "$OUT/app/"
sed "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$ROOT/.env.example" > "$OUT/app/.env.example"
cp "$ROOT/scripts/init-env.ps1" "$ROOT/scripts/init-env.sh" "$OUT/app/scripts/"
cp "$ROOT"/bundle/target/scripts/* "$OUT/app/scripts/"
cp "$ROOT"/bundle/target/install.* "$ROOT"/bundle/target/update.* "$OUT/"
cp "$ROOT/README.md" "$OUT/LISEZMOI.md"
echo "$VERSION" > "$OUT/VERSION"
for f in $(find "$OUT" -name '*.sh'); do sed -i 's/\r$//' "$f"; done
# Windows PowerShell 5.1 reads .ps1 files without a BOM as ANSI: add one (accents, Arabic).
for f in $(find "$OUT" -name '*.ps1'); do
  head -c 3 "$f" | od -An -tx1 | grep -q 'ef bb bf' || { printf '\xEF\xBB\xBF' | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"; }
done

if [ "$WITH_INSTALLERS" = 1 ]; then
  step "Windows prerequisites (Docker Desktop, WSL)"
  curl -fL --retry 5 -o "$OUT/prerequis/Docker Desktop Installer.exe" \
    "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
  wsl_url=$(curl -fsSL https://api.github.com/repos/microsoft/WSL/releases/latest \
    | grep -oE 'https://[^"]+x64\.msi' | head -1)
  curl -fL --retry 5 -o "$OUT/prerequis/$(basename "$wsl_url")" "$wsl_url"
fi
if [ -n "$UBUNTU" ]; then
  step "Ubuntu prerequisites: Docker Engine for $UBUNTU"
  mkdir -p "$OUT/prerequis/ubuntu"
  pool="https://download.docker.com/linux/ubuntu/dists/$UBUNTU/pool/stable/amd64/"
  listing=$(curl -fsSL "$pool")
  for pkg in containerd.io docker-ce-cli docker-ce docker-buildx-plugin docker-compose-plugin; do
    deb=$(echo "$listing" | grep -oE "\"${pkg}_[^\"]+_amd64\.deb\"" | tr -d '"' | sort -V | tail -1)
    [ -n "$deb" ] || { echo "no $pkg package for $UBUNTU"; exit 1; }
    curl -fL --retry 5 -o "$OUT/prerequis/ubuntu/$deb" "$pool$deb"
  done
  # Their dependencies missing from a minimal install (iptables, nftables…), taken from a clean
  # image of that release: latest versions, so installing them never downgrades anything.
  docker run --rm -v "$OUT/prerequis/ubuntu:/u" "ubuntu:$UBUNTU" sh -c '
    apt-get update -qq && apt-get install -y -qq --no-install-recommends --download-only /u/*.deb >/dev/null &&
    mkdir -p /u/dependances && cp /var/cache/apt/archives/*.deb /u/dependances/'
fi
cat > "$OUT/prerequis/LISEZMOI.txt" <<'TXT'
Windows 10/11 sans Internet (détail : LISEZMOI.md, section 4) :
  1. BIOS : activer la virtualisation (Intel VT-x / AMD-V).
  2. PowerShell administrateur :
       dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
       dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
     puis redémarrer.
  3. Installer wsl.*.msi, redémarrer.
  4. Installer « Docker Desktop Installer.exe » (laisser « Use WSL 2 » coché), redémarrer.
  5. Lancer Docker Desktop sans se connecter à un compte, attendre « Engine running ».
     Settings > General : cocher « Start Docker Desktop when you sign in », décocher « Send usage statistics ».
     Settings > Software updates : décocher « Automatically check for updates ».
  6. Lancer install.ps1 (clic droit > Exécuter avec PowerShell).
Ubuntu : paquets Docker dans ubuntu/ (si fournis), voir LISEZMOI.md, section 5.
TXT

step "Checksums"
(cd "$OUT" && find . -type f ! -name SHA256SUMS | sed 's|^\./||' | sort | xargs -d '\n' sha256sum > SHA256SUMS)
du -sh "$OUT"
echo "Bundle ready: $OUT"
