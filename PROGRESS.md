# PROGRESS — Living Project State

**Single source of truth for "where are we." Read fully before doing anything; update
before ending every session.**

## Current status

- **Sprint in progress:** 1 — Core services (media pipeline FULLY live: Redis + both workers
  running; frontend shell + login branding done)
- **Last completed task:** The whole media module is implemented, tested and live. B2 client +
  BullMQ queues (media + generation) with 42 new tests + a generation.worker regression
  (suite 124/124 in-band); Redis 8.10 installed (brew — openssl@3 built from source, ~20 min,
  no bottle on macOS 13/x86_64) and running on :6379; media-worker + generation-worker in
  screens. Fixed 3 real bugs: graceful queue degradation hung on dead Redis (retryStrategy),
  generation worker consumed the WRONG queue (QUEUE_NAME imported from media.queue.js), and a
  test-suite hang from a leaked Redis connection in the Jest process (teardown closers).
  Frontend: app shell (index.html/main.tsx/router/AuthGuard/Dashboard/Tailwind v4) renders at
  :34601; Login now fetches school crest/name from a typed short name (onBlur, resolves real
  school_id). See session log for details.
- **Last updated:** 2026-08-17
- **Updated by:** Buffy (Sprint 1 — media module + Redis/workers + frontend shell)

## Next up (do this first)

- [ ] Sprint 1, remaining: verify a REAL B2-mode upload end to end (upload to :34600 → queued
      on kids-media-processing → media-worker sharp-processes → object lands in the
      elite-kids-* B2 bucket → served via GET /media/<key>). All the moving parts (Redis,
      workers, B2 config) are up now.

## Active blockers

_(none currently — update whenever a task is stuck; see 01-PLANNING/04-AI-AGENT-ORCHESTRATION-GUIDE.md "When stuck")_

## Environment/setup state

- [x] `backend/.env` created from `.env.example` and filled (JWT_SECRET_KEY = prod shared secret)
- [x] `frontend/.env` created with `VITE_API_URL=http://localhost:34600`
- [ ] B2 application key rotated (old one exposed in chat — see README)
- [x] MySQL (main DB + elite_content + AI DB elite_bot) reachable — verified via tunnel
- [x] Redis 8.10 running on :6379 (screen `kids-redis`) — media + generation queues live
- [ ] CI pipeline configured (optional for Sprint 0)

## Deviations from original design

Full log in `01-PLANNING/09-DECISIONS-LOG.md`. Summary:

- DEC-001 — addon architecture (shared JWT + shared school DB; addon tables in elite_content/elite_ai)
- DEC-002 — B2 buckets renamed `elite-kids-*`

## Session log

_(append one short entry per work session — do not delete old entries, this is the audit trail)_

