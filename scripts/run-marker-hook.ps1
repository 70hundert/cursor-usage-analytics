Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$configPath = Join-Path $env:USERPROFILE ".cursor\marker-hook.json"
$hookScript = Join-Path $PSScriptRoot "cursor-marker-hook.py"
$python = "python"

if (Test-Path $configPath) {
    try {
        $config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($config.pythonPath -and (Test-Path $config.pythonPath)) {
            $python = [string]$config.pythonPath
        }
    } catch {
        # fallback to python on PATH
    }
}

# PowerShell -File does not reliably forward stdin to child processes.
$stdin = [Console]::In.ReadToEnd()
if ($stdin) {
    $env:CURSOR_HOOK_PAYLOAD = $stdin
}

try {
    & $python $hookScript
    exit $LASTEXITCODE
} finally {
    Remove-Item Env:CURSOR_HOOK_PAYLOAD -ErrorAction SilentlyContinue
}
