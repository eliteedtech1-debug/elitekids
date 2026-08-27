# Systemd cutover — elite-kids api+web (2026-08-23 ~20:52 UTC)

Supervisor directive: run as system services if not difficult/risky. Implemented as
systemd USER units (linger=yes for dev) = boot-persistent, zero root, matches
existing lms-* pattern at /etc/systemd/system if root-level units ever preferred.

## Units
- ~/.config/systemd/user/elite-kids-api.service  → node src/index.js (backend/, .env via EnvironmentFile)
- ~/.config/systemd/user/kids-web.service        → npx vite --host --port 5173 --strictPort (frontend/)

## State
pm2 instances STOPPED + saved (not deleted). Both systemd units enabled (default.target.wants) + active.
Verified: :8484 /health ok · :5173 HTTP 200 · unauth /kids/leaderboard → 401.

## Ops commands
systemctl --user status|restart|stop elite-kids-api kids-web
journalctl --user -u elite-kids-api -n 50

## Rollback (if ever needed)
systemctl --user disable --now elite-kids-api.service kids-web.service && pm2 restart elite-kids kids-web

## Notes
- RestartSec=3, Restart=always both units.
- Logs: journald --user (+ reports/systemd-*.log for web stdout append).
- Do NOT run pm2 and systemd simultaneously for the same app (port double-bind).
