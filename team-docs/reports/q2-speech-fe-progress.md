# Q2 speech FE leaf (Q25) — progress (Buffy, 2026-09-03)

Lane: opencode was confirmed UNAVAILABLE → Buffy (worker) took over the queued
opencode lane per ZERO-IDLE (briefs/q2-opencode-lowdep.md: Q25 → Q26).

## Q25 — Pronunciation Coach + ReadingTracker: DONE

- `frontend/src/lib/utils/speechRecognition.ts` (new) — shared `getRecognition()`,
  `isSpeechSupported()`, `stopRecognition()`; SpeechGame.tsx untouched (Q24 owns it).
- `frontend/src/lib/utils/speechCoach.ts` (new) — pure helpers, all exported:
  `buildCoachPack`, `bandForScore` (backend band parity 85/65/40), `minutesLabel`,
  `readingMinutes` (passing attempts only), `todayRollup`, `readingStreak`
  (consecutive days; today-not-read-yet tolerated; gaps break).
- `frontend/src/components/PronunciationCoach.tsx` (new) — per-item mic/typed →
  POST /kids/speech/assess → banded feedback (word/letter accuracy + fluency bars,
  stars) + "try again" (fail) vs "next" (pass) loop; big child-safe buttons.
- `frontend/src/components/ReadingTracker.tsx` (new) — read-a-thon: per-item pass
  chips, minutes read today (session), streak spark + today rollup from
  GET /kids/speech/progress (live endpoint, no backend edits).
- `frontend/src/pages/Student/SpeechPractice.tsx` — sub-tabs Practice / Coach /
  Tracker (less intrusive than StudentHome header, per brief).
- i18n: 16 `speechCoach.*` + 16 `readingTracker.*` keys in en.ts + en.json + ha.json
  (real Hausa, no English fallbacks); zero raw-key leaks verified.
- Tests: `speechCoach.test.ts` 11 tests (pack determinism/clamp, band parity,
  minutes, rollup, streak edge cases). Full suite: **128/128 pass**, tsc clean,
  `vite build` OK.

## i18n chunk refactor (user-requested while adding keys)

- `en.ts` (1390 lines, unsorted) → `frontend/src/lib/i18n/chunks/en-a-c.ts` …
  `en-w-z.ts` (9 alphabetically-SORTED per-letter-range files) + `en.ts` barrel.
- Values byte-identical (verified programmatically 1257/1257). Bonus: recovered a
  hidden same-line key `gameSceneEditor.addScene` that was missing from en.json
  (stale-mirror finding C5) — en.json now 1257 keys, fully in sync.
- `frontend/scripts/chunk-i18n.cjs` (new, re-runnable splitter) +
  `frontend/scripts/sync-i18n.js` fixed (was `require` in a `"type":"module"`
  package — now ESM `import.meta.dirname`, reads chunks/ dir).
- Build still code-splits locales (`en-*.js`, `ha-*.js` lazy chunks).

## CHECKPOINTS
- 2026-09-03 23:2x: Q25 implemented; tsc + vitest 128/128 + build green; i18n keys
  verified in all three files.
- 2026-09-03 23:4x: i18n chunked + synced; QUEUE.md Q25 → DONE (Buffy takeover).

## Q26 — Drawing FE components (Q2-G): DONE
- `lib/utils/drawing.ts` (new) — pure geometry: dist, pointSegmentDist/Path,
  resampleStroke (rate-independent), strokeCoverage (on-line %), bboxIoU,
  scoreDrawing (coverage 0.8 + IoU 0.2 → stars 1–3 + emoji), normalizeStroke,
  TRACE_PATHS catalog (circle/square/triangle/star/heart + digits 0–9),
  DEMO_TRACES. All pure + exported for Q2-C reuse.
- `components/DrawingCanvas.tsx` — DPR-aware canvas, pointer (mouse+touch),
  stroke color/width, clear/undo toolbar, emits NORMALIZED strokes via onStroke.
- `components/TracingGuide.tsx` — ghost SVG polyline guide + live on-line %
  per stroke (strokeCoverage); forwards strokes to parent.
- `components/DrawingFeedback.tsx` — deterministic score card: stars, emoji,
  %, try-again vs next.
