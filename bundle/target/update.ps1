# Mise à jour depuis une nouvelle clé USB : les données sont conservées, une sauvegarde est
# faite avant. (Même script que l'installation, qui détecte l'installation existante.)
param([string]$InstallDir = 'C:\ArchiveInventory', [switch]$SkipVerify)
& (Join-Path $PSScriptRoot 'install.ps1') -InstallDir $InstallDir -SkipVerify:$SkipVerify
exit $LASTEXITCODE
