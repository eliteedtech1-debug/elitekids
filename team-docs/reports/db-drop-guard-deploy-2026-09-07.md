# DB-drop guard — deploy verification — 2026-09-07

## What was deployed
Commit `65ca68d` pushed to `origin/main` at 2026-09-07 ~17:07 UTC.
Self-hosted deploy workflow (`.github/workflows/deploy.yml`) fast-forwarded the
VPS checkout at `/var/www/html/elite/elite-kids` and restarted the backend.

## Files added
- `backend/lib/db-drop-guard.js` — shared guard (MD5 `602524784e615130e1cea9b9259e0698`)
- `backend/lib/assert-database-name.sh` — shell wrapper for bash scripts
- `team-docs/reports/db-drop-guard-scan-2026-09-07.md`
- `team-docs/reports/subjects-db-guard-restore-2026-09-07.md`

## Files modified
- `backend/migrate-isolate.sh` — every DROP TABLE wrapped in `assert_database_name`
- `backend/scripts/seed-animals-series.js` — DELETE pre-checked via `assertDestructiveTarget`

## VPS verification (all passed)
- Git head on VPS: `65ca68db775dd77efdf40959be1b9c9f720af46b` (matches local) ✓
- `backend/lib/db-drop-guard.js` present on VPS, MD5 matches local ✓
- `backend/lib/assert-database-name.sh` present on VPS ✓
- `migrate-isolate.sh` has 6 `assert_database_name` calls ✓
- `seed-animals-series.js` has 1 `assertDestructiveTarget` call ✓
- Guard module loads on VPS: `isProdDb('elite_db')=true`, `isTestDb('elite_db_test')=true` ✓
- Guard rejects `elite_db` DROP DATABASE on VPS ✓
- Running API process: PID 1919682, `/usr/bin/node src/index.js`, cwd =
  `/var/www/html/elite/elite-kids/backend`, started 2026-09-07 17:09 ✓
- Port 8484 listening, responds 200 on `/` ✓
- `elite_db.subjects`: 4,871 rows, intact ✓
- `elite_db_test.subjects`: 4,871 rows, identical copy (created 2026-09-07 10:32) ✓

## Incident context
- `elite_db_test.subjects` was missing earlier; restored from `elite_db` before
  this session (table created 2026-09-07 10:32:50, identical 4871 rows).
- Root cause of the original deletion: a process that mistakenly treated
  `elite_db` as a throwaway test DB. The deploy gate + test harness were
  already individually guarded (2026-09-06 fix); this session adds a single
  shared guard (`db-drop-guard.js`) covering the two remaining unguarded
  operational scripts (`migrate-isolate.sh`, `seed-animals-series.js`).
