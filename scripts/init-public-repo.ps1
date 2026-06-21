# Erzeugt einen sauberen Public-Clone ohne alte Git-Historie.
param(
    [string]$DestinationRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SourceRoot = Split-Path $PSScriptRoot -Parent
if (-not $DestinationRoot) {
    $DestinationRoot = Join-Path (Split-Path $SourceRoot -Parent) "Cursor-Usage-Dashboard-Public"
}

$excludeDirNames = @('.git', 'venv', 'data', '.specstory', '__pycache__', 'node_modules')
$excludeRelativePaths = @(
    'config\users.json',
    'docs\PROMPT-feature-reference.md',
    'docs\VORLAGE-PROMPT-feature-reference.md',
    'docs\ROADMAP.md',
    '.cursor\rules\feature-reference-workflow.mdc'
)

function Get-RelativePath {
    param([string]$FullPath, [string]$Root)
    return $FullPath.Substring($Root.Length).TrimStart('\', '/').Replace('/', '\')
}

function Should-SkipPath {
    param([string]$FullPath, [string]$Root)
    $relative = Get-RelativePath $FullPath $Root
    foreach ($rel in $excludeRelativePaths) {
        if ($relative -ieq $rel) {
            return $true
        }
    }
    if ((Split-Path $FullPath -Leaf) -eq '.env') {
        return $true
    }
    $parts = $relative -split '\\'
    foreach ($part in $parts) {
        if ($excludeDirNames -contains $part) {
            return $true
        }
    }
    return $false
}

if (Test-Path $DestinationRoot) {
    $items = Get-ChildItem -Force $DestinationRoot
    if ($items.Count -gt 0) {
        throw "Ziel existiert und ist nicht leer: $DestinationRoot"
    }
} else {
    New-Item -ItemType Directory -Path $DestinationRoot | Out-Null
}

Write-Host "Kopiere von: $SourceRoot"
Write-Host "         nach: $DestinationRoot"

Get-ChildItem -Path $SourceRoot -Recurse -Force | ForEach-Object {
    if (Should-SkipPath $_.FullName $SourceRoot) {
        return
    }
    $relative = Get-RelativePath $_.FullName $SourceRoot
    $target = Join-Path $DestinationRoot $relative
    if ($_.PSIsContainer) {
        if (-not (Test-Path $target)) {
            New-Item -ItemType Directory -Path $target -Force | Out-Null
        }
    } else {
        $parent = Split-Path $target -Parent
        if (-not (Test-Path $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}

Write-Host "Initialisiere Git..."
Set-Location $DestinationRoot
git init -b main
git add -A
git commit -m "Initial public release preparation (clean export)."
git status

Write-Host ""
Write-Host "Fertig. Naechste Schritte:"
Write-Host "  cd $DestinationRoot"
Write-Host "  gh repo create cursor-usage-dashboard --private --source=. --remote=origin"
Write-Host "  git push -u origin main"
Write-Host ""
Write-Host "Siehe docs/PUBLIC_REPO.md"
