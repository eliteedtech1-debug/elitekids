# ECCE bridge — schema ownership, model binding and route wiring (2026-09-14)

**Trigger:** the deploy gate (`scripts/ci-gate.sh` → `scripts/run-tests.sh`) failed on
3 suites at `b142333`: `jolly-phonics-creche-contract`, `game-config-rules`,
`observation-integration`. Brief: fix all failing suites.

**Result:** gate green — **63/63 suites, 697/697 tests**.
`bash scripts/run-tests.sh --forceExit`

Two of the three failures were **real production defects**, not test defects. The
third was reverted work-in-progress.

| Suite | Root cause | Fix |
|---|---|---|
| `jolly-phonics-creche-contract` | The **tracked** half of the crèche work had been reverted by a previous deploy's `git reset --hard` (the untracked half survived), so the seeder no longer built one explicit ID-based round per sound | Restored the reverted half — the pre-reset work the deploy workflow had preserved. No new logic written |
| `game-config-rules` | `gameConfigRules.js` validated raw item arrays, so a `matching` game with 5 pairs read as 10 items, and a `puzzle-split` with 5 pieces read as 0; chain rounds were summed into one 5–10 cap | Implemented the playable-item contract from `curriculum/00-framework/game-size-and-module-standard.md`: `playableItemCount(template, config)` with `logicalPairCount()` (a pair counts once, not twice), `puzzle-split` counted by piece count, band-aware cap (`5–10`; `5–15` for Primary), and each chain round validated independently |
| `observation-integration` | Two defects, both above the test's own surface: (1) the bridge/observation models were bound to the **shared school DB** (see below), and (2) `POST /kids/observations` was **never mounted** in `src/routes/kids.js` → Express 404 for every request | Added both model files to `KIDS_CONTENT_MODEL_FILES` so they bind to the Kids connection (**`KIDS_DB_NAME`, `elite_kids`**) per `team-docs/ELITEKIDS-DATABASE-ENV-CONTRACT.md` §3, **and** mounted the observation routes |

## The two production defects in detail

### 1. Bridge models were writing to the shared EliteSMS database

`src/models/index.js` binds model files by name: only files listed in
`KIDS_CONTENT_MODEL_FILES` go to the Kids connection; everything else lands on the
shared school connection (`DB_NAME`). `KidLessonBridge.js` and
`KidTeacherObservation.js` were **absent from that list**, so:
- `kids_lesson_bridges` / `kids_teacher_observations` would have been created and
  read in `elite_db` — the shared DB that the contract says this app "may retain
  read-only legacy access" to;
- the bridge/observation code would have failed against the real `elite_kids`.

In the hermetic test the split was visible immediately: the fixture wrote the bridge
to `elite_kids_test` (raw sql, Kids DB) while the model read `elite_db_test` → 404.

**Fix:** both files added to `KIDS_CONTENT_MODEL_FILES` (binding only).

### 2. DDL must not run with the server, so the tables come from a separate migration

Adding those files to `KIDS_CONTENT_TABLES` would have made `models.syncKidsTables()`
— called from `src/index.js` at boot — create the tables as a side effect of
starting the service. **DDL is not run by the server**; the tables are created by a
migration run on its own:

```
node database/ecce-bridge-tables-migration.js            # DRY-RUN (default)
node database/ecce-bridge-tables-migration.js --apply    # create if missing
```

The migration is additive-only (`CREATE TABLE IF NOT EXISTS` for exactly these two
tables, DDL generated from the Sequelize models so it cannot drift), refuses to run
if the Kids connection resolves to the shared DB, and touches nothing else. Neither
model file is in `KIDS_CONTENT_TABLES`, so **the server never issues their DDL at
boot** — that list is what `syncKidsTables()` filters on.

Dry-run against the live environment:

```
EliteKids — ECCE bridge tables migration
  kids DB   : elite_kids
  shared DB : elite_db (untouched)
  mode      : DRY-RUN
  present   : (none)
  missing   : kids_lesson_bridges, kids_teacher_observations
  + would CREATE TABLE IF NOT EXISTS `kids_lesson_bridges`
  + would CREATE TABLE IF NOT EXISTS `kids_teacher_observations`
```

