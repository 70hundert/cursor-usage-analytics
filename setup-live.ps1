# Cursor Usage — Live data setup (session token in .env)
param(
    [string]$UserId = "primary",
    [string]$Token,
    [switch]$OpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$envPath = Join-Path $PSScriptRoot ".env"
$examplePath = Join-Path $PSScriptRoot ".env.example"

if (-not (Test-Path $envPath)) {
    if (Test-Path $examplePath) {
        Copy-Item $examplePath $envPath
        Write-Host ".env aus .env.example erstellt."
    } else {
        throw ".env fehlt — bitte .env.example kopieren."
    }
}

if ($OpenBrowser) {
    Start-Process "https://cursor.com/dashboard/usage"
    Write-Host @"

Token holen:
  1. F12 → Application → Cookies → https://cursor.com
  2. WorkosCursorSessionToken → Wert kopieren

"@
}

$envKey = "CURSOR_SESSION_TOKEN_$($UserId.ToUpper().Replace('-', '_'))"

if (-not $Token) {
    $Token = Read-Host "WorkosCursorSessionToken für '$UserId' einfügen (Enter = überspringen)"
}

if ($Token) {
    $lines = Get-Content $envPath -Encoding UTF8
    $pattern = "^\s*$envKey="
    $updated = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) {
            $lines[$i] = "$envKey=$Token"
            $updated = $true
        }
    }
    if (-not $updated) {
        $lines += "$envKey=$Token"
    }
    Set-Content -Path $envPath -Value $lines -Encoding UTF8
    Write-Host "$envKey gespeichert."
} else {
    Write-Host "Kein Token eingegeben — Live-Modus bleibt deaktiviert."
}

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "venv fehlt — bitte zuerst: python -m venv venv; pip install -r requirements.txt"
    exit 1
}

Write-Host ""
Write-Host "Health-Check:"
& $venvPython -c @"
import json, urllib.request
try:
    r = urllib.request.urlopen('http://127.0.0.1:8060/health', timeout=3)
    print(r.read().decode())
except Exception as e:
    print('Server nicht erreichbar — starte mit: .\start.ps1')
"@

Write-Host ""
Write-Host "Dashboard: http://127.0.0.1:8060/cursor-usage-analytics.html"
