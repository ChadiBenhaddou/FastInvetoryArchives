# Sauvegarde vers un disque USB (ou tout autre dossier) :
#   - base de données + index de recherche (sauvegarde du jour, faite maintenant),
#   - toutes les photos (seules les nouvelles sont copiées après la première fois),
#   - la clé de chiffrement de l'application (nécessaire pour relire les codes PIN).
# Usage : double-clic sur « Sauvegarde vers USB », ou  backup.ps1 -Destination E:\
param([string]$Destination)
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $Destination) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Choisir le disque USB (ou le dossier) de sauvegarde'
    $dialog.ShowNewFolderButton = $true
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }
    $Destination = $dialog.SelectedPath
}
$target = Join-Path $Destination 'ArchiveInventory-Sauvegarde'
$root = Get-DataRoot

Write-Step "Sauvegarde vers $target"
if ((Invoke-Compose -Arguments @('exec', '-T', 'app', 'php', 'artisan', 'archive:backup')) -ne 0) {
    Write-Fail 'La sauvegarde de la base a échoué (application démarrée ?).'; Read-Host 'Entrée pour fermer'; exit 1
}
$folder = ($script:LastOutput | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}_\d{6}$' } | Select-Object -Last 1)
Write-Ok "Base et index sauvegardés ($folder)"

Write-Step 'Copie vers le disque'
robocopy (Join-Path $root "backups\$folder") (Join-Path $target "base\$folder") /E /R:2 /W:2 /NFL /NDL /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Fail 'Copie de la base impossible (disque plein ou retiré ?)'; Read-Host 'Entrée pour fermer'; exit 1 }
Write-Ok 'Base copiée'
Write-Host '      photos (seules les nouvelles sont copiées)…'
# /E without /MIR: a photo is never deleted from the backup, even if it disappeared from the PC.
robocopy (Join-Path $root 'storage') (Join-Path $target 'photos') /E /R:2 /W:2 /NFL /NDL /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Fail 'Copie des photos impossible (disque plein ou retiré ?)'; Read-Host 'Entrée pour fermer'; exit 1 }
Write-Ok 'Photos copiées'

$appKey = (Read-DotEnv)['APP_KEY']
Set-Content -Path (Join-Path $target 'app-key.txt') -Value $appKey -Encoding ascii
Set-Content -Path (Join-Path $target 'LISEZMOI.txt') -Encoding UTF8 -Value @"
Sauvegarde de l'Inventaire des archives — CONFIDENTIEL, à conserver en lieu sûr.
Dernière sauvegarde : $folder

base\<date>\database.sql.gz   base de données
base\<date>\search.dump       index de recherche
base\<date>\photos.csv        liste de contrôle des photos (empreintes SHA-256)
photos\                       toutes les photos des boîtes
app-key.txt                   clé de l'application (pour relire les codes PIN des téléphones)

Restauration : sur le PC où l'application est installée,
  powershell -ExecutionPolicy Bypass -File C:\ArchiveInventory\app\scripts\restore.ps1 -From "$target"
"@
Write-Ok "Terminé : $target"
Write-Host ''
Write-Host 'Retirer le disque avec « Retirer le périphérique en toute sécurité ».'
if (-not $PSBoundParameters.ContainsKey('Destination')) { Read-Host 'Entrée pour fermer' }
