#!/usr/bin/env bash
set -euo pipefail
# Git-based deploy: push local → pull on VPS → build → restart
# Usage: bash deploy-git.sh

VPS_HOST="${VPS_HOST:-62.72.0.209}"
VPS_USER="${VPS_USER:-dev}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/hostinger_bits}"
REMOTE_DIR="/var/www/html/elite-kids"

SSH_CMD="ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

step() { echo; echo "==> $1"; }

step "Pushing to GitHub..."
git push origin main 2>&1 | tail -3

step "Running git-deploy on VPS..."
$SSH_CMD "$VPS_USER@$VPS_HOST" "bash $REMOTE_DIR/git-deploy.sh" 2>&1

echo
echo "═══════════════════════════════════════════════════"
echo "  ✅ Git deploy complete — https://elitekids.com.ng"
echo "═══════════════════════════════════════════════════"
