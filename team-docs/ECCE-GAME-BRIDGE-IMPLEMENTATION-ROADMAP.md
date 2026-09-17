# ECCE/Game Bridge Implementation Roadmap

**Date:** 2026-09-04  
**Status:** Planning baseline  
**Primary documents:**
- `team-docs/reports/ecce-outcome-engagement-findings.md`
- `team-docs/reports/ecce-game-bridge-gap-map.md`
- `team-docs/SRS-ECCE-OUTCOME-GAME-BRIDGE.md`
- `team-docs/ECCE-GAME-BRIDGE-DATA-CONTRACTS.md`

## 1. Delivery strategy

Build the smallest useful bridge first. Do not pause the existing game product to build a large learning-management system.

```text
Phase 0: reconcile contracts
Phase 1: persist teacher lesson bridge
Phase 2: align game and game-chain authoring
Phase 3: record observations and coverage
Phase 4: improve child engagement/access
Phase 5: offline hardening and controlled rollout
```

Each phase is independently testable and reversible. Existing published games must continue to work when the bridge is disabled.

## 2. Phase 0 — Contract reconciliation

**Outcome:** no contradictory source of truth remains.

### Checklist

- [ ] Choose canonical API age values: `Crèche`, `Playgroup`, `Nursery 1`, `Nursery 2`, `Kindergarten`, `Primary`, and map technical aliases only at boundaries.
- [ ] Resolve the duplicate `GET /kids/curriculum` route. Recommended: retain `/kids/curriculum` for the child series map and use `/kids/curriculum-points` for curriculum-point discovery.
- [ ] Normalize each game template's playable collection at the backend boundary; document both stored and runtime shapes.
- [ ] Make the authoritative unit lock rule explicit in code, tests and copy. Recommended current rule: a passing Test score meeting the configured threshold for every required game in the prerequisite unit; Crèche/Playgroup uses teacher observation.
- [ ] Remove broad fallback behavior that can expose higher-band lessons. Remedial content must be explicitly at-or-below-band.
- [ ] Add fixture validators for the bridge, observation and chain contracts.

### Files

`backend/src/routes/kids.js`, `backend/src/services/ageBand.js`, `backend/src/services/gameConfigRules.js`, `backend/src/controllers/kids.js`, `backend/src/controllers/kidsSeries.js`, `frontend/src/lib/types/game.ts`, `frontend/src/lib/game/gameChain.ts`, tests.

### Exit gate

- `node -c` passes for changed backend files.
- Contract fixtures validate.
- No route shadowing remains.
- Targeted backend and frontend tests pass.

## 3. Phase 1 — Professional lesson bridge MVP

**Outcome:** a teacher can turn a reviewed curriculum outcome into a complete weekly lesson record.

### Backend tasks

1. Add `KidLessonBridge.js` to the dedicated kids model registry and sync order.
2. Add request validation helpers: exact term names, week 1–10, one objective, 2–4 micro-objectives/evidence statements, concrete activity and game plan.
3. Add controller methods:
   - `listOutcomes`
   - `createBridge`
   - `getBridge`
   - `updateBridge`
   - `submitBridgeReview`
4. Add routes under `/kids/lesson-bridges`.
5. Keep draft bridge data invisible to child routes.
6. Add `bridge_id`/`outcome_id` only as additive JSON or nullable references where needed; do not break old lesson rows.

### Frontend tasks

1. Add API endpoint constants and TypeScript interfaces.
2. Add `LessonBridgeEditor` with sections: outcome, objective, real activity, evidence, differentiation, game plan, home link.
3. Add `BridgeReviewPanel` to the teacher review flow.
4. Give the teacher starter text from the selected reviewed outcome, but keep every field editable.
5. Show a clear “game required” status and the selected game/chain.

### Tests

- Model loads on kids DB.
- Staff can create/update own-school bridge.
- Missing objective/concrete activity/term/week returns 400.
- Child cannot read teacher draft.
- Unknown outcome or foreign lesson returns 403/404.
- Existing manual lesson creation remains compatible.

### Exit gate

A teacher can save and review one Nursery 2 numeracy bridge without AI or paid services.

## 4. Phase 2 — Game and game-chain alignment

**Outcome:** a selected game demonstrably supports the bridge objective.

### Backend tasks

1. Validate the linked config/template and component item counts.
2. Require sequence metadata for oversized topics.
3. Validate follow-up representation metadata when `follow_up_type = new-representation`.
4. Return component-indexed errors for chains.
5. Preserve one chain-level progress record; component telemetry is separate.
6. Check story checkpoint references and objective alignment before review.

### Frontend tasks

1. Add chain builder UI: add component, select template, configure, reorder, preview and remove.
2. Show “5–10 playable items per component” beside each component, not “5–10 total chain items”.
3. Add count displays for logical pairs, cards and puzzle pieces.
4. Add numeracy representation helper for objects, counting marks, bundles, numerals and number names.
5. Add follow-up selector linking to a previous lesson seed.
6. Add a short objective-alignment checklist before submission.

### Tests

- Valid 4–5 component chain passes.
- 5 components × 6 items passes.
- 4 or 11 items in one component fails.
- Nested chain fails.
- Puzzle-split component passes when its chosen difficulty has 5–10 pieces.
- Counting 1–100 metadata splits without requiring a fixed unit count.
- Child chain order remains unchanged.

