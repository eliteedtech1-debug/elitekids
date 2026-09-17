# ECCE Outcome-to-Game Bridge — Data Contracts and Workflows

**Date:** 2026-09-04  
**Companion SRS:** `team-docs/SRS-ECCE-OUTCOME-GAME-BRIDGE.md`  
**Purpose:** Remove ambiguity from implementation by defining the smallest stable contracts first.

## 1. Contract vocabulary

| Term | Meaning |
|---|---|
| Outcome | Reviewed curriculum expectation for an age band and subject |
| Observable action | What an adult can see/hear/notice the child do |
| Weekly learning cell | One class × term × week × subject planning record |
| Lesson bridge | Persisted connection between outcome, real activity, game and evidence |
| Game component | One game template with 5–10 logical playable items |
| Game-chain | Ordered container of 2–10 complete game components for one lesson/unit objective |
| Module | Manageable part of a larger topic, with a bounded item range |
| Observation | Dated professional evidence recorded by teacher/caregiver |
| Evidence bundle | Digital game evidence + teacher observation + next step |

## 2. Weekly learning cell JSON

This is a planning contract. It may be stored in `kids_lesson_bridges` or assembled from existing curriculum records during the first read-only phase.

```json
{
  "cell_id": "nursery-2-first-term-w03-numeracy-01",
  "class_label": "Nursery 2",
  "age_band": "Nursery 2",
  "academic_year": "2026/2027",
  "term_name": "First Term",
  "week_number": 3,
  "subject_id": "numeracy",
  "display_subject": "Numeracy / Mathematics Skill",
  "strand": "Number",
  "sub_strand": "Quantity and representation",
  "outcome_id": "outcome-numeracy-quantity-01",
  "weekly_focus": "Represent quantities using objects, marks and numerals.",
  "prerequisite": "Child has counted groups from 1 to 5 with real objects.",
  "objective": "Match a group of five objects to numeral 5.",
  "micro_objectives": [
    "touches one object for each counting word",
    "states or shows the total",
    "matches the group to numeral 5"
  ],
  "vocabulary": ["five", "how many", "same", "count"],
  "concrete_experience": "Count five bottle tops, stones or fruit pieces with an adult.",
  "guided_play": ["adult models slow one-to-one counting", "child counts with a partner"],
  "independent_choice": "Child chooses fruit, counters or drawing to show five.",
  "success_evidence": [
    "counts each object once",
    "matches five objects to 5",
    "demonstrates independently or with a verbal clue"
  ],
  "evidence_routes": ["point", "speech", "home_language", "drawing", "mark-making"],
  "differentiation": {
    "reduce_load": "Use 1–3 objects and two numeral choices.",
    "access": "Use large objects, audio replay and extra wait time.",
    "extend": "Represent five using counting marks or a bundle."
  },
  "home_connection": "Count five safe household objects together.",
  "follow_up_type": "new-representation",
  "reinforcement_of": ["nursery-2-first-term-w02-numeracy-01"],
  "representation_sequence": ["objects", "counting-marks", "group-of-five", "numeral", "number-name"],
  "grouping": { "bundle_size": 5, "show_boundaries": true, "allow_remainders": true },
  "item_range": "1–5",
  "game_plan": {
    "minimum_games": 1,
    "components": [
      {
        "component_id": "c1",
        "order": 1,
        "template": "matching",
        "role": "match quantity to numeral",
        "playable_item_count": 6,
        "module_number": 1
      },
      {
        "component_id": "c2",
        "order": 2,
        "template": "tap-recognition",
        "role": "recognise the structured quantity",
        "playable_item_count": 6,
        "module_number": 1
      }
    ],
    "container_template": "game-chain"
  },
  "scene_plan": ["intro", "teach", "game_checkpoint", "reinforce", "recap"],
  "assessment_plan": {
    "creche_or_playgroup": "adult observation",
    "nursery_or_kg": "low-stakes picture choice after concrete play",
    "teacher_required": true
  },
  "status": "draft"
}
```

## 3. Game component contract

