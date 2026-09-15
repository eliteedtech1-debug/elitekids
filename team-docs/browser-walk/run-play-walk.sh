#!/usr/bin/env bash
# Run the PLAY subject-section browser walk (temporary — team-docs only).
#
# One shot on purpose: background processes do not survive between tool calls, so
# serve + chromium + walk + teardown all happen here.
#
# Cleanup kills by PORT, never `pkill -f <text>` — the pattern would match this
# script's own command line and kill the shell running it.
#
# Usage: bash team-docs/browser-walk/run-play-walk.sh [label] [admission_no]
set -u
cd /var/www/html/elite/elite-kids || exit 1

PORT=34777
CDP_PORT=9333
LABEL="${1:-p1}"
ADMISSION="${2:-EK-Q4-TEST-001}"
OUT="/tmp/kids-play-${LABEL}"
JWT="$(cat team-docs/browser-walk/.token)"

kill_port() {
  local p="$1"
  local pid
  pid=$(ss -ltnp 2>/dev/null | grep ":$p " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  return 0
}

kill_port "$PORT"
kill_port "$CDP_PORT"
sleep 1

nohup node team-docs/browser-walk/serve.mjs "$PORT" > /tmp/kids-serve.log 2>&1 &
SERVE_PID=$!
nohup chromium --headless=new --remote-debugging-port="$CDP_PORT" --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --window-size=412,915 --user-data-dir=/tmp/kids-walk-play about:blank \
  > /tmp/kids-chrome.log 2>&1 &

UP=0
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && curl -sf -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version"; then
    UP=1; break
  fi
  sleep 1
done
echo "[run] harness up=$UP"

if [ "$UP" = "1" ]; then
  ADMISSION="$ADMISSION" node team-docs/browser-walk/play-sections.mjs \
    "http://127.0.0.1:$PORT" "$JWT" "$LABEL" > "$OUT.json" 2> "$OUT.err"
  echo "[run] walk exit=$? -> $OUT.json"
else
  echo "[run] harness never came up; serve log:"; tail -5 /tmp/kids-serve.log
fi

kill "$SERVE_PID" 2>/dev/null
kill_port "$CDP_PORT"
echo "[run] torn down"
