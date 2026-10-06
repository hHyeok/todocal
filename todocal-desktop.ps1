# Todocal Desktop Launcher
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[Todocal Desktop] 앱을 시작합니다..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
  Write-Host "[Todocal] 의존성을 설치합니다..." -ForegroundColor Yellow
  pnpm install
}

if (-not (Test-Path "dist")) {
  Write-Host "[Todocal] 프론트엔드를 빌드합니다..." -ForegroundColor Yellow
  pnpm build
}

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
pnpm desktop
