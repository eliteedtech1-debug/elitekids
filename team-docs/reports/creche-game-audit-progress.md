# Crèche Game Audit — Discovery and Fix Progress

## Purpose

This report records the manual audit of seeded Crèche games. Each milestone must document:

1. The game or seed scope inspected.
2. The defect discovered.
3. Evidence showing why it is a defect.
4. The manual fix applied.
5. Verification evidence.

Crèche content is adult-led and observation-based. It must not present an ambiguous child-facing quiz or require speech when visual pointing, gaze, gesture, or sound is the intended response.

---

## Milestone 1 — Tap-recognition investigation

**Status:** Discovery complete; implementation fix pending.

### Scope inspected

- Student renderer: `frontend/src/pages/Student/GamePlay.tsx`
- Tap renderer: `TapGame`
- Crèche curriculum plan: `curriculum/00-framework/flagship-annual-pilot-plan.json`
- Crèche annual seed: `backend/src/seeders/flagshipAnnualPilotSeed.js`
- Jolly Phonics Crèche seed: `backend/src/seeders/jollyPhonicsSeriesSeed.js`
- Existing tap scenario migration: `backend/migrate-tap-scenarios.js`
- Existing runtime contract: `backend/test/helpers/game-config-invariant.js`

### Defects discovered

#### CREAT-001 — Options are displayed without a reliable target

The child-facing activity can display emoji, letter, or image choices while only showing a generic instruction such as:

> Tap the letter I say!

No deterministic letter, name, story event, or sound is supplied to the child for the round. In some configurations the prompt is generic while `speechText` only describes the activity. The child therefore cannot know which option is correct.

**Human test:** An adult looking at the screen cannot answer “which option is correct?” without hidden knowledge of the seed data.

#### CREAT-002 — Tap renderer uses array position as the answer key

`TapGame.handleTap()` currently decides correctness with:

```ts
const isCorrect = idx === currentIdx;
```

The answer is therefore whichever option happens to occupy the current item index, not the item identified by an explicit `correctId`, `correctIndex`, story question, or stimulus. Because options are rendered with `shuffle(items)`, the visible position and the answer key can also diverge.

This is a renderer/data-contract defect, not merely a copy defect.

#### CREAT-003 — Prompt can reveal or contradict the answer

The renderer displays the current item as the prompt for several prompt modes. For example, it can show the current item label/emoji and then present the same item among the answer options. That turns recognition into answer copying and conflicts with the intended stimulus → question → choices flow.

#### CREAT-004 — Crèche seed generates generic, non-answerable content

The annual pilot seed creates tap content with values such as:

- `prompt: "Tap the <subject> idea we are exploring."`
- `promptAudio: objective`
- labels built from generic curriculum words and the objective
- image options without a question that identifies one option

For Crèche, the objective is often an adult-observation statement, for example responding to a familiar voice, name, song, or picture. That objective is not itself a child-facing question and cannot be used as the answer key.

#### CREAT-005 — The Crèche activity is treated too much like an independent scored quiz

The Crèche curriculum plan specifies Tier 0 exposure and adult observation, but the runtime supports wrong-answer feedback, answer scoring, and test-like progression. The Crèche contract should prioritise one calm reveal or adult-led choice, with no ambiguous “wrong” state where observation is the assessment.

#### CREAT-006 — Speech input can appear on visual-only activities

`TapGame` renders `SpeechInput` when `config.inputMode !== 'tap'`. When `inputMode` is absent, the condition permits the microphone control. This can produce the instruction:

> Tap the mic and say the answer!

even when the options are visual emojis and no sound stimulus is available. Visual tap activities must explicitly use tap-only input; speech activities must have a real speaking objective and a usable audio or spoken prompt.

### Root cause summary

The system currently mixes three contracts:

1. **Child-facing copy:** generic instructions and technical labels.
2. **Legacy tap data:** `items[]` plus implicit array-position correctness.
3. **Story/multimodal data:** characters, scenarios, audio, questions, and explicit IDs.

The renderer does not consistently select one contract, so seeded fields such as story text and category labels can appear without the corresponding stimulus and answer key.

### Required fix for the next milestone

Implement and enforce one explicit Crèche round contract:

