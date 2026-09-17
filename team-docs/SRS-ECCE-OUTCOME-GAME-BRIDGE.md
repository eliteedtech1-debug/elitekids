# Software Requirements Specification — ECCE Outcome-to-Game Bridge

**Product:** EliteKids  
**Version:** 1.0 planning baseline  
**Date:** 2026-09-04  
**Status:** Ready for phased implementation planning; not a deployment authorization  
**Primary constraints:** zero-funding startup, dedicated kids database, additive/defaulted schema changes, offline/low-bandwidth operation

## 1. Scope

This SRS defines the bridge from a curriculum outcome to a classroom lesson, a game or game-chain, evidence and a next teaching step.

### In scope

- Outcome and weekly learning-cell metadata.
- Teacher-facing lesson bridge creation and review.
- Game and game-chain alignment with one primary objective.
- 5–10 playable items per standalone component and flexible oversized-topic splitting.
- Concrete-to-abstract representation metadata and follow-up links.
- Separate digital game evidence and teacher observation evidence.
- Teacher/parent-safe summaries and child-friendly engagement behavior.
- Coverage reporting by class, term, week, subject and outcome.
- Offline-safe child gameplay and idempotent evidence synchronization.

### Out of scope for the first implementation

- Clinical/developmental diagnosis or age estimation.
- A composite intelligence, readiness or developmental score.
- Paid analytics, paid AI tutoring or a new real-time infrastructure service.
- Mandatory child speech recognition for mastery.
- Photo/video evidence storage before consent, retention and storage rules are approved.
- Replacing the existing lesson/game approval state machine.
- Replacing the existing series/unit prerequisite engine.

## 2. Actors and permissions

| Actor | Allowed actions |
|---|---|
| Curriculum editor/ECCE reviewer | Define outcomes, review objective/evidence language, approve curriculum mapping |
| Teacher | Select/adapt an outcome, create lesson bridge, author/assign game, record observations, write next step, view own class |
| School/admin reviewer | Review and publish/reject lesson bridge and game content for their school |
| Child/student | Play only published and entitled content within age/path/lock rules; no access to private teacher notes |
| Parent/guardian | View a plain-language, child-scoped summary and safe home connection; never private class comparisons |
| Platform service | Validate schemas, safety, item load, age fit, prerequisites and idempotency |

All endpoints touching child data require JWT authentication and child ownership/staff authorization. New kids-domain records are stored in the dedicated kids database, never the shared school DB.

## 3. Product principles

1. One primary objective per lesson.
2. Concrete experience before symbolic demand.
3. Recognition before unsupported recall/production.
4. A game score is evidence, not a diagnosis.
5. A game-chain is a lesson container, not a single oversized game.
6. Every standalone component contains 5–10 meaningful playable items; chain component counts are independent.
7. Larger topics split into meaningful ordered modules/units; there is no fixed number of units.
8. Age/load can adapt upward with readiness but never through meaningless filler.
9. Child engagement must be joyful, predictable, inclusive and low pressure.
10. The teacher remains the professional decision-maker for context and next steps.

## 4. Target architecture

```text
Curriculum source/outcome
        │
        ▼
Outcome record + observable actions
        │
        ▼
Weekly learning cell (class × term × week × subject)
        │
        ├── concrete activity, vocabulary, differentiation, home link
        ├── game plan / game-chain components
        └── assessment and evidence plan
                    │
                    ▼
        Teacher review → schema/safety/pedagogy review → publish
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   Child plays             Teacher observes offline
   game/chain               and records evidence
        │                       │
        └───────────┬───────────┘
                    ▼
          Outcome evidence bundle
                    │
                    ▼
        Plain-language summary + next step
```

### 4.1 Existing systems to reuse

- `KidCurriculumPoint` for the current curriculum library seed.
- `KidLesson` and `KidGameConfig` for lesson/game identity and publish state.
- `KidGameSeries`/`KidGameUnit` for ordered modules and prerequisite locks.
- `KidProgress`/`KidGameItemResponse`/`KidMasteryProgress` for digital evidence.
- `KidEngagementSnapshot` and `KidSessionState` for session/reliability signals.
- Existing scene, companion, garden, accessibility, offline and approval flows.

