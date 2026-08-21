# EliteKids — Curriculum Mapping & Content Library Model
*Shifts EliteKids' primary content model from "AI generates per teacher request" to "validated library first, generation and editing as teacher options." Built in partnership with ECE specialists (see pilot strategy) rather than generated blind.*

## The Model Shift
| | Original model | New primary model |
|---|---|---|
| Default teacher experience | Type a request, AI generates a full lesson | Browse a validated library by curriculum point, select and assign |
| Content origin | Generated fresh per request | Pre-built, ECE-specialist-reviewed, passed through Doc 13's Pedagogy Validator |
| AI Game Coder Agent's role | Primary content creator, real-time | Library-population tool + still available for custom/edge-case requests |
| Risk profile | Every generation is a first-time safety/pedagogy check | Library content vetted once, reused many times — lower ongoing risk |

Generation-on-demand is not removed — it becomes the path for edge cases (local festivals, an animal not in the library, a teacher's specific classroom need), not the default for everyday teaching.

## Curriculum Mapping Structure
A new foundational artifact: **Curriculum Points**, built with the ECE center as co-authors, not authored by Elite alone.

### `curriculum_points` (new table)
- `id`, `curriculum_source` (e.g., "Nigerian Early Years Framework" or the ECE center's own framework — confirm which with them), `age_band`, `learning_objective` (plain-language, e.g., "recognizes and names common domestic animals"), `category`, `mapped_item_ids` (which content items in the library satisfy this point)

### Mapping Process
1. ECE center reviews/confirms the relevant curriculum framework and learning objectives per age band.
2. Each objective is mapped to one or more categories (Animals, Shapes, Letters, and future ones) and specific items within them.
3. Each mapped item is built out through the full Association Ladder (Doc 12) for that category's Modality Map, validated through the Pedagogy Validator (Doc 13) and Content State Machine.
4. ECE center reviews the finished item ladder against the original learning objective before it's marked "published" in the library — this is their validation role in practice, not just a general endorsement.

## The Library — Teacher-Facing Model
- **Browse by curriculum point or category** — teacher selects "KG1 → Animals → recognizes common domestic animals" and gets the full validated tier ladder ready to assign, no authoring required.
- **Assign directly** — no generation step needed for standard curriculum coverage; this is the default path for most lessons.

## Teacher Customization Rights (explicitly preserved, not removed)
Two distinct teacher-facing options, both routed through the same safety/pedagogy gates as library content:

1. **Customize a pre-generated game for their own class** — the teacher does not edit the shared library master. Selecting a library game for assignment creates a **class-scoped copy**, which the teacher can then customize for their specific children: swap the image/emoji/sticker set, adjust wording of a label, change the sound clip, or adjust which distractors appear — without altering the tier structure or distractor-count rules from Doc 12/13 (structural pedagogy rules stay locked; surface content is customizable). The original library master is never modified by this — every other class using that library item is unaffected. The customized copy is re-validated through the Pedagogy Validator before it reaches that teacher's class, but does not need to go back through ECE center review unless the customization changes the learning objective itself.
2. **Request a fully custom game** — the original AI Game Coder Agent generation flow remains available for content outside the library (new item, new category, local/cultural content not yet mapped). Custom-generated content still passes through the Pedagogy Validator (Doc 13) and Content State Machine in full, exactly as originally designed — this path doesn't get a lighter safety check just because it's teacher-initiated.

## Data Model Note
- `library_games` — the canonical, ECE-validated master content. Read-only to teachers.
- `class_game_variants` — `id`, `library_game_id` (FK, nullable if fully custom), `teacher_id`, `class_id`, customized fields (image/sound/sticker/label/distractor overrides), `created_at`. This is what a teacher's customization actually writes to — the library master is never touched by a class-level customization.

## What This Means for the Roadmap
- **New MVP milestone:** a first curriculum-mapped category (recommend starting with Animals, since its 4-tier Modality Map is the most complete) fully built out and ECE-reviewed, before wider library expansion.
- **ECE center partnership formalized as a content pipeline**, not a one-time pilot review — ongoing curriculum mapping sessions as new categories are added.
- **Doc 10 (progress report) should track library coverage** — e.g., "12 of 40 mapped curriculum points fully built and ECE-validated" — as a concrete, honest metric of how much of the curriculum is actually covered versus how much still relies on custom generation.

## Open Question for the ECE Center Conversation
Confirm which curriculum framework they want to map against (a formal national framework, their own center's curriculum, or a hybrid) before curriculum_points are populated — this shapes the whole mapping structure and shouldn't be assumed unilaterally by Elite.