```json
{
  "template": "tap-recognition",
  "ageLevel": "Creche",
  "assessment": "adult observation",
  "promptMode": "context",
  "story": "Mama has a boy named Tobi. Tobi went to school.",
  "question": "Who is Mama's son?",
  "items": [
    { "id": "tobi", "label": "Tobi", "emoji": "🧒" },
    { "id": "ada", "label": "Ada", "emoji": "👧" },
    { "id": "kofi", "label": "Kofi", "emoji": "🧒" }
  ],
  "correctId": "tobi",
  "inputMode": "tap"
}
```

The renderer fix must:

- use `correctId` or an explicit per-round answer key;
- never use array position as the correctness rule;
- render `story → question → relevant choices`;
- render only the interaction required by the activity;
- hide technical labels such as `L3`, internal categories, and random tags from the child;
- support adult replay of the story/question without claiming audio exists when it does not;
- treat Crèche as adult observation rather than a child-facing scored test.

### Fix status

No production or seed files were changed during this milestone. This milestone records discovery only. The renderer and Crèche seed repairs will be recorded as separate milestones after implementation and verification.

### Verification status

- Source inspection completed.
- No database writes performed.
- No live content was modified.
- No fix is claimed yet.

---

## Milestone 2 — Explicit answer-key renderer and adapter repair

**Status:** Implemented; verification in progress.

### Defects fixed

#### CREAT-002 / CREAT-003 — Implicit position answer and answer-copy prompt

`TapGame` now normalizes tap content into explicit rounds. Correctness is resolved by `correctId`, not by the option's array position. The options are shuffled for display while the ID-based answer remains stable. Explicit round content can now provide:

- `story`
- `question`
- `speechText` or audio stimulus
- `items[]`
- `correctId`

The child-facing renderer displays a story followed by the actual question when both are present. It no longer uses the correct item itself as the visual prompt for ordinary text/context rounds.

Legacy configs are converted into explicit ID-based rounds for compatibility. They remain playable, but are marked for manual content replacement because a legacy item sequence may still lack a meaningful human question.

#### CREAT-001 — Schema adapter discarded answer IDs

`backend/src/controllers/kids.js` now preserves each `assets.objects[].id` and carries `assets.correctId` into the runtime `items[]` and top-level `correctId`. This fixes the data loss that made explicit answer-key rendering impossible for schema-format content.

#### CREAT-006 — Microphone shown by default

Tap recognition now renders speech input only when `inputMode` is explicitly `speak` or `both`. A missing `inputMode` no longer creates an unexpected microphone instruction. Crèche visual tap activities can therefore be tap-only by contract.

### Files changed

- `frontend/src/pages/Student/GamePlay.tsx`
- `backend/src/controllers/kids.js`
- `backend/test/tap-recognition-contract.test.js`

### Verification completed

- Frontend production build passed: `npm run build`.
- Backend contract tests passed: `tap-recognition-contract.test.js` — 2/2.
- Backend syntax checks passed for `kids.js`, `flagshipAnnualPilotSeed.js`, and `jollyPhonicsSeriesSeed.js`.
- No production database write was performed.
- Seed content repair is still required for already-stored database rows; the renderer now exposes malformed/ambiguous seeds instead of silently guessing their answer.

---

## Milestone 3 — Crèche seed content repair

**Status:** Implemented in source seeders; database migration and broad audit continue.

### Defects fixed

#### CREAT-004 / CREAT-005 — Generic annual Crèche tap content

The Crèche branch of `flagshipAnnualPilotSeed.js` now uses manually authored, subject-specific story rounds instead of generic curriculum labels. Each Crèche tap activity now has:

- a short Tobi story;
- a concrete child-facing question;
- five relevant visual choices;
- a stable explicit `correctId`;
- `promptMode: "context"`;
- `responseMode: "image"`;
- `inputMode: "tap"`;
- `assessment: "adult observation"`.

The communication example now follows the human-readable structure:

> Mama has a boy named Tobi. Tobi went to school.  
> Who is Mama's son?  
> Tobi / Ada / Kofi / Mama / School

Equivalent concrete rounds were added for writing, numeracy, science, social habits, health, movement, creative arts, and digital readiness.

#### CREAT-001 — Crèche choices now have a criterion

The manually seeded options are no longer unexplained `[ABC]` or unrelated emoji labels. Each option belongs to the question, and the answer is explicitly represented by its ID.

