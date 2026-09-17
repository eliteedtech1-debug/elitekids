# EliteKids Go-Live Acceptance Checklist

**Prepared:** 2026-09-09
**Scope:** Q46 curriculum-band reconciliation, ECCE ↔ EliteSMS bridge, and flagship annual pilot coverage

## Flagship annual pilot target

The requested pilot release is explicitly measured as:

```text
5 bands × 9 subjects × 3 terms × 10 teaching weeks × 1 playable game = 1,350 games
```

Editable source: `curriculum/00-framework/flagship-annual-pilot-plan.json`  
Explicit generator: `backend/src/seeders/flagshipAnnualPilotSeed.js`

The generator is deterministic and idempotent. It validates all 1,350 configs against the existing
JSON-schema/pedagogy rules and writes lessons/configs as `pending_human_review`; it does not fabricate
adult validation or silently publish content. The first production run therefore creates the complete
annual pilot library for preview/editing, followed by the existing adult play-test and approval workflow.

## Verified in this checkout

- [x] NERDC band resolver covers the inspected class universe (287/287, per Q46 evidence).
- [x] Legacy game content remains accepted through compatibility enum aliases.
- [x] EliteKids server-only EliteSMS client has bounded GET retries, timeout bounds, fixture isolation and stable error codes.
- [x] Non-flagship bridge authoring resolves context through EliteSMS; no new direct shared-DB fallback.
- [x] Observation creation verifies non-flagship child roster through EliteSMS and keeps digital evidence separate from teacher observation.
- [x] Teacher GameCreator blocks non-flagship authoring until school context is verified.
- [x] Kids-owned model/migration target is `KIDS_DB_NAME`; shared `DB_NAME` remains the institutional read boundary.
- [x] Production fixtures are rejected by the EliteSMS client even if a stale enable flag is present.
- [x] Production SMS bridge rollout now requires an explicit `SMS_CONTEXT_BRIDGE_SCHOOLS` allow-list; an empty production allow-list remains disabled.
- [x] Bridge/observation institution scope no longer falls back to browser-supplied `x-school-id`/`x-branch-id` headers when verified JWT claims are absent.
- [x] Deployment frontend build/rsync step is fail-closed; build or missing `dist/index.html` failure stops the release.
- [x] Backend focused bridge/client/context/naming suites: 60/60.
- [x] Backend B2 manual story/schema suite: 11/11.
- [x] Frontend tests: 229/229.
- [x] Frontend TypeScript/Vite build and compatibility guard: passed.

## Required before claiming production go-live

- [ ] Explicit master approval of the curriculum backbone decisions: scheme representation, subject set, 3-term × 10-week grid, and old-label curriculum-point reseed. The annual pilot generator is additive and does not alter schema or reseed old points, but production execution still requires explicit approval of the 1,350-game pilot scope.
- [ ] Run `cd backend && npm run seed:flagship-pilot -- --dry-run` and confirm `valid: true`, `games: 1350`, `curriculumPoints: 1350`, and all content states are intended before the write run.
- [ ] Run `cd backend && npm run seed:flagship-pilot` only against the approved `KIDS_DB_NAME`; verify 1,350 lessons/configs are `pending_human_review`, 1,350 library mappings are unvalidated, and no `approved_by`/`approved_at` was fabricated.
- [ ] Adult-review the flagship pilot in batches; publish only after complete play, story/objective, controls/answers/feedback, and safety/accessibility checks. Track approved coverage separately from seeded coverage.
- [ ] Commit the verified frozen Q44–Q47 and bridge changes in reviewed batches; do not commit unrelated pre-existing working-tree edits. The standing freeze remains in force until the curriculum plan is explicitly approved.
- [ ] Deploy the EliteSMS versioned lesson-context endpoint from the sibling repository; its sibling working tree is still uncommitted and contains unrelated pre-existing changes, so stage only the shared endpoint/auth/class-resolution files in an intentional batch.
- [ ] Verify production service authentication, scope claim, school isolation, branch isolation, class resolution, subject/lesson consistency, canonical term and week validation.
- [ ] Configure `ELITE_SMS_API_BASE_URL` and exactly one rotated server credential in the EliteKids backend environment; never expose it to Vite/browser code. Preferred credential is a scoped JWT; if the approved API-key path is used, EliteSMS must also enforce an explicit school allow-list for that key.
- [ ] Keep `SMS_CONTEXT_BRIDGE_ENABLED=false` initially; after the endpoint/auth probe, enable only for the approved pilot by setting `SMS_CONTEXT_BRIDGE_SCHOOLS` to exactly that school ID.
- [ ] For the flagship adult-validation pilot, keep `KIDS_FLAGSHIP_PILOT_ENABLED=false` until the adult pilot owner is ready; then set `KIDS_FLAGSHIP_PILOT_SCHOOLS` explicitly to `SCH-ELITE` (or the approved flagship ID). No implicit pilot-school default is accepted.
- [ ] Run the live smoke pilot: one school, one branch, one class, one subject, one term/week and one lesson from SMS schedule → Kids bridge draft → review/publish → child play → observation → neutral summary.
- [ ] Expand adult validation across the seeded annual library using the editable source plan; do not represent `pending_human_review` rows as child-live coverage.
- [ ] Confirm existing published child gameplay works while SMS is unavailable.
- [ ] Confirm each pilot game's `approved_by`/`approved_at` records the validating adult while `model_version=manual-pilot-validated`; this is validation evidence, not a second approval queue.
- [ ] Rotate any exposed B2 credentials before or during release.
- [ ] Confirm deployment workflow fails closed on backend test failure and make frontend build failure fatal before production traffic is switched.

## Known warnings

- Existing frontend build emits chunk-size/dynamic-import warnings but succeeds.
- Existing test setup emits a MySQL2 `sessionVariables` warning.
- Curriculum planning documents still contain historical technical-band labels in explanatory examples; these are documentation compatibility references, not a safe basis for blind global replacement.
- The repository has a large pre-existing working tree. Review and stage only files directly related to the approved release.
