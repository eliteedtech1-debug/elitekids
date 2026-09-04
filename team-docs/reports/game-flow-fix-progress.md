# Game-Flow Fix Progress (Q3-n + Issue3/2/1)

Scope: 3 live-game UX bugs. Decisions (2026-09-04, via team lead):
- Issue 3: **test-pass alone unlocks** next unit (drop raw practice requirement).
- Issue 2: **Full TikTok flow** — practice → pass → Test → pass → auto-next; hide Test until practice done.
- Issue 1: **Hide daily/weekly review + strengthen** when child has no qualifying game data.

## Milestones
- [x] Backend gate fix applied in `kidsSeries.js` at 4 sites: `getLearningPath` (lessonComplete → testPass only), `getCurriculum` (same predicate), `getUnitLockStatus` (predicate + reason copy), legacy item path already test-based. Reason strings updated ("pass the Test"). `node --check` OK. Backward-compatible with `e3f-practice-test-gate.test.js` (test alone already what it asserts for completion; practice-only still NOT complete).
- [x] Issue 2: GamePlay TikTok flow — path fetch (ownLessonState + nextLessonRef), Test tab hidden until practice_done (children only), result-phase next action (practice→"Test →", test-pass→auto-advance to next lesson + "Next: <title>" button after 3.5s). `tsc` clean for GamePlay.tsx.
- [x] Mobile smart-sizing (user idea, applies broadly): in `QuizGame`, image-question/image-option games (e.g. animal games) now stack options 1-per-column on mobile and enlarge question image + option images. Scoped to `promptMode==='image'` + `responseMode==='image'`; other games unchanged. No options removed.
- [x] Issue 1: gate ReviewZone/RevisionCard on StudentHome mount.
  - `ReviewZone.tsx`: hides ENTIRE section when no due reviews AND no review history (brand-new children see nothing) — guard after load.
  - `RevisionCard.tsx`: already returns null when no failed items/nudges (strengthen + weekly hidden for no-data children) — no change needed.
  - `ReviewDueBadge.tsx`: already self-hides at dueCount 0; consistent with ReviewZone (badge only shows when due>0, which guarantees ReviewZone renders).
  - Verified: `tsc --noEmit` = exactly 5 errors, all pre-existing Q3 freebuff (hands-off); zero added by Issue 1/2/bonus changes.
- [x] Verified: `node --check kidsSeries.js` OK; `tsc --noEmit` clean for GamePlay (only 5 pre-existing Q3 freebuff errors remain, hands-off).

## Test DB — unblocked (2026-09-04)
- Creds stored in git-ignored `backend/.env.test` (TEST_DB_HOST/PORT/NAME/USER/PASSWORD). Never in commands/repo.
- `backend/.env.test` + `.env.mvp-backup-20260901` removed from git tracking; `.gitignore` now ignores `.env.*` (keeps `.env.example`).
- `test/setup-env.js` + `test/helpers/test-db.js` load `.env.test` if present (CI/env still wins).
- Verified DB connect: MySQL 8.0.46 @127.0.0.1, `elite_kids_test` schema present. `ensureTestDb()` seeds in ~5.5s.
- **e3f-practice-test-gate.test.js: PASS 4/4** (runInBand). Confirms Issue 3 backend fix backwards-compatible: practice-only stays locked, <50 not a pass, test-only completion, ≥50 pass unlocks. (Leaderboard console.error noise is non-fatal — caught, never breaks game flow.)
- Full related suite fired in background -> `/tmp/opencode/gameflow-tests.log` (series-units, curriculum, b3-learning-path, e3f, marketplace, mailer).

## Definitive test results (2026-09-04, creds from .env.test)
| Suite | Result | Notes |
|---|---|---|
| e3f-practice-test-gate | ✅ 4/4 | Validates Issue 3 unlock fix (backwards-compatible) |
| marketplace | ✅ | My Q4 |
| mailer | ✅ | My Q4 |
| series-units | ✅ | |
| curriculum | ✅ | |
| b3-learning-path | ❌ 6 fail | **PRE-EXISTING** infra gap — test DB missing `allow_anonymous_comparison` column (`getLearningPath error: Unknown column 'allow_anonymous_comparison'`, kidsSeries.js:718 catch). test-db.js seeds 0 refs to that column. Age-isolation/cross-child 403-vs-500 tests only. NOT caused by any of my changes (Issue 1/2/3, mobile, Q4). |

Bottom line: all suites covering MY changes PASS. The only failing suite is a pre-existing test-DB schema mismatch in b3-learning-path (age isolation), outside my scope. To fix that suite later: add the missing columns to `test/helpers/test-db.js` seed schema (or run migrations) — requires a schema-seeding change to the test harness.
