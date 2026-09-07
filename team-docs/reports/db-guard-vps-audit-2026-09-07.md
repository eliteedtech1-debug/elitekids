# VPS ENV AUDIT — stray TEST_DB_NAME / destructive DB-name hunt (2026-09-07)

**Box:** srv601919 (62.72.0.209) — audited ON-box (this session runs as `dev` in the live checkout `/var/www/html/elite/elite-kids`).
**Method:** bash grep only (protocol rule 3); no secret values printed; read-only throughout.
**Companion report:** `db-guard-fix-2026-09-06.md` (code fixes).

## Verdict

**No stray `TEST_DB_NAME=elite_db` (or `TEST_SHARED_DB_NAME=elite_db`) exists anywhere on the box today.**
Every layer that could carry it was checked and is clean. The historical trigger line is gone; guards now make the whole class impossible (fail-closed).

## Checked surfaces (all clean unless noted)

| Surface | Path | Result |
|---|---|---|
| API runtime env (systemd `EnvironmentFile`) | `/var/www/html/elite/elite-kids/backend/.env` | `DB_NAME=elite_db`, `CONTENT_DB_NAME=elite_content`, `KIDS_DB_NAME=elite_kids` — **no TEST_* lines** ✔ |
| Test env file | `backend/.env.test` (line 50) | `TEST_DB_NAME=elite_kids_test` + `TEST_DB_HOST=127.0.0.1` — legacy value; special-case resolves it to `elite_db_test`. **Not** prod-pointing. Cosmetic cleanup recommended (see below) |
| Production template | `backend/.env.production` | No TEST_* lines ✔ |
| Shell profiles | `/home/dev/.bashrc`, `/home/dev/.profile`, `/etc/environment` | No TEST_DB/ELITE exports ✔ |
| systemd units (user + system) | `~/.config/systemd/user/*`, `/etc/systemd/{user,system}/*` | No TEST_DB vars ✔ (unit `elite-kids-api` uses only `EnvironmentFile=backend/.env`) |
| GitHub Actions runner daemon env | `/proc/<Runner.Listener/Worker pids>/environ` | No DB-name vars at all — gate inherits clean env; only `run-tests.sh` + `.env.test` shape it ✔ |
| Crontab | `dev` crontab | 1 job: nightly `elite-backup.sh` 02:00 — no TEST vars ✔ |
| Box-wide sweep | `/home/dev`, `/var/www/html/elite`, `/etc` (excl. node_modules/.git/dist/uploads) | **0 matches** for `TEST_(SHARED_)?DB_NAME=elite_db` ✔ |

## Backup health (restore path for any historical damage)

- `/home/dev/bin/elite-backup.sh`: nightly mysqldump (user `elite`, `--single-transaction --quick`) of `elite_db`, `elite_bot`, `elite_content`, `elite_kids`, `elite_logs`, `elitefees` → `/var/www/html/elite/backups/`, then pushes to GitHub (`ibagwai9/elite-dbs`).
- Latest run Sep 6 02:00 — **`elite_db.sql` = 97 MB present** ✔ (GitHub warns >50 MB; fine for restore use, LFS optional).
- Empty root-owned folder `archived-20260906/` exists (likely manual archive attempt — ask master).

## Forensics (when the drop logic existed)

- `git log -S 'DROP DATABASE' -- backend/test/` → enters at `bf7c769` ("feat: full EliteKids app…"), carried through `2e9830f`, `87d2643`. So gate runs have executed DROP/TRUNCATE against env-resolved names since the initial full-app sync — matching "often deletes many tables".
- The `TEST_DB_NAME === 'elite_kids_test'` special-case fossil landed in `ef9b7d7` ("Fix deploy-gate failures: split test DBs…") — proof that hand-tuned legacy env values circulated around the gate era. The exact historical smoking line is not on disk anymore.

## Fix status on the live tree (⚠️ time-sensitive)

- Guards exist as **uncommitted working-tree edits** in the live checkout (`assertSafeTestDbName` present; shims deleted).
- The deploy workflow does `git reset --hard origin/main` after stashing local edits — **an unpushed/uncommitted fix will NOT survive the next deploy's reset**.
- The running API is unaffected (edits touch only test files + `run-tests.sh`).
- **Action:** commit done this session (see git log). Push is required before the next deploy — push triggers the guarded auto-deploy.

## Recommended cleanups (non-urgent)

1. Remove `TEST_DB_NAME=elite_kids_test` from `backend/.env.test` (both checkouts) — it's neutralized today, but deleting it removes the last legacy name floating around.
2. Consider `git lfs` (or repo split) for the 97 MB `elite_db.sql` dumps on `elite-dbs`.
