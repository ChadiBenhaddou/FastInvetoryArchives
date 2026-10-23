# Restauration depuis une sauvegarde USB (backup.ps1). REMPLACE la base actuelle.
# Usage : restore.ps1 -From E:\ArchiveInventory-Sauvegarde [-Backup 2026-10-22_235926]
param([Parameter(Mandatory = $true)][string]$From, [string]$Backup, [switch]$Yes)
. (Join-Path $PSScriptRoot 'common.ps1')

$bases = Join-Path $From 'base'
if (-not $Backup) { $Backup = (Get-ChildItem $bases -Directory | Sort-Object Name | Select-Object -Last 1).Name }
$dump = Join-Path $bases "$Backup\database.sql.gz"
if (-not (Test-Path $dump)) { Write-Fail "Sauvegarde introuvable : $dump"; exit 1 }

Write-Host "Restaurer la sauvegarde du $Backup ?" -ForegroundColor Yellow
Write-Host 'La base de données actuelle sera REMPLACÉE. Les photos de la sauvegarde seront recopiées.'
if (-not $Yes -and (Read-Host 'Taper RESTAURER pour confirmer') -ne 'RESTAURER') { exit 1 }

$cfg = Read-DotEnv
$root = Get-DataRoot
Write-Step '1. Arrêt de l''application (base et recherche restent démarrées)'
Invoke-Compose -Arguments @('stop', 'app', 'queue', 'scheduler', 'pipeline', 'extractor') -Quiet | Out-Null

Write-Step '2. Base de données'
$project = Get-ProjectName
Invoke-Native -Exe 'docker' -Arguments @('cp', $dump, "$project-mysql-1:/tmp/restore.sql.gz") -Quiet | Out-Null
$db = $cfg['DB_DATABASE']
$sql = "mysql -uroot -p`"`$MYSQL_ROOT_PASSWORD`" -e 'DROP DATABASE IF EXISTS $db; CREATE DATABASE $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON $db.* TO ''$($cfg['DB_USERNAME'])''@''%'';' && gunzip -c /tmp/restore.sql.gz | mysql -uroot -p`"`$MYSQL_ROOT_PASSWORD`" $db && rm /tmp/restore.sql.gz"
if ((Invoke-Compose -Arguments @('exec', '-T', 'mysql', 'sh', '-c', $sql)) -ne 0) { Write-Fail 'Restauration de la base impossible'; exit 1 }
Write-Ok 'Base restaurée'

Write-Step '3. Photos'
robocopy (Join-Path $From 'photos') (Join-Path $root 'storage') /E /R:2 /W:2 /NFL /NDL /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Fail 'Copie des photos impossible'; exit 1 }
Write-Ok 'Photos recopiées'

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
