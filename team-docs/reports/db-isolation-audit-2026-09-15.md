# DB-ISOLATION AUDIT — `elite_db_test_test`, and the two kids tables in the shared `elite_db`

**Date:** 2026-09-15 · **Agent:** Buffy (worker) · **Status:** FINDINGS — no code changed
**Brief:** "Check the DB-isolation config for the double-suffixed `elite_db_test_test` name and the
two kids tables still living in the shared `elite_db`."
**Method:** read-only. Source, git history, `information_schema`, and the exact failing query run
against each candidate DB.

---

## Headline

1. **`elite_db_test_test` is a pre-fix orphan and cannot recur** — a non-idempotent suffix helper was
   fixed on **2026-09-14** (`0176bdc`), the current helper is idempotent, and there is a regression
   test for it. Nothing in the repo references the database.
2. **The two kids tables in the shared DB are one documented design exception + one real schema
   collision** — `kidsLeaderboard.js` puts `kids_weekly_points` and `kids_badges` into the **shared**
   DB on purpose; but `kids_badges` therefore exists as **two different tables with two different
   schemas under one name**, in two different databases.
3. **That collision has already produced a live 500:** `GET /kids/analytics/overview` reads
   `kids_weekly_points` from the **kids** DB, where the table does not exist. Proven below.

---

## Part 1 — `elite_db_test_test`

### Where the name came from

`backend/src/config/databaseNames.js` normalizes a configured name for dev/test by appending
`_test`. **Before `0176bdc` (2026-09-14) it appended unconditionally**, so a name that was *already*
suffixed got doubled: `elite_db_test` → `elite_db_test_test`.

```js
function ensureTestSuffix(value) {                                   // current, line 31
  const name = String(value || '').trim();
  if (!name) return name;
  return name.endsWith(TEST_SUFFIX) ? name : `${name}${TEST_SUFFIX}`;  // ← the guard
}
```

- `git log -S'endsWith(TEST_SUFFIX)' -- backend/src/config/databaseNames.js` → **`0176bdc`,
  2026-09-14 23:43:21** — the guard is one day old.
- Regression test present: `backend/test/database-names.test.js:55`
  (`ensureTestSuffix('elite_kids_test') === 'elite_kids_test'`).
- **Conclusion: it cannot be created again.** The orphan is a leftover, not an active fault.

### It is an orphan

`grep -rn 'elite_db_test_test'` across `*.js`, `*.sh`, `*.md`, `*.json` (excluding `node_modules`)
→ **empty**. Nothing references it.

### What it holds

**39 tables, 34 of them `kids_*`** — an exact copy of the test fixture set, in the **kids** role:

```
kids_children=5  kids_lessons=3  kids_game_configs=4  kids_progress=1
kids_content_approvals=3  kids_test_attempts=3  kids_game_series=2  kids_game_units=3
kids_scene_scripts=3  kids_generation_jobs=2  kids_curriculum_points=2  kids_library_games=2
kids_engagement_snapshots=2  kids_interface_onboarding=1  kids_garden_state=1
kids_parental_controls=1  …
```

### There are three stale kids test DBs, not one

| schema | tables | `kids_*` | note |
|---|---|---|---|
| `elite_kids_test` | 48 | 48 | **current** (`test-db.js:38`) |
| `elite_content_test` | 35 | 35 | legacy; still the **`AI_DB_NAME`** fallback (`setup-env.js:37`) |
| `elite_db_test_test` | 39 | 34 | **this orphan** (pre-`0176bdc`) |

Plus `elite_db_test` (8 tables) — the current shared test DB, which carries the two leaderboard kids
tables for the reason in Part 2.

**Stale doc found:** `scripts/run-tests.sh:13` still describes the Kids-owned test DB as
`elite_content_test`, while `test/helpers/test-db.js` uses `elite_kids_test`. Comment only.

**Recommendation:** drop `elite_db_test_test` and `elite_content_test` (both are throwaway test
schemas with fixture data and no referent in the repo). **Not executed** — dropping databases is
outside an investigative brief and needs explicit authorisation.

---

## Part 2 — the two kids tables in the shared `elite_db`

### They are deliberate: `kidsLeaderboard.js` creates them on the shared connection