#### Crèche phonics stimulus mismatch

The Crèche Jolly Phonics tap activity now says that a sound will be provided and asks the child to tap the matching letter. It is explicitly tap-only and includes per-letter sound stimuli instead of relying on an implicit array position.

### Files changed

- `backend/src/seeders/flagshipAnnualPilotSeed.js`
- `backend/src/seeders/jollyPhonicsSeriesSeed.js`
- `backend/src/controllers/kids.js`
- `frontend/src/pages/Student/GamePlay.tsx`
- `backend/test/tap-recognition-contract.test.js`

### Verification

- Seed files pass `node --check`.
- Runtime adapter contract tests pass 2/2.
- Frontend production build and compatibility guard pass.
- This source-level fix is not yet a database migration. Existing published/generated rows must be audited and repaired in a later milestone.

---

## Milestone 4 — Animals Crèche seed repair

**Status:** Implemented and verified in source.

### Defect discovered

`backend/scripts/seed-animals-series.js` generated Crèche tap rounds from the first item using generic copy such as `Tap the Cow!`, without a story, explicit question, or adult-observation contract. The choices were technically present, but the activity did not explain why one choice was correct. This reproduced the same ambiguity outside the annual pilot seed.

### Fix applied

The Animals seed now gives Crèche units 1–5 manually authored story rounds with:

- a short Tobi/Mama context;
- a concrete question;
- five relevant options;
- stable `correctId` values;
- `promptMode: "context"`;
- `responseMode: "image"`;
- `inputMode: "tap"`;
- `assessment: "adult observation"`.

Nursery and older animal rounds retain their existing age-appropriate path, but now receive stable option IDs through the common construction.

### Verification

- `node --check scripts/seed-animals-series.js` passed.
- Combined contract and annual seed tests passed: 5/5.
- Frontend build passed.
- No database write or destructive seed execution was performed.

### Remaining audit target

The next loop must inspect stored Crèche catalog content and any existing published rows, then repair them through an additive, non-destructive migration or source seeder. Production data must not be rewritten blindly.

---

## Milestone 5 — Annual Crèche game-family repair

**Status:** Implemented and verified in source.

### Defect discovered

The annual Crèche seed used concrete copy only for the tap-recognition branch. Its matching, quiz, drag-sort, and stage-sequence branches still inherited generic objective text, repeated labels, or a five-choice array where the stage schema allows at most four choices. This meant the first game could be understandable while later games in the same Crèche lesson family remained ambiguous or invalid.

### Fix applied

All annual Crèche game families now receive the same authored activity context:

- matching uses relevant Tobi story options and explicit picture/name pairs;
- quiz uses the story question and visual options rather than “which choice helps us practise…”;
- drag-sort uses named visual cards and an age-appropriate instruction;
- stage-sequence uses concrete Tobi narration and bounded answer choices;
- Crèche configs retain `assessment: "adult observation"` and no child-facing test contract.

The stage-sequence choice list was also corrected to the schema’s maximum of four options.

### Additional Crèche catalog repair

The two global Crèche catalog quiz lessons now use child-facing questions without technical punctuation or contradictory prompts, and each question has a simple context/story and matching visual choices. Examples include “Tobi sees four things on the table” followed by “Which one is RED?” and a sound activity that asks “Which picture shows two claps?” rather than displaying a sound label without context.

### Verification

- Annual pilot seed tests passed: 3/3.
- Tap contract tests passed: 2/2.
- Seed syntax checks passed.
- Frontend build and compatibility guard passed.
- An attempted backend-directory `npm run build` correctly reported that backend has no build script; the frontend build was then run from `frontend/` and passed.
- No database writes or deployment actions were performed.

---

## Milestone 6 — Generation and secondary Crèche source safeguards

**Status:** Implemented and syntax-verified; no generation or database execution performed.

### Defects discovered

The generic AI generation contract still allowed the model to produce ambiguous Crèche activities even though the renderer and annual seeds had been repaired. Separately, the Jolly Phonics Crèche matching/sorting rounds had no adult-led context, and the generation path could show microphone behavior by omission rather than explicit intent.

### Fix applied