### 4.2 New thin bridge entities

The preferred implementation uses new kids-owned models rather than changing the meaning of existing tables.

#### `kids_lesson_bridges`

One row per lesson's professional planning bridge.

```text
id                         string PK
lesson_id                  string NOT NULL, unique per active bridge
outcome_id                 string NOT NULL
school_id                  string nullable/defaulted according to existing tenant model
class_label                string NOT NULL
age_band                   string NOT NULL
term_name                  enum/string: First Term | Second Term | Third Term
week_number                integer 1..10
subject_id                 string NOT NULL
strand                     string nullable
sub_strand                 string nullable
objective                  text NOT NULL
micro_objectives           JSON array, 2..4 action statements
success_evidence           JSON array, 2..4 observable statements
evidence_routes            JSON array: point|gesture|movement|speech|home_language|sign|AAC|drawing|mark-making
previous_experience        text nullable
concrete_experience        text NOT NULL
guided_play                JSON/text nullable
transfer_activity          text nullable
differentiation            JSON nullable
vocabulary                 JSON nullable
home_connection            text nullable
assessment_plan            JSON/text NOT NULL
follow_up_type             string nullable
reinforcement_of          JSON array nullable
representation_sequence    JSON array nullable
grouping                   JSON nullable
item_range                 string nullable
game_plan                   JSON NOT NULL
scene_plan                 JSON nullable
status                     enum draft|ready_for_review|approved|published|recalled, default draft
created_by                 string NOT NULL
approved_by                string nullable
approved_at                datetime nullable
created_at                 datetime default now
updated_at                 datetime default now
```

`game_plan` must identify at least one game seed/config and the role of each component. A `game-chain` plan must identify ordered components and must not be counted as a way to hide missing weekly coverage.

#### `kids_teacher_observations`

One row per dated teacher/caregiver observation of a child against a bridge/outcome.

```text
id                         string/bigint PK
child_admission_no         string NOT NULL
lesson_bridge_id           string NOT NULL
lesson_id                  string NOT NULL
outcome_id                 string NOT NULL
observer_id                string NOT NULL
observation_level          enum independent|with_prompt|emerging|not_yet_observed|not_applicable
response_route              enum point|gesture|movement|speech|home_language|sign|AAC|drawing|mark-making|mixed
prompt_level               enum none|model|gesture|verbal_clue|two_choices|full_support
context                    string nullable (classroom, outdoor, home report, small group)
note                       text nullable
next_step                  text NOT NULL
work_sample_ref            string nullable; no file upload required in MVP
observed_at                datetime NOT NULL
created_at                 datetime default now
updated_at                 datetime default now
```

Do not store sensitive diagnosis labels. Do not make `score` a required field. A teacher may record an observation even if the child did not play the game.

#### Optional later entity: `kids_outcome_evidence_events`

Defer until the first two entities and APIs prove insufficient. Existing `KidProgress` and `KidGameItemResponse` are enough for the first digital evidence slice.

## 5. Canonical API contracts

All responses use the existing shape `{ success: true, data }` or `{ success: false, message, errors? }`.

### 5.1 Outcome/library discovery

```http
GET /kids/learning-outcomes?age_band=Nursery%202&subject_id=numeracy
```

Response data:

```json
[
  {
    "id": "outcome-numeracy-quantity-01",
    "source": "NERDC/ECCE reviewed",
    "age_band": "Nursery 2",
    "subject_id": "numeracy",
    "strand": "Number",
    "sub_strand": "Quantity",
    "statement": "Represent quantities using objects and marks.",
    "observable_actions": ["counts each object once", "matches a group to a numeral"],
    "suggested_representations": ["objects", "counting-marks", "numeral"]
  }
]
```

### 5.2 Lesson bridge

```http
POST /kids/lesson-bridges
GET  /kids/lesson-bridges/:id
PATCH /kids/lesson-bridges/:id
POST /kids/lesson-bridges/:id/submit-review
```

Create request must include:

