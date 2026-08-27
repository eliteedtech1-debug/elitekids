# PHASE B1 — FINAL REPORT: Kids DB separation (elite_kids) + mode-lock root-cause fix

**Date:** 2026-08-23 · **Agent:** ox-alpha · **Branch:** main @ `f51b291` (pushed)
**Constraints:** C1 honored (kids tables resident in elite_content; new dedicated `elite_kids` DB created as 4th connection, no co-hosted table moved), C2 honored (zero ALTERs; additive code only), C4 honored (this report in team-docs/reports/; nothing inside committed), C6 honored (jest runs backgrounded, no blocking waits).

---

## VERDICT (one line)

**PHASE B1 COMPLETE — all 7 steps green.** `getModeLock` error spam is root-caused and fixed at the connection layer (`db.sequelize`→`db.content`); a dedicated `elite_kids` database now exists and is wired as the 4th Sequelize instance for future migration per C1; all production gates pass with **zero test regressions**.

## Root cause

`backend/src/controllers/kidsModeLock.js` executed its raw SQL against `db.sequelize` (main/elite_db) while the `kids_mode_locks` table lives in elite_content → every student request spammed
`Table 'elite_db.kids_mode_locks' doesn't exist`. The table was never missing — the query hit the wrong database.

## Changes shipped (commit f51b291 — code-only, 3 files, +68/−22)

| File | Change |
|---|---|
| `backend/src/controllers/kidsModeLock.js` | ALL raw SQL repointed `db.sequelize` → `db.content` (the fix) |
| `backend/src/models/index.js` | Additive 4th instance `db.kids` ← `KIDS_DB_NAME=elite_kids`; no models rerouted |
| `backend/src/config/database.js` | Additive `kidsPool/kidsQuery/getKidsConnection/closeKids` helpers |

Env: `KIDS_DB_NAME=elite_kids` appended to backend/.env (gitignored). No model/table moves occurred (STEP3 scan proved zero kids-domain tables exist in elite_db — nothing to migrate yet).

## Gate results (STEP5)

| # | Gate | Result |
|---|---|---|
| 1 | POST `/students/login` (JP-E2E-001 @ kids) via https://elitekids.com.ng | ✅ 200 + Bearer token |
| 2 | GET `/kids/series` (auth) | ✅ 200 — 2 series |
| 3 | 15 Jolly Phonics published configs ≥5 rounds | ✅ 15/15 PASS (min 5 / max 7; key varies by template: items/questions/pairs/sentences) |
| 4 | GET `/schools/get-details?query_type=select-by-short-name&short_name=kids` (prod URL) | ✅ 200 JSON `{success:true,data:[SCH-KIDS …]}` |
| 5 | jest `--runInBand` (TEST_DB_USER/PASSWORD injected) | ✅ NO NEW FAILURES: current tree 40F/225P/265T ≡ clean-HEAD baseline rerun 40F/225P — FAIL sets byte-identical (40 failures pre-exist on origin/main) |
| 6 | elite-api health | ✅ GET :8383/ → 200 "Hello my World" |

## STEP4 evidence — errors stopped

- pm2 `elite-kids` restarted 01:13:28Z on fixed code → clean full-sync boot, listening :8484.
- `elite-kids-error.log`: 24× `getModeLock error` lines, file mtime **2026-08-22T23:58:13Z** (all pre-fix); **zero writes post-restart**.
- Live probe: GET `/kids/mode-lock?child_admission_no=JP-E2E-001&lesson_id=lesson-jp-u1-tap&mode=game` → **200** `{success:true,data:null}`.

## Baseline facts captured (STEP0–3 recap)

- elite_db has ZERO kids_* tables; all 24 kids content tables live in elite_content (co-hosted with elite-cbt-api → STAYS pending human review per C1); AI audit table in elite_bot.
- `elite_kids` created (utf8mb4) with grants to 'elite'@'localhost'; all 4 connections authenticate; `KidModeLock.getTableName()` = kids_mode_locks.
- Content baseline counts unchanged (lessons 138, game_configs 142, mode_locks 0, etc.).

## Handoff notes / follow-ups

1. **C4 gap:** `.gitignore` contains no `team-docs/` entry despite STANDING-CONSTRAINTS claiming it is gitignored — needs supervisor-approved hygiene commit (out of B1 scope).
2. The 40 pre-existing jest failures on origin/main deserve triage (unrelated to B1).
3. Future migration into `elite_kids` can proceed model-by-model via the new `db.kids` connection without touching shared school-domain models (User/Student/SchoolSetup stay in elite_db).

---

## ROLLBACK PROCEDURE

**B1 moved no data, so rollback is two independent halves: code revert + optional DB drop.**

### Code (3 files, commit f51b291)
1. `git revert f51b291` (or `git reset --hard 42bb0e7` on the server) — restores pre-B1 code. NOTE: reverting puts `kidsModeLock.js` back on `db.sequelize`, which **re-creates the `Table 'elite_db.kids_mode_locks' doesn't exist` error spam** — that is the expected pre-fix behavior; do not mistake it for a new break.
2. Restart the app for the revert to take effect:
   `pm2 restart elite-kids && pm2 save`
3. Verify: `pm2 logs elite-kids --err --lines 5 --nostream` — expect `getModeLock error` lines to resume (pre-fix signature), confirming the revert is live.