- Added a Crèche safety contract to `contentGeneratorService.js` requiring concrete story/stimulus → question/action → relevant choices, adult observation, no reading requirement, explicit `inputMode`, and no false audio claims.
- Generation normalization now adds `assessment: "adult observation"` and tap input defaults for Crèche configs.
- Jolly Phonics Crèche matching and sorting rounds now include Tobi/adult story text and speech guidance; the existing phonics tap round remains explicit tap-only.
- Global catalog Crèche questions now use clear child-facing wording and context.

### Verification

- Syntax checks passed for the generator, seeders, and Animals source.
- Focused backend tests passed: 5/5.
- No AI generation call, seed execution, production migration, or database write was performed.

---

## Milestone 7 — Crèche choice-contract and stimulus audit

**Status:** Implemented and verified in source; database remains unchanged.

### Defects discovered

#### CREAT-007 — Annual Crèche quiz rounds exceeded the child-facing choice contract

The annual Crèche quiz branch reused five authored options, but the quiz schema permits at most four options per question. This made the source content inconsistent with the renderer/schema contract even though the earlier round-count test passed.

#### CREAT-008 — Annual Crèche quiz repeated one question and one answer position

Each of the five quiz rounds used the same story/question and placed the correct answer at index zero. A child could see repetitive content and learn a position pattern instead of understanding the story.

#### CREAT-009 — Visual global sound catalog still claimed an audio stimulus

The global Crèche sound catalog used prompts such as “Which sound is loud?” and “Which sound is quiet?” while the game only rendered visual answer choices. That repeated the original defect: the child was asked to hear something that was not supplied.

#### CREAT-010 — Crèche phonics rounds still depended on legacy sequential behavior

The Jolly Phonics Crèche tap round had sound labels but no explicit option IDs/correct target. The renderer’s compatibility path could make it playable, but it was not an explicit stimulus → answer-key contract. The next Nursery phonics tap round also lacked explicit IDs and could expose the same default microphone behavior when played outside the intended path.

### Fix applied

- Annual Crèche quiz rounds now use no more than four options, with an explicit in-range `correctIndex`.
- Quiz targets are authored as distinct child-facing prompts: the Tobi/Mama story is used for the main target, while distractor-target rounds use concrete picture questions and a short Tobi context. The correct option is rotated across positions instead of always appearing first.
- Annual Crèche stage-sequence content now has a distinct five-step Tobi story for each subject, one clear closing question, and four relevant answer choices. It no longer repeats a tap-recognition option list as an unrelated sequence.
- Global Crèche sound questions now describe visible pictures/objects (for example, “Which picture shows a loud sound?” and “Which picture shows the drum?”). They no longer imply that an unavailable audio clip played.
- Jolly Phonics Crèche and Nursery tap options now have stable IDs, explicit tap-only input, and an explicit starting `correctId`; the Crèche round’s sound stimulus remains adult-led and replayable through the existing sound/TTS path.
- Added annual seed regression coverage for stories, choice bounds, and answer-index validity across all Crèche game families.

### Files changed in this milestone

- `backend/src/seeders/flagshipAnnualPilotSeed.js`
- `backend/src/seeders/globalCatalogSeed.js`
- `backend/src/seeders/jollyPhonicsSeriesSeed.js`
- `backend/test/flagship-annual-pilot-seed.test.js`

### Verification

- Backend syntax checks passed for all three changed seeders.
- Focused backend tests passed: 6/6 (`tap-recognition-contract.test.js`, `flagship-annual-pilot-seed.test.js`).
- Direct source audit validated both global Crèche catalog lessons and all 10 questions for story presence, four-choice bounds, and valid answer indices.
- Frontend TypeScript check passed: `npx tsc --noEmit`.
- `git diff --check` passed.
- The frontend `npm run build` attempt exceeded the 60-second agent wait limit; no build failure was observed before timeout, so a full production-build pass is not claimed here.
- No database write, destructive seed execution, migration, deployment, or production change was performed.

### Remaining work

- Continue auditing non-annual stored/published Crèche rows (especially Animals and Jolly Phonics database copies) and add a non-destructive migration only if explicitly authorized.
- Continue checking other age bands for the same visual/audio mismatch after the Crèche source audit is complete.

IDLE: none — next audit loop is the stored Crèche content inventory and migration-safety review.

---

## Milestone 8 — Animals Crèche non-tap source repair

**Status:** Implemented and verified in source; the destructive Animals seeder was not executed.

### Defects discovered

