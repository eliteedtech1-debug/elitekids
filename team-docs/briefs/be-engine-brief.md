# BRIEF — L1-BE: Backend Engine & Content (G1–G7 backend half)

**Dispatched:** 2026-09-03 · **Agent:** opencode worker (tmux `phaseG1`) · **Lane:** L1-BE
**Source specs (read first):**
- `team-docs/TECH-SPEC-STORY-GAMES-100PCT.md` (Phases A–D backend tasks)
- `team-docs/TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` (Phases 1–3 backend tasks)
- `team-docs/TECH-SPEC-LEARNING-PATH.md` (Phases 1 backend tasks)
- `team-docs/EXECUTION-PLAN-BRIDGE-ALL-GAPS.md` (lane/file ownership)
**Compliance:** C1/C2/C4/C5/C7. You own `backend/src/**`, `game-engine/schemas/**`,
`backend/test/**` — do NOT touch `frontend/**` (L2-FE owns it), `docs/**`, `team-docs/**`
(you write ONLY to `team-docs/reports/be-progress.md`).

## RUN-RULES (mandatory, from SESSION-PLAYBOOK)
1. NEVER open `.env` with Read tools — bash grep/cut only.
2. CHECKPOINT after every step: one line (UTC timestamp + done-what) appended to
   `team-docs/reports/be-progress.md`. Assume your session dies ~30–60 min; resume = read
   your last checkpoint and continue.
3. Small tool calls; no blocking wait >60s.
4. **NEVER git commit or push.** MASTER merges. Keep working tree changes for review.
5. Schema changes: append-only ENUMs / additive defaulted columns only (C2); kids tables
   never in shared DBs (C1). Run hermetic tests (`scripts/run-tests.sh` regression suite)
   before declaring a phase done.

## Phase 1 — Registry/ENUM cleanup (foundation)
- Realign template ENUMs to the full list (7 existing + `label-diagram` + `stage-sequence`)
  **append-only** in: `backend/src/models/KidGameConfig.js`, `backend/test/helpers/test-db.js`,
  `backend/test/test-db.js`. Confirm current drift first (model ENUM = 4 values; hermetic = 6,
  missing `memory-pairs`).
- NOTE (MASTER product decision 2026-09-03): `clock-reading` is NOT a template of its own.
  The learning category is **`stage-sequence`**: an ORDERED queue of step graphics, simple →
  complex (never random) — clock progression 1:00→3:15→3:45, human lifecycle
  infant→adult→old age, plant seedling→harvest — plus a closing `assessment[]`. AnalogClock
  SVG is a step/check graphic kind inside stage-sequence (and an optional quiz visual).
- Extend `VALID_TEMPLATES` (`controllers/kids.js:672`), `contentGeneratorService.js` list +
  promptMode/responseMode maps (label-diagram → text→image; stage-sequence → image→text),
  `pedagogyValidator.js`, `test/helpers/game-config-invariant.js` rounds map.
- **Exit:** full suite still at baseline (2F/355P — C-DEBT-01/02 only); regression 25/25.

## Phase 2 — New template schemas + validation
- Write `game-engine/schemas/label-diagram.schema.json` + `stage-sequence.schema.json` from
  the config shapes in TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES §4–§5.
- Save-time validation in `createLessonManual` (`controllers/kids.js`): label-diagram needs
  `diagram.image` + ≥5 hotspots w/ unique labels + labelBank; stage-sequence needs ordered
  `steps[]` (≥3, simple→complex; each step graphic kind image/analog-clock/emoji with the
  matching required field) + `assessment[]` (≥1) w/ valid `time` strings for analog-clock
  steps/checks. Return 400 with field detail, never silent degrade.
- **Exit:** schema-valid configs save; invalid ones 400; node --check clean.

## Phase 3 — Scene engine backend (story visual layer)
- Validate v2 scenes on save (types incl. `intro/teach/reinforce/recap/game_checkpoint`,
  durationSec 3–60, gameId required iff checkpoint); write real `scene_type` from canonical
  `type` (today GUI sends `type`, backend reads `sceneType` → always 'teach').
- Pass-through v2 fields in `toRuntimeGameConfig`, `getGamePreview` (`kids.js:859`),
  `getPublishedScenes`.
- `GET /kids/scene-library` (auth+requireStaff): approved backgrounds (`farm-daytime`,
  classroom, garden, kitchen, space) + characters with emoji fallbacks — seed data file
  `backend/src/seeders/sceneAssetsSeed.js`.
- `GET /kids/story-templates?template=matching` (auth+requireStaff): arc + 3–5 scene-card
  scaffolds per game type (mirror guide table in `docs/teacher-game-maker-guide.md`).
- **Exit:** curl as staff returns library + templates; preview returns v2 scenes; scene_type
  column round-trips; `b2-story.test.js` cases green.

## Phase 4 — Learning-path + age isolation + goals backend
- Server-side `classToAgeLevel()` (port mapping from `StudentHome.tsx:105`; Year 3 → KG1,
  Year 4 → KG2, Year 5 → Primary) + **hard band ceiling** in the student lessons path: never
  return a lesson whose `age_level` is above the child's band. Remove the client fallback
  dependency — isolation must hold even if client is edited.
- `GET /kids/learning-path?student_id=` (`kidsSeries.js`): series → units (ordered) →
  lessons w/ per-lesson state (`none/practice_done/passed/completed` from KidProgress +
  KidTestAttempt), unit locks reusing the E3f gate logic (`getUnitLockStatus`, `kidsSeries.js:348`),
  spill-over labeling for lower-band unfinished units, batch queries (no N+1).
- New `backend/src/models/KidLearningGoal.js` (C2 additive, kids DB) + boot reconcile in
  `models/index.js` + `GET /kids/goals/:admissionNo`, `POST /kids/goals/:admissionNo`
  (target_count, set_by child|teacher|auto) with lazy weekly auto-init (default target 1).
- Routes appended at end of `routes/kids.js` register block.
- **Exit:** hermetic test `b3-learning-path.test.js`: KG1 request returns ZERO KG2/Primary
  lesson ids; spill-over rows correct; lock gate honored; goal CRUD + weekly rollover green.

## Phase 5 — Content (one topic per unit)
- Split `animalsNumbersExpansionSeed.js` U10 "Money and Time Basics" into a **U10a–f series**
  per guide rule: Basic Time & Watch (o'clock) → Money — Coins → Intermediate Time (:15/:30/:45)
  → Naira Notes → Advanced Watch → final story unit connecting money↔time ("saving ₦X/hr over N
  hrs"). Time units are `stage-sequence` lessons (AnalogClock frames o'clock → :15 → :30 →
  :45, simple→complex, closing clock checks); no unit mixes 2 topics.
- Label-diagram sample lessons: Human Body (Nursery, 6–8 parts), Tree/Plant (KG1), Car (KG1,
  incl. appliances later) with real diagram art URLs (B2 media pipeline) + emoji fallback.
- **Exit:** seeds run clean; series/units visible in `/kids/learning-path` for a test child;
  one-topic-per-unit test asserts isolation.

## Finish
Append FINAL status line to `team-docs/reports/be-progress.md` (what shipped per phase,
what remains, next checkpoint) and STOP — MASTER polls.
