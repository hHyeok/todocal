#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js가 설치되어 있지 않습니다."
  echo "https://nodejs.org 에서 Node.js를 먼저 설치해 주세요."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/2] 의존성 패키지를 설치하는 중입니다..."
  pnpm install
fi

if [ ! -d "dist" ]; then
  echo "[2/2] 웹 앱을 빌드하는 중입니다..."
  pnpm build
fi

export TODOCAL_MOCK=1
export TODOCAL_OPEN=1

echo "==================================================="
echo "  todocal (Mock Mode) 시작: http://127.0.0.1:5180"
echo "  종료하려면 Ctrl+C 를 누르세요."
echo "==================================================="
echo ""

pnpm start
