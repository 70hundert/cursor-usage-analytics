Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
$venvPip = Join-Path $PSScriptRoot "venv\Scripts\pip.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "venv fehlt - wird eingerichtet (einmalig)..."
    python -m venv venv
    & $venvPip install -r requirements.txt
    Write-Host "venv bereit."
}

$port = 8060
if ($env:CURSOR_WEB_PORT) {
    $port = [int]$env:CURSOR_WEB_PORT
}

$listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    Write-Host "Warnung: Port $port ist bereits belegt (PID(s): $($pids -join ', '))."
    Write-Host 'Alten Server beenden mit: .\stop.ps1'
    Write-Host ""
}

& $venvPython serve.py
