Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$port = 8060
if ($env:CURSOR_WEB_PORT) {
    $port = [int]$env:CURSOR_WEB_PORT
}

$listeners = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if (-not $listeners) {
    Write-Host "Kein Prozess auf Port $port."
    exit 0
}

$pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $pids) {
  if ($procId -eq 0) { continue }
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host "Beende $($proc.ProcessName) (PID $procId) auf Port $port..."
    Stop-Process -Id $procId -Force
  }
}

Write-Host "Port $port frei. Start mit: .\start.ps1"
