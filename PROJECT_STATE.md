# Project State — Single Source of Truth

**Read this file fully before doing anything, every session.** It answers: where did we
stop, and what do we do next.

Last updated: 2026-08-17 (session 7 — docs consolidated to full current status)
Updated by: Buffy (initial package generation + real-DB wiring + Sprint 1 tests + media module + workers + frontend)

## Current status

- **Phase/Sprint:** 1 — Core services (media module implemented + tested, Redis + workers live, frontend shell up)
- **Last completed task:** Media pipeline is FULLY live. The B2 client + BullMQ
  media/generation queues (written earlier today with zero tests) are now
  implemented AND tested: 42 new tests across `test/media/*`
  (image-processor, b2, media.queue, media.service, media-pipeline, media
  routes) plus a generation.worker regression test — suite **124/124**
  (`npx jest --runInBand`). Redis 8.10 installed (brew) + running on :6379;
  media-worker and generation-worker running in screens. Three real bugs found
  and fixed along the way: (1) media.queue.js graceful degradation hung forever
  on a dead Redis (BullMQ `add()` queued commands with `maxRetriesPerRequest:
  null`) — added env-bounded `retryStrategy` (`REDIS_MAX_RETRIES`; unset in
  prod = previous behavior); (2) generation.worker.js consumed the WRONG queue
  (imported QUEUE_NAME from media.queue.js, listening on kids-media-processing
  while jobs went to kids-content-generation) — fixed + regression test;
  (3) test-suite hang once Redis was up (real Redis connection leaked in the
  Jest process) — added closeRedis()/closeGenerationQueue() into teardown.
  Also landed: frontend app shell (index.html, main.tsx, router, AuthGuard,
  Dashboard, Tailwind v4) rendering at :34601, and the Login short-name
  branding fetch (onBlur → /schools/get-details, resolves real school_id).
- **Server is running (screens):** elite-kids-api on `127.0.0.1:34600`
  (`kids-api`, read-only KIDS_SKIP_DB_SYNC=1); prod tunnel `kids-tunnel`;
  Redis on :6379 `kids-redis`; `kids-media-worker` + `kids-generation-worker`;
  frontend vite dev on :34601 `kids-web`. All verified live (/health, school
  lookups, upload auth gates 401/404, headless-Chrome render + login branding
  round trip). Stop individually with `screen -S <name> -X quit`.
- **Next task to start:** Sprint 1, remaining — verify a REAL B2-mode upload
  end to end: upload to :34600 → job on kids-media-processing → media-worker
  sharp-processes → object lands in the elite-kids-* B2 bucket → served back
  via GET /media/<key>. Everything it needs (Redis, workers, B2 config) is
  running now.

## In-progress work

Sprint 1 completed so far:
- [x] Auth routes ported (`/users/login` incl. parents + multi-school selection,
      `/students/login`, `/superadmin-login`, `/verify-token`, forgot/reset password,
      `/auth/select-school`) — `src/app.js` split out for testability
- [x] School lookup + tenancy (`/schools/get-details`, `/schools/check-shortname`,
      flagship alias resolution)
- [x] `kids_children` CRUD + parent↔child linking:
      - GET list (parent → own; staff → school), GET one + progress summary
      - POST create (validates against shared `students`), PUT update (owner/staff,
        staff-only re-link), DELETE soft delete (staff)
      - POST `/kids/children/link` — parent self-service link with ownership checks
        against the shared `students` row (parent_id/guardian_id/phone/email)
      - Covered by Jest suite (children.test.js, 23 tests) — suite total 60/60
- [x] Lesson Service CRUD API (`kids_lessons`) — create + published-game gate
      implemented and covered (POST /kids/lessons, GET /kids/lessons/:id/game)
- [x] Progress + approval routes covered (POST /kids/progress/game-complete
      idempotent, GET /kids/progress/child/:admissionNo, GET /kids/approvals,
      POST /kids/approvals/:id/decide flips config + lesson to published)
- [x] B2 client module + BullMQ media queue (`src/storage/b2.js` + `src/media/*`,
      env-driven, wired into `routes/media.js`) — 42 new tests (suite 124/124
      in-band), local-mode smoke round trip verified, Redis + both workers
      running. Remaining: verify a B2-mode upload end to end (queued → worker
      → B2 bucket → served back).

## Environment/setup state

- [x] `backend/.env` created and populated with REAL prod values
  (`DB_NAME=elite_db`, `CONTENT_DB_NAME=elite_content`, `AI_DB_NAME=elite_bot` —
  no `elite_ai` on this server, see DEC-002; `JWT_SECRET_KEY` = prod shared secret,
  verified identical to elite-api). Access via SSH tunnel
  `ssh -i ~/.ssh/hostinger_bits -L 33061:127.0.0.1:3306 -N dev@62.72.0.209`
  (MySQL grants `elite` only on localhost). File is gitignored + chmod 600.
- [x] `frontend/.env` created with `VITE_API_URL=http://localhost:34600` (copied
      from .env.example; VITE_APP_DOMAIN=elitekids.com.ng)
