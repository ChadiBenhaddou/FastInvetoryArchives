#!/usr/bin/env bash
# Vérification de l'installation, à faire RÉSEAU COUPÉ (voir verify.ps1 pour le détail).
#   verify.sh [--disable-network]   (avec sudo pour couper/rétablir le réseau via nmcli)
source "$(dirname "$0")/common.sh"
failed=0 report=() disabled=0
report+=("Vérification du $(date '+%Y-%m-%d %H:%M')")

step "1. Réseau du PC"
if [ "${1:-}" = --disable-network ] && command -v nmcli >/dev/null; then nmcli networking off && disabled=1 && sleep 3; fi
if ip route | grep -q '^default'; then warn "Une route réseau est active (pour le test officiel : couper le réseau)"; report+=("Réseau : ACTIF")
else ok "Aucune route réseau"; report+=("Réseau : coupé"); fi

step "2. Services"
wait_healthy 600 && ok "Tous les services sont prêts" || { fail "services non prêts"; failed=1; }

step "3. Isolement"
probe="(command -v bash >/dev/null && timeout 5 bash -c '</dev/tcp/1.1.1.1/53') || (command -v wget >/dev/null && wget -q -T 5 -O /dev/null http://1.1.1.1)"
for svc in app ollama ocr-worker meilisearch mysql; do
  if compose exec -T "$svc" sh -c "$probe" >/dev/null 2>&1; then fail "$svc a pu joindre Internet !"; failed=1; report+=("Isolement $svc : ECHEC")
  else ok "$svc : aucun accès extérieur"; fi
done

step "4. Traitement complet d'un export d'exemple (plusieurs minutes)"
docker cp "$APP_DIR/samples/selftest.zip" "$(project_name)-app-1:/tmp/selftest.zip"
out="$(compose exec -T --user www-data app php artisan archive:selftest /tmp/selftest.zip --query=Benali --query=الداخلية 2>&1)" || failed=1
echo "$out"; report+=("$out")

[ $disabled = 1 ] && nmcli networking on
file="$(data_root)/verification-$(date +%Y%m%d-%H%M).txt"
printf '%s\n' "${report[@]}" > "$file"
[ $failed = 0 ] && ok "VÉRIFICATION RÉUSSIE — rapport : $file" || fail "VÉRIFICATION ÉCHOUÉE — rapport : $file"
exit $failed