### Exit gate

One teacher-created chain can deliver one lesson objective through multiple mechanics without false item-count rejection.

## 5. Phase 3 — Teacher observation and coverage

**Outcome:** digital evidence and professional evidence appear together.

### Backend tasks

1. Add `KidTeacherObservation.js` to the dedicated kids model registry.
2. Add append-safe observation create/read/update endpoints.
3. Enforce teacher class/school access using existing helpers.
4. Add evidence bundle and learning-summary service.
5. Add coverage aggregation by class, term, week and subject.
6. Keep private notes out of child and parent response shapes.
7. Ensure idempotency for offline retries.

### Frontend tasks

1. Add `ObservationForm` to lesson/child teacher views.
2. Add “what I saw / support used / next step” layout.
3. Add neutral summary card: digital evidence, teacher evidence, next opportunity.
4. Add coverage view with missing/deferred/published/observed states.
5. Add parent-safe home connection card only; do not expose private observation notes.

### Tests

- Observation works without a game score.
- Accepted evidence routes and levels are enforced.
- Cross-child/cross-school writes fail.
- Duplicate idempotency key does not duplicate an observation.
- Summary contains no diagnostic or peer-comparison language.
- Coverage detects a missing subject/week cell.

### Exit gate

A teacher can observe a child counting five objects offline from the screen, record “with prompt”, and select a next step.

## 6. Phase 4 — Child engagement and inclusion

**Outcome:** the bridge feels safe and fun to use.

### Checklist

- [ ] Every relevant template has a story/scenario or clear purpose.
- [ ] Every error state has gentle feedback and retry.
- [ ] Learning mode has no forced timer.
- [ ] Targets are large and layouts predictable.
- [ ] Audio replay/TTS and subtitles exist where content needs them.
- [ ] Reduced-motion and colour-safe cues are honored.
- [ ] Child can use pointing/gesture/movement/audio/drawing/AAC routes where the objective allows.
- [ ] Garden/companion rewards participation and never regresses on a failed test.
- [ ] Structured tally/bundle, analog-clock, diagram and stage-sequence visuals use real/SVG art with safe fallbacks.

### Tests

- Copy scan rejects shame, diagnosis and peer comparison strings in child-facing output.
- A missing asset falls back without a blank/broken state.
- Retry does not erase prior progress.
- The game has a natural stopping/continue point.
- Reduced motion does not remove required meaning.

## 7. Phase 5 — Offline and controlled rollout

**Outcome:** low-cost schools can use the bridge under weak connectivity.

### Checklist

- [ ] Cache published lesson bridge summary with game and path payload.
- [ ] Queue child progress with existing sync queue.
- [ ] Queue observations with client-generated idempotency keys.
- [ ] Use append-only observation conflict handling.
- [ ] Make approval/publish state server-authoritative.
- [ ] Add feature flags: `lesson_bridge_authoring`, `teacher_observations`, `learning_path_bridge_summary`.
- [ ] Pilot one class, one subject and one term week before expanding.
- [ ] Collect teacher feedback using the existing voice-note/text mechanisms rather than a paid survey tool.

### Smoke path

```text
Teacher selects outcome
→ saves bridge
→ adds game/chain
→ previews and submits
→ reviewer approves
→ child plays online
→ child plays cached copy offline
→ reconnect syncs progress
→ teacher records observation
→ summary shows both evidence streams and next step
```

### Rollback

Disable bridge UI/API reads through the feature flag. Existing lesson/game routes, progress, series locks and offline play remain active. Do not delete bridge or observation history.

## 8. Ownership map for agents

| Lane | Owns |
|---|---|
| Backend | `backend/src/models`, controllers, routes, services, backend tests, game schemas |
| Frontend | `frontend/src`, frontend tests and build |
| Curriculum/docs | `curriculum/`, `team-docs/`, outcome wording and review checklists |
| QA | Read-only code audit, contract fixtures, tests, copy/accessibility review |

Never edit the same file from two lanes. Pass contract changes through a written handoff.

## 9. Lower-tier AI execution recipe

Give an implementation agent one brief at a time:

```text
You are implementing Phase 1, FR-02 only.
Read team-docs/reports/ecce-game-bridge-gap-map.md,
team-docs/SRS-ECCE-OUTCOME-GAME-BRIDGE.md and
team-docs/ECCE-GAME-BRIDGE-DATA-CONTRACTS.md first.

Inspect the existing model/controller/route pattern before coding.
Use the dedicated kids DB only; never alter elite_db. New fields must be
nullable or have defaults. Reuse JWT ownership, response shapes and approval
state. Add focused tests. Do not implement later phases. Run the targeted
backend test and report changed files, test output, blockers and rollback notes.
```

The agent must return:

```text
Changed files:
Contract implemented:
Tests run/result:
Known limitations:
Follow-up handoff:
```

## 10. Product success measures

Avoid vanity metrics. Use measures that show the bridge is helping teaching:

- Percentage of pilot weekly cells with a complete objective, concrete activity and game.
- Percentage of published bridge lessons with at least one teacher observation.
- Time a teacher needs to create a complete lesson bridge.
- Number of children who can resume after interruption without lost progress.
- Percentage of recommendations that include a clear next step and no prohibited labels.
- Teacher-reported usefulness of the evidence summary.
- No increase in child-facing safety, age-isolation or cross-tenant defects.
