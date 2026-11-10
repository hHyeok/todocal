#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js가 설치되어 있지 않습니다."
  exit 1
fi

[ -d node_modules ] || pnpm install
{ [ -d dist ] && [ -f server-dist/index.mjs ]; } || pnpm build

ELECTRON="$DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
nohup "$ELECTRON" "$DIR/electron/main.js" >/dev/null 2>&1 &
disown
