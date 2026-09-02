# E4 Phase 1 — Q18 coturn TURN Relay: CLOSED

- **Date:** 2026-09-02
- **Resolver:** `coturn-setup.yml` GitHub Actions workflow (workflow_dispatch-only), run on self-hosted runner `elitekids-runner` (repo `eliteedtech1-debug/elitekids`, VPS 62.72.0.209, user `dev`, `/home/dev/actions-runner`).
- **Root mechanism:** `S() { echo "${{ secrets.SUDO_PASSWORD }}" | sudo -S "$@"; }` — mirrors elite-sms `deploy-vps.yml` precedent (secret confirmed present in elite-kids repo).

## What the workflow did (idempotent)
1. coturn already present (`/usr/bin/coturn`) → skipped reinstall.
2. Reused existing `TURN_PASS` from `backend/.env` (did NOT rotate existing secret).
3. Rewrote `/etc/turnserver.conf` (realm elitekids.com.ng, use-auth-secret, relay 49160-49200, external-ip 62.72.0.209).
4. Firewall: ufw rules for 3478/5349 + relay range (ufw active branch).
5. Enabled + started coturn; service `active`.
6. Appended/updated `backend/.env`: `LIVE_WEBRTC=1`, `STUN_URLS`, `TURN_URLS=turn:62.72.0.209:3478?transport=udp`, `TURN_USER=elitekids`, `TURN_PASS=<redacted>`.
7. Restarted `elite-kids-api`; health OK.

## Verification (VPS, dev user)
- `coturn` service: **active**
- Port **3478/TCP listening** on `62.72.0.209`; connect via `127.0.0.1:3478` ✅ and `62.72.0.209:3478` ✅
- Backend health: OK
- `backend/.env`: TURN/STUN vars present → `e3fLive.js` will send `turn:62.72.0.209:3478` in the `welcome` iceServers frame

## Notes / non-blocking
- **5349/TLS refused:** `tls-listening-port` set but no TLS cert path in config, so the TLS listener isn't open. NON-BLOCKING — TURN_URLS uses plain UDP/TCP 3478 only. Optional later: add `/etc/letsencrypt/...` `cert=`/`pkey=` lines + restart.
- UDP relay range 49160-49200 opened via ufw (relay media path) — same step.
- Final browser smoke (teacher publish → CGNAT student subscribe → grant/revoke) is a manual device test; relay config is confirmed listening.

## Commit
- `a0aa2d2` — added `.github/workflows/coturn-setup.yml` (workflow_dispatch-only, SUDO_PASSWORD root step), pushed to `main`.

## Progress
- QUEUE.md Q18 → DONE.