```json
{
  "component_id": "c1",
  "template": "matching",
  "order": 1,
  "role": "concrete-to-symbolic association",
  "objective_ref": "bridge-123",
  "series_id": "series-counting-1-100",
  "unit_number": 1,
  "module_number": 1,
  "term_name": "First Term",
  "week_number": 3,
  "item_range": "1–5",
  "playable_item_count": 6,
  "config_id": "config-123",
  "prerequisite_module_id": null,
  "representation_sequence": ["objects", "numeral"],
  "follow_up_type": "new-skill",
  "status": "schema-valid"
}
```

Validation:

- `playable_item_count` must be 5–10 for a standalone component.
- `matching` and `memory-pairs` count logical pairs, not visual cards.
- `puzzle-split` count is the populated playable piece set for the selected difficulty.
- A component may represent a quantity larger than 10 when the representation is structured and the number of playable prompts remains 5–10.
- `game-chain` is excluded from nested component templates.
- `order` is unique and contiguous from 1; the renderer must not shuffle.

## 4. Game-chain contract

```json
{
  "gameId": "chain-counting-1-5",
  "template": "game-chain",
  "lessonId": "lesson-123",
  "ageLevel": "Nursery 2",
  "category": "Numeracy",
  "tier": 1,
  "item_id": "bridge-123",
  "series_id": "series-counting-1-100",
  "unit_number": 1,
  "module_number": 1,
  "termName": "First Term",
  "week": 3,
  "objectiveRef": "bridge-123",
  "rounds": [
    {
      "id": "r1",
      "label": "Match the groups",
      "template": "matching",
      "config": { "template": "matching", "assets": { "items": "...5-10 logical pairs..." } }
    },
    {
      "id": "r2",
      "label": "Build the picture",
      "template": "puzzle-split",
      "config": { "template": "puzzle-split", "difficulties": { "easy": { "pieces": "...5-10 pieces..." } } }
    },
    {
      "id": "r3",
      "label": "Find the tally bundle",
      "template": "tap-recognition",
      "config": { "template": "tap-recognition", "assets": { "objects": "...5-10 targets..." } }
    },
    {
      "id": "r4",
      "label": "Sort the quantities",
      "template": "drag-sort",
      "config": { "template": "drag-sort", "assets": { "items": "...5-10 items..." } }
    },
    {
      "id": "r5",
      "label": "Choose the numeral",
      "template": "quiz",
      "config": { "template": "quiz", "questions": "...5-10 questions..." }
    }
  ],
  "rewards": { "starsOnComplete": 3, "xp": 50 },
  "successThresholdPct": 60
}
```

Chain policy:

1. Components are complete games, not loose questions.
2. Each component is validated independently.
3. The complete chain may have more than ten total items.
4. Chain completion must have one explicit progress policy. Recommended MVP: one parent lesson completion plus component telemetry, not one `KidProgress` row per hidden component.
5. A failed component is replayable; later components may be gated by the chain's pedagogical design, but the policy must be explicit in config.
6. A long chain is split into separate modules rather than forcing a child through an overloaded session.

## 5. Observation contract

```json
{
  "id": "observation-123",
  "child_admission_no": "CHILD-01",
  "lesson_bridge_id": "bridge-123",
  "lesson_id": "lesson-123",
  "outcome_id": "outcome-numeracy-quantity-01",
  "observer_id": "teacher-01",
  "observation_level": "with_prompt",
  "response_route": "point",
  "prompt_level": "verbal_clue",
  "context": "small-group table activity",
  "note": "Child touched each object once and selected 5 after a verbal clue.",
  "next_step": "Repeat with six objects and show one bundle of five plus one.",
  "observed_at": "2026-09-04T09:30:00.000Z"
}
```

Allowed values:

```text
observation_level: independent | with_prompt | emerging | not_yet_observed | not_applicable
response_route: point | gesture | movement | speech | home_language | sign | AAC | drawing | mark-making | mixed
prompt_level: none | model | gesture | verbal_clue | two_choices | full_support
```

## 6. Evidence bundle response

