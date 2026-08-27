# E2 Brief — Offline Progress Reconciliation

Context: EliteKids kids education platform (React/Vite + Express/Sequelize + MySQL `elite_content`). Rural users silently lose progress: `frontend/src/pages/Student/GamePlay.tsx` (~line 2444) does `apiClient.post(...).catch(()=>{})`, dropping failed progress posts.
Execution: an autonomous agent works STEPS in order on the VPS; after every STEP append `[CHECKPOINT HH:MMZ] <done>` to `team-docs/reports/e2-progress.md`.

## STEPS

1. **STEP 1 — Read context.**
   Read `GamePlay.tsx` submitProgress area, `frontend/lib/offline/sync.ts`, `frontend/lib/offline/db.ts` (IndexedDB syncQueue), `frontend/src/components/OfflineBanner.tsx`, backend `recordGameComplete` in `controllers/kids.js`, and model `KidProgress.js` including unique key `uq_kids_progress_dedupe` (`child_admission_no, lesson_id, game_config_id, idempotency_key`) — all under `/var/www/html/elite-kids`.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E2 step1 offline stack + server progress path reviewed` to `team-docs/reports/e2-progress.md`.

2. **STEP 2 — Client fix.**
   Failed posts enqueue to the IndexedDB syncQueue via the existing `sync.ts` drainNow/batch path; capped exponential backoff retries; `OfflineBanner` shows pending/failed counts.
   Keep the old single-post behavior as fallback when the queue is unavailable.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E2 step2 client enqueue+backoff+banner implemented` to `team-docs/reports/e2-progress.md`.

3. **STEP 3 — Server fix.**
   New `POST /kids/sync/batch` endpoint: child-JWT auth identical to existing progress endpoints; per-item result `created|duplicate|error` preserving request order; dedupe via `uq_kids_progress_dedupe`; top-level response `{results:[...], failed:N}`. Fully backward compatible with existing single-post flow.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E2 step3 /kids/sync/batch endpoint implemented` to `team-docs/reports/e2-progress.md`.

4. **STEP 4 — Tests.**
   Jest cases: fresh batch (all created), replayed batch (all duplicate), partial failure mid-batch (order preserved), idempotency collision across children (no cross-child dedupe). Zero NEW failures vs the 4-known baseline (`reports/c-preexisting-failures.md`).
   `TEST_DB_USER`/`TEST_DB_PASSWORD` are injected via env from `backend/.env` — never printed or committed.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E2 step4 jest suite green vs baseline` to `team-docs/reports/e2-progress.md`.

## GATES
- Jest suite green vs baseline: exactly the 4 known pre-existing failures remain, zero new failures.
- Manual smoke documented in the report: go offline → submit progress → restore network → queue drains → exactly ONE row in `kids_progress`.
- Deliverable exists: final report written to `team-docs/reports/e2-report.md` (steps summary, evidence, gate results).

## RULES
- Work only under `/var/www/html/elite-kids`.
- Never print secrets or tokens (DB credentials, JWTs, `.env` values).
- No git commit/push unless this brief explicitly says so.
- Additive-only schema changes.
- If any gate fails twice, STOP and write the obstacle to `team-docs/reports/e2-obstacles.md`.
