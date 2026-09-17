# EliteKids ECCE/Game Bridge — Finding-to-Implementation Map

**Date:** 2026-09-04  
**Companion document:** `team-docs/reports/ecce-outcome-engagement-findings.md`  
**Purpose:** Convert the findings into a file-level implementation map that a lower-tier AI agent can execute without guessing.

## 1. Current system baseline

### Already available

- Annual curriculum framework: `curriculum/00-framework/`
- One game per subject per week, 3 terms, 10 weeks per term: `year-plan-and-game-authoring-standard.md`, `annual-game-coverage-template.md`
- Game-ready lesson seed and granular lesson plan contracts: `game-ready-curriculum-contract.md`, `granular-lesson-plan-template.md`
- 5–10 playable-item rule and flexible series/module splitting: `game-size-and-module-standard.md`
- Number representation follow-up: `number-representation-progression.md`
- Ordered heterogeneous game-chain: `game-engine/schemas/game-chain.schema.json`, `backend/src/services/gameConfigRules.js`, `frontend/src/lib/game/gameChain.ts`
- Existing game templates, schema validation, safety/pedagogy services and manual teacher creation flow
- Existing progress: `KidProgress`, item responses, mastery, engagement snapshots, series/units/locks and weekly goals
- Existing offline content/progress/session cache and save/resume
- Existing story, companion, garden, accessibility, TTS, voice, portfolio and analytics areas

### Main missing bridge

The project has strong pieces but they are not yet one explicit data flow. A `KidLesson` has title, subject, age and text, while the richer objective/evidence/next-step record mostly remains in curriculum Markdown. Teacher observations are not yet a first-class child/outcome evidence contract. The current portfolio is largely derived from game and speech activity, not a teacher observation bundle.

## 2. Finding-to-file matrix

