#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# db-switch.sh — Toggle between TEST and PRODUCTION databases
# Usage:
#   bash db-switch.sh test        → use *_test DBs (safe sandbox)
#   bash db-switch.sh production  → use live DBs (REAL DATA — careful!)
# ──────────────────────────────────────────────────────────
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-}"

if [ "$MODE" = 'test' ]; then
  cp "$DIR/.env.test" "$DIR/.env"
  echo '✅ Switched to TEST databases (elite_*_test)'
  echo '   DB_NAME=elite_db_test | CONTENT_DB_NAME=elite_content_test | KIDS_DB_NAME=elite_kids_test'
  echo '   Run: pm2 restart elite-kids-backend  (or the matching pm2 name)'
elif [ "$MODE" = 'production' ]; then
  echo '⚠️  You are about to switch to LIVE production databases!'
  read -r -p '   Type YES to confirm: ' confirm
  if [ "$confirm" = 'YES' ]; then
    cp "$DIR/.env.production" "$DIR/.env"
    echo '✅ Switched to PRODUCTION databases (elite_db | elite_content | elite_kids)'
    echo '   Run: pm2 restart elite-kids-backend'
  else
    echo 'Aborted.'
  fi
else
  echo 'Usage: bash db-switch.sh [test|production]'
  echo ''
  echo 'Current DB config:'
  grep -E 'DB_NAME|CONTENT_DB|KIDS_DB' "$DIR/.env" | grep -v '^#' | grep -v PASSWORD
fi