#### CREAT-011 — Animals Crèche matching, sorting, quiz, and fill-in-blank lacked a unified story contract

The Animals source seeder had authored Crèche stories only for the tap-recognition branch. Other Crèche templates inherited generic or empty prompts, so the same unit could present a story in one game and unrelated choices in the next.

#### CREAT-012 — Animals story metadata did not include answer choices

The Crèche story table stored `story`, `question`, and `target`, but not options. Non-tap branches therefore could not reliably construct relevant choices from the story. The capstone unit had no story row and exposed undefined context during source generation.

#### CREAT-013 — Animals drag-sort had no criterion for its requested order

The renderer asks the child to put items in order, but the Crèche source did not say whether that meant alphabetic order, teaching order, or story order. This repeated the original “correct by hidden criteria” defect.

### Fix applied

- Added a safe fallback authored Tobi/Mama animal-card activity for Crèche units without a dedicated story row.
- Added derived options to every Crèche story activity, using the unit’s own animal items where dedicated options are not needed.
- Matching, quiz, drag-sort, and fill-in-blank Crèche configs now carry story/scenario text, a concrete question/context, adult-observation assessment, and tap-only input defaults.
- Drag-sort now states the criterion explicitly: “Tobi sees X, then Y. Put the animal cards in that order.”
- Crèche quiz options and correct IDs now come from the authored activity options rather than the generic first item.
- The fill-in-blank prompt includes the concrete animal story before the sentence.
- Added `backend/test/creche-content-contract.test.js`, which loads the generator without executing its destructive delete/reseed path and checks every Crèche Animals template.

### Verification

- Animals and all Crèche source seeders pass `node --check`.
- Focused backend tests passed: 7/7, including the new Animals contract test.
- Frontend TypeScript check passed in the preceding verification cycle.
- `git diff --check` passed.
- No database write, DELETE, seed execution, migration, deployment, or production change was performed.

### Remaining work

- Audit stored/published Animals and Jolly Phonics rows separately; source changes do not repair already-persisted database JSON.
- Build a read-only inventory before proposing any additive migration.

IDLE: none — next loop is a read-only stored Crèche row inventory.

---

## Milestone 9 — Jolly Phonics Crèche explicit sound rounds

**Status:** Implemented and verified in source; no database seeder execution.

### Defect discovered

The Jolly Phonics Crèche tap definition contained sound labels and a generic instruction, but `buildConfig()` omitted `inputMode`, `correctId`, and any explicit round list. The runtime therefore entered its legacy compatibility path, which treats each array position as the current target. That is not a reliable sound → letter contract and can disagree with shuffled options.

### Fix applied

- Added stable IDs to every Crèche Group 1 sound option.
- Added `buildCrechePhonicsRounds()`, producing one explicit round per sound with story, question, speech text, complete options, and `correctId`.
- `buildConfig()` now preserves `inputMode` and `correctId`, and attaches the explicit Crèche rounds.
- The seed script is now import-safe for source tests; importing it does not authenticate or write to the database.
- Added `backend/test/jolly-phonics-creche-contract.test.js`.

### Verification

- Jolly Phonics and Animals seeders pass `node --check`.
- Focused Crèche suite passed: 8/8 tests across four suites.
- Frontend TypeScript check passed: `npx tsc --noEmit`.
- `git diff --check` passed.
- No database write, destructive seeder, migration, deployment, or production change was performed.

### Remaining work

- Inventory already-persisted Crèche rows read-only before deciding whether an additive migration is warranted.

IDLE: none — next loop is the read-only stored Crèche row inventory.

---

## Milestone 10 — Animals matching criterion alignment

**Status:** Implemented and verified in source; no stored content was modified.

### Defect discovered

The Animals Crèche matching prompt said “Match the animal to its name or sound,” but the generated Crèche pairs expose an animal picture and a text label; no sound choice is rendered. The instruction therefore offered a criterion that the child could not use on screen.

### Fix applied

Changed the Crèche matching instruction to:

> Match each animal picture to its name.

Added a regression assertion to the read-only generator contract test.

### Verification

- Focused Crèche tests passed: 8/8.
- Animals and Jolly Phonics seed syntax checks passed.
- `git diff --check` passed.
- No database read/write command, destructive seeder, migration, or deployment was executed.

### Remaining work

