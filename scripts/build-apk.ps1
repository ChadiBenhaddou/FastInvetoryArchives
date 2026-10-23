# Builds the signed Android APK inside Docker (Node 22 + JDK 21 + Android SDK).
# Run on the CONNECTED development machine; output: mobile\release\archive-capture-<version>.apk
# Note: docker writes progress to stderr, so failures are detected with $LASTEXITCODE
# (ErrorActionPreference=Stop would abort on the first progress line in Windows PowerShell).
$root = Split-Path -Parent $PSScriptRoot

docker build -t archive-inventory/android-builder:1 "$root\mobile\docker" 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host "Echec de la construction de l'image Android." -ForegroundColor Red; exit $LASTEXITCODE }

# node_modules and the Gradle cache live in Docker volumes (Linux binaries, reused between builds).
docker run --rm `
    -v "${root}:/repo" `
    -v archive-mobile-node-modules:/repo/mobile/node_modules `
    -v archive-gradle-cache:/root/.gradle `
    archive-inventory/android-builder:1 sh /repo/mobile/scripts/build-apk.sh 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host "Echec de la construction de l'APK." -ForegroundColor Red }
exit $LASTEXITCODE
