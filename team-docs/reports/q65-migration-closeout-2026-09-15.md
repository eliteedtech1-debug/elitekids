# Q65 CLOSEOUT — what the 2026-09-10 shared `elite_db` migration actually applied

**Date:** 2026-09-15 · **Agent:** Buffy (worker) · **Status:** CLOSED — verdict, no code change
**Brief:** "Close out Q65 by finding what the 2026-09-10 shared `elite_db` migration actually applied."
**Method:** read-only. Source, logs, backups, `information_schema`, git history. One read-only
runner invocation (its default dry-run mode) — see *Side effects* at the end.

---

## VERDICT

> **The 2026-09-10 migration applied NOTHING.** Zero DDL, zero row updates, zero tables created.
> Its one write attempt **failed** (`Table 'elite_db.kids_lessons' doesn't exist`); the two
> successful "APPLY" runs were explicit no-ops ("Nothing to do — schema already up to date").
>
> The three 09-10 `school_setup` backups are **byte-identical to each other** — the runner dumps
> that table *unconditionally before applying*, even when the plan is empty, so three dumps of an
> **unchanged** table. The backup is evidence that the runner *ran*, not that anything changed.
>
> The `school_setup` growth (18,291 → 22,155 B) **predates 09-10** and comes from **other Elite
> apps** on the shared DB plus EliteKids' own **08-19** run — not from this one.

