# Creates .env next to docker-compose.yml with random secrets (Windows).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\init-env.ps1 [-ArchiveRoot C:\ArchiveInventory]
param(
    [string]$ArchiveRoot = 'C:\ArchiveInventory',
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'

if ((Test-Path $envFile) -and -not $Force) {
    Write-Host ".env existe deja ($envFile). Utilisez -Force pour le regenerer (les mots de passe de la base changeraient !)."
    exit 1
}

function New-Secret([int]$bytes) {
    $buffer = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    return $buffer
}
function New-Password { ([Convert]::ToBase64String((New-Secret 24))) -replace '[+/=]', '' }

$appKey = 'base64:' + [Convert]::ToBase64String((New-Secret 32))
$content = (Get-Content (Join-Path $root '.env.example') -Raw) `
    -replace '(?m)^ARCHIVE_HOST_ROOT=.*$', ("ARCHIVE_HOST_ROOT=" + ($ArchiveRoot -replace '\\', '/')) `
    -replace '(?m)^APP_KEY=.*$', "APP_KEY=$appKey" `
    -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$(New-Password)" `
    -replace '(?m)^DB_ROOT_PASSWORD=.*$', "DB_ROOT_PASSWORD=$(New-Password)" `
    -replace '(?m)^MEILI_MASTER_KEY=.*$', "MEILI_MASTER_KEY=$(New-Password)"

[System.IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding $false))
New-Item -ItemType Directory -Force -Path $ArchiveRoot | Out-Null
Write-Host ".env cree. Dossier des archives : $ArchiveRoot"
