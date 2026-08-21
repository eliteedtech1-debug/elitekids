# EliteKids — Pedagogy Enforcement Layer
*The Association Ladder (Doc 12) is only real if it's enforced at the point of authoring/generation — not left as guidance a teacher or AI agent can bypass. This doc defines that enforcement, sitting alongside (not instead of) the existing child-safety Content State Machine.*

## Where This Sits in the Pipeline
```
Teacher input (Age/Class + Subject + Topic + Duration)
      ▼
AI Game Coder Agent generates GDL (Game Definition Language) JSON
      ▼
[NEW] Pedagogy Validator  ──rejects if tier/distractor rules violated──►  back to Agent for regeneration
      ▼
Content State Machine (pre-screen classifier → denylist → human approval)  [existing, unchanged]
      ▼
Teacher: Generate → Review → Edit → Approve → Publish  [existing flow, now reviewing a tier ladder, not one isolated game]
```
Two independent, mandatory gates: pedagogy correctness and child-safety correctness. Neither substitutes for the other.

## Rule 1 — GDL Schema Is Tier-Aware, Not Optional Metadata
Every GDL document must declare:
- `category` (must match an existing, documented Modality Map — see Doc 12)
- `tier` (0–3, constrained to what that category's Modality Map defines as valid — e.g., Shapes cannot declare `tier: 3`)
- `item_id` (the specific content item, e.g., "cow", within the category)

If a teacher or the AI agent attempts to author a tier the category's Modality Map doesn't support (e.g., Shapes Tier 3), generation is rejected before it reaches the Content State Machine — this is a hard validation rule, not a warning.

## Rule 2 — Sequential Unlock
A Tier N game for a given `item_id` cannot be authored, generated, or published unless a Tier N-1 game for that same `item_id` already exists (published or in the same authoring session). Tier 0 has no prerequisite. This directly enforces the receptive-before-expressive principle (Doc 12) at the system level, not just as teacher guidance.

## Rule 3 — Distractor Count Is Constrained by Tier + Mode, Not Freely Set
| Mode | Allowed distractor range |
|---|---|
| Learning | Locked to 3 |
| Practice | 3–5, scaling with demonstrated consistency (see Doc 12) |
| Test | Up to 6, only available once Tier 2 minimum is completed in Practice for that item |

A teacher can preview a game at any distractor count for editing purposes, but cannot **publish** a pedagogically unsound combination (e.g., 6 near-identical distractors offered to a first-time learner in Learning mode).

## Rule 4 — Teacher Experience Stays Simple
The teacher-facing input remains unchanged from the original EliteKids design: `Age/Class + Subject + Topic + Duration` (e.g., "KG1 | Animals | Cow | 7 min"). The AI Game Coder Agent is responsible for auto-generating the full valid tier ladder for that item based on the category's Modality Map — the teacher is not expected to manually specify tiers or distractor counts. The teacher's Review step now shows a **ladder of 3–4 linked games** (per the category's tier count) rather than one isolated game, but the authoring effort on the teacher's side does not increase.

## Rule 5 — Orphan Detection
Before publish, the validator checks the full set of published + pending games for a given `item_id` and rejects any state where a higher tier exists without its full chain of prerequisite tiers beneath it (no orphaned Tier 2 without Tier 0/1, etc.).

## Where This Plugs Into the Existing Architecture
- **GDL schema** (referenced in the original EliteKids GameOS design) gains the `category`/`tier`/`item_id` fields as required, not optional.
- **Content State Machine** is unchanged — pedagogy validation is a new, separate gate that runs first; safety validation still runs on every generated asset regardless of pedagogy outcome.
- **Phaser 3 interpreter** does not need to know about tiers — it renders whatever valid GDL it's given; tier logic lives entirely in the authoring/generation/validation layer, keeping the renderer simple per the original architecture principle (no raw AI code execution, closed schema).

## QA Requirement
Add explicit tests: (a) attempt to generate a Tier 3 Shapes game — must be rejected; (b) attempt to generate a Tier 2 game for an item with no existing Tier 1 — must be rejected; (c) attempt to publish a Learning-mode game with 6 distractors — must be rejected; (d) confirm a full valid 4-tier Animals ladder for a new item generates and publishes correctly end-to-end.
