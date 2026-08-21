#!/usr/bin/env bash
set -euo pipefail
# Git-based deploy: push local → pull on VPS → build → restart
# Usage: bash deploy-git.sh
#
# Safety: only pushes what you've committed locally.
# VPS script backs up .env before reset, always rebuilds dist.

VPS_HOST="${VPS_HOST:-62.72.0.209}"
VPS_USER="${VPS_USER:-dev}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/hostinger_bits}"
REMOTE_DIR="/var/www/html/elite-kids"

SSH_CMD="ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"

step() { echo; echo "==> $1"; }

# Pre-flight: check we have uncommitted changes
UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$UNCOMMITTED" -gt 0 ]; then
  echo "⚠️  You have $UNCOMMITTED uncommitted changes."
  echo "   Run 'git add . && git commit' first, or use 'bash deploy.sh' (rsync) instead."
  echo "   Aborting git deploy."
  exit 1
fi

# Check we have local commits ahead of remote
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
if [ "$AHEAD" = "0" ]; then
  echo "✅ Nothing to push — local is up to date with origin/main."
  exit 0
fi

step "Pushing $AHEAD commit(s) to GitHub..."
git push origin main 2>&1 | tail -5

step "Running git-deploy on VPS..."
$SSH_CMD "$VPS_USER@$VPS_HOST" "bash $REMOTE_DIR/git-deploy.sh" 2>&1

echo
echo "═══════════════════════════════════════════════════"
echo "  ✅ Git deploy complete — https://elitekids.com.ng"
echo "═══════════════════════════════════════════════════"
