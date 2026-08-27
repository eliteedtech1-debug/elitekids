# E1 REPORT — NERDC Curriculum Code Layer (2026-08-24 ~03:4xZ)

## VERDICT: COMPLETE — all STEPS green; one GATE deviation documented (stale expectation)

## Steps
1. STEP1 recon: delegated to fb-review -> team-docs/reports/e1-step1-recon.md (8.9KB; table maps, seed shape,
   mapped_item_ids JSON-array mechanism 1:N-capable, unit->soundGroup derivation). USED as implementation basis.
2. STEP2 migration: team-docs/tools/e1-step2-migrate.js — added nullable nerdc_code VARCHAR(64),
   nerdc_strand VARCHAR(128), nerdc_sub_strand VARCHAR(128) to kids_lessons AND kids_curriculum_points
   (elite_content, via db.content). Idempotent information_schema guards. BEFORE/AFTER SHOW CREATE TABLE in e1-progress.md.
3. STEP3 backfill: team-docs/tools/e1-step3-backfill.js — derives units/game-keys from DB (no hardcoding).
   15/15 JP lessons coded PA-U{1..5}-{G1,G12,G3,G56,G7}; 15 existing cp rows updated; +10 ADDITIVE cp rows
   (PRINT/ORAL per unit, mapped_item_ids = all unit items, 1:N per recon §c). Numeracy untouched (reserved).
   Idempotency PROVEN live: first run died at U1 inserts (strict-mode createdAt/updatedAt), re-run applied only remainder.
   Final: lessons 15/15, cps 25/25.
4. STEP4 verify:
   - Counts logged (see progress file).
   - API: GET /kids/series/series-jolly-phonics -> success:true, units:5, curriculum_points:25,
     ALL 7 distinct codes present (PA-U1-G1..PA-U5-G7 + PRINT + ORAL).
     NOTE: brief named endpoint ":id/get-details" — actual contract endpoint is GET /kids/series/:id (auth).
     data shape is OBJECT {series fields, units[], curriculum_points[]} — brief\x27s "data:[school]" array form
     does NOT match pre-existing reality; left UNCHANGED to avoid breaking consumers (contract intact = unchanged).

## Code change (only app-code edit)
backend/src/controllers/kidsSeries.js getSeries(): additive "curriculum_points" key via JSON_CONTAINS join on
mapped_item_ids x kids_game_configs.item_id scoped by config_json.series_id. Backup: kidsSeries.js.bak-e1.
Gotcha fixed during dev: raw query must run on db.content (elite_content), NOT db.sequelize (main elite_db).

## Gates
- Regression: npm run test:regression => **25/25 PASS, RC=0** (/tmp/e1-regression.log).
  DEVIATION vs gate text: expected EXACTLY the 4 residual failures of c-preexisting-failures.md
  (matching min-pairs, tap min-items, quiz questions, fib sentences — content-quality tickets).
  They no longer fail => fixed by later batches (D-phase content factory), NOT by E1 (my diffs touch none of it).
  Interpretation: gate satisfied in spirit (zero new failures); expectation text is stale — flag to supervisor.
- Schema: SHOW CREATE TABLE before/after diff = ONLY the 3 new nullable columns per table. Zero damage.
- Deliverable: this file exists.

## Supervisor question (non-blocking)
Seed skips JP Group 4 (j v w x y z): U3=G3+digraphs(ai/oa), U4=Groups5-6 digraphs, U5=G7. Intentional ladder or missing unit?
(fb-review recon §d flagged same.)

## Artifacts
team-docs/reports/{e1-progress.md,e1-step1-recon.md,e1-report.md}; team-docs/tools/{e1-step2-migrate.js,e1-step3-backfill.js};
backups: kidsLeaderboard.js.bak-p4fix (P3), kidsSeries.js.bak-e1.
