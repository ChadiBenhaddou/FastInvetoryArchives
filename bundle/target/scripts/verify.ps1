# Vérification de l'installation, à faire RÉSEAU COUPÉ :
#   services prêts, aucun accès Internet possible depuis l'application, puis un export
#   d'exemple traité de bout en bout (import → OCR → IA → recherche) et supprimé ensuite.
# -DisableNetwork : désactive les cartes réseau du PC pendant le test puis les réactive
#                   (PowerShell lancé en administrateur).
param([switch]$DisableNetwork, [int]$TimeoutSeconds = 2400)
. (Join-Path $PSScriptRoot 'common.ps1')
$report = @("Vérification du $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
$failed = $false
$disabled = @()

try {
    Write-Step '1. Réseau du PC'
    $up = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
    if ($DisableNetwork -and $up.Count) {
        foreach ($a in $up) { Disable-NetAdapter -Name $a.Name -Confirm:$false; $disabled += $a.Name }
        Start-Sleep 5
        $up = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
    }
    if ($up.Count) { Write-Warn2 "Carte(s) réseau active(s) : $($up.Name -join ', ') — pour le test officiel, les désactiver (ou relancer avec -DisableNetwork)."; $report += 'Réseau : ACTIF' }
    else { Write-Ok 'Aucune carte réseau active'; $report += 'Réseau : coupé' }

    Write-Step '2. Services'
    if (-not (Wait-Healthy -TimeoutSeconds 600)) { throw 'services non prêts' }
    Write-Ok 'Tous les services sont prêts'

    Write-Step '3. Isolement : l''application ne peut joindre aucun serveur extérieur'
    # Exit code 0 = a TCP connection to the outside succeeded (bash /dev/tcp, or wget on Alpine).
    $probe = "(command -v bash >/dev/null && timeout 5 bash -c '</dev/tcp/1.1.1.1/53') || (command -v wget >/dev/null && wget -q -T 5 -O /dev/null http://1.1.1.1)"
    foreach ($svc in @('app', 'ollama', 'ocr-worker', 'meilisearch', 'mysql')) {
        $code = Invoke-Compose -Arguments @('exec', '-T', $svc, 'sh', '-c', $probe) -Quiet
        if ($code -eq 0) { Write-Fail "$svc a pu joindre Internet !"; $failed = $true; $report += "Isolement $svc : ECHEC" }
        else { Write-Ok "$svc : aucun accès extérieur" }
    }

    Write-Step '4. Traitement complet d''un export d''exemple (plusieurs minutes)'
    $project = Get-ProjectName
    Invoke-Native -Exe 'docker' -Arguments @('cp', (Join-Path $script:AppDir 'samples\selftest.zip'), "$project-app-1:/tmp/selftest.zip") -Quiet | Out-Null
    $code = Invoke-Compose -Arguments @('exec', '-T', '--user', 'www-data', 'app', 'php', 'artisan', 'archive:selftest', '/tmp/selftest.zip',
        '--query=Benali', '--query=الداخلية', "--timeout=$TimeoutSeconds")
    $report += $script:LastOutput
    if ($code -ne 0) { $failed = $true }
} catch {
    Write-Fail "$_"; $failed = $true; $report += "ERREUR : $_"
} finally {
    foreach ($name in $disabled) { Enable-NetAdapter -Name $name -Confirm:$false }
    if ($disabled.Count) { Write-Host "      cartes réseau réactivées : $($disabled -join ', ')" }
}

$file = Join-Path (Get-DataRoot) ("verification-" + (Get-Date -Format 'yyyyMMdd-HHmm') + '.txt')
Set-Content -Path $file -Value $report -Encoding UTF8
Write-Host ''
if ($failed) { Write-Fail "VÉRIFICATION ÉCHOUÉE — rapport : $file" } else { Write-Ok "VÉRIFICATION RÉUSSIE — rapport : $file" }
if ($MyInvocation.InvocationName -ne '&' -and [Environment]::UserInteractive -and -not $env:ARCHIVE_NONINTERACTIVE) { Read-Host 'Entrée pour fermer' | Out-Null }
exit $(if ($failed) { 1 } else { 0 })
