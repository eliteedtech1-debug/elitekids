# D — Created Content IDs (Phase D)

phaseD · 2026-08-23 · all authored via manual workflow, published & body-verified (26/26 sweep PASS).

## Series (kids_game_series)
| Key | Name | Category | Series ID | Units |
|---|---|---|---|---|
| s1 | Sound Match Bank (Jolly Phonics Memory) | Letters | `24709690-e879-4262-bee0-1493feab3746` | **0 — BLOCKED by D-OBS-04** (memory-pairs enum missing; payloads ready) |
| s2 | Number Sense Gym (Counting 1-10) | Shapes | `766a9eb2-2744-412c-87bc-d0ee54c4c256` | 4 units, prereq-chained |
| s3 | Animal World Discovery | Animals | `d945a82c-8e9d-4e01-8abb-0f5bde98f27d` | 4 units, prereq-chained |

## Lessons (kids_lessons, all global, all published)
| Slug | Lesson ID | Template | Band |
|---|---|---|---|
| d-num-tap-cr | `e8ca5ed6-7f17-4ecb-b494-15612f02e708` | tap-recognition | Creche |
| d-num-sort-nur | `3aba0360-9661-47f8-b130-d7786ee2c23e` | drag-sort (flat ordering) | Nursery |
| d-num-fib-kg1 | `b394fb49-2379-4171-aa2f-4f2ff4716309` | fill-in-blank | KG1 |
| d-num-quiz-kg2 | `73cd3079-07fd-4e77-ae67-49c4c116559c` | quiz (multi-question) | KG2 |
| d-ani-match-cr | `4dd05770-687c-444b-9e6a-7056760d9dff` | matching | Creche |
| d-ani-sort-nur | `930221ad-abde-4e1d-b7e7-eeb2cabca937` | drag-sort (bucket schema) | Nursery |
| d-ani-puzzle-kg1 | `8b4189a4-d42b-475a-a0b9-e5b0e2b29396` | puzzle-split WITH SVG pieces | KG1 |
| d-ani-quiz-kg2 | `6ac1cb1a-cee8-4f7b-9116-734f85abd9bd` | quiz + scene scripts | KG2 |

Blocked payloads (ready to submit post-ALTER): d-jp-mem-u1 / d-jp-mem-u2 / d-cvc-mem-u3 in `team-docs/templates/d-series1-sound-match-bank.json`.

## Units (kids_game_units)
s2: eb939c76-145b-45af-a6c3-d90a90db1e1e (u1) → 6dbbcc07-6456-442d-88b1-c38d2f9091b1 (u2) → 7e8f086d-d00a-4e18-ba6c-15ee12a1bf7e (u3) → 985a3d66-da64-46bf-8ae5-35308a9bc6ad (u4)
s3: d3f04b53-ed67-40c8-b0bb-1d32e1f572da (u1) → da3bab79-c9c3-4c75-95f5-3bc75e3972a7 (u2) → 036203f0-5f80-4584-9e05-7e5b8659a8f0 (u3) → 2b6a9144-d28c-4662-bef8-5d6877cd4782 (u4)
Each unit's content_items links its lesson ({item_id, lesson_id}); each u≥2 has prerequisite_unit_id = previous unit id.

## Scene scripts added
- d-ani-quiz-kg2: 1 wrapper row (intro/teach/match beats), published via form flow.
- **JP backfill: 15/15 lesson-jp-* lessons now have a published wrapper row** (b3-report gap closed). Insert manifest: tmp/d-scenes-manifest.json; authored copy: templates/scenes-jp-backfill.json. Method note: rows inserted as pending_human_review mirroring createLessonManual output incl. scene_script approval rows (form path impossible pre-D-OBS-01 fix), then published via official POST /kids/lessons/:id/approve.

## Net DB delta (elite_content)
lessons +8 global · game_configs +8 (incl. first-ever memory… none yet — 8 = tap/sort/fib/quiz/match/sort-bucket/puzzle/quiz) · scene_scripts +16 (1 new lesson + 15 JP backfills) · approvals +24 pending→approved trail rows · series +3 · units +8. Zero schema changes performed.
