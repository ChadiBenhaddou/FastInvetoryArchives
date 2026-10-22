#!/bin/sh
# Smoke test of the web build in headless Chromium (fake camera). Runs inside the
# android-builder image; see scripts/e2e-mobile.(ps1|sh) at the repository root.
set -e
cd /repo/mobile

npm ci --no-audit --no-fund
npx playwright install --with-deps chromium >/dev/null
npm run build

npx vite preview --port 4173 --strictPort >/tmp/preview.log 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null' EXIT
for i in $(seq 1 30); do
  curl -fs http://localhost:4173 >/dev/null && break
  sleep 1
done

OUT_DIR=${OUT_DIR:-/repo/.devdata/samples} node e2e/smoke.mjs