- Perform the planned read-only database inventory through an approved, bounded query path before any migration decision.

IDLE: none — database inventory remains the next audit action.

---

## Milestone 11 — Early-years placement visual/audio alignment

**Status:** Implemented and verified in source; no placement rows or database content were changed.

### Defect discovered

The Playgroup placement fixture is stored in the same technical `Creche` bucket as Crèche. Its prompt said “Match the drum sound to the loud picture. Which sound is loud?” while the placement payload provides visual/text options and no audio stimulus. This could expose the same ambiguity to an early-years child even though it is outside the annual Crèche seed.

### Fix applied

Changed the prompt to:

> Look at the pictures. Which one shows a loud drum?

The answer option remains the visible drum choice, so the criterion now matches the returned interaction. Added `backend/test/placement-content-contract.test.js` to lock the behavior.

### Verification

- Focused early-years suite passed: 9/9 tests across five suites.
- `kidsPlacement.js` and Animals source syntax checks passed.
- Frontend TypeScript check passed: `npx tsc --noEmit`.
- `git diff --check` passed.
- No database read/write, placement execution, migration, destructive seeder, deployment, or production change was performed.

### Remaining work

- A bounded, read-only inventory of persisted Crèche/Playgroup game JSON is still required before any migration or repair of existing rows.
- Continue only within the Crèche/early-years audit scope unless the next brief explicitly expands it.


---

## Milestone 12 — Standalone Animals and global catalog Crèche seed safeguards

**Status:** Implemented and verified in source; persisted rows remain unchanged.

### Defects discovered

#### CREAT-014 — Standalone Animals still seeded a Crèche text fill-in task

The destructive Animals seeder iterated every unit template for every age band. That exposed `fill-in-blank` to Crèche even though the activity requires a text answer and spelling/reading, which conflicts with Crèche exposure and adult observation.

#### CREAT-015 — Standalone Animals matching could expose animal sounds without a sound stimulus

The Crèche matching branch reused `sound` values as the right-side answer while rendering no audio prompt. The child therefore had to match a hidden sound criterion rather than the visible animal picture to its name.

#### CREAT-016 — Global Crèche catalog metadata did not declare the intended interaction

The global Crèche quiz rows were stored without `assessment`, `inputMode`, `promptMode`, or `responseMode`. Their visual questions could consequently be handled as a generic scored quiz rather than an adult-observation, tap-only visual activity. Existing rows were also not converged when the source copy changed.

### Fix applied

- Added an age-aware Animals template selection helper that excludes `fill-in-blank` from Crèche generation while preserving it for older age bands.
- Changed Crèche Animals matching to picture-to-name: the left side is a local data-image visual and the right side is the animal name; sound labels are not used without an audio stimulus.
- Added global catalog config construction with `assessment: "adult observation"`, `inputMode: "tap"`, `promptMode: "context"`, and `responseMode: "image"` for the two Crèche catalog lessons.
- Added visual emoji fields to catalog options and concrete story context to every Crèche question.
- Made the global catalog’s idempotent update path converge repaired config JSON for its fixed owned rows.
- Added regression coverage for both source contracts.

### Files changed in this milestone

- `backend/scripts/seed-animals-series.js`
- `backend/src/seeders/globalCatalogSeed.js`
- `backend/test/creche-content-contract.test.js`

### Verification

- Focused Crèche/early-years suite passed: 8/8 tests across four suites (`flagship-annual-pilot-seed`, `jolly-phonics-creche-contract`, `creche-content-contract`, and `placement-content-contract`).
- `node --check` passed for Animals, global catalog, annual pilot, and Jolly Phonics seeders.
- Frontend TypeScript check remains clean from the prior cycle; this milestone changed no frontend files.
- `git diff --check` passed.
- No seeder execution, database read/write, migration, deployment, or production change was performed.

### Remaining work

- Perform the planned bounded, read-only inventory of persisted Crèche/Playgroup game JSON before proposing any additive migration for older Animals/Jolly Phonics copies.
- Do not run the destructive Animals seeder against stored data without explicit migration approval.

IDLE: none — source seeding repair is complete for this loop; persisted-content inventory remains the next audit action.

