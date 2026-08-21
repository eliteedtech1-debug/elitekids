#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  EliteKids Dev Server Launcher
#  Double-click this file in Finder to start both servers.
#  Close the Terminal window to stop both servers.
# ═══════════════════════════════════════════════════════════

# Open a new Terminal window with the commands
osascript <<'APPLESCRIPT'
tell application "Terminal"
    activate
    do script "cd /Users/elite/Downloads/apps/elite/elite-kids/backend && node src/index.js"
    delay 4
    do script "cd /Users/elite/Downloads/apps/elite/elite-kids/frontend && VITE_API_URL=http://localhost:34600 npx vite --host" in front window
    delay 3
    do script "echo '' && echo '════════════════════════════════════════════' && echo '  ✅ EliteKids is ready!' && echo '' && echo '  Open: http://localhost:5173/login' && echo '' && echo '  Parent:  hhfh@hhf.com / test1234' && echo '  Student: 213232/1/0029 / test1234' && echo '════════════════════════════════════════════'" in front window
end tell
APPLESCRIPT
