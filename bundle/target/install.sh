#!/usr/bin/env bash
# Installation (ou mise à jour) hors ligne de l'Inventaire des archives — Ubuntu.
#   sudo ./install.sh [--dir /srv/archive] [--port 80] [--skip-verify]
# Une installation existante est détectée : MISE A JOUR (sauvegarde d'abord, données conservées).
set -uo pipefail
BUNDLE="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(tr -d '[:space:]' < "$BUNDLE/VERSION")"
DIR=/srv/archive PORT=80 PROJECT=archive-inventory SKIP_VERIFY=0 SKIP_SUMS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift ;;
    --port) PORT="$2"; shift ;;
    --project) PROJECT="$2"; shift ;;
    --skip-verify) SKIP_VERIFY=1 ;;
    --skip-checksums) SKIP_SUMS=1 ;;
  esac
  shift
done
APP="$DIR/app"
source "$BUNDLE/app/scripts/common.sh"
APP_DIR="$APP" ENV_FILE="$APP/.env"
UPDATE=0; [ -f "$ENV_FILE" ] && UPDATE=1
echo "Inventaire des archives $VERSION — $([ $UPDATE = 1 ] && echo 'MISE A JOUR' || echo 'INSTALLATION') dans $DIR"

step "1. Vérification du PC"
docker info >/dev/null 2>&1 || { fail "Docker ne répond pas (installer Docker Engine, voir LISEZMOI.md)"; exit 1; }
ok "Docker est démarré"
ram=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
[ "$ram" -lt 15 ] && warn "Mémoire : $ram Go (16 Go minimum)" || ok "Mémoire : $ram Go"
mkdir -p "$DIR"
free=$(df -BG --output=avail "$DIR" | tail -1 | tr -dc 0-9)
[ "$free" -lt 40 ] && warn "Espace libre : $free Go (prévoir 40 Go + ~0,4 Mo par photo)" || ok "Espace libre : $free Go"

if [ $SKIP_SUMS = 0 ]; then
  step "2. Contrôle des fichiers de la clé (SHA-256)"
  (cd "$BUNDLE" && sha256sum --quiet -c SHA256SUMS) || { fail "Fichiers abîmés : recopier la clé"; exit 1; }
  ok "Tous les fichiers sont intacts"
fi

if [ $UPDATE = 1 ]; then
  step "3. Sauvegarde de sécurité avant la mise à jour"
  compose exec -T app php artisan archive:backup && ok "Sauvegarde faite" || warn "Sauvegarde impossible"
fi

step "4. Copie des fichiers de l'application"
mkdir -p "$APP" && cp -r "$BUNDLE"/app/. "$APP"/
if [ $UPDATE = 0 ]; then
  sh "$APP/scripts/init-env.sh" "$DIR" --force
  set_env_value HTTP_PORT "$PORT"
  set_env_value COMPOSE_PROJECT_NAME "$PROJECT"
  chown -R 33:33 "$DIR" 2>/dev/null || true   # www-data in the containers
fi
set_env_value APP_VERSION "$VERSION"
ok "Application copiée dans $APP"

step "5. Chargement des images (plusieurs minutes)"
for f in "$BUNDLE"/images/*.tar.gz; do echo "      $(basename "$f")"; docker load -q -i "$f" >/dev/null || { fail "$f"; exit 1; }; done
ok "Images chargées"

step "6. Modèles d'IA locale"
if [ -f "$BUNDLE/models/ollama-models.tar" ]; then
  vol="$(project_name)_ollama-models"
  docker volume create "$vol" >/dev/null
  docker run --rm --network none -v "$vol:/root/.ollama" -v "$BUNDLE/models:/src:ro" --entrypoint tar \
    "archive-inventory/app:$VERSION" -xf /src/ollama-models.tar -C /root/.ollama || { fail "Copie des modèles"; exit 1; }
  ok "Modèles installés"
fi

step "7. Démarrage"
compose up -d --no-build --pull never --remove-orphans || { fail "Démarrage impossible"; exit 1; }
wait_healthy 1200 || { fail "Services non prêts : docker compose logs"; exit 1; }
ok "Tous les services sont prêts"

if [ $UPDATE = 0 ]; then
  step "8. Compte administrateur"
  compose exec app php artisan archive:create-admin --username=admin
fi

step "9. Raccourci"
url="http://localhost$([ "$PORT" = 80 ] || echo ":$PORT")"
user_home="$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)"
desktop="$user_home/Bureau"; [ -d "$desktop" ] || desktop="$user_home/Desktop"
if [ -d "$desktop" ]; then
  printf '[Desktop Entry]\nType=Link\nName=Inventaire des archives\nURL=%s\nIcon=folder\n' "$url" > "$desktop/inventaire-archives.desktop"
  printf '[Desktop Entry]\nType=Application\nName=Sauvegarde vers USB\nExec=x-terminal-emulator -e %s/scripts/backup.sh\nTerminal=true\n' "$APP" > "$desktop/sauvegarde-usb.desktop"
  chmod +x "$desktop"/*.desktop; chown "${SUDO_USER:-$USER}" "$desktop"/*.desktop 2>/dev/null || true
  ok "Raccourcis sur le bureau"
fi

if [ $SKIP_VERIFY = 0 ]; then
  step "10. Vérification complète"
  bash "$APP/scripts/verify.sh" || exit 1
fi
echo; echo "Terminé. Ouvrir : $url"
