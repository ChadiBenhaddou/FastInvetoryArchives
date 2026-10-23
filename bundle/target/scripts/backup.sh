#!/usr/bin/env bash
# Sauvegarde vers un disque USB : base + index (faits maintenant), photos (seules les nouvelles), clé.
#   backup.sh /media/$USER/MON_DISQUE
source "$(dirname "$0")/common.sh"
dest="${1:-}"
if [ -z "$dest" ] && command -v zenity >/dev/null; then
  dest="$(zenity --file-selection --directory --title='Choisir le disque USB de sauvegarde')" || exit 1
fi
[ -n "$dest" ] || { echo "Usage : backup.sh <dossier du disque USB>"; exit 1; }
target="$dest/ArchiveInventory-Sauvegarde"
root="$(data_root)"

step "Sauvegarde vers $target"
folder="$(compose exec -T app php artisan archive:backup | tail -1 | tr -d '\r')"
[[ "$folder" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$ ]] || { fail "Sauvegarde de la base impossible : $folder"; exit 1; }
ok "Base et index sauvegardés ($folder)"
mkdir -p "$target/base" "$target/photos"
rsync -a "$root/backups/$folder" "$target/base/" || { fail "Copie de la base"; exit 1; }
# No --delete: a photo is never removed from the backup.
rsync -a "$root/storage/" "$target/photos/" || { fail "Copie des photos"; exit 1; }
env_value APP_KEY > "$target/app-key.txt"
sync
ok "Terminé : $target (démonter le disque avant de le retirer)"
