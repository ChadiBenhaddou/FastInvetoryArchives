#!/usr/bin/env bash
# Restauration depuis une sauvegarde USB. REMPLACE la base actuelle.
#   restore.sh /media/$USER/DISQUE/ArchiveInventory-Sauvegarde [AAAA-MM-JJ_HHMMSS]
source "$(dirname "$0")/common.sh"
from="${1:?Usage : restore.sh <dossier ArchiveInventory-Sauvegarde> [sauvegarde]}"
# USB backup: <from>/base/<date>/ ; backups folder of the PC (undo a restore): <from>/<date>/
bases="$from/base"; [ -d "$bases" ] || bases="$from"
backup="${2:-$(ls "$bases" | grep -E '^[0-9]{4}-' | sort | tail -1)}"
dump="$bases/$backup/database.sql.gz"
[ -f "$dump" ] || { fail "Sauvegarde introuvable : $dump"; exit 1; }
read -r -p "La base actuelle sera REMPLACÉE par celle du $backup. Taper RESTAURER : " answer
[ "$answer" = RESTAURER ] || exit 1

db="$(env_value DB_DATABASE)" user="$(env_value DB_USERNAME)" root="$(data_root)"
# The database is dropped before being reloaded: keep a copy of the current one first.
step "0. Sauvegarde de sécurité de la base actuelle"
if safety="$(compose exec -T app php artisan archive:backup | tail -1 | tr -d '\r')" && [ -n "$safety" ]; then
  ok "Faite : $root/backups/$safety"
else
  warn "Sauvegarde de sécurité impossible (application arrêtée ?)"
  read -r -p "Continuer quand même ? (o/N) " go; [ "$go" = o ] || exit 1
fi
step "1. Arrêt de l'application"
compose stop app queue scheduler pipeline extractor
step "2. Base de données"
docker cp "$dump" "$(project_name)-mysql-1:/tmp/restore.sql.gz"
compose exec -T mysql sh -c "mysql --default-character-set=utf8mb4 -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON $db.* TO '$user'@'%';\" && gunzip -c /tmp/restore.sql.gz | mysql --default-character-set=utf8mb4 -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $db && rm /tmp/restore.sql.gz" \
  || { fail "Restauration de la base"; exit 1; }
ok "Base restaurée"
step "3. Photos"
if [ -d "$from/photos" ]; then rsync -a "$from/photos/" "$root/storage/" && ok "Photos recopiées"
else ok "Pas de photos dans cette sauvegarde : celles du PC sont gardées"; fi
if [ -f "$from/app-key.txt" ] && [ "$(cat "$from/app-key.txt")" != "$(env_value APP_KEY)" ]; then
  set_env_value APP_KEY "$(cat "$from/app-key.txt")"; ok "Clé de l'application reprise"
fi
step "4. Redémarrage et index de recherche"
compose up -d --no-build --pull never && wait_healthy
compose exec -T app php artisan archive:search-setup --reindex && ok "Restauration terminée"
