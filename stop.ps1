Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$port = 8060
if ($env:CURSOR_WEB_PORT) {
    $port = [int]$env:CURSOR_WEB_PORT
}

function Get-ListenerPids([int]$listenPort) {
    $connections = Get-NetTCPConnection -LocalPort $listenPort -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        return @()
    }
    return @(
        $connections |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 }
    )
}

$round = 0
while ($true) {
    $pids = @(Get-ListenerPids -listenPort $port)
    if ($pids.Count -eq 0) {
        break
    }

    $round++
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Beende $($proc.ProcessName) (PID $procId) auf Port $port..."
            Stop-Process -Id $procId -Force
        }
    }

    Start-Sleep -Milliseconds 300
    if ($round -ge 10) {
        $remaining = @(Get-ListenerPids -listenPort $port)
        if ($remaining.Count -gt 0) {
            Write-Host "Warnung: Port $port noch belegt (PID(s): $($remaining -join ', '))."
            exit 1
        }
        break
    }
}

Write-Host "Port $port frei. Start mit: .\start.ps1"
