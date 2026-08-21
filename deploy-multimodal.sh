#!/usr/bin/env bash
set -euo pipefail
# Deploy multimodal patch: updates backend controller + migrates existing game configs
# Usage: bash deploy-multimodal.sh

VPS_HOST="${VPS_HOST:-62.72.0.209}"
VPS_USER="${VPS_USER:-dev}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/hostinger_bits}"
REMOTE_DIR="/var/www/html/elite-kids"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

SSH_CMD="ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
step() { echo; echo "==> $1"; }

# 1. Build frontend
step "Building frontend..."
cd "$SRC_DIR/frontend"
VITE_API_URL="" npm run build 2>&1 | tail -3
cd "$SRC_DIR"

# 2. Push frontend dist
step "Pushing frontend dist..."
rsync -az --delete --exclude 'node_modules' --exclude 'src' -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
  "$SRC_DIR/frontend/dist/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/frontend/dist/"
echo "  ✅ Frontend deployed"

# 3. Push backend + scripts
step "Pushing backend..."
rsync -az -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
  --exclude node_modules --exclude .env --exclude logs --exclude coverage \
  "$SRC_DIR/backend/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/backend/"
echo "  ✅ Backend deployed"

# 4. Push game-engine schemas
step "Pushing game-engine..."
rsync -az -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
  "$SRC_DIR/game-engine/" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/game-engine/"
echo "  ✅ Game-engine deployed"

# 5. Apply backend patch + migrate game configs on VPS
step "Patching backend controller + migrating game configs..."
$SSH_CMD "$VPS_USER@$VPS_HOST" bash << 'REMOTE_EOF'
cd /var/www/html/elite-kids/backend

# Apply the controller patch
node scripts/apply-multimodal-patch.js 2>&1 || echo "⚠️  Patch script had issues — applying manual patch"

# If patch script didn't work, do inline sed
if ! grep -q 'MULTIMODAL_PATCH_START' src/controllers/kids.js 2>/dev/null; then
  echo "Applying inline patch via sed..."
  
  # Find the line number of the second "No published game" (in getPublishedGame)
  LINE=$(grep -n "No published game for this lesson" src/controllers/kids.js | tail -1 | cut -d: -f1)
  
  if [ -n "$LINE" ]; then
    # Insert the multimodal injection after line $LINE+3 (the closing brace)
    INSERT_AT=$((LINE + 3))
    sed -i "${INSERT_AT}a\\
\\
    // Auto-inject multimodal defaults for backward-compatible configs\\
    const MULTIMODAL_DEFAULTS = {\\
      matching:          { promptMode: 'text',  responseMode: 'image' },\\
      'tap-recognition': { promptMode: 'text',  responseMode: 'image' },\\
      'drag-sort':       { promptMode: 'text',  responseMode: 'image' },\\
      quiz:              { promptMode: 'text',  responseMode: 'image' },\\
      'fill-in-blank':   { promptMode: 'text',  responseMode: 'text' },\\
      'puzzle-split':    { promptMode: 'image', responseMode: 'image' },\\
    };\\
    try {\\
      const cfg = typeof config.config_json === 'string' ? JSON.parse(config.config_json) : (config.config_json || {});\\
      if (!cfg.promptMode || !cfg.responseMode) {\\
        const defaults = MULTIMODAL_DEFAULTS[cfg.template] || { promptMode: 'text', responseMode: 'text' };\\
        if (!cfg.promptMode) cfg.promptMode = defaults.promptMode;\\
        if (!cfg.responseMode) cfg.responseMode = defaults.responseMode;\\
        config.config_json = cfg;\\
      }\\
    } catch {}" src/controllers/kids.js
    echo "✅ Inline patch applied"
  else
    echo "❌ Could not find getPublishedGame null check"
  fi
fi

# Migrate existing game configs
echo ""
echo "Running game config migration..."
node scripts/migrate-multimodal.js 2>&1 || echo "⚠️  Migration had issues (may need manual run)"

REMOTE_EOF

# 6. Restart backend
step "Restarting backend..."
$SSH_CMD "$VPS_USER@$VPS_HOST" "cd /var/www/html/elite-kids/backend && pm2 restart elite-kids 2>&1 | tail -3; sleep 3; pm2 save 2>&1"

# 7. Verify
step "Verifying..."
sleep 3
HEALTH=$($SSH_CMD "$VPS_USER@$VPS_HOST" "curl -s http://127.0.0.1:8484/health" 2>/dev/null || echo "FAIL")
echo "  Backend: $HEALTH"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://elitekids.com.ng/ 2>/dev/null || echo "000")
echo "  Frontend: HTTP $HTTP_CODE"

echo
echo "═══════════════════════════════════════════"
echo "  ✅ Multimodal deploy complete"
echo "  🌐 https://elitekids.com.ng"
echo "═══════════════════════════════════════════"
