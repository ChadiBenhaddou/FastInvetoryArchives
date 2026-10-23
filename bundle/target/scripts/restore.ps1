# Restauration depuis une sauvegarde USB (backup.ps1). REMPLACE la base actuelle.
# Usage : restore.ps1 -From E:\ArchiveInventory-Sauvegarde [-Backup 2026-10-22_235926]
#   ou, pour revenir à une sauvegarde faite sur le PC (nuit, ou sécurité avant restauration) :
#         restore.ps1 -From C:\ArchiveInventory\backups [-Backup ...]   (les photos ne sont pas touchées)
param([Parameter(Mandatory = $true)][string]$From, [string]$Backup, [switch]$Yes)
. (Join-Path $PSScriptRoot 'common.ps1')

# USB backup: <From>\base\<date>\ ; backups folder of the PC: <From>\<date>\
$bases = if (Test-Path (Join-Path $From 'base')) { Join-Path $From 'base' } else { $From }
if (-not $Backup) { $Backup = (Get-ChildItem $bases -Directory | Sort-Object Name | Select-Object -Last 1).Name }
$dump = Join-Path $bases "$Backup\database.sql.gz"
if (-not (Test-Path $dump)) { Write-Fail "Sauvegarde introuvable : $dump"; exit 1 }

Write-Host "Restaurer la sauvegarde du $Backup ?" -ForegroundColor Yellow
Write-Host 'La base de données actuelle sera REMPLACÉE. Les photos de la sauvegarde seront recopiées.'
if (-not $Yes -and (Read-Host 'Taper RESTAURER pour confirmer') -ne 'RESTAURER') { exit 1 }

$cfg = Read-DotEnv
$root = Get-DataRoot
# The database is dropped before being reloaded: keep a copy of the current one first,
# so that a failed restore can itself be undone (restore.ps1 -From <dossier des données> -Backup <date>).
Write-Step '0. Sauvegarde de sécurité de la base actuelle'
if ((Invoke-Compose -Arguments @('exec', '-T', 'app', 'php', 'artisan', 'archive:backup') -Quiet) -eq 0) {
    Write-Ok "Faite : $root\backups\$(($script:LastOutput | Select-Object -Last 1).Trim())"
} else {
    Write-Warn2 'Sauvegarde de sécurité impossible (application arrêtée ?).'
    if (-not $Yes -and (Read-Host 'Continuer quand même ? (o/N)') -ne 'o') { exit 1 }
}

Write-Step '1. Arrêt de l''application (base et recherche restent démarrées)'
Invoke-Compose -Arguments @('stop', 'app', 'queue', 'scheduler', 'pipeline', 'extractor') -Quiet | Out-Null

Write-Step '2. Base de données'
$project = Get-ProjectName
Invoke-Native -Exe 'docker' -Arguments @('cp', $dump, "$project-mysql-1:/tmp/restore.sql.gz") -Quiet | Out-Null
$db = $cfg['DB_DATABASE']
# The steps go in a small script copied into the container: Windows PowerShell 5.1 mangles
# quotes in arguments passed to native commands, so nothing quoted goes on the command line.
$steps = @(
    'set -e'
    "mysql --default-character-set=utf8mb4 -uroot -p`"`$MYSQL_ROOT_PASSWORD`" -e `"DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON $db.* TO '$($cfg['DB_USERNAME'])'@'%';`""
    "gunzip -c /tmp/restore.sql.gz | mysql --default-character-set=utf8mb4 -uroot -p`"`$MYSQL_ROOT_PASSWORD`" $db"
    'rm -f /tmp/restore.sql.gz /tmp/restore.sh'
) -join "`n"
$stepsFile = Join-Path $env:TEMP 'archive-restore.sh'
[IO.File]::WriteAllText($stepsFile, "$steps`n", (New-Object Text.UTF8Encoding $false))
Invoke-Native -Exe 'docker' -Arguments @('cp', $stepsFile, "$project-mysql-1:/tmp/restore.sh") -Quiet | Out-Null
Remove-Item $stepsFile
if ((Invoke-Compose -Arguments @('exec', '-T', 'mysql', 'sh', '/tmp/restore.sh')) -ne 0) { Write-Fail 'Restauration de la base impossible'; exit 1 }
Write-Ok 'Base restaurée'

Write-Step '3. Photos'
if (Test-Path (Join-Path $From 'photos')) {
    robocopy (Join-Path $From 'photos') (Join-Path $root 'storage') /E /R:2 /W:2 /NFL /NDL /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Fail 'Copie des photos impossible'; exit 1 }
    Write-Ok 'Photos recopiées'
} else { Write-Ok 'Pas de photos dans cette sauvegarde : celles du PC sont gardées' }

$keyFile = Join-Path $From 'app-key.txt'
if ((Test-Path $keyFile) -and ((Get-Content $keyFile -Raw).Trim() -ne $cfg['APP_KEY'])) {
    Set-DotEnvValue 'APP_KEY' ((Get-Content $keyFile -Raw).Trim())
    Write-Ok 'Clé de l''application reprise de la sauvegarde (codes PIN lisibles)'
}

Write-Step '4. Redémarrage et reconstruction de l''index de recherche'
Invoke-Compose -Arguments @('up', '-d', '--no-build', '--pull', 'never') -Quiet | Out-Null
Wait-Healthy | Out-Null
Invoke-Compose -Arguments @('exec', '-T', 'app', 'php', 'artisan', 'archive:search-setup', '--reindex') | Out-Null
Write-Ok 'Restauration terminée'
