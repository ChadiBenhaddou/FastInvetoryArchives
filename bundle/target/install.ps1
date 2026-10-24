# Installation (ou mise à jour) hors ligne de l'Inventaire des archives — Windows.
# A lancer depuis la clé USB :  clic droit > Exécuter avec PowerShell
#   ou :  powershell -ExecutionPolicy Bypass -File E:\ArchiveInventory-1.0.0\install.ps1
# Une installation existante est détectée : c'est alors une MISE A JOUR (sauvegarde d'abord,
# données conservées).
param(
    [string]$InstallDir = 'C:\ArchiveInventory',
    [int]$HttpPort = 80,
    [string]$ProjectName = 'archive-inventory',
    [switch]$SkipChecksums,
    [switch]$SkipVerify,
    [switch]$Unattended,           # tests: pas de questions (admin créé avec -AdminPassword)
    [string]$AdminPassword
)
$ErrorActionPreference = 'Continue'
$bundle = $PSScriptRoot
$version = (Get-Content (Join-Path $bundle 'VERSION') -Raw).Trim()
$installAppDir = Join-Path $InstallDir 'app'
. (Join-Path $bundle 'app\scripts\common.ps1')
$script:AppDir = $installAppDir
$script:EnvFile = Join-Path $installAppDir '.env'
$isUpdate = Test-Path $script:EnvFile

Write-Host "Inventaire des archives $version — $(if ($isUpdate) { 'MISE A JOUR' } else { 'INSTALLATION' }) dans $InstallDir" -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. Pré-requis
Write-Step '1. Vérification du PC'
if (-not (Test-DockerRunning)) {
    Write-Fail 'Docker ne répond pas.'
    Write-Host '   Installer d''abord (dossier prerequis\ de la clé), puis redémarrer le PC :'
    Write-Host '     1. wsl.*.msi            (sous-système Linux pour Windows)'
    Write-Host '     2. Docker Desktop Installer.exe'
    Write-Host '   Démarrer Docker Desktop, attendre « Engine running », puis relancer ce script.'
    exit 1
}
Write-Ok 'Docker est démarré'
$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
if ($ramGb -lt 15) { Write-Warn2 "Mémoire : $ramGb Go (16 Go minimum recommandés, 32 Go conseillés)" } else { Write-Ok "Mémoire : $ramGb Go" }
$drive = Split-Path -Qualifier $InstallDir
$freeGb = [math]::Round((Get-PSDrive ($drive.TrimEnd(':'))).Free / 1GB)
if ($freeGb -lt 40) { Write-Warn2 "Espace libre sur ${drive} : $freeGb Go (prévoir 40 Go + ~0,4 Mo par photo)" } else { Write-Ok "Espace libre sur ${drive} : $freeGb Go" }

