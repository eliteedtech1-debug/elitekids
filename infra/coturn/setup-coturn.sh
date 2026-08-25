#!/usr/bin/env bash
# ── coturn TURN server setup for EliteKids WebRTC voice ──────────────────────
# Run on production VPS: sudo bash setup-coturn.sh
# This installs coturn, deploys config, and opens firewall ports.
set -euo pipefail

TURN_USER="elitekids"
TURN_PASS="secret123Turn!"
VPS_IP="62.72.0.209"

echo "==> Installing coturn..."
apt-get update -qq
apt-get install -y -qq coturn

echo "==> Deploying turnserver.conf..."
cp "$(dirname "$0")/turnserver.conf" /etc/turnserver.conf

# Ensure TURN credentials match config
sed -i "s/^user=.*/user=${TURN_USER}:${TURN_PASS}/" /etc/turnserver.conf

echo "==> Enabling coturn service..."
# Enable coturn in defaults
sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true

echo "==> Restarting coturn..."
systemctl enable coturn
systemctl restart coturn
sleep 2

echo "==> Checking coturn status..."
systemctl is-active coturn && echo "✅ coturn is running" || echo "❌ coturn failed to start"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TURN server configured!"
echo ""
echo "  Add these to /var/www/html/elite-kids/backend/.env:"
echo ""
echo "  LIVE_WEBRTC=1"
echo "  TURN_URLS=turn:${VPS_IP}:3478?transport=udp"
echo "  TURN_USER=${TURN_USER}"
echo "  TURN_PASS=${TURN_PASS}"
echo "  STUN_URLS=stun:stun.l.google.com:19302"
echo ""
echo "  Then restart: pm2 restart elite-kids"
echo ""
echo "  Test: turnutils_uclient -T -u ${TURN_USER} -w '${TURN_PASS}' turn:${VPS_IP}:3478"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