```json
{
  "lesson_id": "lesson-123",
  "outcome_id": "outcome-numeracy-quantity-01",
  "class_label": "Nursery 2",
  "age_band": "Nursery 2",
  "term_name": "First Term",
  "week_number": 3,
  "subject_id": "numeracy",
  "objective": "Match a group of five objects to numeral 5.",
  "micro_objectives": ["counts objects one-to-one", "says or shows the total", "matches numeral 5"],
  "success_evidence": ["touches each object once", "matches independently or with a prompt"],
  "evidence_routes": ["point", "speech", "home_language", "drawing"],
  "concrete_experience": "Count five bottle tops or fruit pieces with an adult.",
  "game_plan": { "minimum_games": 1, "components": [{ "template": "matching", "role": "quantity to numeral", "item_count": 6 }] },
  "assessment_plan": { "child_test": "optional picture check", "teacher_observation": "required" },
  "follow_up_type": "new-representation",
  "reinforcement_of": ["seed-count-1-5"],
  "representation_sequence": ["objects", "counting-marks", "numeral", "number-name"],
  "grouping": { "bundle_size": 5, "show_boundaries": true },
  "home_connection": "Count five safe household objects together."
}
```

### 5.3 Teacher observations

```http
POST /kids/observations
GET  /kids/observations?child_admission_no=X&lesson_bridge_id=Y
GET  /kids/learning-summary/:childAdmissionNo?subject_id=numeracy
```

Request:

```json
{
  "child_admission_no": "CHILD-01",
  "lesson_bridge_id": "bridge-123",
  "observation_level": "with_prompt",
  "response_route": "point",
  "prompt_level": "verbal_clue",
  "context": "small-group table activity",
  "note": "Counted five bottle tops accurately after touching each one.",
  "next_step": "Repeat with six objects and introduce a grouped five bundle."
}
```

### 5.4 Coverage

```http
GET /kids/coverage?class_label=Nursery%202&term_name=First%20Term&week_number=3
```

Coverage must distinguish `planned`, `drafted`, `schema-valid`, `safety-reviewed`, `ece-reviewed`, `published`, `observed`, `deferred` and `blocked`.

## 6. Functional requirements

### FR-01 Outcome selection

The teacher can select a reviewed outcome by age band and subject, see observable action suggestions and start a bridge draft.

**Acceptance:** An unknown outcome cannot be attached by trusting a client-supplied label alone. The server validates the outcome ID and school/staff access.

### FR-02 One-objective lesson bridge

A bridge must have exactly one primary objective and 2–4 micro-objectives/evidence statements.

**Acceptance:** Missing objective, empty evidence or more than four micro-objectives returns HTTP 400 with field-level errors.

### FR-03 Concrete-first plan

The bridge must record a real-world experience before a digital game plan.

**Acceptance:** `concrete_experience` is required for Nursery and older; Crèche/Playgroup uses an adult-led sensory/activity description. A game cannot be submitted for review without it.

### FR-04 Game alignment

Each bridge has at least one valid game seed/config. The linked game must use the same subject, age band and primary objective metadata.

**Acceptance:** A mismatched or missing game returns a publish-blocking error. A scene/story alone does not satisfy the weekly game requirement.

### FR-05 Standalone item load

Every standalone component is 5–10 logical playable items. Matching/memory count logical pairs; chain totals are reporting only.

**Acceptance:** Backend and frontend reject 4 or 11 items with a clear error. A valid chain with five components of six items each is accepted. A nested chain is rejected.

### FR-06 Oversized topic splitting

When content exceeds the age-appropriate item load, the authoring response must recommend ordered modules/units with stable metadata.

**Acceptance:** A 1–100 counting plan stores series ID, unit/module number, bounded item range, prerequisite and representation metadata. No rule forces five units.

### FR-07 Follow-up representation

A follow-up lesson can link to an earlier seed and declare the representation transformation.

**Acceptance:** `new-representation` requires `reinforcement_of` and `representation_sequence`; the review view explains what was previously taught and what changes.

### FR-08 Ordered game-chain