2026-09-11 — FINAL: Milestone 12 source repairs complete; focused contracts 8/8, syntax checks and diff check clean; no database access, seeder execution, migration, or deployment performed.
2026-09-11 — FINAL CHECK: Removed readable animal labels from Animals Crèche picture data URIs; focused Crèche contract 2/2, syntax and diff checks clean.

2026-09-11 — COMPLETED: Milestones 7–11 repaired annual Crèche families, Animals/Jolly Phonics source contracts, and early-years placement copy; focused tests 9/9 and frontend TypeScript clean; no database or deployment writes.

2026-09-11 — CHECKPOINT: Nursery 1 integration wired in flagship annual seed for all nine domains and five weekly game families; source dry-run 1,350/1,350 valid; no seeder execution or database access.
2026-09-11 — CHECKPOINT: Nursery 1 regression now exercises all 9 subjects × 3 terms × 10 weeks, with explicit tap/matching/quiz/drag/stage assertions; syntax and diff checks clean.

## Milestone 14 — Nursery 1 authored annual integration

**Status:** Implemented in source; no database or seeder execution.

### Scope

The existing `NURSERY1_CONTENT` authored activity table is now connected to `buildConfig` for the Nursery 1 band across all nine canonical domains and all five weekly templates selected by `TEMPLATE_BY_WEEK`.

### Contract applied

- Receptive-recognition learning profile with concrete experience, vocabulary, oral/practical evidence and no unsupported reading requirement.
- Tap recognition: five explicit ID-keyed rounds with 3-choice visual options and tap-only input.
- Matching: five authored picture-to-name pairs and ten linked visual/text cards.
- Quiz: five authored picture-choice questions with 3–4 image-backed options and valid answer indices.
- Drag-sort: five narrated picture cards with an explicit story order criterion.
- Stage-sequence: five narrated emoji steps and one four-choice closing check.

### Verification pending

2026-09-11 — FINAL: Nursery 1 authored annual integration complete; focused backend contracts 9/9 across 4 suites, annual dry-run valid 1,350/1,350, seed syntax checks clean, frontend tsc clean, and git diff --check clean. No database access, seeder execution, migration, deployment, commit, or push performed.

2026-09-11 — CHECKPOINT: Source audit found remaining standalone Animals Crèche fill-in-blank generation and global Crèche catalog configs without explicit observation/tap-only multimodal metadata.

## Milestone 13 — Persisted legacy-row repair plan

**Status:** Plan recorded; inventory and migration are not yet authorized or executed.

### Objective

Repair already-persisted Crèche and Playgroup game-config JSON without blindly rerunning destructive seeders, silently rewriting approved content, or changing unrelated age bands. Source seed repairs do not alter rows that were stored before those fixes.

### Scope

Inventory `kids_game_configs` joined to `kids_lessons`, limited to early-years rows where either:

- the relational age field is `Crèche`, `Creche`, `Playgroup`, `Nursery`, `Nursery 1`, or `Nursery 2`; or
- the JSON declares the same early-years age level; or
- the row is an owned legacy Animals/Jolly Phonics/global-catalog copy whose lesson age is early-years.

The inventory must include `id`, `lesson_id`, `template`, `age_level`, `category`, `item_id`, `tier`, `content_state`, timestamps, and a redacted/classified representation of `config_json`. It must not expand to all age bands or include child progress data.

### Staged execution plan

#### Phase A — Read-only inventory (first action)

1. Resolve and print the effective database target without opening or displaying any `.env` file; refuse to run unless the target is explicitly the Kids content database and production mode is intentional.
2. Run an aggregate count by age, template, category, and content state before fetching rows.
3. Fetch rows in deterministic pages (for example, `ORDER BY id` with a strict limit), with a hard maximum and query timeout. Do not use `SELECT *` or an unbounded full-table JSON dump.
4. Save the inventory summary, row IDs, metadata, defect classifications, and per-row config hashes under `team-docs/reports/`; do not save credentials or unnecessary child-identifying data.
5. Classify each row as:
   - valid against the current schema and Crèche contract;
   - legacy but safely repairable from an owned source definition;
   - unsupported/ambiguous and requiring human content review;
   - malformed or missing lesson linkage;
   - published/approved and requiring replacement workflow rather than in-place patching.
6. Produce separate counts for Animals, Jolly Phonics, global catalog, placement/Playgroup, and unknown ownership. Unknown ownership is never auto-repaired.

