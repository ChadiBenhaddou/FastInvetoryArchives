#!/bin/sh
# Creates .env next to docker-compose.yml with random secrets (Ubuntu).
# Usage:  scripts/init-env.sh [ARCHIVE_ROOT] [--force]     (default /srv/archive)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE_ROOT="${1:-/srv/archive}"
ENV_FILE="$ROOT/.env"

if [ -f "$ENV_FILE" ] && [ "$2" != "--force" ]; then
  echo ".env existe déjà ($ENV_FILE). Ajoutez --force pour le régénérer (les mots de passe de la base changeraient !)."
  exit 1
fi

secret() { head -c "$1" /dev/urandom | base64 | tr -d '\n+/='; }

# The Windows OCR engine is a Windows DLL: PaddleOCR only on Ubuntu (heavier: 2 photos at a time).
sed -e "s|^ARCHIVE_HOST_ROOT=.*|ARCHIVE_HOST_ROOT=$ARCHIVE_ROOT|" \
    -e "s|^OCR_ENGINE=.*|OCR_ENGINE=paddle|" \
    -e "s|^PIPELINE_WORKERS=.*|PIPELINE_WORKERS=2|" \
    -e "s|^APP_KEY=.*|APP_KEY=base64:$(head -c 32 /dev/urandom | base64 | tr -d '\n')|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(secret 24)|" \
    -e "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$(secret 24)|" \
    -e "s|^MEILI_MASTER_KEY=.*|MEILI_MASTER_KEY=$(secret 24)|" \
    "$ROOT/.env.example" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
mkdir -p "$ARCHIVE_ROOT"
echo ".env créé. Dossier des archives : $ARCHIVE_ROOT"