# ---------------------------------------------------------------- 2. Intégrité de la clé
if (-not $SkipChecksums) {
    Write-Step '2. Contrôle des fichiers de la clé (SHA-256)'
    $bad = @()
    foreach ($line in Get-Content (Join-Path $bundle 'SHA256SUMS')) {
        if ($line -notmatch '^([0-9a-f]{64})\s+\*?(.+)$') { continue }
        $file = Join-Path $bundle ($Matches[2] -replace '/', '\')
        Write-Host "      $($Matches[2])"
        if (-not (Test-Path $file) -or (Get-FileHash -Algorithm SHA256 $file).Hash.ToLower() -ne $Matches[1]) { $bad += $Matches[2] }
    }
    if ($bad.Count) { Write-Fail "Fichiers abîmés ou manquants : $($bad -join ', ') — recopier la clé."; exit 1 }
    Write-Ok 'Tous les fichiers sont intacts'
}

# ---------------------------------------------------------------- 3. Sauvegarde avant mise à jour
if ($isUpdate) {
    Write-Step '3. Sauvegarde de sécurité avant la mise à jour'
    if ((Invoke-Compose -Arguments @('exec', '-T', 'app', 'php', 'artisan', 'archive:backup')) -ne 0) {
        Write-Warn2 'Sauvegarde impossible (application arrêtée ?).'
        if (-not $Unattended -and (Read-Host 'Continuer quand même ? (o/N)') -ne 'o') { exit 1 }
    } else { Write-Ok 'Sauvegarde faite (dossier backups)' }
}

# ---------------------------------------------------------------- 4. Fichiers de l'application
Write-Step '4. Copie des fichiers de l''application'
New-Item -ItemType Directory -Force -Path $installAppDir | Out-Null
Copy-Item -Path (Join-Path $bundle 'app\*') -Destination $installAppDir -Recurse -Force
if (-not $isUpdate) {
    & (Join-Path $installAppDir 'scripts\init-env.ps1') -ArchiveRoot $InstallDir -Force | Out-Host
    Set-DotEnvValue 'HTTP_PORT' $HttpPort
    Set-DotEnvValue 'COMPOSE_PROJECT_NAME' $ProjectName
}
Set-DotEnvValue 'APP_VERSION' $version
Write-Ok "Application copiée dans $installAppDir"

# ---------------------------------------------------------------- 5. Images Docker
Write-Step '5. Chargement des images (plusieurs minutes)'
foreach ($image in Get-ChildItem (Join-Path $bundle 'images') -Filter '*.tar.gz') {
    Write-Host "      $($image.Name)"
    if ((Invoke-Native -Exe 'docker' -Arguments @('load', '-i', $image.FullName) -Quiet) -ne 0) {
        Write-Fail "Chargement impossible : $($image.Name)"; $script:LastOutput | Write-Host; exit 1
    }
}
Write-Ok 'Images chargées'

# ---------------------------------------------------------------- 6. Modèles d'IA
Write-Step '6. Modèles d''IA locale'
$project = Get-ProjectName
$volume = "${project}_ollama-models"
$models = Join-Path $bundle 'models\ollama-models.tar'
if (Test-Path $models) {
    Invoke-Native -Exe 'docker' -Arguments @('volume', 'create', $volume) -Quiet | Out-Null
    $code = Invoke-Native -Exe 'docker' -Arguments @('run', '--rm', '--network', 'none', '-v', "${volume}:/root/.ollama",
        '-v', "$(Split-Path $models):/src:ro", '--entrypoint', 'tar', "archive-inventory/app:$version",
        '-xf', '/src/ollama-models.tar', '-C', '/root/.ollama')
    if ($code -ne 0) { Write-Fail 'Copie des modèles impossible'; exit 1 }
    Write-Ok 'Modèles installés'
} else { Write-Warn2 'Pas de modèles dans ce paquet (mise à jour sans changement de modèle)' }

# ---------------------------------------------------------------- 7. Démarrage
Write-Step '7. Démarrage'
if ((Invoke-Compose -Arguments @('up', '-d', '--no-build', '--pull', 'never', '--remove-orphans')) -ne 0) { Write-Fail 'Démarrage impossible'; exit 1 }
if (-not (Wait-Healthy -TimeoutSeconds 1200)) {
    Write-Fail 'Les services ne sont pas prêts. Voir : docker compose logs'
    exit 1
}
Write-Ok 'Tous les services sont prêts'

# ---------------------------------------------------------------- 8. Premier administrateur
if (-not $isUpdate) {
    Write-Step '8. Compte administrateur'
    if ($Unattended) {
        Invoke-Compose -Arguments @('exec', '-T', 'app', 'php', 'artisan', 'archive:create-admin', '--username=admin', "--password=$AdminPassword") | Out-Null
    } else {
        Write-Host '   Choisir le mot de passe du compte « admin » (8 caractères minimum).'
        & docker compose --project-directory $installAppDir -f (Join-Path $installAppDir 'docker-compose.yml') exec app php artisan archive:create-admin --username=admin
    }
}

# ---------------------------------------------------------------- 9. Raccourcis
Write-Step '9. Raccourcis sur le bureau'
$desktop = [Environment]::GetFolderPath('Desktop')
$port = (Read-DotEnv)['HTTP_PORT']
$url = if ($port -eq '80') { 'http://localhost' } else { "http://localhost:$port" }
Set-Content -Path (Join-Path $desktop 'Inventaire des archives.url') -Value "[InternetShortcut]`r`nURL=$url`r`n" -Encoding ascii
$shell = New-Object -ComObject WScript.Shell
foreach ($s in @(
    @{ Name = 'Sauvegarde vers USB'; Script = 'backup.ps1' },
    @{ Name = 'Inventaire - Démarrer'; Script = 'start.ps1' },
    @{ Name = 'Inventaire - Arrêter'; Script = 'stop.ps1' },
    @{ Name = 'Inventaire - Vérifier'; Script = 'verify.ps1' }
)) {
    $lnk = $shell.CreateShortcut((Join-Path $desktop "$($s.Name).lnk"))
    $lnk.TargetPath = 'powershell.exe'
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $installAppDir "scripts\$($s.Script)")`""
    $lnk.WorkingDirectory = $installAppDir
    $lnk.Save()
}
Write-Ok "Raccourcis créés (adresse : $url)"

# ---------------------------------------------------------------- 10. Vérification
if (-not $SkipVerify) {
    Write-Step '10. Vérification complète (import d''un exemple, OCR, IA, recherche)'
    & (Join-Path $installAppDir 'scripts\verify.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ''
Write-Host "Terminé. Ouvrir : $url" -ForegroundColor Green
Write-Host 'Penser à faire une première sauvegarde vers un disque USB (raccourci « Sauvegarde vers USB »).'