#### Phase B — Repair manifest and dry-run

1. Build a reviewed manifest keyed by immutable config ID, containing the reason, source-of-truth builder, expected template, before-hash, proposed after-hash, and intended action.
2. Generate repaired JSON only from the current tested source builders or manually reviewed fixtures; never infer a correct answer from array position or generic legacy text.
3. Validate every proposed config against its template schema and the Crèche contract: concrete context/question, explicit answer key where applicable, visual/audio consistency, tap-only interaction where visual, and adult-observation metadata.
4. Run a dry-run that reports exact row-level actions and refuses to write if the before-hash has changed, the row is not in the manifest, or the repair would alter ownership/state fields.
5. Review the dry-run output and approve the bounded manifest separately from the inventory.

#### Phase C — Non-destructive migration

1. Take a machine-readable before snapshot of every manifest row, including the original JSON, metadata, and hashes; verify the snapshot before writes.
2. For generated or pending legacy rows, apply only allowlisted `config_json` repairs in a transaction, preserving IDs, lesson links, approval fields, and content state unless explicitly authorized.
3. For approved/published rows, do not overwrite in place by default. Create a deterministic replacement row or version, validate it, route it through the existing approval/review process, and switch publication only after the replacement is approved. Preserve the original row as recalled/retained history according to the approved rollout design.
4. Do not delete rows, run the destructive Animals seeder, alter schema, rewrite progress, or change unrelated age-band content.
5. Record affected IDs, before/after hashes, transaction result, validation result, and any skipped/conflicted rows.

#### Phase D — Post-migration verification and rollback readiness

1. Re-run the bounded inventory and confirm zero unresolved contract violations in the repaired manifest.
2. Verify lesson/config linkage, content-state transitions, approval records, library references, and child-play retrieval behavior.
3. Run focused persisted-content tests plus the relevant backend regression suite; use the hermetic `_test` databases for automated write tests.
4. Compare post-migration hashes to the manifest and confirm no out-of-scope rows changed.
5. If verification fails, stop rollout and restore only from the verified before snapshot through an approved rollback procedure; never use a broad table restore.
6. Append final counts and evidence to this report and leave unresolved rows explicitly ticketed for human review.

### Approval gates

- **Gate 1:** explicit approval to run the bounded read-only production inventory.
- **Gate 2:** approval of the generated repair manifest and dry-run output.
- **Gate 3:** explicit approval to write, with the policy for generated/pending versus approved/published rows confirmed.
- **Gate 4:** post-write verification before any broader rollout.

Until Gate 1 is granted, no database connection, inventory query, migration script execution, or seeder execution will be performed.

### Planned artifacts

- `team-docs/reports/creche-legacy-inventory-<date>.md` — bounded counts, classifications, and hashes.
- `team-docs/reports/creche-legacy-repair-manifest-<date>.json` — reviewed immutable-ID repair set.
- `team-docs/reports/creche-legacy-migration-<date>.log` — dry-run/write/verification evidence.
- A dedicated migration script only after the inventory confirms the exact ownership and replacement strategy; the existing destructive Animals seeder and generic multimodal migration are not substitutes.

### Current boundary

No database access, read or write query, migration execution, seeder execution, deployment, or source change was performed for this plan. The next action is Gate 1 approval, followed by a bounded read-only inventory.

2026-09-11 — CHECKPOINT: Persisted legacy-row plan recorded with read-only inventory, manifest, non-destructive repair, approval gates, hash checks, and rollback boundaries; no database access performed.
2026-09-11 — CHECKPOINT: Database configuration and migration conventions reviewed; implementation started with a bounded read-only inventory only, with no migration or write path.
2026-09-11 — IMPLEMENTED: Added `backend/scripts/inventory-creche-legacy.js`, a read-only-only bounded inventory with aggregate counts, keyset pagination, hard page/row caps, SHA-256 config hashes, payload redaction, ownership classification, and report-path confinement.
2026-09-11 — VERIFIED: Added `backend/test/creche-legacy-inventory.test.js`; focused suite 7/7 passed, script syntax and `git diff --check` passed, and the CLI refusal gate passed without confirmation flags.
2026-09-11 — GATE 1 BLOCK: No live database inventory was executed; awaiting explicit approval for the bounded production read-only query. No migration, seeder, write, or deployment performed.
