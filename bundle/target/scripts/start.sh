#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
step "Démarrage"
compose up -d --no-build --pull never && wait_healthy && ok "Prêt" || fail "Services non prêts"