Applied on order (2026-09-14), then re-verified independently of the script's own
report:

```
  mode      : APPLY
  missing   : kids_lesson_bridges, kids_teacher_observations
  ✓ kids_lesson_bridges created
  ✓ kids_teacher_observations created

# independent re-check, direct information_schema + live count
kids_lesson_bridges          columns 44 | indexes 7 | rows 0
kids_teacher_observations    columns 19 | indexes 5 | rows 0
# dry-run afterwards: present: both · missing: (none)
```

Both tables now exist in the live `elite_kids`, additive and empty (no existing
data touched); `elite_db` was never written to.

`backend/test/helpers/test-db.js` also gained the two tables: it is the hermetic
test-schema owner (`test/global-setup.js` → `ensureTestDb()`), it runs in the jest
process only, and it is required by no file under `src/`. That is the test fixture,
not the server.

## Test-proven behaviour

```
PASS test/observation-integration.test.js
    ✓ rejects with 422 when the child is NOT in the SMS class roster (STUDENT_NOT_FOUND)
    ✓ rejects with 503 when the EliteSMS API is unavailable (no context invented)
    ✓ creates the observation when the SMS roster confirms the child
PASS test/game-config-rules.test.js   (6/6)
PASS test/jolly-phonics-creche-contract.test.js   (1/1)
Test Suites: 63 passed, 63 total
Tests:       697 passed, 697 total
```

## Files changed

| File | Change |
|---|---|
| `backend/src/models/index.js` | `KidLessonBridge.js` + `KidTeacherObservation.js` added to `KIDS_CONTENT_MODEL_FILES` (Kids DB binding); deliberately **not** added to `KIDS_CONTENT_TABLES` so no boot DDL |
| `backend/src/routes/kids.js` | Mounted the teacher-observation surface: `POST/GET /kids/observations`, `PATCH /kids/observations/:id`, `GET /kids/learning-summary/:childAdmissionNo` (all `auth` + `requireStaff`) |
| `backend/database/ecce-bridge-tables-migration.js` | **New** — separate dry-run-by-default migration owning the two bridge tables |
| `backend/src/services/gameConfigRules.js` | Playable-item contract per the curriculum module standard |
| `backend/test/helpers/test-db.js` | Hermetic test-schema fixtures for the two bridge tables |
| `backend/test/bridge-routes.test.js` | **New** — 14-assertion route-surface guard (unmounted route ⇒ 401, not 404) |
| `.gitignore` | `dist` (no trailing slash) added — `dist/` did not match the `frontend/dist` **symlink** into `releases/`, so the docroot symlink was showing up as a committable untracked path |

## The bridge write path is now mounted end to end

`src/routes/kids.js` carries the full teacher authoring path (all `auth` +
`requireStaff`, matching the controllers' own staff check):

| Route | Handler |
|---|---|
| `GET /kids/sms/lesson-context` | resolve the SMS-authoritative class context |
| `GET /kids/learning-outcomes` | pick a reviewed curriculum outcome |
| `GET /kids/lesson-bridges` · `POST /kids/lesson-bridges` | list / draft a bridge |
| `GET` · `PATCH /kids/lesson-bridges/:id` | read / edit the draft |
| `POST /kids/lesson-bridges/:id/submit-review` | submit for review |

`backend/test/bridge-routes.test.js` (new, 14 assertions) guards exactly the
regression that caused this thread, since service-level tests stayed green while
the surface 404'd: each of the 11 authoring/evidence paths must answer **401**
without a token — an unmounted path 404s *before* middleware runs, so a 401 is the
proof the route exists — and as staff the list endpoints return 200 with a
controller-shaped body while `POST /kids/lesson-bridges` reaches the bridge
validation path (never a bare 404).

Gate after all of the above: **64/64 suites, 711/711 tests**.

## Still open (not in these briefs)

1. The bridge **review/approval** step (ready_for_review → approved → published) has
   no handler yet — `submitBridgeReview` is as far as the write path goes, so
   bridges cannot be approved from the API.
2. Everything here is **uncommitted** unless a commit follows; a deploy runs
   `git reset --hard origin/main` and would revert it (the workflow stashes first,
   but the work should be committed).
