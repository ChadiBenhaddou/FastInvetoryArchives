# Installation HORS LIGNE de l'OCR Windows (moteur de l'Outil Capture d'écran / Snipping Tool)
# pour l'Inventaire des archives. A lancer sur le PC, dans ce dossier :
#     powershell -ExecutionPolicy Bypass -File setup.ps1
#
#  1. copie oneocr.dll, oneocr.onemodel et onnxruntime.dll depuis l'Outil Capture d'écran du PC
#     vers ocr_data\ (ces fichiers appartiennent à Microsoft : ils ne sont jamais fournis sur la clé);
#  2. installe Python + oneocr + Pillow depuis wheels\ (aucun téléchargement);
#  3. vérifie que le moteur lit du texte;
#  4. crée la tâche planifiée « ArchiveInventory-OCR » (démarrage à l'ouverture de session) et la lance;
#  5. vérifie que l'application (conteneur gateway) atteint le service.
#
# Options : -SourceDir <dossier>  les 3 fichiers sont pris dans ce dossier au lieu de l'Outil Capture
#           -Python <python.exe>  Python 3.12 à utiliser (sinon : lanceur « py -3.12 »)
#           -NoTask               pas de tâche planifiée (tests)
#           -Uninstall            arrête et supprime la tâche planifiée
param(
    [string]$SourceDir,
    [string]$Python,
    [switch]$NoTask,
    [switch]$Uninstall
)
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$dataDir = Join-Path $here 'ocr_data'
$wheels = Join-Path $here 'wheels'
$venv = Join-Path $here 'venv'
$taskName = 'ArchiveInventory-OCR'
$port = 8010   # fixed: docker/app/gateway.conf forwards this port
$files = @('oneocr.dll', 'oneocr.onemodel', 'onnxruntime.dll')

function Write-Step([string]$Text) { Write-Host ""; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "   OK  $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text) { Write-Host "   !!  $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "   XX  $Text" -ForegroundColor Red }

function Stop-OcrTask {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    }
    # The DLL stays locked while the service runs: make sure it is gone before copying.
    Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe' OR Name = 'python.exe'" |
        Where-Object { $_.CommandLine -like '*ocr_service.py*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Test-Health {
    try { return (Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 3).status -eq 'ok' } catch { return $false }
}

if ($Uninstall) {
    Stop-OcrTask
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Ok "Tâche $taskName supprimée. L'application utilise PaddleOCR."
    exit 0
}

Write-Host "OCR Windows (Outil Capture d'écran) pour l'Inventaire des archives — $here" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. Fichiers du moteur
Write-Step "1. Fichiers du moteur OCR de l'Outil Capture d'écran"
if (-not $SourceDir) {
    $pkg = Get-AppxPackage -Name Microsoft.ScreenSketch -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1
    if ($pkg) {
        $SourceDir = Join-Path $pkg.InstallLocation 'SnippingTool'
        Write-Ok "Outil Capture d'écran $($pkg.Version) : $SourceDir"
    } else {
        $found = Get-ChildItem 'C:\Program Files\WindowsApps' -Directory -Filter 'Microsoft.ScreenSketch_*_x64__*' -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($found) { $SourceDir = Join-Path $found.FullName 'SnippingTool' }
    }
}
$missing = @($files | Where-Object { -not $SourceDir -or -not (Test-Path (Join-Path $SourceDir $_)) })
if ($missing.Count -gt 0) {
    Write-Fail "Introuvable : $($missing -join ', ')$(if ($SourceDir) { " dans $SourceDir" })"
    Write-Host "   Ces fichiers sont fournis par l'Outil Capture d'écran de Windows 11, dans une version"
    Write-Host "   récente (avec les « Actions de texte », 2023 ou plus récent). Solutions :"
    Write-Host "     - mettre à jour l'Outil Capture d'écran (Microsoft Store) AVANT de couper le réseau du PC ;"
    Write-Host "     - si l'accès au dossier est refusé : relancer PowerShell en administrateur ;"
    Write-Host "     - ou copier les 3 fichiers depuis l'Outil Capture d'écran de CE PC dans un dossier,"
    Write-Host "       puis : setup.ps1 -SourceDir <ce dossier>"
    Write-Host "   En attendant, l'application continue avec PaddleOCR."
    exit 1
}
Stop-OcrTask
New-Item -ItemType Directory -Force $dataDir | Out-Null
foreach ($f in $files) {
    try {
        Copy-Item (Join-Path $SourceDir $f) (Join-Path $dataDir $f) -Force -ErrorAction Stop
    } catch {
        Write-Fail "Copie de $f impossible : $($_.Exception.Message)"
        Write-Host "   Si l'accès est refusé : relancer PowerShell en administrateur."
        exit 1
    }
    Write-Ok ("{0,-16} {1,6:N1} Mo" -f $f, ((Get-Item (Join-Path $dataDir $f)).Length / 1MB))
}