```
2026-08-17 — Package generated: EliteKids.zip plan studied, ecosystem (elite-cbt /
  elite-cbt-api / elite-core / elite-api) studied, all planning docs adjusted for the
  EliteCore addon architecture, backend/frontend skeletons + game-engine schemas +
  infra added. No runnable code written yet.

2026-08-17 — Prod wiring + confirmations: backend/.env wired to real DBs (elite_db /
  elite_content / elite_bot via SSH tunnel), dry-run migration verified (no changes
  applied), AI DB confirmed elite_bot (no elite_ai) and JWT_SECRET_KEY confirmed
  shared; .env.example + DEC-002 updated. Smoke boot + shared-JWT verify-token ok.

2026-08-17 — Sprint 1 (auth + school port): extracted testable src/app.js; ported
  /users/login (parents + multi-school selection), /students/login, /superadmin-login,
  /verify-token, forgot/reset password, /auth/select-school, /schools/get-details,
  /schools/check-shortname. Added Jest/Supertest integration suite against hermetic
  local elite_kids_test DB (fixtures + global setup + teardown). 37/37 green after
  fixing: escaped-backtick syntax in test-db.js, multi-school detection (login must
  not be school-scoped), fixture restore after password reset, phase claim dropped by
  generateLoginToken (now mirrors elite-cbt-api). Read-only smoke boot vs prod:
  school lookups (BHA, SCH/1) + verify-token round trip for real admin 712 all ok.

2026-08-17 — Sprint 1 (children CRUD): added GET one (with progress summary), PUT
  update (owner/staff; staff-only re-link), DELETE soft delete (staff), and POST
  /kids/children/link parent self-service linking — ownership verified against the
  shared students row (parent_id/guardian_id/phone/email), never client-side. Test
  DB now rebuilds from scratch each run (DROP DATABASE, so schema changes never
  linger) with kids_children/kids_progress tables + parent/ownership fixtures.   Suite grew to 60/60. Updated API contract + frontend endpoints (DELETE, LINK).

2026-08-17 — Kids routes tests + persistent boot: added Jest/Supertest coverage for
  POST /kids/lessons, GET /kids/lessons/:id/game (published gate), progress
  (game-complete idempotency + child summary + student data-scoping 403), and
  approvals (pending queue, school scoping, decide approve/reject state flips).
  Fixed the approve test to use a game_config approval (APPR-3) so the flip
  publishes config + lesson; re-pointed the already-decided test at the consumed
  approval. Suite now 80/80, Jest exits cleanly. Booting persistent: nohup+disown
  does not survive here — used screen sessions (kids-api on :34600 read-only with
  KIDS_SKIP_DB_SYNC=1; kids-tunnel for the SSH tunnel) after the tunnel kept dying.
  Verified live vs prod: /health, get-details (DKG by short_name + SCH/23 by id),
  check-shortname, bogus-login 404.

2026-08-17 — Media module finished (B2 client + BullMQ queue, written earlier today,
  had NO tests): added test/media/*.test.js — image-processor (resize/re-encode/
  thumbnail), b2 (bucket routing, config gate, StorageError mapping, list
  pagination via mocked SDK), media.queue (inline vs tmp-staged enqueue,
  getJobStatus state mapping via mocked bullmq/ioredis), media.service (local-mode
  store/list/remove + validation), media-pipeline (image+thumb, doc passthrough,
  missing-bytes error), media routes (auth 401 / parent 403 / full upload→serve→
  list→delete / bad mime 400 / bad key 400). setup-env.js now blanks B2_* + sets
  REDIS_MAX_RETRIES=0 so tests are hermetic (dotenv in src/models would otherwise
  load real B2/Redis values). Fixed a real bug in media.queue.js: with a dead
  Redis, BullMQ add() queued commands forever (maxRetriesPerRequest:null) so the
  "graceful degradation" fallback never fired and kids-routes create-lesson test
  hung 30s + leaked ioredis reconnect timers; added an env-bounded retryStrategy
  (REDIS_MAX_RETRIES, unset in prod = today's infinite backoff) so commands reject
  and callers fall back inline. Suite now 122/122 (npx jest --runInBand). NOTE:
  `npm test` in default PARALLEL mode still shows 6 pre-existing failures
  (approvals + children tests race on the shared elite_kids_test DB — reproduced
  with only the original 4 files; run the suite in-band). Smoke: local-mode
  upload→serve (byte-identical)→list→delete round trip verified against a scratch
  server (:34602), auth gates 401/404 correct; Redis is DOWN locally so the B2
  queue path still needs a live Redis + worker to verify end to end. Frontend
  .env created (VITE_API_URL=http://localhost:34600); vite dev server up on :34601.

2026-08-17 — Frontend app shell scaffolded: index.html, src/vite-env.d.ts,
  src/index.css (Tailwind v4), src/main.tsx (BrowserRouter + Toaster), App.tsx
  router (/login, guarded /dashboard, redirects), AuthGuard (token → /login),
  Dashboard placeholder (brand header, live /health indicator, role-aware nav
  cards, logout), public/logo.svg. Swapped Login.tsx off react-icons (was a
  phantom dep — NOT in package.json) onto lucide-react (already a dep);
  installed @tailwindcss/vite (Tailwind v4 + Vite) and wired into vite.config.
  npm run build (tsc + vite) green; headless-Chrome render verified at :34601:
  /login paints the full page, / redirects via AuthGuard to login. Frontend
  was an empty skeleton before this — no entry point at all.

2026-08-17 — Redis + workers live: installed redis via brew (homebrew, macOS 13 x86_64 — no
  bottle, openssl@3 built from source, ~20 min; brew's bundled redis.conf references a missing
  redisbloom module so redis runs with bare flags --port 6379 --save "" --appendonly no).
  Started media-worker + generation-worker in screens. Found + fixed: generation.worker.js
  imported QUEUE_NAME from media.queue.js (listened on kids-media-processing; generation jobs
  went to kids-content-generation) — switched to generation.queue.js, added
  test/media/generation.worker.test.js regression (suite now 124/124 in-band). With Redis up,
  the Jest process opened a real Redis connection during enqueue (kids-routes create-lesson)
  that never closed, hanging the suite — added closeRedis() (media.queue.js) +
  closeGenerationQueue() (generation.queue.js) and wired both into test/helpers/teardown.js.
  Verified: redis-cli PONG; both bull:* queues registered; generation worker consumed the
  test-enqueued job and failed it correctly (Lesson not found — test DB only).

2026-08-17 — Login branding fix: on localhost (no subdomain), typing a school short name did
  NOT fetch the school logo/name — the auto-detect effect only ran for subdomains. Extracted
  loadSchool() (public GET /schools/get-details), reused by the subdomain effect, and wired it
  to the short-name input's onBlur (clears stale branding on change). Bonus: the field now
  resolves to the real school_id (SCH/23 for DKG), so login sends the correct id on manual
  entry. Verified with a real-browser CDP test (headless Chrome + Input.dispatchKeyEvent):
  typed DKG + Tab → "Welcome to DR. KABIRU GWARZO ACADEMY & TAHFEEZ" + cloudinary badge
  shown; typed BHA → badge shown + Kids-module gate correctly blocked (BHA kids_stand_alone=0).
```
