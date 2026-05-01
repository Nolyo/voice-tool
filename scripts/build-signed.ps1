# Script pour builder l'application avec signature
# Charge la clé privée et lance le build

Write-Host "Loading signing key..." -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$PSScriptRoot\..\src-tauri\private.key" -Raw
# Password not set here on purpose: Tauri will prompt interactively.
# If you want to skip the prompt, uncomment and set the real password:
# $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password-here"

Write-Host "Building application..." -ForegroundColor Cyan
pnpm tauri build

Write-Host "Build complete!" -ForegroundColor Green