**And a second, more important finding:** the committed runner **is broken**. At HEAD it throws
`ReferenceError: addContentColumns is not defined` before it can even print a plan, so it can
neither plan nor apply anything. The 09-10 runs that printed plans came from an **uncommitted
local working-tree version that no longer exists** — destroyed by the same mechanism Q60
diagnosed (the deploy's `git reset --hard origin/main`).

---

## 1. The runner

| | |
|---|---|
| File | `backend/database/migrate.js` (tracked; last commit **`7f847c2`, 2026-09-07**) |
| Banner | `ELITE KIDS MIGRATION RUNNER` |
| Logs | `backend/logs/kids-migration-<ts>.log` — **`logs/` is gitignored** (`.gitignore:20`) |
| Backups | `backend/logs/kids-migration-backups/<ts>/elite_db.school_setup.sql` |
| Posture | dry-run **by default**; `--apply` takes backups first; `--skip-backup` opts out |
| Targets | main `elite_db` (from `DB_NAME`), kids `KIDS_DB_NAME`=`elite_kids`, AI `AI_DB_NAME`=`elite_bot` |

## 2. Every run on 2026-09-10 (there were five, 06:10–07:09Z)

| time | mode | plan | outcome |
|---|---|---|---|
| 06:10:07 | APPLY | **no plan section at all** — 12 lines, ends at the safety check | died before planning; no tail, no backup dir |
| 06:10:45 | APPLY | **4 ADD COLUMN "(main DB)"**: `kids_lessons.is_global`, `kids_game_configs.item_id`/`tier`/`category` | ❌ **FAILED** — `Table 'elite_db.kids_lessons' doesn't exist`. Applied **nothing** |
| 06:11:14 | APPLY | **"Nothing to do — schema already up to date."** | ✅ "applied successfully" — a **no-op**; backup only |
| 06:39:26 | DRY-RUN | "Nothing to do" | no changes, no backup |
| 07:09:10 | APPLY | "Nothing to do" | ✅ "applied successfully" — a **no-op**; backup only |

The 06:10:45 failure is the whole of the 09-10 write attempt: **one ALTER, no valid target, zero
changes.** Everything after it is a no-op.

## 3. Why the backup grew — and it was not 09-10

The 09-10 backups are byte-identical:

```
778fb156665e9c8cbdd7e15b31293019  2026-09-10T06-10-45-558Z/elite_db.school_setup.sql   22,155 B
778fb156665e9c8cbdd7e15b31293019  2026-09-10T06-11-14-730Z/elite_db.school_setup.sql   22,155 B
778fb156665e9c8cbdd7e15b31293019  2026-09-10T07-09-10-799Z/elite_db.school_setup.sql   22,155 B
92d3bd6c…                         2026-08-19T14-17-10-311Z/elite_db.school_setup.sql   18,291 B
```

Diffing the `CREATE TABLE` bodies (Aug-19 → Sep-10), then attributing each delta:

| delta | attribution |
|---|---|
| **+** `kids_stand_alone`, `kids_url` | **EliteKids' own 08-19 run.** `kids-migration-2026-08-19T14-17-10-311Z.log` plans exactly these two on `school_setup` and logs `✅ applied successfully`. Its backup was taken **pre-ALTER**, so the columns look "new" against it purely from **dump timing** |
| **+** `enable_offline_mode` | **another Elite app** (not this runner — never in any EliteKids plan) |
| **~** `require_result_approval` → `NOT NULL DEFAULT '0' COMMENT 'When 1, assessments must be Approved before Release'` | **another Elite app** — the comment is SMS-flavoured (assessment approval), and it appears in no EliteKids plan |
| **−** `cbt_center`, `cbt_stand_alone` | **elite-cbt**, which owns those columns on the shared DB |

So `school_setup` **did** change between Aug-19 and Sep-10 — but **not on 09-10, and not by this
runner**. The Q65 row's inference ("the backup grew, so `school_setup` really changed") was
correct in substance and wrong in attribution: the growth is the 08-19 run plus other apps.

## 4. Was the kids-only rule respected?

**Yes — but vacuously, by failure rather than by design.**

The 4 planned columns were targeted at the **shared** DB:

```
information_schema.tables WHERE table_schema='elite_db' AND table_name IN
  ('kids_lessons','kids_game_configs')                          → NEITHER exists
```

hence `Table 'elite_db.kids_lessons' doesn't exist`. The columns actually live in `elite_kids`
(also `elite_content_test`, `elite_kids_test`, and an oddly-named `elite_db_test_test`) — where
they **already existed** on 09-10, which is exactly why 06:11 could correctly report
"already up to date". The rule held because the runner **could not** touch the shared DB for kids
tables; it was not enforcing the rule.

## 5. The real finding — the committed runner is non-functional

```
$ cd backend && node database/migrate.js          # default mode = DRY-RUN, no writes
✅ safety check: main DB 'elite_db' looks correct (users, school_setup, students present)
Unhandled error: ReferenceError: addContentColumns is not defined
    at main (backend/database/migrate.js:232:33)
```

- `addContentColumns` is referenced at **lines 232, 235, 242, 243, 244, 323, 331** and **declared
  nowhere**. `CONTENT_COLUMN_PLAN` (line 129) is defined but **never consumed**. The throw happens
  in the planning summary — *before* the plan is printed — so the failure is total in both modes.
- The file at HEAD is **byte-identical to `7f847c2` (09-07)**: `git diff 7f847c2 HEAD --
  backend/database/migrate.js` is empty, working tree clean. So this has been the committed state
  since 09-07.
- Therefore the 09-10 runs that printed a plan ("4 ADD COLUMN(s)") and later "Nothing to do" /
  "applied successfully" **cannot have been produced by the committed file**. They ran from an
  **uncommitted working-tree version** which (a) computed `addContentColumns`, and (b) stopped
  planning the 4 kids-table columns against the shared DB — the only way 06:11 can report "already
  up to date" when `elite_db` has no such tables.
- That version is **gone**. Same mechanism as Q60: the deploy workflow's `git stash create` +
  `git reset --hard origin/main` on this checkout. Note also the **08-17/08-19 runs were made from
  a laptop** — their logs write to `/Users/elite/Downloads/apps/elite/elite-kids/…` — while the
  09-10 ones write to this server's path.
- Regression note: this is the same class of accidental content/edit loss Q60 recorded for the
  Primary/Playgroup work. It is not a new mechanism, it is the same one, still live.

## 6. Impact today

- **From 09-10: none.** No writes landed. No drift was introduced. Confirmed independently by the
  Q60/Q74 tooling — `team-docs/tools/diff-pilot-vs-prod.mjs` reports `IN SYNC`, and the flagship
  counts are unchanged (1710/1710/1530/51/1710/1710).
- **Latent: the tool cannot run, and if repaired naively it is WRONG.** `COLUMN_PLAN` (lines
  91–95) still lists `kids_lessons` / `kids_game_configs` against a detection query scoped to
  `DATABASE()` = the **main** DB (`sequelize`). Restoring `addContentColumns` alone would return
  the runner to the state that produced the **06:10:45 failure**: it would plan 4 doomed ALTERs
  against the shared DB on every run.

## 7. Recommended repair (NOT executed — outside this brief)

Small, and it needs a commit + a test so it cannot be lost the same way a second time:

1. Compute `addContentColumns` from `CONTENT_COLUMN_PLAN` (the missing declaration), **and**
2. Route per-table column detection by owner — a `COLUMN_PLAN` entry whose table is kids-owned
   must be checked against / applied to `KIDS_DB_NAME`, not `DATABASE()`. (Today the whole plan is
   checked against the main DB.)
3. Commit it, with a unit test that (a) the plan contains no main-DB-tabled kids column, and
   (b) an empty plan prints "Nothing to do".
4. Re-run the dry-run and confirm it says "Nothing to do" against prod — that is the real
   acceptance check, and it is also the proof that 09-10 changed nothing.

Until then **do not run `--apply`**: it cannot succeed, and a partial repair would plan ALTERs
against the shared DB.

## 8. Also observed (read-only, no action)

- **`elite_db_test_test`** — a double-suffixed test DB name (`DB_NAME` ending `_test`, then another
  `_test` appended by the isolation layer). Worth a look in the DB-isolation config.
- **Two kids tables still live in the shared `elite_db`**: `kids_badges`, `kids_weekly_points`
  (vs ~80 in `elite_kids`). Leftovers from the phase-2 move; the shared DB is supposed to be kids-free.
- `backend/logs/` is gitignored, so **none of this evidence is in version control** — it exists only
  on this checkout. The runner's own history is therefore unverifiable from git; this report is the
  record.

## Side effects of this investigation

Read-only, verified: no backup directory was created (the runner returns before backups in dry-run
mode — `ls -lt backend/logs/kids-migration-backups/` still ends at `2026-09-10T07-09-10-799Z`), and
the only artifact is the runner's own gitignored log
(`backend/logs/kids-migration-2026-09-15T19-25-36-883Z.log`, 414 B — it stops at the safety check
plus the `ReferenceError`). **`git status --porcelain` shows no tracked modification.** No DDL, no
DML, no `.env` read, no schema change.

## Evidence index

- `backend/database/migrate.js:91-95, 129, 232-244, 323, 331` — plan, the unused `CONTENT_COLUMN_PLAN`, and the six dangling references
- `backend/logs/kids-migration-2026-09-10T*.log` (5 runs) — the plans, the failure, the no-ops
- `backend/logs/kids-migration-2026-08-19T14-17-10-311Z.log` — the real source of the two `school_setup` columns
- `backend/logs/kids-migration-backups/*/elite_db.school_setup.sql` — the byte-identical 09-10 triple
- `git log -1 7f847c2` (2026-09-07) + empty `git diff 7f847c2 HEAD -- backend/database/migrate.js`
- `backend/logs/kids-migration-2026-09-15T19-25-36-883Z.log` — this investigation's dry-run