```js
// kidsLeaderboard.js — header
 *  Tables live in MAIN db (db.sequelize) alongside weekly_scores — same
 *  documented exception as FB-14 conversion writes.
// kidsLeaderboard.js:88,103 — ensureSchema()
await db.sequelize.query(`CREATE TABLE IF NOT EXISTS kids_weekly_points (` … );
await db.sequelize.query(`CREATE TABLE IF NOT EXISTS kids_badges (` … );
```

`db.sequelize` is the **shared** connection (`process.env.DB_NAME` → `elite_db`). So these are not
leftovers from the phase-2 move — they are **created at runtime in the shared DB, by design**, and
the shared DB is therefore not kids-free.

### …but `kids_badges` is now two different tables under one name

| | `elite_db.kids_badges` | `elite_kids.kids_badges` |
|---|---|---|
| owner | `kidsLeaderboard.js` (weekly podium) | `kidsFestival.js:281/287/304/310`, `e3fArena.js:276/283`, `kidsParent.js:587/660/938` |
| connection | `db.sequelize` (**shared**) | `dbm().content` (**kids**) |
| columns | `id INT AI`, `school_id`, `academic_year`, `term`, `week_number`, `class_code`, `admission_no`, `position`, `badge ENUM('gold','silver','bronze')`, `free_access_until`, `awarded_at` | `id VARCHAR(50)`, `child_admission_no`, `school_id`, `badge_name`, `badge_emoji`, `badge_type`, `awarded_at` |
| rows now | 0 | 0 |

Verified column-by-column against `information_schema`. Both tables are empty, so no data has
collided yet — but any name-only reference resolves to a **different schema depending on which
connection it is made through**, which is exactly the hazard the isolation work was meant to remove.

`kids_weekly_points` is simpler: it exists **only** in the shared DB
(`elite_db=1`, `elite_db_test=0`, `elite_backup_db=1`) — **no copy in `elite_kids` at all**.

---

## Part 3 — the live defect this produces (⚠️)

`kidsAnalytics.js:55` reads `kids_weekly_points` through **`dbm().content`** — the **kids** DB — where
the table does not exist:

```js
const [totalPts] = await dbm().content.query(
  `SELECT COALESCE(SUM(points), 0) AS total FROM kids_weekly_points WHERE school_id = :sid`,
  { replacements: { sid } },
);
```

Running that exact statement against each database:

```
elite_kids  FAIL ER_NO_SUCH_TABLE  Table 'elite_kids.kids_weekly_points' doesn't exist
elite_db    OK   total=0
```

**Impact.** `GET /kids/analytics/overview` is routed (`routes/kids.js:427`, staff-only) and the whole
handler sits inside **one** `try/catch` returning `500 { success: false, message: 'Server error.' }`.
The throw happens *before* `res.json`, so the **entire** overview fails — not just the points field:
`total_students`, `active_this_week`, `games_played_this_week`, `avg_score_this_week`,
`excellent_games_this_week`, `active_classes` **and** `total_points`. Every school, every request.

**Fix is one line** — read it from the same connection that creates it:

```diff
- const [totalPts] = await dbm().content.query(
+ const [totalPts] = await dbm().sequelize.query(
```

**Not applied** — this brief was investigative. Flagged as the highest-value follow-up below.

**Second smell in the same handler** (not broken, but an isolation leak): the active-classes query
hard-codes **`JOIN elite_db.students`**. That resolves to the *production-named* database even under
test, where the shared DB is `elite_db_test`.

---

## Recommendations (none executed)

| # | Action | Risk if ignored |
|---|---|---|
| 1 | **`kidsAnalytics.js:55` → `dbm().sequelize`.** One line; unblocks the whole analytics overview | A staff endpoint 500s for every school |
| 2 | Decide where the leaderboard's two tables belong. Either move them to the kids DB (and point `kidsLeaderboard.js` at `dbm().kids`), or keep them shared and **rename them out of the `kids_` namespace** so the name stops colliding with the festival/arena badges | Two schemas under one name; the next writer binding to the wrong connection gets a silent `ER_BAD_FIELD_ERROR` |
| 3 | Drop the orphans `elite_db_test_test` and `elite_content_test` | Disk + confusion; `elite_content_test` is still named as `AI_DB_NAME`'s fallback |
| 4 | Fix the stale `run-tests.sh:13` comment (`elite_content_test` → `elite_kids_test`) | Docs drift |
| 5 | Note that `elite_db.kids_badges` / `kids_weekly_points` are **intentional**, so any future "kids-only rule" check must not flag them blindly | A future clean-up could drop live leaderboard tables |

## Evidence index

- `backend/src/config/databaseNames.js:31-40` — `ensureTestSuffix` (idempotent) + `resolveDatabaseName`
- `git log -S'endsWith(TEST_SUFFIX)'` → `0176bdc`, 2026-09-14 — when the guard landed
- `backend/test/database-names.test.js:55` — the regression test
- `backend/test/setup-env.js:34-38`, `backend/test/helpers/test-db.js:36-38,65` — test name resolution + routing
- `backend/src/controllers/kidsLeaderboard.js:1-6,88,103` — the documented shared-DB exception
- `backend/src/controllers/kidsAnalytics.js:55` + `backend/src/routes/kids.js:427` — the failing query and its route
- `information_schema` sweep — schema inventory, per-table row counts, `kids_badges` columns per DB
