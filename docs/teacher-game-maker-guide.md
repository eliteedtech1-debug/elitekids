# Teacher's Game Maker Guide

*Elite Kids · manual game creation with the admin form (no AI). Written from the Phase D content-factory run, 2026-08-23. Companion templates live in `team-docs/templates/`.*

## Who this is for
Teachers and admins who want to build a lesson game **with full control over every question, picture and reward**. You will use the **Create Game Manually** form (`/teacher/game-creator` → "Create Game Manually"). Nothing here uses the AI generator.

## The 5 steps at a glance
| Step | Screen | You provide |
|---|---|---|
| 1 | Lesson Details | Title, Subject, Age Level (Creche/Nursery/KG1/KG2/Primary), optional lesson text |
| 2 | Template | One of 7 game types (table below) |
| 3 | Config (JSON) | The game content — start from "Reset to template" then edit |
| 4 | Scenes (optional) | Intro story text shown before the game |
| 5 | Review & Send | Submit → goes to the approval queue |

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

**Scene scripts** are not a 7th card — they are Step 4 on any lesson. Author them as one wrapper object: `{ "scenes": [ {"id":1,"text":"...","type":"intro"}, ... ] }`. Types used today: `intro`, `teach`, `reinforce`, `match`.

## Golden rules (learned the hard way)
1. **No external image links.** Use emoji in labels (`"Hen 🐔"`) or SVG data-URI art. Broken URLs = broken games.
2. **Memory Pairs**: every item needs a partner pointing back (`a.matches=b` AND `b.matches=a`). Give picture cards an `image`; letter cards show their first letters.
3. **Drag & Sort**: to sequence numbers use plain `items:[{"num":3,"label":"3"},...]` — order comes from `num`. (Bucket-style sorting currently plays as ordering; see obstacle log D-OBS-06.)
4. **Puzzle Split**: fill `pieces` for EVERY difficulty you keep. Empty pieces = dead screen for kids.
5. **Quiz**: 2+ questions belong in `questions[]`; each needs its own `correctId`.
6. **Fill in the Blank**: the gap marker is exactly three underscores `___`; answers are case-insensitive.
7. Leave `lessonId` as-is — the app fills it automatically.
8. If Memory Pairs fails to save with "Server error", it is a known platform bug (D-OBS-04) — report it, don't retry.

## Copy-paste starters
Full worked lessons ready to paste into Steps 3-4:
- `team-docs/templates/d-series1-sound-match-bank.json` (Memory Pairs ×3)
- `team-docs/templates/d-series2-number-gym.json` (Tap / Sort / Fill-blank / Quiz)
- `team-docs/templates/d-series3-animal-world.json` (Matching / bucket Sort / Puzzle WITH pieces / Quiz + scenes)
- Minimal per-field skeletons: `team-docs/templates/config-tpl-<template>.json`
- Scene wrappers: `scenes-jp-backfill.json`

## After publishing — check your work
Open the student view for your lesson (or ask the approver to). A healthy game returns your template and content from `GET /kids/lessons/:id/game`; scenes return from `/scenes`. If scenes were skipped, see D-OBS-08/D-OBS-01 in `team-docs/reports/d-form-obstacles.md`.

## Known rough edges (full list: reports/d-form-obstacles.md)
D-OBS-01 can't add scenes later · D-OBS-02 rich scene JSON invisible · D-OBS-03 no Nursery 1/2/3 · D-OBS-04 Memory Pairs save bug · D-OBS-05 errors all say "Server error." · D-OBS-06 bucket sort degrades · D-OBS-07 empty puzzle pieces pattern · D-OBS-09 JSON-only editing.

## Guided tour outline (for the in-app onboarding tour)
1. **Welcome** (Step-1 header): "Build a learning game in 5 steps — no AI, your rules."
2. **Lesson details**: name it like a topic ("Counting 1-10"), pick ONE age band; the band drives difficulty defaults.
3. **Template gallery** (Step-2 cards): hover each card; caption = classroom activity ("Flip cards, find pairs!").
4. **Start from a template** (Step-3): press *Reset to template*, change ONLY the words/emoji between quotes; green check = valid JSON.
5. **Scenes made simple** (Step-4): paste a `scenes` wrapper; warn: only this shape reaches students.
6. **Send for review** (Step-5): explain pending → approved states; where the approvals screen lives.
7. **Test drive**: open the student game page for the new lesson; play once in Learning mode.
8. **When things fail**: error toast meanings; pointer into the guide's golden rules + known issues list.
