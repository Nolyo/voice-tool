# Script pour builder l'application avec signature
# Charge la clé privée et lance le build

Write-Host "Loading signing key..." -ForegroundColor Cyan
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content src-tauri\private.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

Write-Host "Building application..." -ForegroundColor Cyan
pnpm tauri build

Write-Host "Build complete!" -ForegroundColor Green
