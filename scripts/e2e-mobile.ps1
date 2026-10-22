# Runs the mobile app smoke test (headless Chromium, fake camera) inside Docker.
# The exported sample ZIP is written to .devdata\samples\.
$root = Split-Path -Parent $PSScriptRoot
docker run --rm `
    -v "${root}:/repo" `
    -v archive-mobile-node-modules:/repo/mobile/node_modules `
    -v archive-playwright:/root/.cache/ms-playwright `
    archive-inventory/android-builder:1 sh /repo/mobile/scripts/e2e.sh 2>&1 | Out-Host
exit $LASTEXITCODE
