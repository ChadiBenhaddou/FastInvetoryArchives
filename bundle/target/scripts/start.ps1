# Démarre l'Inventaire des archives (si Docker Desktop vient d'être lancé, patienter qu'il soit prêt).
. (Join-Path $PSScriptRoot 'common.ps1')
Write-Step 'Démarrage'
for ($i = 0; $i -lt 30 -and -not (Test-DockerRunning); $i++) { Write-Host '      attente de Docker…'; Start-Sleep 10 }
if (-not (Test-DockerRunning)) { Write-Fail 'Docker Desktop ne démarre pas.'; Read-Host 'Entrée pour fermer'; exit 1 }
Invoke-Compose -Arguments @('up', '-d', '--no-build', '--pull', 'never') | Out-Null
if (Wait-Healthy) {
    $port = (Read-DotEnv)['HTTP_PORT']
    Start-Process $(if ($port -eq '80') { 'http://localhost' } else { "http://localhost:$port" })
    Write-Ok 'Prêt'
} else { Write-Fail 'Les services ne sont pas prêts (voir le raccourci « Vérifier »).' }
Start-Sleep 3