### Database
- **No tables were moved, renamed, or dropped in B1** — STEP3 was a no-op (zero kids_* tables existed in elite_db; nothing was renamed or dumped). The generic "rename tables back" pattern would be `RENAME TABLE elite_kids.<t> TO elite_content.<t>;` per table — **not applicable to B1**, but documented here for any future phase that does move tables.
- `elite_kids` (and `elite_kids_test`) exist but are **empty** (0 tables). Rollback options:
  - **Leave in place (recommended):** harmless — no model binds to `db.kids` yet; the connection is only used if code references it.
  - **Drop (full undo):** `DROP DATABASE elite_kids; DROP DATABASE IF EXISTS elite_kids_test;` and remove the `KIDS_DB_NAME=elite_kids` line from `backend/.env`. Re-provisioning later = re-run STEP1 (CREATE DATABASE utf8mb4 + `GRANT ALL ON elite_kids.* TO 'elite'@'localhost'`).

---

## NEEDS-HUMAN-REVIEW LIST

| # | Item | Why it needs a human | Blocker? |
|---|---|---|---|
| 1 | **Kids tables stay co-hosted in `elite_content`** (C1) | `elite_content` is shared with elite-cbt-api (`cbt_*`, `question_*`, `school_website_*`). B1 deliberately did NOT move the 24 kids content tables into `elite_kids`. A human must decide when (and which models) to migrate model-by-model onto `db.kids`. | No — deliberate stop point |
| 2 | **`.gitignore` missing `team-docs/`** (C4 gap) | STANDING-CONSTRAINTS claims team-docs is gitignored; it is not. Needs a supervisor-approved hygiene commit. | No |
| 3 | **40 pre-existing jest failures** | Byte-identical to the origin/main baseline (40F/225P/265T) — unrelated to B1, but they mask real regressions. Needs triage. | No — pre-existing |
| 4 | **`'elite'@'localhost'` grant on `elite_kids`** | STEP1 grant matches the existing pattern, and `elite` already has global `*.*` privileges. Human should confirm the grant model is intended. | No |
| 5 | **Found during independent verification (outside B1 scope):** `MEDIA_PUBLIC_BASE_URL=http://62.72.0.209/kids/media` in `backend/.env` — verified live that `GET /kids/media/<key>` 404s (`Route GET /kids/media/<key> not found`; backend mounts media at `/media/*`). Every stored media URL is currently broken. | Yes — live prod media breakage |
| 6 | **Test isolation gap (B1 follow-up):** `backend/test/setup-env.js` overrides `DB_NAME/CONTENT_DB_NAME/AI_DB_NAME` to the test DB but **not** `KIDS_DB_NAME` — so the new `db.kids` instance points at the real (empty) `elite_kids` DB during tests. Add `process.env.KIDS_DB_NAME = process.env.TEST_DB_NAME || 'elite_kids_test'` next to line 14-16. | No — no model binds to db.kids yet |

---

## EVIDENCE APPENDIX (independent verification, read-only, 2026-08-23)

Independently re-verified by a second agent against the live box — all commands read-only.

### 1) `SHOW DATABASES` → elite_kids present
```
mysql> SHOW DATABASES; (filtered to elite*)
elite_bot  elite_content  elite_db  elite_kids  elite_kids_test  elite_logs
```

### 2) Env var
```
backend/.env: KIDS_DB_NAME=elite_kids
```

### 3) Code wiring
```
backend/src/models/index.js:164  const kidsSequelize = new Sequelize(process.env.KIDS_DB_NAME || 'elite_kids', ...)
backend/src/models/index.js:194  db.kids = kidsSequelize   (191 db.sequelize, 192 db.content, 193 db.ai)
backend/src/controllers/kidsModeLock.js: 14× db.content.query(...); 0× db.sequelize/sequelize.query
```

### 4) information_schema
```
SELECT COUNT(*) FROM information_schema.tables
 WHERE table_schema='elite_db' AND table_name LIKE 'kids\_%';  → 0
kids_mode_locks currently lives in: elite_content (confirmed)
elite_kids table count: 0 (provisioned, empty)
```

### 5) pm2 error log — quiet since before 00:20Z
```
pm2 logs elite-kids --err --lines 30 --nostream → 26 lines, all 'getModeLock error: Table 'elite_db.kids_mode_locks' doesn't exist'
stat elite-kids-error.log mtime = 2026-08-22 23:58:13Z   (ALL lines pre-fix)
process started 01:13:28Z on fixed code; out log: '✅ Kids tables synced into elite_content (... kids_mode_locks)', '✅ Databases synced', listening :8484
Zero error-log writes since restart (mtime unchanged at verify time 01:24Z)
```

### 6) jest gate (independent re-run, 2026-08-23 ~01:55Z)
```
$ TEST_DB_USER=elite TEST_DB_PASSWORD=<env> TEST_DB_NAME=elite_kids_b1verify \
    DISABLE_RATE_LIMIT=1 npx jest --ci --runInBand
Test Suites: 8 failed, 12 passed, 20 total
Tests:       40 failed, 225 passed, 265 total   (Time: 27.6 s)
```
**Independent result 40F/225P/265T — byte-identical to the origin/main baseline** (executor-recorded STEP5d: 40F/225P/265T, FAIL sets identical) → **zero regressions from the B1 diff**. Re-run used a throwaway DB (`elite_kids_b1verify`) to avoid colliding with the parallel executor run.

NOTE (harness quirk, pre-existing): jest prints "Jest did not exit one second after the test run has completed" — tests finish in ~28 s but the process lingers on open handles, so a piped `npx jest … | tail` invocation appears hung until the wrapper is killed. The parallel executor run observed in the same state had finished its tests; not a B1 regression.
