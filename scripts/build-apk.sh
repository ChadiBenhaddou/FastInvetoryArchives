#!/bin/sh
# Builds the signed Android APK inside Docker (Node 22 + JDK 21 + Android SDK).
# Run on the CONNECTED development machine; output: mobile/dist/apk/archive-capture-<version>.apk
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker build -t archive-inventory/android-builder:1 "$ROOT/mobile/docker"
docker run --rm \
  -v "$ROOT:/repo" \
  -v archive-mobile-node-modules:/repo/mobile/node_modules \
  -v archive-gradle-cache:/root/.gradle \
  archive-inventory/android-builder:1 sh /repo/mobile/scripts/build-apk.sh
