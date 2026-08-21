# EliteKids — Learning Progression & Association Ladder
*A curriculum-design layer sitting on top of the GDL/game template system. Written to formalize progressive, concrete-to-abstract, simple-to-complex game sequencing — replacing flat category tabs as the only structure.*

## Core Principle: Receptive Before Expressive
Children reliably **recognize** a concept before they can **recall or produce** it (a foundational early-childhood-education principle). A child points to "cow" correctly long before they can name it unprompted. Every association sequence in EliteKids must follow this order: recognition tasks before recall/production tasks.

## The Association Ladder
Four tiers, applied per content item (e.g., "Cow" within the Animals category):

| Tier | Name | What happens | Cognitive demand |
|---|---|---|---|
| **Tier 0 — Exposure** | Multi-sensory introduction | Image + emoji + label + sound (if available) shown together, no question, no wrong answer possible | None — teaching, not testing |
| **Tier 1 — Receptive Recognition** | One modality → visual selection | Child hears the sound or sees the label, selects the matching image from a set | Low — recognition only |
| **Tier 2 — Cross-Modal Association** | Visual → symbolic selection | Child sees the image, selects the matching name/label | Medium — concrete-to-symbolic connection |
| **Tier 3 — Expressive Recall** | Symbolic → symbolic | Child hears the sound, selects the name directly, no image support | High — no concrete anchor, pure recall |

A child must complete Tier 0 exposure for an item before Tier 1 is offered, Tier 1 before Tier 2, and so on. Tiers are never skipped and never offered out of order.

## Distractor Set Size — Independent Difficulty Dial
Cognitive load within a tier is controlled separately from the tier itself, via the number of answer options presented:
- **3 options** — new item, or younger age band, or Learning mode default
- **4–5 options** — item is familiar; standard Practice mode range
- **6 options, near-similar distractors** (e.g., cow / horse / goat, not cow / car) — genuine mastery check; Test mode, higher tiers only

This lets a single tier serve a range of ages/abilities — the tier defines *what kind* of association is being tested, the distractor count defines *how hard* that specific test is.

## Category-Specific Modality Maps
Not every category has the same senses available, so each category gets its own defined tier set rather than forcing a universal template:

| Category | Tier 0 (Exposure) | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| **Animals** | Image + emoji + label + animal sound | Sound → pick image | Image → pick name | Sound → pick name |
| **Letters** | Shape + label + phonic sound | Phonic sound → pick shape | Shape → pick name | Phonic sound → pick name |
| **Shapes** | Image + label | Visual differentiation (pick the triangle among distractors) | Shape → pick name | *(capped — no meaningful Tier 3; shapes have no abstract symbol beyond the name itself)* |

New categories must have their Modality Map explicitly defined before any content is authored in them — a category is not usable until its tier set is documented (see Doc 13, validation rule).

## Sequencing Beyond a Single Item
- **Within a category:** items are ordered by **familiarity**, not alphabetically — common/concrete items (cow, dog, cat) before less-familiar ones (giraffe, hippopotamus).
- **Across categories (macro-sequence):** concrete, sensory-rich categories (Shapes, Animals) precede abstract-symbol categories (Letters) for a given age band. This macro-ordering is a per-age-band configuration, reviewed by the education specialist role (per the original Initial Team plan).

## Game Series & Unit Sequencing

### Overview
When converting structured content (e.g., a book, curriculum, or topic progression) into games, the system supports explicit sequencing through **Game Series** and **Units**. This ensures students progress through content in the intended order — Chapter 1 before Chapter 10, not because 1 is "smaller," but because human learning follows sequential progression.

### When Creating a Game
The system asks the teacher/author:

```
"Is this game a new topic or a continuation of an existing topic?"
```

| Choice | System Action |
|---|---|
| **New Topic** | Creates "Unit 1" of a new series (e.g., "ABC Learning — Unit 1") |
| **Continuation** | Creates "Unit 2" (or next unit), linking to the previous unit as a prerequisite |

### Unit Structure
Each unit within a series contains:
- **Series ID** — links all units together (e.g., `series_abc_learning`)
- **Unit Number** — sequential position (1, 2, 3...)
- **Prerequisite Unit** — must be completed before this unit unlocks (Unit 2 requires Unit 1)
- **Content Items** — the specific items (letters, animals, shapes) covered in this unit

### Example: ABC Learning
```
Series: ABC Learning
├── Unit 1 (A, B, C) — no prerequisite, accessible immediately
├── Unit 2 (D, E, F) — requires Unit 1 completion
├── Unit 3 (G, H, I) — requires Unit 2 completion
└── ... through Unit 9 (X, Y, Z)
```

### Student Experience
- Can access Unit 1 (no prerequisites)
- **LOCKED out of Unit 2** until Unit 1 completed
- **LOCKED out of Unit 3** until Unit 2 completed
- Within each unit, items follow the Association Ladder (Tier 0→1→2→3)

### Key Principles
| Principle | Description |
|---|---|
| **Teacher flexibility** | Different teachers can create different sequences for the same content |
| **System enforcement** | Once a sequence is defined, prerequisites are locked |
| **Not global enforcement** | System doesn't force "ABC before XYZ" universally — teachers define the sequence |
| **Explicit teacher intent** | Teacher declares the order; system respects and enforces it |

### Why Not System-Enforced Global Sequencing?
The system will ACCEPT a game for "Z" even if "A" hasn't been created. This is deliberate:
- A teacher may have a specific reason to start with a different letter
- The system shouldn't block valid content based on assumed pedagogical order
- Human judgement (teacher, ECE specialist) decides the sequence
- The system only enforces the tier progression within each item AND the unit prerequisites within a series

### Technical Implementation
- **Series metadata** stored in `kids_game_series` table
- **Unit metadata** stored in `kids_game_units` table
- **Prerequisite check** runs when a student attempts to access a unit
- **Lock state** computed dynamically, not stored (avoids stale locks)

## Integration With Existing Game Modes
- **Learning mode** — plays through tiers with full guidance, distractor count locked to 3, no time pressure.
- **Practice mode** — child answers, correct/incorrect shown, distractor count scales 3→5 as the child demonstrates consistency at a tier.
- **Test mode** — timer on, no visual feedback on correct/incorrect, only offered once Tier 2 (minimum) has been completed in Practice mode for that item; distractor count can reach 6.

A child cannot be placed into Test mode for an item/tier they haven't completed in Learning and Practice first — this is enforced structurally, not left to teacher judgment (see Doc 13).
