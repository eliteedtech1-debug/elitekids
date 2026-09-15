# PLAY grouped by series unit — progress report

**Brief (from 2026-09-15 session-close):** group PLAY into Unit 1, Unit 2… sections using
the path's unit data (`locked`, `locked_reason`, `relation`, `done`), surface each unit's
overview/summary game and its closure test, and hang the jump-to-next-milestone offer on
locked units. Scope: frontend (`elite-kids/frontend`). Chosen by the user from the
session-close followups ("PLAY by unit").

**Worker:** Buffy · **Claimed:** 2026-09-15T14:55Z

## Checkpoints

- 2026-09-15T14:55Z | SCOPE | Read the four files the change touches: `tabs/PlayTab.tsx`
  (flat grid + `homeItems` sections next/open/locked), `StudentHome.tsx#homeItems`
  (lines ~607-666), `lib/utils/learningPath.ts` (pure path helpers), `components/
  LearningPath.tsx` (the LEARN unit renderer to reuse), `components/CheckpointTestOut.tsx`,
  and `tabs/studentTabs.test.ts` (the AST contract that pins ownership + helper uniqueness).

- 2026-09-15T14:55Z | BLOCK | **The brief as literally written cannot be built as described.
  Two findings, both verified, not inferred:**

  **(1) There is no per-unit "overview/summary game" or "closure test" in the API.**
  `computeLearningPath` (backend/src/controllers/kidsSeries.js:622-784) gives each unit
  `lessons: PathLesson[]` = `{lesson_id, title, age_level, state}`. A unit's games come from
  `content_items`. There is no separate summary/overview row and no per-unit closure-test
  row. "Closure" is a **mode** on each game (`test`) — the E3f gate is
  `lessonComplete = testPass` (kidsSeries.js:~660). The jump-ahead assessment is
  **per-SERIES, not per-unit**: `GET /kids/checkpoint?student_id&series_id` covers every
  unfinished unit of that subject (kidsCheckpoints.js:14-17). So "surface each unit's
  closure test" would mean inventing a backend concept. Not done.

  **(2) Grouping by unit is ~1 card per header in every band the repo can produce.**
  `curriculum/00-framework/flagship-annual-pilot-plan.json` (HEAD, tracked, clean) declares
  **5 bands** (creche, playgroup, nursery-1, nursery-2, kindergarten), 9 subjects,
  3 terms × 10 weeks = **30 units per series**, and
  `flagshipAnnualPilotSeed.js:386` writes
  `content_items: [{ lesson_id, game_config_id, item_id, template, termName, week }]` —
  **exactly ONE game per unit, for every band**.

  Live counts (from `reports/band-count-progress.md` §5, corroborated by the session-close
  walk's "catalog on wire: 1718" = 272+270+272+271+271+362):

  | Child band | Lessons visible | Path units covering them | Cards per unit header |
  |---|---|---:|---:|
  | Nursery 2 | 1085 | ~1080 | **~1.0** |
  | Kindergarten | 1356 | ~1350 | **~1.0** |
  | Primary | 362 | 180 | 2.0 |

  Rendering one "Unit N — …" section per unit would therefore put **~1080 headers over
  ~1085 cards** for a Nursery 2 child — strictly worse than today's grid. Only Primary
  (2 games/unit, 180 units / 362 lessons) gains anything.

- 2026-09-15T14:55Z | FIND | **Repo ≠ prod drift, found while checking (2).** HEAD's plan JSON
  has **no `primary` band**; `git log -S'"primary"' -- <plan json>` returns **empty** — no
  commit ever added one. `git status` shows the plan JSON and the seeder **clean/unchanged**
  vs HEAD. Yet prod serves **1718** lessons, which is exactly the 6-band total including
  Primary 362. So the 09-10 band-count/`Primary`+`Playgroup` ladder work (report §3-§7,
  "1,710 games published", "2 games per week") **is not in this repository** — it exists in
  the live DB and in the untracked report, but the tracked plan + seeder that would
  reproduce it are absent. `reports/band-count-progress.md` is itself untracked.
  Consequence for this brief: unit:card ratios must be read from the **server's** path
  response, never derived from the repo's plan. The design below does that (it groups
  `pathData.path[].units[]` as returned), so the drift is not blocking — but it is a
  reproducibility gap worth its own line item.

- 2026-09-15T14:55Z | STOP | Asked the master which grouping grain to build (literal
  per-unit, per-subject/series, or per-term within the current band) rather than guessing:
  the literal reading produces ~1080 one-card sections and would ship a worse PLAY tab.
  No code written yet.

- 2026-09-15T15:0xZ | DECIDE | Master chose **by subject, in unit order**: one section per
  path series, its cards in path/unit order. Implemented on that basis.

