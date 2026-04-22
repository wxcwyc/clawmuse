#!/usr/bin/env bash
set -euo pipefail

echo "[guard] openclaw desktop connection regression guard"

COREPACK_HOME=/tmp/corepack corepack pnpm vitest run \
  apps/desktop-electron/src/main/index.test.ts \
  apps/desktop-electron/src/preload/index.test.ts \
  apps/desktop-electron/src/renderer/main.test.ts \
  apps/desktop-electron/src/renderer/App.test.ts \
  packages/openclaw-adapter/src/websocket-transport.test.ts

COREPACK_HOME=/tmp/corepack corepack pnpm build:desktop-electron

echo "[guard] passed"
