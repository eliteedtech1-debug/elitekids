#!/usr/bin/env bash
# rebuild-frontend.sh — build frontend dist for nginx.
# Called by post-receive and post-merge hooks.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"

echo "[rebuild] cd $FRONTEND"
cd "$FRONTEND" || { echo "[rebuild] FAIL: cannot cd to frontend/"; exit 1; }

echo "[rebuild] npm run build..."
if npm run build 2>&1; then
  echo "[rebuild] SUCCESS — dist/ updated at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  echo "[rebuild] FAIL: build failed"
  exit 1
fi