| Finding | Current implementation | Gap | Required location | Phase | Acceptance proof |
|---|---|---|---|---|---|
| F01 Observable child action | Curriculum templates require `objective` and `successEvidence`; `KidCurriculumPoint` has `learning_objective` | No persisted lesson-outcome bridge; authoring can submit only title/subject/config | New `KidLessonBridge` model/controller; `GameCreator.tsx`; teacher lesson detail; API contract | P1 | A lesson cannot be marked ready without one objective and 2–4 evidence statements; API returns the bridge with the lesson |
| F02 Concrete-to-abstract sequence | Curriculum Markdown and prompts mention concrete experience; game configs support modes | No structured UI or stored plan for real-world warm-up/model/guided play/transfer | New bridge JSON contract; `GameConfigEditor` guidance; lesson-plan view | P1 | Bridge contains concrete warm-up, model, guided play and transfer; review screen displays them |
| F03 Representation follow-up | `number-representation-progression.md`; config metadata supports `followUpType`, `reinforcementOf`, `representationSequence`; existing generator prompts mention tally bundles | Fields are not consistently persisted/validated; no follow-up view or link from a prior lesson | Bridge model JSON; `gameConfigRules.js`; `GameCreator.tsx`; optional representation helper | P1/P2 | A counting follow-up links to the earlier seed and stores objects → tally-bundle → numeral; validator accepts quantity >10 inside 5–10 playable items |
| F04 Game-chain lesson container | Schema, backend rules, frontend helper and renderer exist; `puzzle-split` is allowed | Teacher GUI still relies on raw/config editor for chain authoring; no chain-specific objective/component review | `GameConfigEditor.tsx`, `GameCreator.tsx`, `gameChain.ts`, chain tests and schema | P2 | Teacher creates 4–5 ordered components; each component is independently 5–10 items; whole chain is not rejected for total >10; no nested chain |
| F05 Auditable weekly coverage | Curriculum annual matrix and seed templates exist | No product-wide coverage dashboard linked to bridge/outcome/evidence state; several docs are planning-only | `TeacherLessons.tsx`, new coverage endpoint/controller/UI, tests | P3 | Dashboard reports planned, drafted, schema-valid, reviewed, published and observed counts by term/week/subject |
| F06 Game evidence vs teacher evidence | `KidProgress`, `KidGameItemResponse`, `KidMasteryProgress`, `KidEngagementSnapshot`, portfolio | No first-class observation record with evidence level, route, prompt and next step | New `KidTeacherObservation` model/controller/routes; teacher observation UI; portfolio extension | P3 | Teacher records `independent/with_prompt/emerging/not_yet_observed`; child score remains separate; summary shows both |
| F07 Low-pressure agency/access | Garden, companion, hints, retry, a11y store, reduced motion/accessibility, save/resume | Feature behavior is spread across screens; no shared lesson accessibility contract or test matrix | `A11ySettings`, `GamePlay.tsx`, game template components, shared contract and tests | P4 | Every game exposes audio replay, large targets and retry; no failure causes progress garden regression; keyboard/screen-reader smoke where applicable |
| F08 Story purpose | Scene schema, Story/Scene editor plans, companion/scenario fields and story technical spec | Objective-to-story alignment is not persisted or automatically reviewed; visual story work has partial status | `SceneEditor.tsx`, `scene-script.schema.json`, `kids.js` scene validation, story bridge metadata | P2/P4 | A review screen shows objective, scene arc and game checkpoint; a mismatch or unresolved checkpoint blocks publish |
| F09 Structured real visuals | Planned `AnalogClock`, `LabelDiagram`, `StageSequence`; schemas and prompts exist | Asset approval/fallback and representation semantics are not common across all templates | `game-engine/schemas/`, `GameConfigEditor.tsx`, `GamePlay.tsx`, offline asset cache | P2/P4 | Clock/tally/diagram configs render real/SVG art online and approved fallback offline; asset keys are reviewable |
| F10 Teacher professional role | Manual Game Creator, curriculum library, approvals, teacher insights and voice notes | Teacher cannot easily record context and next step beside a game result | New observation UI; lesson bridge editor; teacher summary endpoints | P1/P3 | Teacher can edit objective/activity/differentiation and save a next step without changing the global library master |
| F11 Home/community connection | Curriculum Markdown requires `homeConnection` | No persisted home connection in lesson API or child/parent summary | Bridge contract/model; teacher lesson view; optional parent read-only card | P1/P4 | Published lesson returns a safe no-cost home activity; parent view never exposes private teacher notes |
| F12 Adapt support, not labels | Adaptive v2, spaced repetition, mastery and neutral pattern docs exist | Existing analytics/wording may still use score-centric or “struggling” labels; no evidence-aware recommendation contract | `kidsAdaptiveV2`, `kidsTeacher.js`, `kidsTracking.js`, copy/i18n tests | P3/P4 | Recommendations name support/action and evidence, never diagnosis or peer comparison |
| F13 Reliability as pedagogy | Offline cache, sync, session state, asset warming, TTS and accessibility | Learning path and bridge evidence need offline-safe snapshots and conflict/idempotency rules | `frontend/src/lib/offline/`, sync endpoints, bridge/observation APIs | P4/P5 | Child can finish cached activity offline; progress queues once; duplicate sync is idempotent; teacher observation failure is visible and retryable |
| F14 Review gate | Content states, approval queue, `gameConfigRules`, safety pipeline and pedagogy validator | Objective/evidence/story/observation readiness is not one publish gate; duplicate curriculum route exists | `kids.js`, `gameConfigRules.js`, `pedagogyValidator.js`, `routes/kids.js`, approvals tests | P2/P3 | Publish response lists all failed gates; no game becomes child-visible when its bridge or required review is incomplete |

## 3. Exact current implementation locations

### Curriculum and authoring

| Concern | Files |
|---|---|
| Annual scheme and term/week rules | `curriculum/00-framework/year-plan-and-game-authoring-standard.md`, `annual-game-coverage-template.md` |
| Lesson plan fields | `curriculum/00-framework/granular-lesson-plan-template.md` |
| Game-ready seed contract | `curriculum/00-framework/game-ready-curriculum-contract.md` |
| Item size and module splitting | `curriculum/00-framework/game-size-and-module-standard.md` |
| Number representations | `curriculum/00-framework/number-representation-progression.md` |
| Game-chain story | `curriculum/00-framework/game-chain-story-example.md` |

### Backend

| Concern | Files |
|---|---|
| Lesson create/manual save/publish | `backend/src/controllers/kids.js`, `backend/src/routes/kids.js` |
| Schema/item validation | `backend/src/services/gameConfigRules.js`, `backend/src/services/contentGeneratorService.js` |
| Pedagogy/safety | `backend/src/services/pedagogyValidator.js`, `backend/src/services/safetyPipeline.js` |
| Lesson and game data | `backend/src/models/KidLesson.js`, `KidGameConfig.js`, `KidCurriculumPoint.js` |
| Series/unit locks | `backend/src/models/KidGameSeries.js`, `KidGameUnit.js`, `backend/src/controllers/kidsSeries.js` |
| Digital evidence | `KidProgress.js`, `KidGameItemResponse.js`, `KidMasteryProgress.js`, `KidEngagementSnapshot.js`, `backend/src/controllers/kidsTracking.js` |
| Teacher/parent summaries | `backend/src/controllers/kidsTeacher.js`, `kidsParentIntelligence.js`, `kidsPortfolio.js` |
| Current child path/goals | `kidsSeries.js`, `kidsGoals.js`, `KidLearningGoal.js` |
| Dedicated database registry | `backend/src/models/index.js`, `02-ELITE-INTEGRATION/02-DATABASE-PLACEMENT.md` |

