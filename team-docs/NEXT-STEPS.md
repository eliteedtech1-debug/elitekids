# NEXT STEPS — EliteKids (handoff, updated 2026-09-01)

Pickup notes for whoever continues EliteKids work. Everything below was either
verified live or is a known gap with a concrete fix. Companion docs:
`FLAGSHIP-ELITE-SCHOOL-SPEC.md`, `EXECUTION-PLAN-ELITE-SCHOOL.md`,
`MVP-TO-PROD-DB-SWAP.md`, `SESSION-PLAYBOOK.md`.

---

## ✅ Current state (verified)

- **Flagship identity is SCH-ELITE** (`elite`, "Elite EduTech Systems Ltd — Model
  School"). `elite` / `kids` / `practice` and ANY `*.elitekids.com.ng` subdomain
  resolve to it. Legacy SCH-KIDS stays only as a global-content source
  (`PLATFORM_SCHOOL_IDS = ['SCH-ELITE','SCH-KIDS']` in `kids.js`).
- **Parent login = shared EliteSMS credential** (phone/email/username + password).
  PIN is deleted. No re-login on app switch (shared JWT secret, `verify-token`
  accepts kids-issued tokens). Verified: `unified-login.test.js` 8/8.
- **Parent live role (WebRTC)**: `e3fLive` extends the existing WebRTC + `ws`
  intercom with a `parent` role — parent↔child presence, broadcast, mute/unmute
  floor, calls. Verified: `e5-parent-live.test.js` 6/6, `e4` 10/10.
- **Subscriptions + Paystack** (`kidsSubscription.js`): plans 500/term, 1200/
  annual (DB-configurable), school + flagship-parent flows, initiate/verify/
  webhook with HMAC, entitlement guard (`free_tier` for flagship parents, `none`
  for unsubscribed schools, `all_games` once paid). Same `PAYSTACK_SECRET_KEY`
  as EliteSMS. Verified: `subscription.test.js` 15/15.
- **Deploy gate**: elite-kids deploys via the elite-sms self-hosted runner
  (`elitekids-deploy-reusable.yml` ← `elitekids-deploy-watch.yml` schedule +
  dispatch, and `elitekids-sync` job in `deploy-vps.yml`). Gate runs
  unified-login + subscription + E4 + E5 on every deploy and BLOCKS on red.
  Proven: red blocks (service untouched), green deploys. Latest verified deploy:
  **5c13096**, health 200, flagship + login + subscription all live.
- **Fixed in 5c13096**: passport parent session dropped `id`/`school_id` →
  flagship-parent `initiate` 400'd ("Could not determine subscription scope")
  → webhook 404. Session now keeps id/school_id from the token.

---

## 🔴 Correctness (do these first)

1. **Register the elite-kids self-hosted runner** (needs a repo-ADMIN token for
   `eliteedtech1-debug/elitekids` → Settings → Actions → Runners). Then
   elite-kids self-deploys natively on push via its own `deploy.yml` (already
   rewritten for the live layout: `/var/www/html/elite/elite-kids`, systemd
   USER unit `elite-kids-api` :8484, no sudo) and the watcher bridge can retire.
   Add a `concurrency` group to `deploy.yml` so it can never race the bridge.
2. **Move the elite-kids PAT** off `/home/dev/.git-creds-map` into an Actions
   secret (`ELITEKIDS_TOKEN`). Deploy depends on a plaintext PAT file today —
   one credential store, revocable.
3. **Audit other parent-scoped routes** for the session bug fixed in 5c13096
   (parents reading `req.user.id`/`req.user.school_id` before the fix got
   undefined). Check `kidsParent.js`, `kidsParental.js`, `kidsModeLock.js`,
   `kids.js` parent flows.

## 🟡 Reliability

4. **`loginctl enable-linger dev`** + boot-time check for `elite-kids-api` —
   nothing guarantees the USER unit returns after a VPS reboot.
5. **Cron caveat**: the `*/2` schedule on elite-sms rarely fires (GitHub
   schedule service). The push-bridge (`elitekids-sync` in `deploy-vps.yml`) and
   manual dispatch are the dependable paths today; revisit once the elite-kids
   runner exists.
6. **Frontend deploys deterministic**: `npm ci` instead of `npm install` in the
   deploy, and verify the kids frontend's `VITE_API_URL` actually points at the
   API serving `kids.elitekids.com.ng`.

## 🟢 Finish the product

7. **Parent live-control UI** — the server + tests for the parent WebRTC/floor
   role are done, but the parent dashboard has no UI for it; mirror the teacher
   UI (broadcast, mute/unmute, call buttons).
8. **Browser E2E of the login flow** (sidelined): confirm the deployed frontend
   sends `{phone, password}` to `/kids/parent/login` (not `pin`), and AppSwitcher
   core ⇄ kids needs no re-login.
9. **Flagship row completeness**: verify SCH-ELITE has `kids_stand_alone=1`, a
   `school_locations` row, and the `admin@elitekids.ng` admin (seeder creates at
   boot — one confirmation pass). Optionally migrate SCH-KIDS global lessons to
   SCH-ELITE so the legacy school can retire.
10. **Delete stale duplicate test files**
    `backend/src/controllers/e4-webrtc-signaling.test.js` +
    `e6-boss-battles.test.js` (jest ignores them; canonical copies in `test/`).

## 📌 Known loose ends

- **VPS git stash**: a pre-existing local edit to `flagshipKidsSeed.js` on the
  live server sits in `git stash` (`live-local-*`) after a conflict during an
  early auto-deploy — merge or drop it deliberately.
- **MVP→prod DB swap** (elite_db_test → elite_db / elite_kids / elite_content)
  is planned in `MVP-TO-PROD-DB-SWAP.md` — not yet executed.
- **Pricing is DB-configurable** (`kids_subscription_plans` rows); NGN 500/1200
  are seeds, change via UPDATE — no deploy needed.
