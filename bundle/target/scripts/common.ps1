# Shared helpers for the PC scripts (Windows PowerShell 5.1 compatible).
# Docker writes progress on stderr: failures are detected with exit codes, never with
# $ErrorActionPreference = 'Stop' (which would abort on the first progress line).

$ErrorActionPreference = 'Continue'
$script:AppDir = Split-Path -Parent $PSScriptRoot           # ...\ArchiveInventory\app
$script:EnvFile = Join-Path $script:AppDir '.env'

function Write-Step([string]$Text) { Write-Host ""; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "   OK  $Text" -ForegroundColor Green }
function Write-Warn2([string]$Text) { Write-Host "   !!  $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "   XX  $Text" -ForegroundColor Red }

# Runs a native command, prints its output, returns the exit code.
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments, [switch]$Quiet)
    $output = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    if (-not $Quiet) { $output | ForEach-Object { Write-Host "      $_" } }
    $script:LastOutput = $output
    return $LASTEXITCODE
}

function Read-DotEnv {
    $values = @{}
    if (Test-Path $script:EnvFile) {
        foreach ($line in Get-Content $script:EnvFile) {
            if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
        }
    }
    return $values
}

function Set-DotEnvValue([string]$Key, [string]$Value) {
    $content = Get-Content $script:EnvFile -Raw
    if ($content -match "(?m)^$Key=") { $content = $content -replace "(?m)^$Key=.*$", "$Key=$Value" }
    else { $content = $content.TrimEnd() + "`r`n$Key=$Value`r`n" }
    [System.IO.File]::WriteAllText($script:EnvFile, $content, (New-Object System.Text.UTF8Encoding $false))
}

# docker compose in the app folder (it reads .env there, including COMPOSE_PROJECT_NAME).
function Invoke-Compose {
    param([string[]]$Arguments, [switch]$Quiet)
    $all = @('compose', '--project-directory', $script:AppDir, '-f', (Join-Path $script:AppDir 'docker-compose.yml')) + $Arguments
    return Invoke-Native -Exe 'docker' -Arguments $all -Quiet:$Quiet
}

function Get-ProjectName {
    $cfg = Read-DotEnv
    if ($cfg['COMPOSE_PROJECT_NAME']) { return $cfg['COMPOSE_PROJECT_NAME'] }
    return 'archive-inventory'
}

function Test-DockerRunning {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
    $code = Invoke-Native -Exe 'docker' -Arguments @('info', '--format', '{{.ServerVersion}}') -Quiet
    return ($code -eq 0)
}

# Waits until every listed service reports "healthy" (or is simply running when it has no healthcheck).
function Wait-Healthy {
    param([string[]]$Services = @('mysql', 'meilisearch', 'app', 'gateway', 'ocr-worker', 'ollama'), [int]$TimeoutSeconds = 900)
    $project = Get-ProjectName
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $pending = @()
        foreach ($service in $Services) {
            $status = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$project-$service-1" 2>$null)
            if ($status -ne 'healthy' -and $status -ne 'running') { $pending += "$service=$status" }
        }
        if ($pending.Count -eq 0) { return $true }
        Write-Host "      en attente : $($pending -join ', ')"
        Start-Sleep -Seconds 10
    }
    return $false
}

function Get-DataRoot {
    $cfg = Read-DotEnv
    return ($cfg['ARCHIVE_HOST_ROOT'] -replace '/', '\')
}
