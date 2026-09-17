# Band Count Verification + Primary Progressive Band — 2026-09-10

## 1. Table verified against LIVE elite_kids (read-only, published rows only)

| Band | Lessons | GameConfigs | Series | Units | Verdict |
|------|--------:|------------:|-------:|------:|---------|
| Crèche | 2 | 2 | 9 | 270 | ✅ |
| Playgroup | 0 | 0 | 9 | 270 | ✅ (zero published early content — global catalog floor only) |
| Nursery 1 | 2 | 2 | 9 | 270 | ✅ |
| Nursery 2 | 1 | 1 | 9 | 270 | ✅ |
| Kindergarten | 1 | 1 | 9 | 270 | ✅ |
| Primary | 2 | 2 | 0 | 0 | ✅ |

**Evidence (2026-09-10 live query):**
- Published lessons by NERDC age_level: Crèche 2, Nursery 1 2, Nursery 2 1, Kindergarten 1, Primary 2 — Playgroup 0. ✅ matches Lessons column.
- Published configs by platform band: Creche 2, Nursery 2, KG1 1, KG2 1, Primary 2. ✅ maps 1:1 to the GameConfigs column.
- Series/Units columns = flagship annual pilot coverage per band (9 subjects × 30 weeks = 270 units; 9 series per band). Total: 45 series, 1350 units, all `fp-*`, all **pending_human_review** in prod. Primary row shows 0/0 because the pilot plan's `bands` array had NO Primary entry.
- **Root cause of "seed excluded primary":** `curriculum/00-framework/flagship-annual-pilot-plan.json` defined only 5 early-years bands (creche, playgroup, nursery-1, nursery-2, kindergarten). `kids_lessons.age_level` enum already carries the new NERDC set including 'Primary' — storage was ready, the plan was not.

## 2. NERDC primary resources (researched 2026-09-10)

- NERDC Basic Education Curriculum (BEC) has full Primary curricula: **Primary 1-3** (`/content_manager/pri1-3.html`) and **Primary 4-6** (`/content_manager/pri4-6.html`), under the BEC home (`/content_manager/curriculum.html`).
- Official subject set (Primary 1-6): English Studies, Mathematics, Basic Science & Technology, National Values, Culture & Creative Arts (CCA), Pre-Vocational Studies + language curricula (French, Arabic, Hausa, Igbo, Yoruba, Islamic Studies).
- Seeded as 6 canonical Primary subjects in the plan JSON (`primarySubjects`): english-studies, mathematics, basic-science-technology, national-values, culture-creative-arts, pre-vocational.

## 3. Implementation (design + code, DONE)

**"1 class fits all primary classes" design** — one entity class `Primary` (rank 5) for ALL Basic/Primary 1-6 classes:
- `classToAgeLevel` (Q46) already maps Basic 1-6 / Primary 1-6 / JSS / elder classes → Primary band.
- Primary games are **linearly progressive**: 30-week ladder per subject, 6 complexity levels (≈ Basic/Primary 1-6), unit chain with prerequisite locks.
- **2 games per subject per week** (user directive) — second slot uses a template 5 weeks ahead; unit holds both games (`content_items` length 2).
- **Up to 15 question items per lesson** (user directive, exceeds the 10-item early-years cap):
  - `game-engine/schemas/quiz.schema.json` questions maxItems 10→15
  - `game-engine/schemas/stage-sequence.schema.json` steps/assessment maxItems 10→15
  - `backend/src/controllers/kidsLessonBridges.js` validator 5-10 → 5-15
  - `curriculum/00-framework/game-size-and-module-standard.md` documents 5-15 Primary exception
- **Learning parameters embedded per Primary game** (`config_json.pedagogy`): domainOfKnowledge (cognitive/psychomotor/affective rotating), cognitiveLoad (low→moderate→high), learningObjective, measurement.successEvidence + outcome, application (specific→near-transfer→generalization), concreteness (concrete→representational→abstract), reinforcement (positive + XP reward), reward/punishment in XP (xpReward escalates; xpPenaltyOnWrong=5 from level 3, retryPenalty).
- **Published directly** (user directive: content already under intense testing/validation) — no `pending_human_review` gate: content_state='published', approved_by/approved_at set, published_at set, **is_global=1** on all lessons.
- Plan JSON updated: primary band entry + ladder metadata (`gamesPerWeek: 2`, `itemsPerGame: up to 15`).

**Files changed:**
- `curriculum/00-framework/flagship-annual-pilot-plan.json` (+primary band, +primarySubjects)
- `backend/src/seeders/flagshipAnnualPilotSeed.js` (subjectsForBand, gamesPerWeek, slot loop, itemLabels count, pedagogy ladder, published state)
- `backend/src/index.js` (boot log text)
- `backend/test/flagship-annual-pilot-seed.test.js` (6 bands / 1710 games / published / ladder asserts)
- `game-engine/schemas/quiz.schema.json`, `game-engine/schemas/stage-sequence.schema.json` (maxItems 15)
- `backend/src/controllers/kidsLessonBridges.js` (5-15 validator)
- `curriculum/00-framework/game-size-and-module-standard.md` (Primary exception)