A game-chain plays components in stored array order and does not write duplicate child progress for embedded components.

**Acceptance:** The chain renderer preserves order; puzzle-split can be a component; total chain count is not validated as a standalone 5–10 game; no nested chain; completion is recorded once for the lesson/unit container according to the chosen policy.

### FR-09 Teacher observation

A teacher can record evidence separately from a game score.

**Acceptance:** A saved observation includes child, outcome, context, level, response route, prompt level and next step. A child may have multiple dated observations. Teachers can edit their own observation; parents/children cannot.

### FR-10 Evidence summary

Teacher summary combines digital evidence and observation evidence without a composite score.

**Acceptance:** Summary uses neutral language and includes “what was seen”, “support used” and “next step”. It never says a child is weak, delayed, gifted or below peers.

### FR-11 Child engagement

Game surfaces expose story purpose, supportive feedback, retry, predictable controls, audio replay and a natural stopping point when the template supports them.

**Acceptance:** QA verifies no harsh wrong-state copy, no forced timer in Learning mode, no loss of prior progress after retry and accessible fallback when media is missing.

### FR-12 Offline and sync

Child game payloads, session state and progress can work offline; evidence/progress sync is idempotent.

**Acceptance:** Disconnect after content download, complete a game, reconnect and sync once. Replaying the same idempotency key does not duplicate progress or observation records.

### FR-13 Publish gate

A lesson is child-visible only after content, bridge, safety and human review gates pass.

**Acceptance:** API returns a list of blocking gates. Published child endpoint excludes draft/recalled bridge or game content.

### FR-14 Privacy and tenancy

All records are tenant-scoped and child-scoped. No new shared database table is created.

**Acceptance:** Cross-school and cross-child requests return 403; model sync targets the dedicated kids DB; no secret or private teacher note appears in child/parent payloads.

## 7. Phase-based implementation plan

### Phase 0 — Contract and reconciliation

**Goal:** Make the existing system internally consistent before new feature work.

Tasks:

1. Confirm one canonical API age-band representation and add display mapping.
2. Resolve duplicate `/kids/curriculum` route contracts.
3. Reconcile playable collection shapes for every template.
4. Confirm one authoritative unit unlock rule and update comments/tests/UI copy.
5. Remove or explicitly constrain the broad age fallback so strict isolation cannot leak higher-band content.
6. Add contract fixtures for the lesson bridge, chain and observation shapes.

Files:

- `backend/src/models/KidGameConfig.js`
- `backend/src/services/gameConfigRules.js`
- `backend/src/controllers/kids.js`
- `backend/src/controllers/kidsSeries.js`
- `backend/src/routes/kids.js`
- `game-engine/schemas/*.schema.json`
- `frontend/src/lib/types/game.ts`
- `frontend/src/lib/game/gameChain.ts`
- tests under `backend/test/` and `frontend/src/**/*.test.ts`

Exit criteria:

- One documented value for each age band.
- One curriculum endpoint contract.
- Every template has one tested playable-item counter.
- No chain/series rules contradict each other.

### Phase 1 — Professional lesson bridge MVP

**Goal:** A teacher can turn one reviewed outcome into one complete weekly lesson plan record.

Tasks:

1. Add `KidLessonBridge` model in the kids DB with defaulted/null-safe fields.
2. Add bridge controller/routes and request validation.
3. Add bridge fields to the teacher authoring flow or create a focused `LessonBridgeEditor`.
4. Link bridge to existing `KidLesson`, `KidCurriculumPoint`, game config and optional series/unit.
5. Add concrete activity, evidence route, differentiation, home link and representation fields.
6. Add API/client types and a read-only teacher review panel.

Files:

- New: `backend/src/models/KidLessonBridge.js`
- New: `backend/src/controllers/kidsLessonBridges.js`
- `backend/src/models/index.js`
- `backend/src/routes/kids.js`
- New: `frontend/src/components/LessonBridgeEditor.tsx`
- `frontend/src/pages/Teacher/GameCreator.tsx`
- `frontend/src/lib/api/endpoints.ts`
- curriculum framework docs

Exit criteria:

