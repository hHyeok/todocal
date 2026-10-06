@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo [Todocal Desktop] 앱을 시작합니다...

if not exist node_modules (
  echo [Todocal] 의존성을 설치합니다...
  call pnpm install
)

if not exist dist (
  echo [Todocal] 프론트엔드를 빌드합니다...
  call pnpm build
)

set NODE_TLS_REJECT_UNAUTHORIZED=0
call pnpm desktop
