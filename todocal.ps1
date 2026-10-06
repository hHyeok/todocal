[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "todocal - Todoist Calendar"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js가 설치되어 있지 않습니다." -ForegroundColor Red
    Write-Host "https://nodejs.org 에서 Node.js를 먼저 설치해 주세요."
    Read-Host "엔터를 누르면 종료합니다..."
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "[1/2] 의존성 패키지를 설치하는 중입니다..." -ForegroundColor Yellow
    pnpm install
}

if (-not (Test-Path "dist")) {
    Write-Host "[2/2] 웹 앱을 빌드하는 중입니다..." -ForegroundColor Yellow
    pnpm build
}

$env:TODOCAL_OPEN = "1"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  todocal 단일 통합 서버 시작: http://127.0.0.1:5180" -ForegroundColor Cyan
Write-Host "  종료하려면 Ctrl+C 를 누르세요." -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

pnpm start
