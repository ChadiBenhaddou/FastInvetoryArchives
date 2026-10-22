#!/bin/sh
# Runs the mobile app smoke test (headless Chromium, fake camera) inside Docker.
# The exported sample ZIP is written to .devdata/samples/.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm \
  -v "$ROOT:/repo" \
  -v archive-mobile-node-modules:/repo/mobile/node_modules \
  -v archive-playwright:/root/.cache/ms-playwright \
  archive-inventory/android-builder:1 sh /repo/mobile/scripts/e2e.sh
