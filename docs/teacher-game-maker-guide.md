# Teacher's Game Maker Guide

*Elite Kids · manual game creation with the admin form (no AI). First written 2026-08-23 from the Phase D content-factory run; updated 2026-09-02 (visual Easy-mode editor + scene-script GUI) and 2026-09-03 (9 game types — Label Diagram + Stage Sequence added). Companion templates live in `team-docs/templates/`.*

## Who this is for
Teachers and admins who want to build a lesson game **with full control over every question, picture and reward**. You will use the **Create Game Manually** wizard (`/teacher/create-game` → "Create Game Manually"). Nothing here uses the AI generator. You do **not** need to know JSON — every step now has a plug-&-play visual editor, with an optional Advanced tab if you want full control.

## The 5 steps at a glance
| Step | Screen | You provide |
|---|---|---|
| 1 | Lesson Details | Title, Subject, Age Level (Creche/Nursery/KG1/KG2/Primary), optional NERDC alignment |
| 2 | Template | One of 9 game types (table below) |
| 3 | Config | The game content — a **visual form** per template (Easy mode) or raw JSON (Advanced) |
| 4 | Scenes (optional) | Intro story / narration shown before the game — built as **scene cards** |
| 5 | Review & Send | Read the summary, then submit → goes to the approval queue |

After you submit, an approver publishes it from **Teacher Approvals**. Students see it immediately after.

## Choosing a template
| Template | Best for | Age fit | Content you write |
|---|---|---|---|
| Matching | pair two things by tapping (mother↔baby, word↔picture) | Creche+ | `pairs` list |
| Memory Pairs | flip-card concentration recall | Creche+ | `assets.items` in mutual pairs |
| Tap Recognition | "tap the right one" listening rounds | Creche+ | `items`, one per round |
| Drag & Sort | put things in order 1→N | Nursery+ | flat `items[{num,label}]` |
| Quiz | multiple choice, 1 or many questions | KG1+ | `questions[]` + `correctId` |
| Fill in the Blank | complete the sentence/number sequence | KG1+ | `sentences[]` + `wordBank` |
| Puzzle Split | jigsaw with easy/hard levels | KG1+ | `difficulties.*.pieces` (never leave empty!) |
| Label Diagram | tap the part of a real picture when its name is said — body, tree, car | Nursery+ | `hotspots` on a `diagram.image` (5+ parts) |
| Stage Sequence | watch an ordered set of step pictures go simple → harder (clock times, plant growth, life stages), then answer checks | Nursery+ | `steps[]` in order + `assessment[]` |

**Scene scripts** are not a game type — they are Step 4 on any lesson. You build them as **scene cards** in Easy mode (each card = one line the student sees/hears before or after play). Under the hood they are saved as one wrapper object `{ "scenes": [ ... ] }`. Scene types: `intro`, `teach`, `reinforce`, `recap`, and `game checkpoint` (a checkpoint drops the student into a real game mid-story, then continues the scenes). They are optional — leave them empty to skip.

## 🎬 Turning a learning objective into a story game

The **walking skeleton of a good game**: every story game follows the same arc. Write your scenes to express it, then pick the template whose gameplay matches the objective.

```
1  INTRO      Set the scene  → plot hook, character, place
2  TEACH      Show the skill → narrate HOW to do it + one worked example
3  [THE GAME] Player DOES it  → the template you chose in Step 2
4  REINFORCE  Warm recap + praise → what they just did, why it matters
5  MATCH      Extend/connect → one more link to what they know (optional)
```

### Step 1 — Write down the learning objective
Start with a single, kid-sized objective. Examples:
- "Count objects 1–5 and say the total."
- "Identify the letters b, d, p, q by sound."
- "Name 5 farm animals and match each to its sound."

### Step 2 — Give it a character, a place, a problem
Turn the objective into one sentence a child can picture: *"Maya the farmer lost her 5 fruits and needs help counting them back into the basket."* Borrow from the template's content — if your game is **Counting Fruits 1–5**, Maya, the farm, and the fruit ARE the story glue.

### Step 3 — Map the arc to your template
| Game type | Does the objective ask the child to… | Story glue to write in scenes |
|---|---|---|
| Matching | *pair* two things | "Maya's chicks are lost! Match each hen to her chick." |
| Memory Pairs | *recall* where things are | "The animals hid behind cards — find each baby's mother." |
| Tap Recognition | *pick the right one* | "A sound plays — tap the animal that makes it." |
| Drag & Sort | *order / sequence* | "Put the numbers back in order so the rocket can launch." |
| Quiz | *choose the answer* | "Maya asks questions — tap the correct answer to move on." |
| Fill in the Blank | *complete the sentence/steps* | "Fill in the missing number so the count finishes." |
| Puzzle Split | *reassemble an image* | "Put the picture back together to reveal the farm." |

