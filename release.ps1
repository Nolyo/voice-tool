#Requires -Version 5.1
<#
.SYNOPSIS
    Local release script for voice-tool. Builds, stages artifacts, creates GitHub release.

.PARAMETER Prerelease
    Mark the GitHub release as a prerelease.

.PARAMETER DryRun
    Run all steps (including build) but skip git tag and GitHub release creation.

.EXAMPLE
    .\release.ps1
    .\release.ps1 -Prerelease
    .\release.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch]$Prerelease,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "   WARN $msg" -ForegroundColor Yellow }
function Write-Fail { param([string]$msg) Write-Host "   ERR $msg" -ForegroundColor Red; exit 1 }

function Resolve-Glob {
    param([string]$Pattern)
    return Get-ChildItem $Pattern -ErrorAction SilentlyContinue | Select-Object -First 1
}

# --- Step 1: Read version ---

Write-Step "Reading version from tauri.conf.json"

$confPath = "src-tauri\tauri.conf.json"
if (-not (Test-Path $confPath)) { Write-Fail "Cannot find $confPath" }

$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$VERSION = $conf.version
$TAG = "v$VERSION"

Write-Ok "Version : $VERSION  ->  Tag : $TAG"

# --- Step 2: Prerequisites ---

Write-Step "Checking prerequisites"

