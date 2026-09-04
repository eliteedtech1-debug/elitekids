# NEXT STEPS — EliteKids (handoff, updated 2026-09-04)

Pickup notes for whoever continues EliteKids work. Everything below was either
verified live or is a known gap with a concrete fix. Companion docs:
`FLAGSHIP-ELITE-SCHOOL-SPEC.md`, `EXECUTION-PLAN-ELITE-SCHOOL.md`,
`MVP-TO-PROD-DB-SWAP.md`, `SESSION-PLAYBOOK.md`.

> **🆕 2026-09-04 status:** Q2 workstream (queue Q24–Q29: speech/drawing/portfolio FE,
> i18n chunking, never-empty UX) is COMPLETE and live on main (`c74d9ae`+). Mailer
> confirmed live (`backend/.env` SMTP creds). **Open:** Q30 HA review (emailed MASTER),
> Q31 mailer flow wiring. Full picture: `team-docs/reports/status-2026-09-04.md` —
> queue is the live board: `team-docs/QUEUE.md`.

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
  floor, calls. **Parent live-control UI is now complete** (ParentLive.tsx).
  Verified: `e5-parent-live.test.js` 6/6, `e4` 10/10.
- **Subscriptions + Paystack** (`kidsSubscription.js`): plans 500/term, 1200/
  annual (DB-configurable), school + flagship-parent flows, initiate/verify/
  webhook with HMAC, entitlement guard (`free_tier` for flagship parents, `none`
  for unsubscribed schools, `all_games` once paid). Same `PAYSTACK_SECRET_KEY`
  as EliteSMS. Verified: `subscription.test.js` 15/15.
- **Deploy gate**: elite-kids now deploys via its **own self-hosted runner**
  (`elitekids-runner` on VPS). Push to `main` triggers `deploy.yml` which runs
  on the VPS runner, fast-forwards the live checkout, rebuilds frontend, restarts
  backend. Concurrency group prevents parallel deploys. PAT stored as encrypted
  Actions secret (`ELITEKIDS_TOKEN`). Latest verified deploy: **c2f9d56**.
- **Security**: `requireChildOwnership()` guard applied to 20+ endpoints.
  3 parent→child linkage paths checked: `kids_parent_links` (phone), `kids_children`
  (ecosystem JWT), `students.parent_id → parents.parent_id` (EliteSMS link).
- **Infrastructure**: `loginctl enable-linger dev` + `elitekids-api` service
  enabled for boot survival. Frontend uses `npm ci` for deterministic builds.

---

## ✅ All items completed (2026-09-01)

1. **Register the elite-kids self-hosted runner** — DONE. `elitekids-runner`
   systemd user service, enabled, survives reboot with linger.
2. **Move PAT to Actions secret** — DONE. `ELITEKIDS_TOKEN` encrypted with
   NaCl SealedBox. Deploy uses `x-access-token` URL auth.
3. **Audit parent-scoped routes** — DONE. Found 6 vulnerabilities, fixed with
   `requireChildOwnership()` across `kidsParental.js`, `kidsGarden.js`,
   `kidsModeLock.js`, `kidsSession.js`, `kidsTracking.js`, `kidsRetry.js`.
4. **Enable linger + boot check** — DONE. `loginctl enable-linger dev` +
   service enabled.
5. **Deterministic deploys** — DONE. `npm ci` + concurrency group.
6. **Parent live-control UI** — DONE. `ParentLive.tsx` mirrors `TeacherLive.tsx`.
   "Live" tab added to `ParentChildren.tsx`.
7. **Flagship row completeness** — DONE. `kids_url` set, `admin@elitekids.ng`
   created.
8. **Delete stale test files** — DONE. Duplicates removed from `src/controllers/`.

---

## 📌 Known loose ends

- **VPS git stash**: a pre-existing local edit to `flagshipKidsSeed.js` on the
  live server sits in `git stash` (`live-local-*`) after a conflict during an
  early auto-deploy — merge or drop it deliberately.
- **MVP→prod DB swap** (elite_db_test → elite_db / elite_kids / elite_content)
  is planned in `MVP-TO-PROD-DB-SWAP.md` — not yet executed.
- **Pricing is DB-configurable** (`kids_subscription_plans` rows); NGN 500/1200
  are seeds, change via UPDATE — no deploy needed.
- **Browser E2E of the login flow** (sidelined): confirm the deployed frontend
  sends `{phone, password}` to `/kids/parent/login` (not `pin`), and AppSwitcher
  core ⇄ kids needs no re-login.
- **Cron caveat**: the `*/2` schedule on elite-sms rarely fires (GitHub
  schedule service). The self-hosted runner is now the dependable path.
