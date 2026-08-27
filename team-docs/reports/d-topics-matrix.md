# D — Topics Matrix (Phase D Content Factory)

Authored by phaseD 2026-08-23. Alignment: NERDC 9-Year BESDRP pre-primary (Nursery/Early Childhood) subject areas + Jolly Phonics sound-group ladder. Age-band mapping to the admin form's `age_level` enum (`GameCreator.tsx` AGE_LEVELS = Creche | Nursery | KG1 | KG2 | Primary):

| Brief band | Form age_level | Notes |
|---|---|---|
| Creche (~2-3y) | `Creche` | 1-step tasks, ≤3 items, emoji-first |
| Nursery 1-3 (~3-5y) | `Nursery` | **Form has NO Nursery 1/2/3 granularity** (logged D-OBS-03); single level used |
| KG (~5-6y) | `KG1`, `KG2` | KG1 = reception, KG2 = pre-primary exit |
| (out of scope) | `Primary` | Existing JP u5 already covers; no new Primary lessons |

## Coverage BEFORE Phase D (elite_content, all published)
Configs: drag-sort 40 · matching 32 · tap-recognition 32 · fill-in-blank 18 · quiz 15 · **puzzle-split 5 (all broken: empty `pieces` arrays → student sees "No puzzle data available.")** · **memory-pairs 0**. Scene scripts: 11 rows, none on the 15 JP lessons (b3-report gap).

## Phase D creation plan — 3 new series, 11 new lessons

Legend: T=template · JP=Jolly Phonics group · NERDC area: LC=Language/Communication, EN=Early Numeracy, SCI=Science/Discovery.

### Series PD-LETTERS "Sound Match Bank" (category `Letters`) — fills memory-pairs zero-gap, extends JP ladder with recall games
| # | Lesson title (form Title) | Band | T | Topic / alignment |
|---|---|---|---|---|
| 1 | Memory Match: First Sounds s a t i p n | Creche | memory-pairs | JP Group 1 letter↔picture recall; LC |
| 2 | Memory Match: Sounds c k e h r m d | Nursery | memory-pairs | JP Group 2; prereq = unit 1; LC |
| 3 | Memory Match: Word Builders cat sun pin | KG1 | memory-pairs | JP G1-G2 CVC word↔picture; prereq = unit 2; LC |

### Series PD-SHAPES "Number Sense Gym" (category `Shapes`) — NERDC Early Numeracy ladder 1-10
| # | Lesson title | Band | T | Topic / alignment |
|---|---|---|---|---|
| 4 | Tap the Number: 1 2 3 | Creche | tap-recognition | number recognition 1-3, cross-modal image→text; EN |
| 5 | Order the Numbers: 1 to 5 | Nursery | drag-sort (flat ordering schema) | sequencing 1-5; EN |
| 6 | Missing Number: Fill the Gap | KG1 | fill-in-blank | numbers after/between within 10; EN |
| 7 | Count and Choose Quiz | KG2 | quiz | counting/addition within 10 MCQ; EN |

### Series PD-ANIMALS "Animal World Discovery" (category `Animals`) — NERDC Science/Discovery
| # | Lesson title | Band | T | Topic / alignment |
|---|---|---|---|---|
| 8 | Match Mother and Baby Animals | Creche | matching | vocabulary, pairing; SCI/LC |
| 9 | Farm or Forest? Sort the Animals | Nursery | drag-sort (bucket schema) | classification; SCI (also proves/disproves bucket-schema UX) |
| 10 | Puzzle: Sunny Farm Picture | KG1 | puzzle-split **with explicit SVG-data-URI pieces** | spatial reasoning + parts-of-whole; SCI/creative — repairs broken template pattern |
| 11 | Animal Homes Quiz (+ teach/reinforce scene scripts) | KG2 | quiz + **scene-script** | habitats; SCI; demonstrates full form flow incl. optional Step-4 scenes |

### Scene-script backfill (template #8, closes b3-report gap)
All **15 existing `lesson-jp-*` lessons** get hand-written `{scenes:[{id,text,type}]}` teach/reinforce wrappers (u1-u5 × intro-teach-reinforce). No attach-to-existing-lesson API exists (D-OBS-01) → rows hand-authored then inserted mirroring the manual endpoint's exact output, published via the official `POST /kids/lessons/:id/approve` state machine. Authored copy kept in `team-docs/templates/scenes-jp-backfill.json`.

## Template × band coverage AFTER Phase D
| Template | Crèche | Nursery | KG1 | KG2 | Source |
|---|---|---|---|---|---|
| matching | ✅#8 | – | – | – | new |
| tap-recognition | ✅#4 | – | – | – | new |
| drag-sort | – | ✅#5 flat, ✅#9 bucket | – | – | new |
| quiz | – | – | – | ✅#7 ✅#11 | new |
| fill-in-blank | – | – | ✅#6 | – | new |
| puzzle-split | – | – | ✅#10 fixed-pattern | – | new |
| memory-pairs | ✅#1 | ✅#2 | ✅#3 | – | new (first ever) |
| scene-script | ✅(JP u1) | ✅(JP u2) | ✅(JP u3+#10/#11) | ✅(JP u4/#11) | new + backfill |

Every band × core-subject cell touched; all 8 templates covered; both drag-sort schemas exercised deliberately as a controlled experiment (D-OBS-06).

## OUTCOME ADDENDUM (2026-08-23 run complete)
Executed as planned EXCEPT the 3 memory-pairs lessons (#1-#3): submissions 500 because `kids_game_configs.template` DB enum lacks 'memory-pairs' while form+controller accept it (**D-OBS-04**, supervisor ALTER required). Actual: **8/11 lessons published & body-verified**, 2 series fully unit-chained (s1 empty pending fix), scene scripts on new lesson + **15/15 JP backfill** (b3 gap closed). IDs: reports/d-created-content.md · verification sweep 26/26 PASS (tmp/d-verify.js) · DB delta cross-checked.