- [ ] B2 application key rotated (old one exposed in chat — see README)
- [x] MySQL reachable (elite_db, elite_content, elite_bot via tunnel)
- [x] `node backend/database/migrate.js` dry-run reviewed — clean, no changes applied
      (2 additive school_setup columns + 9 kids_* tables in elite_content + 1 in elite_bot)
- [x] `node backend/database/migrate.js --apply` run: `school_setup` gained
      `kids_stand_alone` (default 0, backfilled → 6 schools = 1) + `kids_url`;
      9 kids tables created in `elite_content`; `kids_content_generation_audit`
      created in `elite_bot`. Backup of `school_setup` in
      `logs/kids-migration-backups/2026-08-17T14-40-13-923Z/`.
- [x] Smoke boot verified: `/health` ok; `/users/login` 401 on bad creds;
      `/students/login` rejects unknown admission_no; `/verify-token` accepts a
      prod-secret JWT for real admin id 712 (shared-JWT round trip works)
- [x] Jest/Supertest integration suite green: 37/37 (`npm test` in `backend/`)
      against local `elite_kids_test` DB (auth + school routes; multi-school
      selection; forgot/reset password OTP round trip; wrong-phase/garbage tokens)
- [x] Read-only smoke against prod: `/schools/get-details` resolves BEACON HILL
      ACADEMY (BHA) + ABC ACADEMY (SCH/1); `check-shortname` works; verify-token
      with prod-shared-secret JWT returns the full ABC ACADEMY admin session
- [x] Kids-routes Jest suite green: 80/80 (`npx jest --runInBand` in `backend/`)
- [x] Server booted persistently in screen (`kids-api` on :34600, read-only) with
      the prod tunnel in its own screen (`kids-tunnel`); live checks pass
      (`/health`, `get-details?query_type=select-by-short-name&short_name=DKG`,
      `check-shortname`, bogus-login 404); restarted to pick up the media routes
      (`/media/upload` 401-gated, `/media/<key>` 400/404 handling verified live)
- [x] Media routes live on :34600 (restarted the kids-api screen after the media
      module was written); full HTTP round trip smoke-tested in local mode on a
      scratch :34602 instance
- [x] Redis 8.10.0 running on :6379 (screen `kids-redis`; brew install, built
      openssl@3 from source — no bottle on macOS 13/x86_64; brew's etc/redis.conf
      aborts on a missing redisbloom module, so started with bare
      `--port 6379 --save "" --appendonly no`)
- [x] media-worker (screen `kids-media-worker`) + generation-worker (screen
      `kids-generation-worker`) running against the live Redis
- [x] BUG FIXED (found while starting workers): generation.worker.js imported
      QUEUE_NAME from media.queue.js → listened on kids-media-processing while
      jobs were enqueued to kids-content-generation → generation would NEVER
      run. Fixed import + added regression test (test/media/generation.worker.test.js)
- [x] Test-suite hang fixed (Redis-up exposed it): enqueue path opened a real
      Redis connection in the Jest process that never closed → added
      closeRedis()/closeGenerationQueue() wired into test/helpers/teardown.js
- [ ] **Next:** verify a REAL B2-mode upload end to end (upload → queue → worker
      → B2 bucket → served back)
- [x] Frontend app shell: `index.html`, `main.tsx` (BrowserRouter + Toaster),
      `App.tsx` router (/login, guarded /dashboard, redirects), `AuthGuard`,
      Dashboard placeholder (health indicator + role-aware nav), Tailwind v4 via
      `@tailwindcss/vite`, Login switched to lucide-react (react-icons was not in
      deps). `npm run build` green; headless-Chrome render verified — the SPA
      actually paints at :34601
- [x] Login branding fix: short-name entry (localhost) now fetches school
      crest/name via onBlur → GET /schools/get-details (public), resolving the
      real school_id; subdomain auto-detect refactored onto the same loadSchool().
      Real-browser CDP test: DKG → "Welcome to DR. KABIRU GWARZO ACADEMY" +
      cloudinary badge; BHA → badge + Kids-module gate correctly blocks

## Known deviations from original design

See `01-PLANNING/09-DECISIONS-LOG.md` for the full record. Quick-glance:

1. **DEC-001 — Addon architecture**: the standalone backend/frontend/DB from the
   original plan is replaced by the elite-cbt addon pattern (shared JWT, shared
   school DB, addon tables in `elite_content` / `elite_ai`).
2. **DEC-002 — B2 buckets**: `elite-kids-*` buckets, reusing the existing media-service
   pattern (see 02-ELITE-INTEGRATION/02).

## Open blockers

None.

## How to resume (agent instructions)

1. Read this file fully.
2. Read `01-PLANNING/09-DECISIONS-LOG.md` — where the plan changed, it wins.
3. Read `02-ELITE-INTEGRATION/*` before touching any auth/DB/deploy code.
4. Read `01-PLANNING/03-EXECUTION-ROADMAP.md`, find the first unchecked box.
5. Resume there. Do not re-do completed tasks.
6. At the end of the session, update this file (current status, in-progress work,
   new deviations, new blockers). This is not optional.
