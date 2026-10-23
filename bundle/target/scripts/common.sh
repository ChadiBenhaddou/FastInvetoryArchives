#!/usr/bin/env bash
# Shared helpers for the Ubuntu scripts.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

step() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
ok() { printf '   \033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '   \033[33m!!\033[0m  %s\n' "$*"; }
fail() { printf '   \033[31mXX\033[0m  %s\n' "$*"; }

env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'; }
set_env_value() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.yml" "$@"; }
project_name() { local p; p="$(env_value COMPOSE_PROJECT_NAME)"; echo "${p:-archive-inventory}"; }
data_root() { env_value ARCHIVE_HOST_ROOT; }

wait_healthy() {
  local timeout="${1:-900}" project deadline pending s status
  project="$(project_name)"
  deadline=$(( $(date +%s) + timeout ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    pending=""
    for s in mysql meilisearch app gateway ocr-worker ollama; do
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$project-$s-1" 2>/dev/null)"
      [ "$status" = healthy ] || [ "$status" = running ] || pending="$pending $s=$status"
    done
    [ -z "$pending" ] && return 0
    echo "      en attente :$pending"
    sleep 10
  done
  return 1
}
