#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
step "Arrêt"
compose stop && ok "Arrêté"
