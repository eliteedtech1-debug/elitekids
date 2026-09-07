# subjects-db-guard-restore — 2026-09-07

## Confession (what we know on disk)

- Live app `.env` points at `DB_NAME=elite_db`. Normal app boot does **not** DROP/TRUNCATE/DELETE `subjects` anywhere in `backend/src`.
- `backend/src/controllers/auth.js` reads `subjects` at verify-token time:
  - `SELECT * FROM subjects WHERE school_id = :school_id AND branch_id = :branch_id AND (status IS NULL OR LOWER(status) = 'active')`
- The only code that drops/truncates `subjects` is in the **test harness / deploy gate**:
  - `scripts/run-tests.sh` maps `DB_USERNAME/DB_PASSWORD` → `TEST_DB_USER/TEST_DB_PASSWORD` and runs Jest.
  - `backend/test/helpers/test-db.js` + `backend/test/test-db.js` DROP DATABASE / TRUNCATE throwaway `_test` DBs on every run.
- If any process points a `_test` slot (e.g. `TEST_DB_NAME`, `DB_NAME` under test env) at `elite_db` instead of `elite_db_test`, that path can drop/truncate `elite_db` **and its `subjects` table**. That is the deletion risk behind the `elite_db_test.subjects missing` confession.

## Immediate goals

- **(a) Restore** `elite_db_test.subjects` from `elite_db.subjects` (safe copy, not a full DB swap).
- **(b) Harden** deploy gate + test harness so no `_test` slot can ever point at `elite_db`.

## Status

- Not started on the VPS yet. Next action is to run the restore + guard on the live VPS via `~/bits/connect.sh` into `/var/www/html/elite/elite-kids`.
