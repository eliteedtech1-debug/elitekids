# DB-drop guard scan — 2026-09-07

## What this doc covers

Every place in the elite-kids tree that can DROP / TRUNCATE / DELETE data, and
what guard already exists vs what still needs hardening.

## Audit scope: remaining scripts not covered by db-drop-guard

### What this audit checked
- Every `backend/` source file (TypeScript/JS), excluding `node_modules`, VCS,
  test files (`*.test.js/ts`), and logs.
- Keywords scanned: `TRUNCATE`, `DROP DATABASE`, `DROP TABLE`, `.drop(`, `.truncate(`.
- Also scanned `backend/**/*.sh` and `scripts/` for DB-name drift.

### Result — no additional unguarded DROP/TRUNCATE/DELETE paths found

#### 1. App runtime (`backend/src/**`)
- **No `DROP DATABASE`, `TRUNCATE TABLE`, `.drop()`, or `.truncate()` anywhere in `src/`.**
- `DELETE` statements present are all scoped to `kids_*` content tables (e.g.
  `kids_push_subscriptions`, `kids_mode_locks`, `kids_tournament_games`,
  `kids_boss_raid_games`, `kids_teacher_*`), executed against the content DB
  through normal route/controller flows. None target `elite_db` / `elite_content`
  shared tables.
- Confirmed against both `backend/src/**/*.js` and `backend/src/**/*.ts`.

#### 2. Operational scripts
- `backend/migrate-isolate.sh` — every `DROP TABLE` is wrapped in
  `assert_database_name` (guard active). `DROP FOREIGN KEY` statements are ALTER
  operations, not DROP TABLE / DROP DATABASE; not applicable to this guard.
- `backend/scripts/seed-animals-series.js` — every `DELETE FROM kids_*` runs
  through `db-drop-guard.assertDestructiveTarget(...)` before execution.
- `backend/database/migrate.js` — dry-run by default; `--apply` path does DDL
  (ALTER/CREATE), not DROP/TRUNCATE of prod data tables. Not applicable.

#### 3. Shell helpers
- `backend/lib/assert-database-name.sh` — shells out to `db-drop-guard.js`,
  not a separate decision path.

### 4. What is still guarded but worth re-review
- `backend/test/helpers/test-db.js` and `backend/test/test-db.js` perform
  `DROP DATABASE IF EXISTS` + `TRUNCATE TABLE` against `_test` DBs every test
  run. These are already guarded by `_test`-suffix assertions and prod-name
  denylists, but they are the highest-risk surface because they run against
  env-resolved DB names on every gate invocation.
- `scripts/run-tests.sh` — references DROP/TRUNCATE in comments only; the
  actual dangerous calls are inside the test helpers above.

### 5. Out of scope (documented for completeness)
- `backend/test/**/*.test.js` — test teardown/setup uses TRUNCATE/DELETE,
  guarded by test helpers (covered in §4).
- Frontend `DELETE` endpoints are HTTP verbs, not DB-level destructive ops.

## Audit conclusion + follow-up actions

### Chronology note
- This audit was run as a follow-up to the 2026-09-07 guard hardening + restore
  work. Earlier scan notes (drop-guard-fix-2026-09-06, subjects-db-guard-restore-2026-09-07)
  cover the incident timeline and the restore of `elite_db_test.subjects`.

### Conclusion
- After wiring `migrate-isolate.sh` and `seed-animals-series.js` through
  `db-drop-guard.js`, there are **no remaining backend scripts that can DROP/
  TRUNCATE/DELETE against a prod DB name without going through the guard first.**
- The only surface still doing DROP/TRUNCATE is the test harness, and that is
  confined to `_test` DBs with an explicit prod-name denylist.

### Recommended review cadence
- Re-run this scan whenever a new operational script is added to `backend/` (not
  `backend/test/`). The scan is cheap: a single ripgrep pass for
  `TRUNCATE|DROP\s+(DATABASE|TABLE)|\.drop\(|\.truncate\(` over non-test JS/TS.
- If a new script legitimately needs to touch prod data (e.g. a one-off DELETE),
  route it through `assertDestructiveTarget(...)` with an explicit
  `allowedDatabases` entry and document the reason in this file.