- Teacher saves a bridge with one objective, evidence, concrete experience and one game plan.
- Draft bridge is not child-visible.
- Validation messages identify the exact missing field.
- No paid service or new shared-DB table is required.

### Phase 2 — Game alignment and chain authoring

**Goal:** The game delivers the lesson objective rather than merely attaching a game by title.

Tasks:

1. Add objective/bridge identifiers to the game review payload without duplicating authoritative text.
2. Make `GameConfigEditor` offer item-count guidance and the correct canonical collection shape.
3. Add a visual chain builder: add component, choose template, configure, reorder, preview, remove.
4. Validate each component with the existing schema/rules and prohibit nested chains.
5. Add representation/follow-up controls for numeracy and other registered categories.
6. Connect story checkpoint metadata to the bridge objective.

Files:

- `frontend/src/components/GameConfigEditor.tsx`
- `frontend/src/pages/Teacher/GameCreator.tsx`
- `frontend/src/lib/game/gameChain.ts`
- `game-engine/schemas/game-chain.schema.json`
- `backend/src/services/gameConfigRules.js`
- `backend/src/controllers/kids.js`
- `backend/src/services/contentGeneratorService.js`
- `backend/test/game-config-rules.test.js`
- `frontend/src/lib/game/game-chain.test.ts`

Exit criteria:

- A teacher creates a 4–5 component chain for one objective.
- Every component contains 5–10 logical items.
- A 30-item chain is accepted when it has valid independent components.
- A malformed component blocks publish with its component index.
- Child progress is recorded according to one documented chain completion policy, not multiple hidden completions.

### Phase 3 — Teacher evidence and coverage

**Goal:** The system closes the loop from gameplay to professional observation and annual coverage.

Tasks:

1. Add `KidTeacherObservation` model/controller/routes.
2. Add class/child observation form with level, route, prompt, context, note and next step.
3. Add teacher summary combining game evidence and observation evidence.
4. Add term/week/subject coverage endpoint and simple teacher dashboard.
5. Extend portfolio/parent-safe summary only with approved plain-language fields.
6. Add tests for child/school ownership, neutral wording and no composite score.

Files:

- New: `backend/src/models/KidTeacherObservation.js`
- New: `backend/src/controllers/kidsObservations.js`
- `backend/src/controllers/kidsTeacher.js`
- `backend/src/controllers/kidsPortfolio.js`
- `backend/src/routes/kids.js`
- New: `frontend/src/components/ObservationForm.tsx`
- `frontend/src/pages/Teacher/TeacherAnalytics.tsx`
- `frontend/src/pages/Teacher/TeacherLessons.tsx`

Exit criteria:

- Teacher records an observation even when no game score exists.
- Summary shows game evidence separately from observation evidence.
- Coverage identifies missing weekly cells and approved deferrals.
- Parent/child payloads exclude private notes and class comparisons.

### Phase 4 — Child engagement and inclusive access

**Goal:** Make the bridge feel like a joyful, low-pressure child experience.

Tasks:

1. Standardize story/scenario/helper/feedback fields and review copy.
2. Ensure all relevant game templates support large targets, audio replay, reduced motion and clear retry.
3. Add child-friendly progress moments tied to real completion, not public ranking.
4. Add structured visual representation renderers where required: tally/group view, analog clock, diagram and stage sequence.
5. Add home connection recap where safe.
6. Add component-level accessibility and copy tests.

Files:

- `frontend/src/pages/Student/GamePlay.tsx`
- `frontend/src/components/GameConfigEditor.tsx`
- `frontend/src/components/LearningPath.tsx`
- `frontend/src/lib/utils/a11y-store.ts`
- `frontend/src/lib/offline/`
- `game-engine/schemas/`
- i18n chunks and component tests

Exit criteria:

- Child can learn with image/audio/pointing routes where supported.
- No child-facing message uses shame or peer comparison.
- Missing media falls back safely to approved SVG/emoji/text.
- Session can stop and resume without losing the current learning point.

### Phase 5 — Offline, rollout and hardening