$privateKey = "src-tauri\private.key"
if (-not (Test-Path $privateKey)) {
    Write-Fail "Private key not found at '$privateKey'. Run: pnpm tauri signer generate --write-keys src-tauri/private.key --ci -p `"`""
}
Write-Ok "Private key present"

try {
    $null = gh auth status 2>&1
    Write-Ok "gh CLI authenticated"
} catch {
    Write-Fail "gh CLI not authenticated. Run: gh auth login"
}

# --- Step 3: Git state ---

Write-Step "Checking git state"

$gitStatus = git status --porcelain 2>&1
if ($gitStatus) {
    Write-Warn "Working tree is dirty. Uncommitted changes will NOT be included in the release."
    Write-Warn "Files: $($gitStatus -join ', ')"
}

foreach ($t in @($TAG, $VERSION, "v-$VERSION")) {
    $existingTag = git tag -l $t 2>&1
    if ($existingTag -eq $t) {
        Write-Fail "Tag '$t' already exists locally. Bump the version first."
    }
    $remoteTag = git ls-remote --tags origin "refs/tags/$t" 2>&1
    if ($remoteTag) {
        Write-Fail "Tag '$t' already exists on remote. Bump the version first."
    }
}

Write-Ok "Tag '$TAG' is free"

# --- Step 4: Build ---

Write-Step "Building application (pnpm tauri build)"

$privateKeyContent = Get-Content $privateKey -Raw
$env:TAURI_SIGNING_PRIVATE_KEY = $privateKeyContent.Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

Write-Ok "Cleaning old bundle artifacts to avoid stale files"
Get-ChildItem "src-tauri\target\release\bundle" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue

# MSI does not support non-numeric pre-release identifiers (e.g. 'beta'), skip it for prereleases
if ($Prerelease) {
    Write-Warn "Prerelease build: skipping MSI (MSI requires numeric-only pre-release identifiers)"
    pnpm tauri build --bundles nsis
} else {
    pnpm tauri build
}
if ($LASTEXITCODE -ne 0) { Write-Fail "Build failed (exit code $LASTEXITCODE)" }

Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue

Write-Ok "Build succeeded"

# --- Step 5: Locate artifacts ---

Write-Step "Locating build artifacts"

# Resolve Cargo target directory: check .cargo/config.toml overrides first
$cargoConfig = "src-tauri\.cargo\config.toml"
$releaseDir = "src-tauri\target\release"
if (Test-Path $cargoConfig) {
    $targetDirLine = Get-Content $cargoConfig | Where-Object { $_ -match '\btarget-dir\s*=' }
    if ($targetDirLine) {
        $targetDirValue = ($targetDirLine -replace '.*=\s*"?([^"]+)"?.*', '$1').Trim().Trim('"')
        $releaseDir = Join-Path $targetDirValue "release"
        Write-Ok "target-dir (from .cargo/config.toml): $targetDirValue"
    }
}
$bundleDir = "$releaseDir\bundle"

$portableSrc = Join-Path $releaseDir "voice-tool.exe"
if (-not (Test-Path $portableSrc)) { Write-Fail "Portable EXE not found: $portableSrc" }
Write-Ok "Portable   : $portableSrc"

$nsisExeSrc = Resolve-Glob "$bundleDir\nsis\Voice Tool_${VERSION}_x64-setup.exe"
if (-not $nsisExeSrc) { Write-Fail "NSIS setup EXE not found for version $VERSION in $bundleDir\nsis\" }
Write-Ok "NSIS EXE   : $($nsisExeSrc.FullName)"

$nsisSigPath = "$($nsisExeSrc.FullName).sig"
if (-not (Test-Path $nsisSigPath)) { Write-Fail "NSIS updater SIG not found: $nsisSigPath" }
Write-Ok "NSIS SIG   : $nsisSigPath"

if (-not $Prerelease) {
    $msiSrc = Resolve-Glob "$bundleDir\msi\Voice Tool_${VERSION}_x64_*.msi"
    if (-not $msiSrc) { Write-Fail "MSI not found for version $VERSION in $bundleDir\msi\" }
    Write-Ok "MSI        : $($msiSrc.FullName)"
} else {
    $msiSrc = $null
    Write-Ok "MSI        : skipped (prerelease)"
}

# --- Step 6: Stage artifacts ---

Write-Step "Staging artifacts into artifacts\$TAG\"

$stagingDir = "artifacts\$TAG"
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

$portableDest = "$stagingDir\voice-tool-$TAG-portable.exe"
$nsisExeDest  = "$stagingDir\voice-tool-$TAG-setup.exe"
$msiDest      = if ($msiSrc) { "$stagingDir\voice-tool-$TAG-setup.msi" } else { $null }

Copy-Item $portableSrc          $portableDest
Copy-Item $nsisExeSrc.FullName  $nsisExeDest
if ($msiSrc) { Copy-Item $msiSrc.FullName $msiDest }

Write-Ok "Staged $((Get-ChildItem $stagingDir).Count) files"

# --- Step 7: Build latest.json and latest-beta.json ---

Write-Step "Building latest.json and latest-beta.json"

$signature   = Get-Content $nsisSigPath -Raw
$nsisExeName = "voice-tool-$TAG-setup.exe"
$downloadUrl = "https://github.com/Nolyo/voice-tool/releases/download/$TAG/$nsisExeName"
$pubDate     = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

$latestJson = [ordered]@{
    version   = $VERSION
    notes     = "See https://github.com/Nolyo/voice-tool/blob/$TAG/CHANGELOG.md"
    pub_date  = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature.Trim()
            url       = $downloadUrl
        }
    }
}

$latestJsonPath     = "$stagingDir\latest.json"
$latestBetaJsonPath = "$stagingDir\latest-beta.json"
$jsonContent = $latestJson | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($latestJsonPath,     $jsonContent, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($latestBetaJsonPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
Write-Ok "latest.json      -> $latestJsonPath"
Write-Ok "latest-beta.json -> $latestBetaJsonPath"
Write-Ok "Download URL: $downloadUrl"

# --- Step 8: SHA256 checksums ---

Write-Step "Generating SHA256 checksums"

$checksumPath = "$stagingDir\checksums-$TAG.txt"
Remove-Item $checksumPath -ErrorAction SilentlyContinue

$filesToChecksum = @($portableDest, $nsisExeDest) + @(if ($msiDest) { $msiDest } else { @() })
foreach ($file in $filesToChecksum) {
    $hash = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
    $name = Split-Path $file -Leaf
    Add-Content $checksumPath "$hash *$name"
    Write-Ok "$name : $hash"
}

# --- DryRun exit ---

if ($DryRun) {
    Write-Host ""
    Write-Host "[DRY RUN] Skipping git tag, GitHub release, and releases.json update." -ForegroundColor Yellow
    Write-Host "Artifacts staged in: $stagingDir" -ForegroundColor Yellow
    exit 0
}

# --- Step 9: Git tag ---

Write-Step "Creating and pushing git tag $TAG"

git tag $TAG
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to create tag $TAG" }

git push origin $TAG
if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to push tag $TAG" }

Write-Ok "Tag $TAG pushed"

# --- Step 10: GitHub Release ---

Write-Step "Creating GitHub Release $TAG"

$msiLine = if ($msiDest) { "`n- **voice-tool-$TAG-setup.msi** : MSI installer (Windows Installer)" } else { "" }
$releaseNotes = @"
See the [CHANGELOG](https://github.com/Nolyo/voice-tool/blob/$TAG/CHANGELOG.md) for details.

## Downloads

- **voice-tool-$TAG-portable.exe** : Portable version (no installation required)
- **voice-tool-$TAG-setup.exe** : NSIS installer (recommended)$msiLine

Verify file integrity using the provided SHA256 checksums.

## Auto-Update Support

This release includes signed update artifacts for automatic in-app updates.
"@

if ($Prerelease) {
    $releaseNotes += "`n`n[PRERELEASE] This is a pre-release version for testing purposes only."
}

$ghArgs = @(
    "release", "create", $TAG,
    "--title", "Voice Tool $TAG",
    "--notes", $releaseNotes,
    $portableDest,
    $nsisExeDest
)
if ($msiDest) { $ghArgs += $msiDest }
$ghArgs += @($latestJsonPath, $latestBetaJsonPath, $checksumPath)

if ($Prerelease) { $ghArgs += "--prerelease" }

gh @ghArgs
if ($LASTEXITCODE -ne 0) { Write-Fail "gh release create failed" }

Write-Ok "GitHub Release created: https://github.com/Nolyo/voice-tool/releases/tag/$TAG"

# --- Step 10b: For prereleases, also push latest-beta.json to the latest stable release ---
# The beta updater URL resolves to 'releases/latest/download/latest-beta.json'.
# GitHub's 'latest' always points at the most recent non-prerelease, so the file
# must live there to be discoverable by users on the beta channel.

if ($Prerelease) {
    Write-Step "Updating latest-beta.json on latest stable release"

    $stableRelease = gh release list --json tagName,isPrerelease --limit 100 `
        | ConvertFrom-Json `
        | Where-Object { -not $_.isPrerelease } `
        | Select-Object -First 1

    if ($stableRelease) {
        $latestStableTag = $stableRelease.tagName
        Write-Ok "Target stable release: $latestStableTag"
        Write-Ok "Uploading: $latestBetaJsonPath"
        gh release upload $latestStableTag $latestBetaJsonPath --clobber
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Could not update latest-beta.json on $latestStableTag. Run manually: gh release upload $latestStableTag $latestBetaJsonPath --clobber"
        } else {
            Write-Ok "latest-beta.json pushed to stable release $latestStableTag"
            Write-Ok "Beta channel users will now be offered $TAG"
        }
    } else {
        Write-Fail "No stable release found on GitHub. Create a stable release first, then run: gh release upload <tag> $latestBetaJsonPath --clobber"
    }
}

# --- Step 11: Regenerate releases.json ---

Write-Step "Regenerating docs/releases.json"

$scriptsDir = ".github\scripts"
if (-not (Test-Path "$scriptsDir\generate-releases-json.js")) {
    Write-Warn "generate-releases-json.js not found in $scriptsDir -- skipping releases.json update"
} else {
    $env:GITHUB_TOKEN = (gh auth token)

    Push-Location $scriptsDir
    try {
        node generate-releases-json.js
        if ($LASTEXITCODE -ne 0) { Write-Warn "generate-releases-json.js exited with code $LASTEXITCODE" }
    } finally {
        Pop-Location
        Remove-Item Env:\GITHUB_TOKEN -ErrorAction SilentlyContinue
    }

    # --- Step 12: Commit and push releases.json ---

    Write-Step "Committing docs/releases.json"

    git add docs/releases.json
    $diff = git diff --staged --name-only
    if ($diff) {
        git commit -m "chore: update releases.json for $TAG"
        git push origin main
        if ($LASTEXITCODE -ne 0) { Write-Warn "Failed to push releases.json -- push manually if needed" }
        Write-Ok "docs/releases.json committed and pushed"
    } else {
        Write-Ok "docs/releases.json unchanged -- nothing to commit"
    }
}

# --- Done ---

Write-Host ""
Write-Host "[DONE] Release $TAG complete!" -ForegroundColor Green
Write-Host "       https://github.com/Nolyo/voice-tool/releases/tag/$TAG" -ForegroundColor Green
