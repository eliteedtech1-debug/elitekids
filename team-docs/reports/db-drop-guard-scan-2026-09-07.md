# DB-drop guard scan — 2026-09-07

## What this doc covers

Every place in the elite-kids tree that can DROP / TRUNCATE / DELETE data, and
what guard already exists vs what still needs hardening.

## Verified on disk (this repo)

### 1. App boot — safe by construction
- `backend/src/index.js` → `syncKidsTables()` only, `force: false`.
- `backend/src/models/index.js` → Sequelize binds shared tables to `DB_NAME`
  and never syncs them.

### 2. Test harness — DROP/TRUNCATE against `_test` DBs only (already guarded)
- `backend/test/helpers/test-db.js` — guards `TEST_DB` and `TEST_KIDS_DB`.
- `backend/test/test-db.js` — guards `TEST_DB`.
- `backend/test/setup-env.js` — overrides all DB names to `_test` + guards them.
- `scripts/run-tests.sh` — refuses non-`_test` test DB names before running.

### 3. Operational scripts — NOT guarded (until integrated)
- `backend/migrate-isolate.sh` — drops/truncates tables in `elite_content`
  (`elite_content.$tbl`), with no DB-name guard.
- `backend/scripts/seed-animals-series.js` — DELETEs `kids_*` rows by
  category/subject. Runs against whatever `DB_NAME/CONTENT_DB_NAME` env points at.
- `backend/database/migrate.js` — dry-run by default; `--apply` backs up and
  alters, but does not self-guard against wrong env.

## New shared guard

- `backend/lib/db-drop-guard.js` — shared production-safety guard that refuses
  DROP DATABASE / TRUNCATE on any prod DB name, and refuses DELETE/DROP/TRUNCATE
  on non-test DBs unless the caller explicitly opts in via `options.allowedDatabases`.

## Integration status

### Wired in
- `backend/migrate-isolate.sh` — routes every `DROP TABLE` / `DROP DATABASE` through
  `db-drop-guard` (shell wrapper `backend/lib/assert-database-name.sh`). Aborts if the
  target is a prod DB name or anything that does not end in `_test`.
- `backend/scripts/seed-animals-series.js` — `DELETE FROM kids_*` statements are
  pre-checked via `db-drop-guard.assertDestructiveTarget({ database: DB_NAME, operation: 'DELETE', allowedDatabases: [...] })`.
  Refuses to run if `DB_NAME` is a prod DB and the operation is not explicitly allowed.

### Still the single source of truth (shared module)
- `backend/lib/db-drop-guard.js` — the shared guard. Both operational scripts and the
  test helpers should route through it so there is one rule set, not four inline copies.
