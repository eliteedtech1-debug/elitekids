# DB-GUARD FIX — destructive deploy-gate query on `elite_db` (2026-09-06)

**Status:** FIXED + VERIFIED
**Trigger:** User report — "API running dangerous db destructive async force query that often deletes many tables in the main db elite_db". User confirmed: **the deploy is what caused it.**

---

## 1. Root cause — the kill chain (all verified in code)

1. `.github/workflows/deploy.yml` → every push to `main` runs `scripts/run-tests.sh --forceExit` **on the live VPS** (`/var/www/html/elite/elite-kids/backend`).
2. `scripts/run-tests.sh` greps **PROD credentials** (`DB_USERNAME`/`DB_PASSWORD`) out of `backend/.env` and exports them as `TEST_DB_USER`/`TEST_DB_PASSWORD` (needed so the gate can create/drop throwaway DBs).
3. Jest `globalSetup` → `backend/test/global-setup.js` → `ensureTestDb()` in `backend/test/helpers/test-db.js`, which runs:
   - `DROP DATABASE IF EXISTS` for `TEST_DB` **and** `TEST_CONTENT_DB`
   - `CREATE DATABASE` + DDL + **`TRUNCATE TABLE` on 34 tables** — including shared tables `users`, `parents`, `students`, `school_setup`, `password_reset_tokens` (the exact `elite_db` tables).
4. The DB name was resolved with **zero protection**:
   `TEST_DB = TEST_SHARED_DB_NAME || (TEST_DB_NAME !== 'elite_kids_test' ? TEST_DB_NAME : undefined) || 'elite_db_test'`
   → any stray `TEST_DB_NAME=elite_db` / `TEST_SHARED_DB_NAME=elite_db` line in `.env`, `.env.test`, or the calling shell made **every deploy drop `elite_db` with real prod credentials**.

## 2. Culprits found

| # | File | Problem | Severity |
|---|------|---------|----------|
| C1 | `backend/test/helpers/test-db.js` | `DROP DATABASE` + `TRUNCATE` with unguarded env-resolved DB name; prod creds mapped by gate runner | CRITICAL |
| C2 | `backend/src/controllers/test-db.js` | Shim re-exporting the test helper **from the production source tree** (`require('../../test/helpers/test-db')`) | HIGH (landmine) |
| C3 | `backend/test-db.js` (root) | Same shim at backend root | HIGH (landmine) |
| C4 | `backend/test/test-db.js` (legacy dup) | `TEST_DB = TEST_DB_NAME || 'elite_kids_test'` + same `DROP`/`TRUNCATE`, no guard | HIGH |
| C5 | `backend/test/setup-env.js` | Same unguarded fallback chain sets `DB_NAME` etc. for the app-under-test | MEDIUM |
| C6 | `scripts/run-tests.sh` | Maps prod creds onto test creds without any DB-name sanity check | MEDIUM |

**Checked and cleared:**
- `backend/database/migrate.js` — dry-run default, additive-only, guard tables, mysqldump backups. Safe.
- `backend/src/index.js` boot — additive `ADD COLUMN` reconciles + `syncKidsTables()` uses `model.sync({ force: false })` (create-if-missing, never alters). Shared models never synced. Safe.
- `backend/src/**` — no `DROP`/`TRUNCATE`/`force: true`/`alter: true` anywhere in runtime code.
- `backend/src/controllers/kidsSubscription.js` `ALTER ... MODIFY status ENUM(...)` — content DB only, additive enum widen. OK.
- `backend/scripts/seed-animals-series.js` — scoped `DELETE FROM kids_*` (content DB) for a manual reseed. Not elite_db; left as-is, noted.
- Seeder IIFEs (`animalsNumbersExpansionSeed`, `jollyPhonicsSeriesSeed`, `moneyTimeBridgeSeed`) — upsert-only, dormant unless run directly. Safe.

## 3. Fixes applied (defense in depth — 4 layers)

1. **`backend/test/helpers/test-db.js`** — `assertSafeTestDbName()`: names MUST end in `_test` and never be `elite_db|elite_content|elite_bot|elite_kids|elite_ai`. Asserted at module load AND re-asserted inside `ensureTestDb()` immediately before any `DROP`.
2. **`backend/test/test-db.js`** (legacy) — same guard at module load.
3. **`backend/test/setup-env.js`** — same guard over `DB_NAME`/`CONTENT_DB_NAME`/`AI_DB_NAME`/`KIDS_DB_NAME` before the app-under-test connects.
4. **`scripts/run-tests.sh`** — preflight loop rejects any `TEST_*_NAME` var (from `.env` **or** exported env) not ending in `_test`; exits 2 with a FATAL banner before Jest starts.
5. **Deleted** `backend/src/controllers/test-db.js` and `backend/test-db.js` (zero requires repo-wide — verified by search).

## 4. Verification evidence

- `bash -n scripts/run-tests.sh` + `node --check` on all 3 JS files → OK.
- Guard behavior (from `backend/`):
  - `TEST_DB_NAME=elite_db` require helper → `Error: [test-db] TEST_DB="elite_db" does not end in _test — refusing to DROP/TRUNCATE…` ✔
  - `TEST_SHARED_DB_NAME=elite_content` → throws ✔
  - `TEST_DB_NAME=elite_db` + setup-env → `[setup-env] DB_NAME="elite_db" is not a safe *_test database name…` ✔
  - legacy helper with `elite_db` → throws ✔
  - defaults → `elite_db_test` / `elite_content_test` ✔ ; legacy special-case `TEST_DB_NAME=elite_kids_test` → still resolves `elite_db_test` ✔
- `run-tests.sh` preflight (fixture files, then cleaned): bad `.env` line → rc=2 + FATAL; good fixture → rc=0; bad exported shell var → rc=2 ✔
- End-to-end: `bash scripts/run-tests.sh test/auth.test.js --forceExit` → **26/26 passed** through the guarded runner ✔

## 5. Residual recommendations (master decisions)

1. **Inspect VPS `backend/.env` / `~/.bashrc` / CI env for stray `TEST_DB_NAME` / `TEST_SHARED_DB_NAME` lines** (bash grep only, per protocol). If one pointed at `elite_db`, that was the direct trigger; the guards now abort instead of dropping.
2. Consider removing the prod-cred mapping in `run-tests.sh` (dedicated least-priv `elite_test` MySQL user) — kept for now so the deploy gate keeps working on the box.
3. `ensureSchemaMigrations()` in `src/index.js` does `ALTER TABLE school_setup ADD COLUMN` on the shared DB — additive, but contradicts the "shared DB never altered" doc comment; align docs or move to `database/migrate.js` only.
4. Audit-log retention: deploys that failed the gate after a partial drop would leave `elite_db` recreated-but-empty; check latest mysqldump/backup strategy for the shared DB.
5. `backend/scripts/seed-animals-series.js` deletes kids content rows by category — consider an `--yes` flag before it runs unattended.

## 6. Deploy note

No `git push` performed (protocol rule 4). Committing/pushing is the master's call; the next push to `main` will ship these guards and the gate will self-protect on the VPS.