- 2026-09-15T15:0xZ | DONE | `lib/utils/learningPath.ts` — added `groupBySeries(lessons, data,
  band)` (+ `SeriesGroup`/`LessonGrouping` types), the pure grouping the grid now uses. It
  walks `pathData.path[].units[]`, maps lesson_id → (series, unit index), fills each series
  group, sorts inside by **path/unit order** (falling back to `compareCurriculum` for ties
  and for a series the path never ordered — the Primary 2-games-per-unit case), reports only
  the units that actually carry a card, and returns path-less cards separately as
  `uncovered`. Cadence-agnostic by construction: it never assumes a games-per-unit ratio.

- 2026-09-15T15:0xZ | DONE | `tabs/types.ts` — added `HomeSeriesGroup` (seriesId, name,
  category, count, unitsTotal, unitsDone, lessonsDone, lessonsTotal, locked, lockedReason);
  `HomeGridItem.kind` is now `'section' | 'series' | 'lesson'`. Dropped the now-dead
  `seriesIds` / `seriesId` fields (the per-series test-out list they fed is gone).

- 2026-09-15T15:0xZ | DONE | `StudentHome.tsx` — `homeItems` rewritten: subject sections in
  path order, each carrying its own progress + lock state; "Up Next" is now the first
  unlocked/unpassed/unexempt game walking the **sections in order** (so it agrees with what
  the child sees); uncovered path-less games keep a trailing `section` group so nothing
  disappears. Removed the old next/open/locked sections and the per-series `seriesNameById`
  memo, which is dead now that the offer reads `series.name`. Also removed the unused
  `order`/`seriesId` from the `lessonLock` map and the `compareCurriculum` import (ordering
  moved into `groupBySeries`).

- 2026-09-15T15:0xZ | DONE | `tabs/PlayTab.tsx` — renders a `series` item as a subject header
  (flag icon, series name, category chip, `{done}/{total} units`, card count, Locked badge
  or a ✓ when every covered unit is done) and hangs `CheckpointTestOut` on a **locked
  subject**, once, at the section top — correct because the assessment covers every
  unfinished unit of that subject. The `section` branch is now only the uncovered tail.
  `Flag` icon added; `seriesNameById` prop dropped.

- 2026-09-15T15:0xZ | DONE | i18n — one new key `student.home.subjectUnits` = `'{done}/{total}
  units'` in `chunks/en-s.ts`, placed in sorted order (the gate requires every used key to
  resolve; it does not require HA parity). No other keys added — the section titles are
  server data and the rest reuse `student.home.sectionLocked` / `student.home.passed` /
  `HOME_SECTION_LABEL`.

- 2026-09-15T15:0xZ | TEST | `lib/utils/learningPath.test.ts` +6 tests for `groupBySeries`:
  subject grouping + path/unit order restored from a createdAt-DESC input; only covered units
  reported (a chip that kept only Week 2 does not claim Unit 1); path-less games returned as
  `uncovered`, not dropped; an all-filtered subject drops out; two cards in one unit fall
  back to curriculum order (the Primary 2-per-unit shape); no path → everything uncovered.

- 2026-09-15T15:0xZ | VERIFY | `npx tsc --noEmit` **clean**; `npx vitest run` **267/267 in
  21 files** (was 261 before this change — no regressions, includes the i18n key-integrity
  gate and the 22 AST tab-contract tests); `npm run build:staging` **succeeds**, compat-css
  guard passed (PlayTab chunk 14.2 kB → 15.4 kB). `dist.staging` removed afterwards.
  **No push, no deploy** — nothing has been sent to live.

- 2026-09-15T15:0xZ | TODO | Not done, and deliberately so: the brief's "surface each unit's
  overview/summary game and its closure test" (finding (1) — no such rows exist in the API;
  building it would mean inventing a backend concept).

- 2026-09-15T15:2xZ | WALK | Browser walk of the new PLAY sections, run on the staging build
  behind the nginx-mirroring proxy (live still serves `17c0755`, so this exercises the new
  build, not the deploy). Harness: `browser-walk/play-sections.mjs` + a new `mint.mjs`
  (backend's own `generateLoginToken`) + `run-play-walk.sh` (one-shot; kills by PORT, never
  `pkill -f`, which matched and killed the shell on the first attempt). Child
  `EK-Q4-TEST-001` @ SCH-ELITE, read-only GETs, no DB writes; `.token` deleted after the run.
  Full write-up: `browser-walk/REPORT-PLAY-SECTIONS.md`.