**Goal:** Deliver the bridge reliably on low-cost devices and weak networks.

Tasks:

1. Cache published bridge summary with lesson/game payload and path metadata.
2. Queue progress and observation writes with idempotency keys.
3. Add sync conflict rules: server-authoritative approval state; append-only observations; last-safe session state.
4. Add publish audit events and failure diagnostics.
5. Run teacher → child → reconnect → teacher-summary smoke test.
6. Keep all new tables in the dedicated kids DB and use additive/defaulted reconciliation.

Files:

- `frontend/src/lib/offline/content.ts`
- `frontend/src/lib/offline/sync.ts`
- `backend/src/controllers/kids.js`
- `backend/src/models/index.js`
- `backend/test/`
- `team-docs/reports/`

Exit criteria:

- Offline completion syncs once and is visible in teacher evidence.
- Duplicate requests are safe.
- No higher-band lesson is exposed through a fallback.
- Rollback can disable bridge UI while leaving existing games and progress working.

## 8. Non-functional requirements

### NFR-01 Performance

- Learning-path/coverage summary uses batched queries.
- Do not issue one request per item, observation or lesson.
- Child gameplay must not wait on analytics or teacher summary writes.

### NFR-02 Reliability

- All child progress and evidence writes accept an idempotency key where the client may retry.
- Auto-save is local-first; network sync is opportunistic.
- Errors are visible and retryable; no silent success.

### NFR-03 Safety

- Child-facing content is filtered by published state and entitlement.
- Story checkpoint references are resolved before publish.
- Unsafe, unreviewed or missing required fields fail closed.

### NFR-04 Accessibility

- Large touch targets, readable contrast, audio replay, captions/subtitles, reduced motion and no colour-only meaning.
- Valid responses include non-verbal routes where developmentally appropriate.

### NFR-05 Privacy

- No diagnostic labels or peer comparisons.
- Teacher private notes are teacher/staff scoped.
- Parent summaries are child-scoped and plain language.
- Use consent before storing media evidence.

### NFR-06 Maintainability

- One canonical contract per concept.
- New agents must read the gap map and this SRS before editing.
- Every phase adds focused tests and updates the progress report.

## 9. Release gates

A phase is complete only when all applicable gates pass:

```text
schema validation
→ backend unit/integration tests
→ frontend typecheck/build
→ accessibility/copy review
→ ownership/tenant tests
→ offline/idempotency tests where applicable
→ teacher smoke test
→ child smoke test
→ progress report updated
```

No phase may claim “complete” because a document was written. The code, tests and user flow must be verified.

## 10. Rollback strategy

- Keep bridge reads additive and optional until Phase 3 is verified.
- Existing `GET /kids/lessons/:id/game`, game progress, series locks and offline gameplay must continue working if bridge endpoints are disabled.
- New tables are kids-owned and created with `force: false`; no destructive migration.
- Feature flag bridge authoring/observation UI if a phase fails.
- Revert code through the normal repository/deployment process; never delete historical observations.

## 11. Lower-tier AI implementation instruction

An implementation agent must follow this order:

1. Read `team-docs/reports/ecce-outcome-engagement-findings.md`.
2. Read `team-docs/reports/ecce-game-bridge-gap-map.md`.
3. Read this SRS and the relevant existing file before editing.
4. Work on one phase only; do not mix Phase 3 observation work with Phase 2 renderer work.
5. Preserve C1/C2: dedicated kids DB, additive/defaulted fields, no shared DB alteration.
6. Reuse existing services and response shapes.
7. Add or update tests before declaring the phase complete.
8. Report changed files, tests run, known gaps and rollback notes in `team-docs/reports/`.

### Standard task prompt

```text
Implement only Phase <N>, requirement <FR-number> from
team-docs/SRS-ECCE-OUTCOME-GAME-BRIDGE.md.

Read the gap map first. Do not change shared-school DB tables. Use nullable/defaulted
additive kids-domain fields only. Reuse existing auth, approval, offline and progress
services. Do not invent a second contract. Add focused tests, run the targeted test/build
commands, and write a checkpoint report under team-docs/reports/.
```