- `pages/Student/DrawingPractice.tsx` + `/student/drawing?mode=demo` route
  (AuthGuard + LazyRoute). i18n `drawing.*` 13 keys EN+HA. NO backend/ML.
- Tests: `drawing.test.ts` 17 tests. Full suite 145/145, tsc clean, build OK.

## Q27 — speech-story + speech-count templates (Q2-B 5/5): DONE
- `backend/src/controllers/kids.js` VALID_TEMPLATES += speech-story/count.
- `backend/database/fix-template-enum.js` → 15 enum values (idempotent guard).
- `GameCreator.tsx`: 2 template cards (BookOpen/Hash) + audio/audio modes +
  config templates (story = 3 sentences; count = number words).
- `GamePlay.tsx`: speechModeFromTemplate — story → sentence, count → word.
- i18n `gameCreator.tpl.speechStory/Count.*` EN+HA. Q2-B now 5/5.

## Q29 — Portfolio FE (SkillMap + EvidenceGallery + export): DONE
- `components/SkillMap.tsx` — mastery bands (new→mastered), summary, backend
  recommendations (support/focus/strength/celebrate), empty state.
- `components/EvidenceGallery.tsx` — speaking + games rollups + 7d weekly
  strip + recent items; empty state.
- `ParentDashboard.tsx` child view — fetches GET /kids/portfolio/:childId on
  entry (additive; progress view unaffected), renders SkillMap + EvidenceGallery,
  export button → /kids/portfolio/:childId/export as JSON download.
- i18n `portfolio.*` 23 keys EN+HA (real Hausa).

## Product UX fixes (user-dispatch, this session)
- **LearningPath empty state dead-end:** icon + hint pill are now buttons →
  subjects tab (`onExploreSubjects` → setActiveTab('numbers')); subject pills
  keep at least ONE visible even at 0 in-band lessons (no more 'no subject').
- **"check back soon" removed** (realtime SPA, not server-rendered):
  - `student.path.emptyBody` → 'refreshing automatically'
  - NEW `student.path.emptyCountdown` — live 20s auto-refresh loop (onRefresh=
    loadData) + caution 'may take more than estimated time'
  - `student.home.noGamesBody` + `parent.noLessons` de-futured likewise.
  EN + HA.

## CHECKPOINTS (continued)
- 2026-09-03 23:5x: Q26 + Q27 done (drawing + speech-story/count); backend
  suite back to 499/2 baseline (q1-integration fixed for chunked en.ts).
- 2026-09-04 00:0x: Q29 portfolio FE + i18n; UX fixes (subjects shortcut,
  realtime countdown); tsc clean, vitest 145/145, build OK.

## Empty-state classification (user clarification, 2026-09-04)
- **Truly-empty catalog (absence of data)** = `lessons.length === 0` → restored
  static "check back soon" copy (`student.home.noGamesBodySoon` +
  `student.path.emptyBodySoon`), NO countdown, NO explore shortcut (dead ends).
- **Age-bracket empty (data exists, nothing in-band)** = NEVER allowed; countdown
  copy now says the ENGINE IS GENERATING A PERSONALIZED ASSESSMENT to place the
  child on the right track (`student.path.emptyBody`/`emptyCountdown` reworded,
  EN+HA) + caution "may take more than estimated time".
- Implemented via `catalogEmpty` prop on LearningPath (computed in StudentHome).
- **NEVER-EMPTY spec section** added to TECH-SPEC-LEARNING-PATH.md §5.1: invariant
  (data present ⇒ never empty), Class A/B/C classification table, bug contract
  (Class-B filed against engine/placement layer, never static-copy'd), status
  note + acceptance checklist item.

**FINAL STATUS:** Q25/Q26/Q27/Q29 IMPLEMENTED + verified (tsc, vitest 145/145,
build OK; backend 499/2 baseline). Empty-state classification + NEVER-EMPTY
spec done. Queue fully dispatched. ALL uncommitted work (fc919ae + this
session) pushed in one commit per MASTER order — see git log.
- 2026-09-04 00:2x: pushed c74d9ae (40 files) to origin/main — deploy
  auto-runs (backend tests + frontend build) via self-hosted runner.
  IDLE: lane exhausted; next per ZERO-IDLE would be new QUEUE row.