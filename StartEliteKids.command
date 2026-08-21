#!/bin/bash
cd /Users/elite/Downloads/apps/elite/elite-kids/backend && node src/index.js &
sleep 4
cd /Users/elite/Downloads/apps/elite/elite-kids/frontend && VITE_API_URL=http://localhost:34600 npx vite --host --port 5173 &
sleep 3
echo ""
echo "════════════════════════════════════════════"
echo "  ✅ EliteKids is ready!"
echo ""
echo "  Open: http://localhost:5173/login"
echo ""
echo "  Parent:  hhfh@hhf.com / test1234"
echo "  Student: 213232/1/0029 / test1234"
echo "════════════════════════════════════════════"
wait
