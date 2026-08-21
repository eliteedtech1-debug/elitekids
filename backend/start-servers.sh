#!/bin/bash
# Start EliteKids backend + frontend, detached from terminal
# Kill with: pkill -f elitekids

LOGDIR=/tmp
BACKEND_LOG=$LOGDIR/elitekids-backend.log
FRONTEND_LOG=$LOGDIR/elitekids-frontend.log

# Kill any existing instances
pkill -f "elite-kids/backend.*index.js" 2>/dev/null
pkill -f "elite-kids/frontend.*vite" 2>/dev/null
sleep 1

# Start backend
cd "$(dirname "$0")"
nohup node src/index.js > "$BACKEND_LOG" 2>&1 &
echo "Backend started: PID=$!"

# Wait for backend to be ready
for i in $(seq 1 15); do
  if curl -s -o /dev/null --max-time 1 http://localhost:34600/api/health 2>/dev/null; then
    echo "Backend ready on :34600"
    break
  fi
  sleep 1
done

# Start frontend
cd ../frontend
nohup npx vite --host --port 34601 > "$FRONTEND_LOG" 2>&1 &
echo "Frontend started: PID=$!"
sleep 3

echo ""
echo "════════════════════════════════════════════════"
echo "  ✅ EliteKids Dev Servers Running"
echo ""
echo "  Frontend: http://localhost:34601/login"
echo "  Backend:  http://localhost:34600"
echo ""
echo "  Kill: pkill -f elitekids"
echo "════════════════════════════════════════════════"
