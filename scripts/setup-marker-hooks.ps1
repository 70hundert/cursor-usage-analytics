Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$hookSource = Join-Path $repoRoot "scripts\cursor-marker-hook.py"
$wrapperSource = Join-Path $repoRoot "scripts\run-marker-hook.ps1"
$configExample = Join-Path $repoRoot "config\marker-hook.example.json"

$cursorDir = Join-Path $env:USERPROFILE ".cursor"
$hooksDir = Join-Path $cursorDir "hooks"
$hookTarget = Join-Path $hooksDir "cursor-marker-hook.py"
$wrapperTarget = Join-Path $hooksDir "run-marker-hook.ps1"
$cmdTarget = Join-Path $hooksDir "run-marker-hook.cmd"
$hooksJsonPath = Join-Path $cursorDir "hooks.json"
$configTarget = Join-Path $cursorDir "marker-hook.json"

if (-not (Test-Path $hookSource)) {
    throw "Hook-Skript nicht gefunden: $hookSource"
}

New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null
Copy-Item -Path $hookSource -Destination $hookTarget -Force
if (Test-Path $wrapperSource) {
    Copy-Item -Path $wrapperSource -Destination $wrapperTarget -Force
}
Write-Host "Hook installiert: $hookTarget"

$venvPython = Join-Path $repoRoot "venv\Scripts\python.exe"
$pythonPath = if (Test-Path $venvPython) { $venvPython } else { "python" }

$cmdLines = @(
    "@echo off"
    "chcp 65001 >nul"
    "set PYTHONIOENCODING=utf-8"
    "set PYTHONUTF8=1"
    "`"$pythonPath`" `"$hookTarget`""
    "exit /b %ERRORLEVEL%"
)
Set-Content -Path $cmdTarget -Value $cmdLines -Encoding ASCII
Write-Host "CMD-Wrapper installiert: $cmdTarget"

$hookCommand = $cmdTarget

$markerHooks = @{
    sessionStart = @(
        @{ command = $hookCommand }
    )
    beforeSubmitPrompt = @(
        @{
            command = $hookCommand
            matcher = "UserPromptSubmit"
        }
    )
    sessionEnd = @(
        @{ command = $hookCommand }
    )
}

$hooksRoot = @{
    version = 1
    hooks = $markerHooks
}

if (Test-Path $hooksJsonPath) {
    try {
        $existingText = Get-Content $hooksJsonPath -Raw -Encoding UTF8
        $existing = $existingText | ConvertFrom-Json
        if ($null -ne $existing -and $null -ne $existing.hooks) {
            $mergedHooks = @{}
            foreach ($prop in $existing.hooks.PSObject.Properties) {
                $mergedHooks[$prop.Name] = $prop.Value
            }
            foreach ($event in $markerHooks.Keys) {
                $mergedHooks[$event] = $markerHooks[$event]
            }
            $hooksRoot = @{
                version = if ($existing.version) { [int]$existing.version } else { 1 }
                hooks = $mergedHooks
            }
        }
    } catch {
        Write-Host "Warnung: hooks.json konnte nicht gemerged werden - wird neu geschrieben."
    }
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

($hooksRoot | ConvertTo-Json -Depth 8) | ForEach-Object { Write-Utf8NoBomFile -Path $hooksJsonPath -Content $_ }
Write-Host "hooks.json aktualisiert: $hooksJsonPath"

if (-not (Test-Path $configTarget)) {
    if (-not (Test-Path $configExample)) {
        throw "Beispiel-Config nicht gefunden: $configExample"
    }
    Copy-Item -Path $configExample -Destination $configTarget
    Write-Host "Config angelegt: $configTarget"
}

try {
    $configText = Get-Content $configTarget -Raw -Encoding UTF8
    $config = $configText | ConvertFrom-Json
    $config | Add-Member -NotePropertyName pythonPath -NotePropertyValue $pythonPath -Force
    $config | Add-Member -NotePropertyName dashboardRoot -NotePropertyValue $repoRoot -Force
    $config | Add-Member -NotePropertyName modes -NotePropertyValue @("agent", "edit", "chat") -Force
    ($config | ConvertTo-Json -Depth 8) | ForEach-Object { Write-Utf8NoBomFile -Path $configTarget -Content $_ }
    Write-Host "Config aktualisiert: $configTarget"
} catch {
    Write-Host "Warnung: marker-hook.json konnte pythonPath/dashboardRoot nicht setzen."
}

Write-Host ""
Write-Host "Naechste Schritte:"
Write-Host ('  1. ' + $configTarget + ' pruefen (defaultUser, pythonPath, dashboardRoot)')
Write-Host "  2. python serve.py starten (Port 8060)"
Write-Host "  3. Cursor komplett neu laden (Hooks unter Settings - Hooks pruefen)"
Write-Host "  4. Neuer Composer-Chat (Agent-, Edit- oder Chat-Modus), dann Dashboard neu laden (F5)"