# ---------------------------------------------------------------- 2. Python et paquets
Write-Step '2. Python et paquets (hors ligne, depuis wheels\)'
if (-not $Python) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $Python = (& py -3.12 -c "import sys; print(sys.executable)" 2>$null)
    }
}
if (-not $Python -or -not (Test-Path $Python)) {
    Write-Fail 'Python 3.12 (64 bits) introuvable.'
    Write-Host "   Installer python-3.12.*-amd64.exe (dossier prerequis\ de la clé), cocher « Add python.exe to PATH »,"
    Write-Host '   puis relancer ce script (ou : setup.ps1 -Python C:\chemin\python.exe).'
    exit 1
}
Write-Ok "Python : $Python"
if (-not (Get-ChildItem $wheels -Filter *.whl -ErrorAction SilentlyContinue)) {
    Write-Fail "Aucun paquet dans $wheels (oneocr et Pillow, voir LISEZMOI)."
    exit 1
}
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
    & $Python -m venv $venv
    if ($LASTEXITCODE -ne 0) { Write-Fail 'Création de l''environnement Python impossible.'; exit 1 }
}
$venvPython = Join-Path $venv 'Scripts\python.exe'
& $venvPython -m pip install --quiet --no-index --find-links $wheels -r (Join-Path $here 'requirements.txt') 2>&1 |
    Where-Object { "$_" -notmatch 'new release of pip|To update, run' } | ForEach-Object { Write-Host "      $_" }
if ($LASTEXITCODE -ne 0) { Write-Fail 'Installation des paquets impossible (voir ci-dessus).'; exit 1 }
Write-Ok 'oneocr et Pillow installés'

# ---------------------------------------------------------------- 3. Le moteur lit-il ?
Write-Step '3. Essai du moteur'
$check = & $venvPython -X utf8 (Join-Path $here 'ocr_service.py') --check 2>&1 | ForEach-Object { "$_" }
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Le moteur ne lit pas le texte de test :'
    $check | Select-Object -Last 8 | ForEach-Object { Write-Host "      $_" }
    Write-Host "   Les fichiers de l'Outil Capture d'écran sont peut-être d'une version incompatible avec oneocr."
    exit 1
}
Write-Ok "Texte lu : $($check | Select-Object -Last 1)"

if ($NoTask) { Write-Ok 'Terminé (sans tâche planifiée).'; exit 0 }

# ---------------------------------------------------------------- 4. Service au démarrage
Write-Step "4. Service OCR (tâche planifiée $taskName, 127.0.0.1:$port)"
$action = New-ScheduledTaskAction -Execute (Join-Path $venv 'Scripts\pythonw.exe') `
    -Argument "`"$(Join-Path $here 'ocr_service.py')`" --port $port" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "OCR Windows de l'Inventaire des archives (windows-ocr\ocr_service.py)" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Health) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
if (-not (Test-Health)) {
    Write-Fail "Le service ne répond pas sur 127.0.0.1:$port. Journal : $(Join-Path $here 'logs\ocr-service.log')"
    exit 1
}
Write-Ok "Service démarré (il redémarre seul à chaque ouverture de session)"

# ---------------------------------------------------------------- 5. Vu depuis l'application
Write-Step "5. Accès depuis l'application"
$gateway = $null
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $gateway = docker ps --filter 'label=com.docker.compose.service=gateway' --format '{{.Names}}' 2>$null | Select-Object -First 1
}
if (-not $gateway) {
    Write-Warn2 "Application non démarrée : vérification à refaire plus tard avec « Inventaire - Vérifier »."
} else {
    $answer = docker exec $gateway curl -fsS -m 5 "http://host.docker.internal:$port/health" 2>&1
    if ("$answer" -match '"ok"') {
        Write-Ok "L'application utilise l'OCR Windows ($gateway → 127.0.0.1:$port)"
    } else {
        Write-Warn2 "La passerelle ($gateway) n'atteint pas le service : $answer"
        Write-Host "   Mettre l'application à jour (version avec OCR Windows), puis relancer cette vérification."
    }
}
Write-Host ""
Write-Host "Pour relire avec ce moteur les photos déjà traitées par PaddleOCR (dans le dossier app) :"
Write-Host "   docker compose exec app php artisan archive:reprocess --upgrade --wait"
