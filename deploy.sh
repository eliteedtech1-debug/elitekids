#!/usr/bin/env bash
set -euo pipefail

# EliteKids — one-command deploy to production VPS
# Usage:
#   bash deploy.sh              # full deploy (build + push + restart)
#   bash deploy.sh --backend    # backend only (skip frontend build)
#   bash deploy.sh --frontend   # frontend only (skip backend push)
#   bash deploy.sh --dry-run    # show what would happen, don't deploy

VPS_HOST="${VPS_HOST:-62.72.0.209}"
VPS_USER="${VPS_USER:-dev}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/hostinger_bits}"
REMOTE_DIR="/var/www/html/elite-kids"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

DRY_RUN=0
DEPLOY_FRONTEND=1
DEPLOY_BACKEND=1

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --backend)    DEPLOY_FRONTEND=0 ;;
    --frontend)   DEPLOY_BACKEND=0 ;;
    -h|--help)    echo "Usage: bash deploy.sh [--backend|--frontend|--dry-run]"; exit 0 ;;
  esac
done

SSH_CMD="ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
step() { echo; echo "==> $1"; }

# 1. Build frontend
if [ "$DEPLOY_FRONTEND" = "1" ]; then
  step "Building frontend..."
  cd "$SRC_DIR/frontend"
  VITE_API_URL="" npm run build 2>&1 | tail -5
  cd "$SRC_DIR"
fi

# 2. Deploy frontend
if [ "$DEPLOY_FRONTEND" = "1" ]; then
  step "Pushing frontend dist..."
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] rsync frontend/ → $VPS_HOST:$REMOTE_DIR/frontend/"
  else
    rsync -az --delete -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
      "$SRC_DIR/frontend/dist/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/frontend/"
    echo "  ✅ Frontend deployed"
  fi
fi

# 3. Deploy backend
if [ "$DEPLOY_BACKEND" = "1" ]; then
  step "Pushing backend..."
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] rsync backend/ → $VPS_HOST:$REMOTE_DIR/backend/"
  else
    rsync -az -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
      --exclude node_modules --exclude .env --exclude logs --exclude coverage \
      "$SRC_DIR/backend/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/backend/"
    echo "  ✅ Backend deployed"
  fi
  step "Pushing game-engine..."
  if [ "$DRY_RUN" != "1" ]; then
    rsync -az -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
      "$SRC_DIR/game-engine/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/game-engine/"
    echo "  ✅ Game-engine deployed"
  fi
fi

# 4. Restart PM2
if [ "$DRY_RUN" = "0" ]; then
  step "Restarting PM2..."
  [ "$DEPLOY_BACKEND" = "1" ] && $SSH_CMD "$VPS_USER@$VPS_HOST" "pm2 restart elite-kids 2>&1 | tail -3"
  $SSH_CMD "$VPS_USER@$VPS_HOST" "pm2 restart elite-kids-web 2>&1 | tail -3"
fi

# 5. Verify
if [ "$DRY_RUN" = "0" ]; then
  step "Verifying..."
  sleep 3
  HEALTH=$($SSH_CMD "$VPS_USER@$VPS_HOST" "curl -s http://127.0.0.1:8484/health" 2>/dev/null || echo "FAIL")
  echo "  Backend: $HEALTH"
  echo "  Frontend: https://elitekids.com.ng"
fi

echo; echo "✅ Done — https://elitekids.com.ng"
