# FB-FIX — kids.js "Route.post() undefined callback" crash-loop investigation

**Date:** 2026-08-23 · **Agent:** fb-review (read-only) · **Files:** `backend/src/routes/kids.js`, `backend/src/controllers/kidsSeries.js`, `backend/src/controllers/kidsModeLock.js` (+ models index for handler-symbol audit). **No files edited.**

## Verdict
The working tree is **currently consistent — all 70 routes register with function callbacks** (empirically verified by loading every controller module, printing exports, and simulating registration of every route with a stub `app`). The crash-loop is a **stale-state/partial-patch artifact**: `routes/kids.js` was updated (new destructures + 4 new routes) while the controllers' tail exports were being appended, so for the patch window one or more destructured names were `undefined` → Express threw at registration → restart loop.

## 1) Require/destructure audit vs actual exports (verified at runtime)

| Module | Names destructured in kids.js | Export inventory (node-verified) | Status |
|---|---|---|---|
| `controllers/kidsSeries` | createSeries, listSeries, getSeries, createUnit, updateUnit, getUnitLockStatus, getUnitSuggestedMode, **getLessonNextUp** | createSeries, listSeries, getSeries, createUnit, updateUnit, getUnitLockStatus, getUnitSuggestedMode, getLessonNextUp | ✅ all resolve |
| `controllers/kidsModeLock` | getModeLock, setModeLock, removeModeLock, listModeLocks, **convertTestScores, domesticateSeries, listDomestications** | getModeLock, setModeLock, removeModeLock, listModeLocks, convertTestScores, domesticateSeries, listDomestications | ✅ all resolve |
| `controllers/kids` | 21 names (listChildrenForParent … getPuzzleDifficultyStatus) | all 21 present | ✅ |
| kidsTracking / kidsGarden / kidsRetry / kidsSession / kidsCurriculum / kidsParental / kidsOnboarding / routesHelper | all | all present | ✅ |

New-route symbols (added by FB patch) → defined + exported:
- `GET /kids/lessons/:id/next-up` → `getLessonNextUp` — kidsSeries.js:413 `module.exports.getLessonNextUp` ✅
- `POST /kids/test-scores/convert` → `convertTestScores` — kidsModeLock.js:448 ✅
- `POST /kids/series/:id/domesticate` → `domesticateSeries` — kidsModeLock.js:578 ✅
- `GET /kids/series-domestications` → `listDomestications` — kidsModeLock.js:579 ✅

Handler-internal symbols also verified: `callerRole` (kidsModeLock.js:32), `callerRank` (:38), `lock0school` (:451), `db.sequelize` + `db.content` (models/index.js:191-192).

Simulated registration result (stub app, all 70 routes): **NO undefined callbacks**.

## 2) Root cause / fragility (why it crashed, and can recur)

- Both controllers use the **"base `module.exports = {…}` + tail appends"** pattern:
  - kidsModeLock.js:283 `module.exports = { getModeLock, setModeLock, removeModeLock, listModeLocks }` then appends at :448 / :578 / :579.
  - kidsSeries.js:378 base export, append `getLessonNextUp` at :413.
- kids.js **requires kidsModeLock twice** (line ~33 for `domesticateSeries/listDomestications`, line ~79 for `getModeLock…convertTestScores`) and **kidsSeries twice** (base block + separate `getLessonNextUp` line).
- **Crash mechanism:** if routes/kids.js is saved with the new destructures before (or while) the controller tail exports land, `require()` returns a module whose tail appends are missing → destructured name = `undefined` → `app.post('/kids/…', auth, requireStaff, undefined)` → `Route.post() requires a callback function but got a [object Undefined]` at boot → supervisor restart loop. Exactly the reported symptom; not reproducible now because both sides are present.
- **Recurrence risk:** any future mid-file load-time throw in either controller (or a later `module.exports = {…}` replacement that wipes tail appends) silently drops the tail exports → same boot crash, invisible until route registration.

## 3) Corrected import lines (exact)

Consolidate each module to **one** require with **all** names, and (recommended) fold tail exports into the base export object:

```js
// ── Game Series & Unit Sequencing ──
const {
  createSeries,
  listSeries,
  getSeries,
  createUnit,
  updateUnit,
  getUnitLockStatus,
  getUnitSuggestedMode,
  getLessonNextUp,          // FB-10 (was separate require)
} = require('../controllers/kidsSeries');

// ── Mode Lock + FB-13/14/15 (single require, was split across two lines) ──
const {
  getModeLock,
  setModeLock,
  removeModeLock,
  listModeLocks,
  convertTestScores,        // FB-13/14
  domesticateSeries,        // FB-15
  listDomestications,       // FB-15
} = require('../controllers/kidsModeLock');
```

Controller-side hardening (recommended, not required for the fix): move the tail appends into the base export objects —
- kidsModeLock.js:283 → `module.exports = { getModeLock, setModeLock, removeModeLock, listModeLocks, convertTestScores, domesticateSeries, listDomestications };` (delete :448/:578/:579 appends),
- kidsSeries.js:378 → add `getLessonNextUp` to the object (delete :413 append).
This guarantees every export exists even if a partial/module load failure occurs.

## 4) Other findings (advisory — no action taken)
- **F4.1 — Schema mutation on request path (C2 conflict):** `domesticateSeries` performs `CREATE TABLE IF NOT EXISTS kids_series_subject_maps` and `ALTER TABLE kids_lessons ADD COLUMN source_lesson_id / owner_school_id` on every first hit, plus INSERTs into `kids_lessons`/`kids_game_configs`/`kids_scene_scripts`. Per standing constraints, schema changes need an explicit order — flag for master before this route is enabled in prod.
- **F4.2 — Route requires staff but handler re-checks:** `domesticateSeries`/`convertTestScores` re-verify `callerRole(req) !== 'teacher'` inside the handler despite `requireStaff` middleware — redundant but harmless.
- **F4.3 — `convertTestScores` queries `academic_calendar`/`ca_setup` via `db.sequelize` (elite_db) while `kids_progress`/`kids_mode_locks` via `db.content` (elite_content)** — cross-DB query is intentional (scores live in elite_db), but the lock-window `created_at` comparison assumes lock rows' timestamps; verify column types if prod schema differs.
- **F4.4 — No route-level regression test** for the 4 new FB routes; b1-regression.test.js covers mode-lock only. Recommend adding a boot test (register app, assert no undefined callbacks) to the C-phase hermetic suite.

## Files changed by FB patch (working tree, uncommitted)
`backend/src/routes/kids.js` (+2 requires, +1 destructure merge, +4 routes) · `backend/src/controllers/kidsModeLock.js` (+convertTestScores, +domesticateSeries, +listDomestications, +removeModeLock rank fix, -crypto id insert) · `backend/src/controllers/kidsSeries.js` (+getLessonNextUp).
