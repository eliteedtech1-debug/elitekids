# E1 Brief — NERDC Curriculum Code Layer

Context: EliteKids kids education platform (React/Vite + Express/Sequelize + MySQL `elite_content`; 7 game templates); the Jolly Phonics 15-lesson series `lesson-jp-u1..u5` must gain official NERDC curriculum codes.
Execution: an autonomous agent works STEPS in order on the VPS; after every STEP append `[CHECKPOINT HH:MMZ] <done>` to `team-docs/reports/e1-progress.md`.

## STEPS

1. **STEP 1 — Read context.**
   Read `backend/src/models/KidLesson.js`, `backend/src/models/KidCurriculumPoint.js`, `backend/src/models/KidGameConfig.js`, `backend/src/seeders/jollyPhonicsSeriesSeed.js`, and all docs matching `01-PLANNING/15-CURRICULUM-MAPPING-*.md` (all under `/var/www/html/elite-kids`).
   Confirm exact table/column names, seed data shape, and the `KidCurriculumPoint.mapped_item_ids` linkage mechanism before changing anything.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E1 step1 models/seeder/curriculum-mapping docs reviewed` to `team-docs/reports/e1-progress.md`.

2. **STEP 2 — Additive migration.**
   Write and run one additive migration adding nullable columns `nerdc_code VARCHAR(64)`, `nerdc_strand VARCHAR(128)`, `nerdc_sub_strand VARCHAR(128)` to BOTH `kids_lessons` and `kids_curriculum_points` in `elite_content`. No destructive change of any kind.
   MUST capture `SHOW CREATE TABLE kids_lessons` and `SHOW CREATE TABLE kids_curriculum_points` BEFORE and AFTER the migration into the progress log.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E1 step2 migration applied; before/after SHOW CREATE TABLE captured` to `team-docs/reports/e1-progress.md`.

3. **STEP 3 — Backfill codes.**
   Backfill the 15 JP lessons and their curriculum points:
   - Phonological awareness: `NERDC-ECC-LIT-PA-U{unit}-{soundGroup}` (unit/sound group taken from the seed series data).
   - Print awareness: `NERDC-ECC-LIT-PRINT`. Oral language: `NERDC-ECC-LIT-ORAL`.
   - Numeracy strand is RESERVED for the Shapes/Numbers game category — do not assign numeracy codes to JP lessons this phase.
   Store lesson↔point linkage via `KidCurriculumPoint.mapped_item_ids` (additive rows/values only). Make backfill idempotent.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E1 step3 backfill complete (15 lessons + curriculum points coded)` to `team-docs/reports/e1-progress.md`.

4. **STEP 4 — Verify.**
   Run SELECT counts proving all 15 JP lessons have non-null `nerdc_code` (log query results into the progress log).
   Call `GET /kids/series/:id/get-details` and confirm the contract `{success, data:[school]}` still holds, with the new NERDC fields present in the payload.
   CHECKPOINT: append `[CHECKPOINT HH:MMZ] E1 step4 verification passed (counts + API contract intact)` to `team-docs/reports/e1-progress.md`.

## GATES
- `npm run test:regression` shows EXACTLY the 4 known pre-existing failures listed in `reports/c-preexisting-failures.md` — no new failures, no silent fixes.
- Zero schema damage: SHOW CREATE TABLE before/after diffs show ONLY the three new nullable columns per table; nothing altered or dropped.
- Deliverable exists: final report written to `team-docs/reports/e1-report.md` (steps summary, evidence, gate results).

## RULES
- Work only under `/var/www/html/elite-kids`.
- Never print secrets or tokens (DB credentials, JWTs, `.env` values).
- No git commit/push unless this brief explicitly says so.
- Additive-only schema changes.
- If any gate fails twice, STOP and write the obstacle to `team-docs/reports/e1-obstacles.md`.
