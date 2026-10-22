# Drives the desktop admin (running stack) in headless Chromium: login, device, ZIP import.
# Usage: scripts\e2e-desktop.ps1 -Password <admin password> [-Zip .devdata\samples\X.zip]
param(
    [Parameter(Mandatory = $true)][string]$Password,
    [string]$User = 'admin',
    [string]$Zip
)
$root = Split-Path -Parent $PSScriptRoot
if (-not $Zip) { $Zip = (Get-ChildItem "$root\.devdata\samples\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
if (-not $Zip) { Write-Host "Aucun ZIP d'exemple : lancer d'abord scripts\e2e-mobile.ps1"; exit 1 }
$zipInRepo = '/repo/' + ((Resolve-Path $Zip).Path.Substring($root.Length + 1) -replace '\\', '/')

# The test container joins the stack's "frontend" network and talks to the app directly
# (by container name: Chromium forces HTTPS for a host named "app", a real TLD on its HSTS list).
docker run --rm --network archive-inventory_frontend `
    -v "${root}:/repo" `
    -v archive-e2e-node-modules:/repo/e2e/node_modules `
    -v archive-playwright:/root/.cache/ms-playwright `
    -e APP_URL=http://archive-inventory-app-1 -e ADMIN_USER=$User -e ADMIN_PASSWORD=$Password -e ZIP=$zipInRepo -e OUT_DIR=/repo/.devdata/samples `
    -w /repo/e2e archive-inventory/android-builder:1 `
    sh -c "npm install --no-audit --no-fund --silent && npx playwright install --with-deps chromium >/dev/null && node desktop-import.mjs" 2>&1 | Out-Host
exit $LASTEXITCODE