### Step 4 — Write the 3–5 scene cards
Break your story sentence into scene cards. Keep each card to **one short line** a child can hold in memory, and end the last `teach` card with what the game will ask:

**Worked example — "Counting Fruits 1–5" (Matching):**
```
1 intro      "Maya the farmer picked 5 fruits — but the basket tipped over!"
2 teach      "Tap a fruit on the left, then tap the basket with the same number on the right."
3 teach      "There is 1, 2, 3, 4, 5. Count them with your finger as you match."
4 reinforce  "Wonderful! You helped Maya save all 5 fruits. Counting is fun!"
```
Then in **Step 3 (Config)**, make the Matching pairs literally the fruit↔number pairs from the story (🍎→"1", 🍌→"2", 🍊→"3", 🍇→"4", 🍉→"5").

### Step 5 — Test it before you send it
Use the new **Test Play** button on the step-5 review screen (and **Preview** on any lesson card or approval). You should be able to narrate the intro, play through, and hear the recap — exactly like a student, with **no progress saved**. If the story and the gameplay don't line up, edit the scenes or the config and test again before submitting.

## 🧩 One game, one topic (the series rule)

**A game teaches ONE topic — never two.** If your objective says *"recognize coins AND tell the time"*, that is two topics trying to squeeze into one game. A child this age learns **one idea at a time** — mixing two topics makes each one half-taught and the game feel scattered. One topic per game, always.

**The one-topic check (before you submit):**
1. Read your lesson title and objective out loud.
2. If they join two ideas — **"Money and Time"**, "Colors and Shapes", "Count and Write" — that is a two-topic game. Split it.
3. One game = one verb + one noun: "Count objects 1–5", "Read o'clock times", "Recognize coins", "Label the parts of the human body".

**Big topics become a SERIES** — a set of ordered units, each unit covering **ONE topic**, each unit built as its own lesson(s). Units build on the previous one, and the **final unit can be a story that connects them all** — that is where two topics *may* meet, inside a narrative, never inside a single round of questions.

**Worked example — the "Money & Time" series** (instead of one mixed "Money and Time" game):

| Unit | ONE topic per unit | Example game |
|---|---|---|
| 1 · Basic Time & Watch | Read o'clock times (hour hand, 1–12) | Stage Sequence: watch the hour hand move 1:00 → 2:00 → 3:00 (real analog clock), then tap the 3 o'clock clock |
| 2 · Money — Coins | Recognize coins (₦1, ₦2, ₦5, ₦10) | Matching: coin picture ↔ value |
| 3 · Intermediate Time & Watch | Half past, quarter past, quarter to (:15 :30 :45) | Stage Sequence: order clock faces 3:00 → 3:15 → 3:30 → 3:45, then read each time |
| 4 · Money — Naira Notes | Recognize notes (₦20 → ₦1000) | Drag & Sort: order notes by value |
| 5 · Advanced Watch | Minutes to the hour ("10 to 4"), digital ↔ analog | Stage Sequence with analog-clock checks ("What time is 10 minutes to 4?") |
| 6 · Final story unit | **Connects** the series: saving money over time | Story game: "Adaeze saves ₦100 every hour…" |

**The final unit is the payoff.** After the separate units, one story game may connect them: *"Adaeze saves ₦100 every hour. She saves for 3 hours — how much has she saved?"* The child reads the clock (3 hours on the story clock) to answer the money question (₦100 × 3). The story makes the two topics feel like one big idea — without ever mixing two topics inside a single game's questions.

Name each unit like the topic it teaches ("Basic Time & Watch", "Money — Coins"), keep them in learning order, and write each unit's story/scenes around only that unit's topic. See the guide section **Turning a learning objective into a story game** above for the story steps.

## Filling in the forms (Step 3 Config & Step 4 Scenes)
Both content steps now open in **Easy mode** by default — no JSON required.

**Step 3 — Config form.** Each template gets purpose-built controls instead of raw JSON: item rows, a "tap the CORRECT answer" picker for quizzes, emoji pickers (`😊`), a **Library** button to grab images, and word-bank chips for Fill-in-the-Blank. Use **Reset to template** to load a safe starting config, then only change the words/emoji you need. A live **green ✓ Valid** badge confirms your game is well-formed.

**Step 4 — Scene cards.** Press **Add scene** to create a narration card, type what the narrator says, and pick a **Scene type** (Intro / Teach / Reinforce / Match). Use the ⭡ / ⭣ arrows to reorder cards and the ✕ to delete one. The scene order and text are exactly what students see — intro first, recap last.

**Advanced (JSON) tab.** Every editor also has an **Advanced (JSON)** tab that shows the exact same config as editable JSON. Anything the visual forms don't cover is still reachable here, and the two views stay in sync — switch back and forth freely. If the JSON becomes invalid, Easy mode steps aside automatically and a red hint tells you to fix it before continuing.

