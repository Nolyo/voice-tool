#Requires -Version 5.1
<#
.SYNOPSIS
    Full release pipeline: bump version, commit, push, build, and publish to GitHub.

.PARAMETER Version
    New version number.
    Stable  : X.Y.Z        (e.g. 2.9.0)
    Beta    : X.Y.Z-beta.N (e.g. 2.9.0-beta.1)

.PARAMETER Beta
    Mark the release as a prerelease / beta channel.

.PARAMETER DryRun
    Run everything (including build) but skip git tag and GitHub release creation.

.EXAMPLE
    .\make-release.ps1 -Version 2.10.0
    .\make-release.ps1 -Version 2.10.0-beta.1 -Beta
    .\make-release.ps1 -Version 2.10.0 -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Version,

    [switch]$Beta,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host ""; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "   WARN $msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$msg) Write-Host "   ERR $msg" -ForegroundColor Red; exit 1 }

# ── Step 1: Validate version format ───────────────────────────────────────────

Write-Step "Validating version"

if ($Beta) {
    if ($Version -notmatch '^\d+\.\d+\.\d+-beta\.\d+$') {
        Write-Fail "Beta version must match X.Y.Z-beta.N (got: $Version)"
    }
} else {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') {
        Write-Fail "Stable version must match X.Y.Z (got: $Version)"
    }
}

$releaseType = if ($Beta) { "beta" } else { "stable" }
Write-Ok "Version: $Version ($releaseType)"

# ── Step 2: Check git state ────────────────────────────────────────────────────

Write-Step "Checking git state"

$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "main") {
    Write-Fail "Must be on 'main' branch (currently on '$branch'). Switch with: git checkout main"
}
Write-Ok "On branch: main"

$gitStatus = git status --porcelain 2>&1
if ($gitStatus) {
    Write-Fail "Working tree has uncommitted changes. Commit or stash them first.`n$($gitStatus -join "`n")"
}
Write-Ok "Working tree is clean"

# ── Step 3: Bump versions in source files ─────────────────────────────────────

Write-Step "Bumping version in source files"

$filesToBump = @("package.json", "src-tauri\Cargo.toml", "src-tauri\tauri.conf.json")

# Read current version from package.json
$packageJson = Get-Content "package.json" -Raw
if ($packageJson -notmatch '"version":\s*"([^"]+)"') {
    Write-Fail "Could not find version in package.json"
}
$currentVersion = $Matches[1]
Write-Ok "Current version: $currentVersion"

if ($currentVersion -eq $Version) {
    Write-Fail "Version is already $Version - nothing to bump."
}

foreach ($file in $filesToBump) {
    if (-not (Test-Path $file)) { Write-Fail "File not found: $file" }
    $content = Get-Content $file -Raw
    $updated = $content -replace [regex]::Escape("`"version`": `"$currentVersion`""), "`"version`": `"$Version`""

    # Cargo.toml uses a different format for the top-level version line
    if ($file -eq "src-tauri\Cargo.toml") {
        $updated = $content -replace "(?m)^version = `"$([regex]::Escape($currentVersion))`"", "version = `"$Version`""
    }

    if ($content -eq $updated) {
        Write-Warn "$file : version string not found / already updated"
    } else {
        [System.IO.File]::WriteAllText((Resolve-Path $file).Path, $updated, [System.Text.Encoding]::UTF8)
        Write-Ok "$file updated"
    }
}

# ── Step 4: Update Cargo.lock ──────────────────────────────────────────────────

Write-Step "Updating Cargo.lock"

$origLibclang = $env:LIBCLANG_PATH
$origPath     = $env:PATH

$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:PATH          = $env:PATH + ";C:\Program Files\CMake\bin"

Push-Location "src-tauri"
try {
    $ErrorActionPreference = "Continue"
    cargo check --quiet
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "cargo check exited $LASTEXITCODE - Cargo.lock may not be fully updated, continuing anyway."
    } else {
        Write-Ok "Cargo.lock updated"
    }
} finally {
    $ErrorActionPreference = "Stop"
    Pop-Location
    $env:LIBCLANG_PATH = $origLibclang
    $env:PATH          = $origPath
}

# ── Step 5: Commit ─────────────────────────────────────────────────────────────

Write-Step "Committing version bump"

git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock
if ($LASTEXITCODE -ne 0) { Write-Fail "git add failed" }

$commitMsg = "chore: bump version to $Version"
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { Write-Fail "git commit failed" }
Write-Ok "Committed: $commitMsg"

# ── Step 6: Push ───────────────────────────────────────────────────────────────

Write-Step "Pushing to origin/main"

if ($DryRun) {
    Write-Warn "[DRY RUN] Skipping git push"
} else {
    git push origin main
    if ($LASTEXITCODE -ne 0) { Write-Fail "git push failed" }
    Write-Ok "Pushed to origin/main"
}

# ── Step 7: Delegate to release.ps1 ───────────────────────────────────────────

Write-Step "Handing off to release.ps1"

$releaseArgs = @()
if ($Beta)   { $releaseArgs += "-Prerelease" }
if ($DryRun) { $releaseArgs += "-DryRun" }

& "$PSScriptRoot\release.ps1" @releaseArgs

# release.ps1 manages its own exit code / error handling
