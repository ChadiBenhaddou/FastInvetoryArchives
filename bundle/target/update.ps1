# Mise à jour depuis une nouvelle clé USB : les données sont conservées, une sauvegarde est
# faite avant. (Même script que l'installation, qui détecte l'installation existante.)
#   update.ps1 [-InstallDir C:\ArchiveInventory] [-SkipVerify] ...  (mêmes options qu'install.ps1)
& (Join-Path $PSScriptRoot 'install.ps1') @args
exit $LASTEXITCODE