### Frontend

| Concern | Files |
|---|---|
| Teacher lesson list/create | `frontend/src/pages/Teacher/TeacherLessons.tsx` |
| Teacher game wizard | `frontend/src/pages/Teacher/GameCreator.tsx` |
| Visual game config editor | `frontend/src/components/GameConfigEditor.tsx` |
| Child game runtime | `frontend/src/pages/Student/GamePlay.tsx`, `frontend/src/lib/game/` |
| Path and goal UI | `frontend/src/components/LearningPath.tsx`, `GoalCard.tsx`, `frontend/src/pages/Student/StudentHome.tsx` |
| Offline cache/sync | `frontend/src/lib/offline/content.ts`, `offline/api.ts`, `offline/sync.ts` |
| API endpoint constants | `frontend/src/lib/api/endpoints.ts` |
| Accessibility/settings | `frontend/src/lib/utils/a11y-store.ts`, `A11ySettings.tsx`, `SpeechSettings.tsx` |

### Engine and tests

| Concern | Files |
|---|---|
| Game schemas | `game-engine/schemas/*.schema.json` |
| Game-chain contract | `game-engine/schemas/game-chain.schema.json`, `frontend/src/lib/game/gameChain.ts` |
| Backend validation tests | `backend/test/game-config-rules.test.js`, `content-generator.test.js`, `series-units.test.js` |
| Frontend chain/path tests | `frontend/src/lib/game/game-chain.test.ts`, `frontend/src/lib/utils/learningPath.test.ts` |
| Invariant helper | `backend/test/helpers/game-config-invariant.js` |

## 4. Important inconsistencies to resolve before implementation

1. **Technical age-band names drift.** Models and curriculum use `Crèche`, `Playgroup`, `Nursery 1`, `Nursery 2`, `Kindergarten`, `Primary`, while some JSON schemas still enumerate `Creche`, `Nursery`, `KG1`, `KG2`, `Primary`. Select one canonical API representation and add an explicit display-label mapping; do not silently compare unlike values.
2. **Curriculum route collision.** `routes/kids.js` registers `GET /kids/curriculum` for `getCurriculum` and later again for `listCurriculumPoints`. Express reaches the earlier route first, so the two contracts are not both available as documented. Rename one path or combine the responses before adding coverage APIs.
3. **Playable item shape drift.** Backend validators count schema-shaped collections such as `assets.objects`, while some frontend starter/runtime helpers use flat `items`. Normalize to one canonical shape at the API boundary and test every template in both preview and child runtime.
4. **Game-chain count semantics must stay separate.** The chain total is for reporting only. Each nested component is independently 5–10; the whole chain must not be rejected for total item count.
5. **Unit lock semantics need one source of truth.** Existing comments and older tests mention Practice+Test, while current `getLearningPath` treats a passing test as sufficient. The bridge SRS must name the authoritative gate and align comments, tests and UI copy.
6. **Current age isolation fallback conflicts with strict isolation.** `listLessons` widens to all global lessons when the band filter returns zero, while the learning-path contract says higher bands must never be returned. Keep any remedial mechanism explicitly below-band and server-resolved; never widen to higher-band content.
7. **Current mastery category can be `Unknown`.** `kidsTracking.updateMasteryProgress` creates `category: 'Unknown'` rather than reliably copying the lesson/game category. Bridge summaries must use the outcome/subject link, not infer subject from this fallback.
8. **Portfolio is not teacher observation.** `kidsPortfolio.js` currently rolls up game and speech evidence. It must not be presented as a complete ECCE assessment until teacher observation records are added.
9. **Duplicate approval rows are possible for scene batches.** The manual lesson path creates an approval entry inside the scene loop. The bridge publish gate should treat one scene batch as one review unit and be idempotent.
10. **Some planning documents say “complete” while their acceptance checklists remain open.** Product status must use code/tests/live verification, not document prose alone.

## 5. Implementation rule

Do not solve these gaps by adding a second unrelated learning system. Extend the existing lesson, game-chain, series/unit, progress, offline and approval flows with a thin bridge layer:

```text
Outcome/weekly cell metadata
+ existing lesson/game config
+ existing digital progress
+ new teacher observation evidence
= complete ECCE learning record
```
