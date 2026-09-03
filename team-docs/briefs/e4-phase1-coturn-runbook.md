# E4 Phase 1 — coturn TURN Relay Deployment Runbook

**QUEUE ref:** Q18 (`E4 Phase 1: WebRTC realtime broadcast`)
**Status:** Code is fully implemented & deployed; **only TURN relay (coturn) remains** — ROOT-ONLY, human/supervisor must run on the VPS.
**Updated:** 2026-09-02

---

## Context / Why this is the only remaining step

Phase 1 WebRTC broadcast was implemented (superseding the E4 brief's socket.io approach)
with the existing `ws`-based **`e3fLive.js`** + frontend `audio.ts`/`webrtc.ts`:

- Backend sends TURN/STUN `iceServers` to clients inside the `welcome` message
  (`e3fLive.js` lines ~182-200), read from env vars `LIVE_WEBRTC`, `TURN_URLS`,
  `TURN_USER`, `TURN_PASS`, `STUN_URLS`.
- Frontend applies them via `setIceServers()` (`audio.ts:205`) →
  `webrtc.ts` uses them for `RTCPeerConnection`.
- Verified: `e4` 10/10, `e5-parent-live` 6/6.

**Current limitation:** no TURN relay is configured, so WebRTC falls back to a single
Google STUN server (`stun:stun.l.google.com:19302`). STUN works for direct/peer-to-peer
connections but **fails on CGNAT / symmetric NAT / strict-firewall networks** — which is
common for students on mobile data in Nigeria. coturn fixes this by relaying media.

---

## STEP 1 — Install coturn (ROOT, Debian/Ubuntu VPS)

```bash
sudo apt-get update
sudo apt-get install -y coturn
```

## STEP 2 — Configure coturn

Edit `/etc/turnserver.conf` (create if missing) — keep it minimal & secure:

```ini
# Public relay + TLS
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech

# Realm (any domain string)
realm=elitekids.com.ng

# Long-term credentials file
use-auth-secret
static-auth-secret=REPLACE_WITH_A_LONG_RANDOM_SECRET
user=elitekids:REPLACE_WITH_STRONG_PASSWORD

# UDP/TCP relay range (open ports 49160-49200 in firewall)
min-port=49160
max-port=49200

# Do not let clients use the relay to reach random IPs
no-loopback-peers
no-multicast-peers

# External IP of the VPS (REQUIRED if behind NAT)
external-ip=62.72.0.209
```

Generate a strong secret once and record it ONLY in:
`/var/www/html/elite/elite-kids/backend/.env` (never commit, never paste in chat):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## STEP 3 — Firewall / security group

Open on the VPS firewall (ufw/nftables) AND any hosting provider security group:

- `3478/tcp` + `3478/udp` (TURN)
- `5349/tcp` (TLS)
- `49160:49200/udp` + `/tcp` (relay range)

```bash
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 49160:49200/udp
sudo ufw allow 49160:49200/tcp
```

Enable + start:

```bash
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable coturn
sudo systemctl restart coturn
sudo systemctl status coturn    # → active (running)
```

Smoke the relay ports are open:

```bash
ss -lntup | grep -E '3478|5349|4916'
```

## STEP 4 — Wire env into EliteKids backend

Append to `/var/www/html/elite/elite-kids/backend/.env` (restart after):

```env
LIVE_WEBRTC=1
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=turn:62.72.0.209:3478?transport=udp,turn:62.72.0.209:3478?transport=tcp
TURN_USER=elitekids
TURN_PASS=REPLACE_WITH_STRONG_PASSWORD
```

Restart the backend unit:

```bash
systemctl --user restart elite-kids-api
systemctl --user is-active elite-kids-api   # → active
```

## STEP 5 — Verify

The backend already relays TURN/STUN to clients automatically (no code change needed).
Verify ICE servers are delivered:

```bash
curl -s http://127.0.0.1:8484/health
# Then open the app as a teacher, start a broadcast, and in DevTools Network/WebSocket
# inspect the `welcome` frame — `iceServers` must include the turn: URL with username.
```

**Browser smoke (2 devices or 2 browser profiles):**
1. Teacher: connect, start broadcast.
2. Student (different network, e.g. phone on mobile data / CGNAT): join class, hear audio.
3. Grant/hand-raise → child mic, revoke → mute. Audio flows over the TURN relay path.

Evidence for Q18 close: screenshot of the `welcome` iceServers JSON + coturn
`systemctl status` active + one CGNAT-to-VPS audio pass.

---

## Rollback / security notes

- coturn with `lt-cred-mech` + a long `static-auth-secret` prevents open-relay abuse.
- The relay secret/pass must be treated as a secret (`.env` only).
- To disable WebRTC, set `LIVE_WEBRTC=0` in `.env` and restart — legacy PCM relay still works.

## Completion rule

Append a line to `team-docs/reports/e4-progress.md` and flip **Q18 → DONE** in
`team-docs/QUEUE.md` ONLY after STEP 5's CGNAT-to-VPS audio pass + screenshots are logged.