## Golden rules (learned the hard way)
1. **No external image links.** Use emoji in labels (`"Hen 🐔"`) or SVG data-URI art. Broken URLs = broken games.
2. **Memory Pairs**: every item needs a partner pointing back (`a.matches=b` AND `b.matches=a`). Give picture cards an `image`; letter cards show their first letters.
3. **Drag & Sort**: to sequence numbers use plain `items:[{"num":3,"label":"3"},...]` — order comes from `num`. (Bucket-style sorting currently plays as ordering; see obstacle log D-OBS-06.)
4. **Puzzle Split**: fill `pieces` for EVERY difficulty you keep. Empty pieces = dead screen for kids.
5. **Quiz**: 2+ questions belong in `questions[]`; each needs its own `correctId`.
6. **Fill in the Blank**: the gap marker is exactly three underscores `___`; answers are case-insensitive.
7. Leave `lessonId` as-is — the app fills it automatically.
8. If Memory Pairs fails to save with "Server error", it is a known platform bug (D-OBS-04) — report it, don't retry.

## Copy-paste starters (for the Advanced tab)
Full worked lessons you can paste into the **Advanced (JSON)** tab of Steps 3-4 (or use as a reference while filling the forms):
- `team-docs/templates/d-series1-sound-match-bank.json` (Memory Pairs ×3)
- `team-docs/templates/d-series2-number-gym.json` (Tap / Sort / Fill-blank / Quiz)
- `team-docs/templates/d-series3-animal-world.json` (Matching / bucket Sort / Puzzle WITH pieces / Quiz + scenes)
- Minimal per-field skeletons: `team-docs/templates/config-tpl-<template>.json`
- Scene wrappers: `scenes-jp-backfill.json`

## After publishing — check your work
Open the student view for your lesson (or ask the approver to). A healthy game returns your template and content from `GET /kids/lessons/:id/game`; scenes return from `/scenes`. If scenes were skipped, see D-OBS-08/D-OBS-01 in `team-docs/reports/d-form-obstacles.md`.

**Better: preview instead of guessing.** Use **Test Play** on the game-creator review step (before submit), **Preview** on any lesson card, and **Preview** on any pending approval. Preview reads the game config regardless of its status — including `pending_human_review` — and plays it exactly as a student would, **without saving any progress**. So a reviewer can approve with confidence that the story and gameplay match the objective.

## Spaced repetition & the Review Zone (what your students see)
Once a game is published and a student plays it, Elite Kids schedules it for **spaced repetition** so learning sticks.

- Students see a **Review Zone** on their home screen. It shows four tiles — **Due Today**, **Reviewed**, **Day Streak** and **Accuracy** — plus a list of each review that is due now.
- Each due review is a short **`?mode=practice`** replay of the game (not a fresh quiz, and not graded). Tapping it re-opens that lesson for low-stakes practice.
- The zone is driven by the adaptive engine: accuracy over the last 7 days, difficulty level, and a `next_review_at` schedule decide when each topic is due again.
- As a teacher you don't have to do anything — reviews populate automatically from real play. If a topic keeps coming back due (low accuracy), that's a signal a child may need a small reteach or a different game.

## Known rough edges (full list: reports/d-form-obstacles.md)
**Resolved in the 2026-09-02 GUI update:** D-OBS-02 (rich scene JSON invisible) and D-OBS-09 (JSON-only editing) are gone — Step 3 & 4 are now visual.
Remaining: D-OBS-01 can't add scenes later · D-OBS-03 no Nursery 1/2/3 · D-OBS-04 Memory Pairs save bug · D-OBS-05 errors all say "Server error." · D-OBS-06 bucket sort degrades · D-OBS-07 empty puzzle pieces pattern.

## Guided tour outline (for the in-app onboarding tour)
1. **Welcome** (Step-1 header): "Build a learning game in 5 steps — no AI, your rules."
2. **Lesson details**: name it like a topic ("Counting 1-10"), pick ONE age band; the band drives difficulty defaults.
3. **Template gallery** (Step-2 cards): hover each card; caption = classroom activity ("Flip cards, find pairs!").
4. **Start from a template** (Step-3 Easy mode): press *Reset to template*, then fill the **form controls** (items, the tap-the-correct-answer picker, emoji/Library). Green check = valid.
5. **Scenes made simple** (Step-4 Easy mode): press *Add scene*, type the narration, pick a type, reorder with ⭡⭣. Advance to JSON only if you need it.
6. **Send for review** (Step-5): read the summary, submit — explain pending → approved states; where the approvals screen lives.
7. **Test drive**: open the student game page for the new lesson; play once in Learning mode.
8. **When things fail**: error toast meanings; pointer into the guide's golden rules + known issues list.
9. **Review Zone**: mention students get scheduled low-stakes practice replays of published games (spaced repetition).
