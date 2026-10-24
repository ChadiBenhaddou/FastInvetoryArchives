# Arrête proprement l'Inventaire des archives (les données sont conservées).
. (Join-Path $PSScriptRoot 'common.ps1')
Write-Step 'Arrêt'
Invoke-Compose -Arguments @('stop') | Out-Null
Write-Ok 'Arrêté'
Start-Sleep 3