## 4. Verification status

- `node src/seeders/flagshipAnnualPilotSeed.js --dry-run` → **valid: true, errors: []**, counts {bands:6, subjects:9, primarySubjects:6, terms:3, weeksPerTerm:10, games:1710, series:51, units:1530, curriculumPoints:1710, libraryGames:1710}
- Jest `flagship-annual-pilot-seed.test.js` → **4/4 PASS** (2026-09-10)
- `node --check` clean on seed + kidsLessonBridges + index.js
- Related suites `curriculum.test.js`, `series-units.test.js`, `b2-story.test.js` pass (`--runInBand`; combined parallel run showed 5 pre-existing failures in **untracked** `test/game-config-rules.test.js` — created 00:02Z, imports `playableItemCount`/`playableItemErrors` which don't exist at HEAD: `TypeError`, NOT caused by this work; needs its own brief or deletion).

## 5. PROD SEED EXECUTED + RE-VERIFIED (2026-09-10, explicit user order)

Ran `node src/seeders/flagshipAnnualPilotSeed.js --confirm` from backend/ (NODE_ENV=production → elite_kids).
Validation valid=true, then: **1,710 games published (6 bands, 51 series)**. All rows now `published` + `is_global=1`; the previous 1,350 pending_human_review rows were upserted to published.

**Post-seed band-count table (published, live elite_kids):**

| Band | Lessons | GameConfigs | Series | Units |
|------|--------:|------------:|-------:|------:|
| Crèche | 272 | 542* | 9 | 270 |
| Playgroup | 270 | 0* | 9 | 270 |
| Nursery 1 | 272 | 272* | 9 | 270 |
| Nursery 2 | 271 | 271* | 9 | 270 |
| Kindergarten | 271 | 271* | 9 | 270 |
| Primary | **362** | **362** | **6** | **180** |

\* Configs store legacy platform bands: Creche 542 (=270 cr + 270 pg + 2 global), Nursery 272, KG1 271, KG2 271, Primary 362. The Lessons column uses NERDC labels.

**Primary target matched:** 360 pilot lessons/configs (6 subjects × 30 weeks × 2 games) + 2 pre-existing global-catalog lessons = **362 lessons / 362 configs / 6 series / 180 units** ✓ (user expectation: 360 lessons / 360 configs / 6 series / 180 units — pilot delta is exactly 360/360/6/180; +2 are the long-standing GLESSON-RANK3-* global floor).

**Playgroup now has 270 published lessons** (was 0) — the band is no longer empty. Its configs share the `Creche` platform band (542 = cr+pg), which is why the GameConfigs column shows 0 for it when mapped naively; lesson-level counts are the authoritative NERDC view.

All 1,710 fp- lessons: content_state=published, is_global=1, approved_by set.

## 6. Playgroup one-class-fits-all ladder — IMPLEMENTED + LIVE (2026-09-10)

- Plan JSON: added `ladder` metadata to the Playgroup band (levels 6, gamesPerWeek 1, itemsPerGame 5, toddler-capped parameters).
- Seed `flagshipAnnualPilotSeed.js`: pedagogy block now applies to `primary` OR `playgroup`. Playgroup is age-capped: cognitiveLoad low→moderate (never high), application specific→near-transfer (never generalization), concreteness concrete→representational (never abstract), reinforcement positive-only (xpPenaltyOnWrong=0, retryPenalty=false). Primary keeps full range + XP penalty from level 3.
- Validation: every Primary AND Playgroup game must carry pedagogy ladder metadata.
- Test: new `Playgroup: same one-class-fits-all ladder with toddler-capped learning parameters` — 5/5 suite PASS.
- **Re-ran idempotent seed --confirm**: 1,710 games published again (6 bands, 51 series). Live verification: 270/270 Playgroup configs + 360/360 Primary configs carry `pedagogy`; level-30 Playgroup game = {lvl:6, cognitiveLoad:moderate, application:near-transfer, concreteness:representational, xpPenalty:0}; level-1 = {lvl:1, cognitiveLoad:low}. ✓
- Playgroup final: 270 published lessons (NERDC age_level 'Playgroup'), 270 configs (platform band 'Creche'), 9 series, 270 units — all is_global=1.

## 7. Stale test resolution

- The stale untracked `test/game-config-rules.test.js` was FIXED (not deleted): implemented `playableItemCount`/`playableItemErrors` + `puzzle-split` chain-round rule in `backend/src/services/gameConfigRules.js` (6/6 PASS; standard doc updated — puzzle-split IS a valid chain round, implemented rule).