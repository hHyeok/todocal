@echo off
setlocal
cd /d "%~dp0"

set TODOCAL_MOCK=1
set TODOCAL_OPEN=1

call node -v >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo [1/2] Installing dependencies...
    call pnpm install
)

if not exist dist (
    echo [2/2] Building frontend...
    call pnpm build
)

echo.
echo ===================================================
echo   todocal (Mock Mode): http://127.0.0.1:5180
echo   Single local server for Web + API + AI
echo   Close this window to stop the server.
echo ===================================================
echo.

call pnpm start
if errorlevel 1 (
    echo.
    echo [ERROR] Server stopped with an error.
    pause
)