```json
{
  "child": { "admission_no": "CHILD-01", "display_name": "A child" },
  "outcome": {
    "id": "outcome-numeracy-quantity-01",
    "statement": "Represent quantities using objects, marks and numerals."
  },
  "bridge": {
    "lesson_id": "lesson-123",
    "objective": "Match a group of five objects to numeral 5.",
    "concrete_experience": "Count five safe objects with an adult.",
    "representation_sequence": ["objects", "counting-marks", "numeral"]
  },
  "digital_evidence": {
    "games_played": 2,
    "components_completed": ["c1", "c2"],
    "best_score": 83,
    "attempt_count": 3,
    "last_played_at": "2026-09-04T10:00:00.000Z"
  },
  "teacher_evidence": [
    {
      "observation_level": "with_prompt",
      "response_route": "point",
      "prompt_level": "verbal_clue",
      "context": "small-group table activity",
      "note": "Counted five objects accurately.",
      "next_step": "Try a group of six with one bundle of five plus one."
    }
  ],
  "summary": "The child represented five objects and needed a verbal clue to choose the numeral. Continue with a structured group of five plus one.",
  "language_rules": {
    "relative_to_own_history": true,
    "peer_comparison": false,
    "diagnostic_label": false,
    "composite_score": false
  }
}
```

## 7. Publish gate contract

```json
{
  "content_id": "lesson-123",
  "gates": {
    "bridge_complete": true,
    "objective_present": true,
    "concrete_experience_present": true,
    "game_present": true,
    "item_load_valid": true,
    "series_metadata_valid": true,
    "story_alignment_reviewed": true,
    "safety_passed": true,
    "schema_passed": true,
    "ece_reviewed": false
  },
  "publishable": false,
  "blocking_reasons": ["ece_reviewed is required before child visibility"]
}
```

Rules:

- The API, not the frontend, is authoritative.
- A draft or recalled bridge cannot make a published game child-visible.
- A game config may remain backward-compatible when no bridge is attached, but new bridge-managed content must pass the bridge gate.
- For Crèche/Playgroup, `assessment_plan.child_test` is null/hidden and observation is the assessment route.

## 8. Child and teacher workflows

### 8.1 Teacher workflow

```text
Choose age/class
→ choose reviewed outcome
→ write one child action
→ add concrete activity
→ choose evidence routes/differentiation
→ choose game or chain
→ validate component counts and sequence
→ add story/checkpoint if useful
→ preview as child
→ submit for review
→ ECCE/admin approval
→ assign/publish
```

### 8.2 Child workflow

```text
Welcome/helper
→ concrete visual or narrated story
→ learn component
→ guided retry/practice
→ optional test/check according to age
→ celebration and natural stopping point
→ progress sync
```

### 8.3 Teacher follow-up workflow

```text
Open class summary
→ see objective and concrete activity
→ compare digital evidence with observations
→ select/add next step
→ assign a smaller/repeated/new-representation follow-up
```

## 9. Minimal test fixtures

### Valid lesson bridge

- Age: `Nursery 2`
- Term: `First Term`
- Week: `3`
- Objective: match five objects to numeral 5
- Concrete activity present
- One matching component with 6 logical pairs
- Teacher observation required

### Invalid bridge cases

1. `term_name: "Term 1"` → reject; use `First Term`.
2. `week_number: 11` → reject.
3. no objective → reject.
4. one evidence statement only → reject if minimum 2 is enforced by the selected phase.
5. no concrete activity → reject for Nursery 1+.
6. four playable items → reject.
7. eleven playable items → reject or require split metadata.
8. chain with a nested `game-chain` round → reject.
9. checkpoint references unknown game → reject with 422.
10. parent posts an observation for another child → 403.
11. child reads teacher private note → field omitted.
12. duplicate observation idempotency key → return existing record, do not create a second row.

## 10. Zero-cost implementation defaults

| Need | Default |
|---|---|
| Illustration | Existing approved B2 asset, SVG, CSS or emoji fallback |
| Narration | Existing browser TTS/local reviewed audio |
| Story animation | CSS transitions and existing scene renderer |
| Structured number view | HTML/SVG groups and marks |
| Offline data | Existing IndexedDB stores and service worker |
| AI assistance | Existing generator only after deterministic contract validation |
| Teacher evidence | Text form first; audio/photo later and consent-gated |
| Analytics | Existing SQL aggregation and teacher digest |
| Feature rollout | UI/API feature flag and additive records |