- 2026-09-15T15:2xZ | WALK-RESULT | **All assertions pass, zero errors.** Rendered 1718 cards
  / 52 sections / 6 offers = expected 1718 catalog rows / 51 series + 1 path-less / 6 locked
  subjects. Sections by band: Crèche 9, Playgroup 9, Nursery 1 9, Nursery 2 9, Kindergarten 9,
  Primary 6, path-less 1. Cards per section ∈ {30, 60, 8} and they sum to exactly 1718, so no
  card is lost or duplicated. Crèche section leads `W1 → W2 → W3` (unit order restored, not the
  API's `createdAt DESC`). The 6 Primary headers carry `Locked` with `W1` open and `W2-W10`
  locked (server reports 29 of 30 locked); the 45 early-band headers carry no Locked badge. The
  jump-ahead offer appears once per locked subject and nowhere else. **0 console errors, 0
  exceptions, 0 failed requests, 0 non-2xx.**

- 2026-09-15T15:2xZ | WALK-CHIPS | Subject-chip pass over all six rendered chips — a chip that
  empties a subject must drop its header, not leave one promising content. `emptyHeaders = 0`
  for every chip (All1718→52 headers, Numbers214→7, Letters62→2, Colors451→15, Shapes1→1,
  Food210→6), and each chip's card total equals its badge count. `Animals` is absent because
  PlayTab hides a chip whose count is 0 — correct.

- 2026-09-15T15:2xZ | WALK-BUGS | Both bugs the walk found were in the HARNESS, not the app,
  and both are fixed in the script: (a) the classifier tested for an `h3` before
  `.game-card-hover`, and every card carries its own `<h3>` title, so all 1718 cards were
  counted as headers — caught because the assertion was falsifiable (`1770 − 1718 = 52 =
  51 + 1`, i.e. the app was right and the harness wrong); (b) the chip pass matched nothing
  because a chip's `textContent` is `"All1718"` — the `\b` in `^(All|…)\b` never fires between
  `l` and `1`. **No application bug was found by this walk.**

- 2026-09-15T15:2xZ | WALK-FINDING | Not a defect, not changed: for a Primary child the 45
  early-band review sections come FIRST, so their own six subjects and the six jump-ahead
  offers sit ~1350 cards down. Pre-existing (the old flat grid was below-band-first too — that
  is the server's path order, and LEARN deliberately leads with spill-over recovery), and the
  subject chips make it far easier to escape. Reordering PLAY to lead with the child's own band
  is a real improvement but a deliberate design change, so it is flagged, not made silently.

- 2026-09-15T15:0xZ | FLAG | Still open from the session-close snapshot and untouched by
  this change: (a) `GET /kids/lessons` sent all 1718 lessons to admissions 004/109 where it
  capped Demo5 at 1085 — the `visibleLevels()` cap is not holding server-side and the client
  ceiling is the only defence; (b) `PROGRESS.md` (2026-09-09) and `QUEUE.md` (stops at Q47b)
  are stale against the 09-10 → 09-15 work, which lives only in `reports/*-progress.md`.

- 2026-09-15T15:1xZ | DEPLOY | Master authorised the deploy. Committed `8fc1e11` (11 files:
  6 frontend + the two reports + 3 harness files) and pushed `origin main` (`17c0755..8fc1e11`).
  Self-hosted runner picked it up: **backend gate 66 suites / 761 tests all passed**, frontend
  publish SUCCESS, `frontend/dist` → `releases/20260915T151254Z-8fc1e11`, old release pruned.
  Confirmed on the wire: the served main chunk `assets/index-CMaXNfKy.js` contains the new
  `{done}/{total} units` string, so live runs the change.

- 2026-09-15T15:2xZ | LIVE-WALK | Walked **https://elitekids.com.ng** itself (not just staging).
  Same assertions, all pass on the deployed release: 1718 cards / 52 sections / 6 offers; sections
  by band Crèche 9, Playgroup 9, Nursery 1 9, Nursery 2 9, Kindergarten 9, Primary 6, path-less 1;
  cards per section ∈ {30,60,8} summing to 1718; Crèche leads `W1→W2→W3`; all 6 Primary headers
  `Locked` with 60 cards, `W1` open and `W2-W10` locked; 6 offers, one per locked subject; every
  chip drops its empty sections (`emptyHeaders = 0` for all six). **0 console errors, 0
  exceptions, 0 failed requests, 0 non-2xx.** No application bug found on live either.

- 2026-09-15T15:2xZ | **WRITE-FOUND** | The first live run was **NOT read-only**: the dashboard
  fired `POST /kids/economy/streak/record` and it succeeded. That endpoint is real and writes —
  `streak.ts#recordPlayDay` posts it from `StudentHome.tsx:365` on every dashboard mount, and
  `kidsEconomy#recordStreak` runs `UPDATE kids_economy SET streak_current, streak_longest,
  streak_freeze_count, last_play_date, current_multiplier` plus possible `kids_economy_milestones`
  INSERTs. **This corrects the 09-15 session report**, which claimed recordPlayDay "fell back to
  localStorage-only after /kids/streak/record was removed — so nothing was written to their
  records": it checked `/kids/streak/record`; the live path is `/kids/economy/streak/record`,
  never removed and it persists. That session's band walks used two **real children** (004 @
  SCH/28, 109 @ SCH/11), so those visits would have advanced their streaks/last_play_date. My run
  wrote one row for `EK-Q4-TEST-001`, a purpose-built test child. Reported, not buried.

- 2026-09-15T15:2xZ | WRITE-FIX | Harness now aborts that write: `Fetch.enable` intercepts only
  `*streak/record*` (everything else passes through untouched, so nothing can be left paused) and
  the paused request is failed inline in the CDP event handler — NOT in `drain()`, which clears the
  queue and would leave the page stalled. Re-ran live: **`readOnly: true`, attemptedWrites =
  [the POST], blockedWrites = [same], escaped = []** — attempted and aborted before leaving the
  browser. A live walk is now provably read-only.

- 2026-09-15T15:18Z | DOCS | Stale-docs sync (separate brief, no code): added **Q48–Q60** to
  `team-docs/QUEUE.md` covering the 09-10 → 09-15 work that lived only in `reports/*-progress.md`
  (Primary pilot, 5-tab restructure, Play-0, data-ownership audit, jump-ahead checkpoints, PLAY
  sections, ECCE bridge, deploy hardening, crèche commit, crèche audit) plus three OPEN rows —
  **Q58** dashboard-load write, **Q59** server-side band cap, **Q60** repo/prod drift. Rewrote
  `PROGRESS.md` (Last updated 2026-09-15, git sync, a new "Student Experience & Deploy" matrix,
  S9 sprint history, refreshed Next Up ordered by production risk, session-log entries).
  Corrected three claims PROGRESS.md had stale, each VERIFIED not assumed: coturn is `active`
  (was "BLOCKED — needs sudo"), live serves `en-XLaQ_gOp.js`/`ha-COH7dJaP.js` 200 (was "English
  locale NOT DEPLOYED"), and GitHub push works over HTTPS (was "Can't push"). Also verified live
  that the checkpoint + bridge routes answer **401 (mounted)** — they 404'd before `eb9b527`
  reached origin, so the jump-ahead row now reads DEPLOYED rather than schema-ready-only.

STATUS: done + DEPLOYED — PLAY is sectioned by subject in unit order; tsc clean,
267/267 tests, staging build + compat-css guard green, and a browser walk of BOTH the staging
confirms 1718 cards / 52 sections / 6 offers with 0 errors and 0 empty sections on every subject
chip. Design correction to the brief documented above (unit-level sections would be ~1 header per
card — 1350 of 1530 live units hold a single game). Still uncommitted and undeployed. Awaiting a
decision on the stale-docs sync, the PLAY ordering finding, and the server-side band-cap bug —
see FLAG.

--- 2026-09-15T15:36Z · Q67 G6 band ceiling (server-side cap) ---
STEP: root-caused Q59. NOT a data problem and NOT the resolver algorithm —
  `models/Student.js` never DECLARED `class_name`, so Sequelize never selected it and
  `ageBand.resolveBandForAdmission` read `undefined` for every real-school child; the next
  fallback (`class_code` `CLS####`) is deliberately stripped by the normalizer, so no band
  resolved, `kids.js`'s `if (childBand)` skipped the ceiling, and the child got all 6 bands
  (1718). `students.class_name` is populated for 6649/6649 rows — the earlier "empty
  class_name / data problem" diagnosis recorded in Q59 was WRONG and is corrected in QUEUE.md.
STEP: fixed — declared `class_name` + `current_class` (SELECT widening only) and added a
  console.warn to the un-capped branch (the failure had been completely silent in the log).
STEP: new suite test/band-ceiling-sms-students.test.js (5 tests, SMS-school fixture with no
  kids_children row). Mutation-checked: reverting the model fails exactly 2 of 5 — no band, and
  Kindergarten/Primary leaking to a Nursery 2 child. Full gate 67/67 suites · 767/767 tests.
STEP: measured against real data (read-only): 004 null→Nursery 2, 1718→1085; 109 null→Kindergarten,
  1718→1356; Demo5 Nursery 2(declaration)→Nursery 1(class), 1085→814 (class outranks declaration
  by design). Both 004 and 109 also stop 400-ing on /kids/learning-path.
FLAG: NOT DEPLOYED (git push origin main is the deploy; needs an explicit order). Demo5 narrowing
  1085→814 is the one behaviour change. Never-empty widening still drops the ceiling by design.
EVIDENCE: team-docs/reports/g6-band-ceiling-model-fix-2026-09-15.md
