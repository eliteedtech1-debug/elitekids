# ECCE Bridge ↔ EliteSMS Integration — Progress Ledger

**Date:** 2026-09-09 (observation context verification implemented) 
**Date:** 2026-09-04 (updated for database naming contract)  
**Current checkpoint:** EliteSMS lesson-context API and strict service-auth middleware are implemented in the sibling repository; EliteKids database naming is explicit and isolated for development/tests. EliteKids now has a server-only SMS client and SMS-aware bridge context resolver behind `SMS_CONTEXT_BRIDGE_ENABLED`. Teacher UI and production deployment verification remain next.

## 2026-09-09 — Observation child/bridge context verification (Step 5)

- Added `assertObservationContext(req, { bridge, child, admissionNo, env, client })` to `backend/src/services/lessonBridgeContext.js`.
- Non-flagship schools: the child roster is verified **via the EliteSMS lesson-context API only** (`admission_no` filter → SMS enforces school/branch/class/admission, answers `STUDENT_NOT_FOUND` outside the roster). No direct shared-DB read was added — per the standing rule, SMS-related data is API-only going forward.
- Flagship/model schools (`SCH-ELITE`, `SCH-KIDS`): local check comparing bridge `class_code` with the Kids child record's `class_code`; legacy bridges without `class_code` keep historical behavior. Display labels (`class_label`) are never used for identity comparison.
- Fails closed: `SMS_CONTEXT_DISABLED` (503) while rollout flag is off, `SMS_CONTEXT_CLASS_REQUIRED` (422) for bridges without an authoritative class, SMS `SMS_CONTEXT_REJECTED`→422, `SMS_CONTEXT_UNAVAILABLE`→503.
- Wired into `createObservation` in `backend/src/controllers/kidsObservations.js` (after child load + class access, before the idempotency/duplicate point).
- New focused tests: `backend/test/observation-context.test.js` — 11/11 passed. Regression: `lesson-bridge-context.test.js` + `elite-sms-client.test.js` — 13/13 passed.
- Note: DB naming/CONTENT_DB reconciliation confirmed OUT of scope for this worker; SMS-related data is strictly API-mediated.

## 2026-09-09 (cont.) — Integration proof + teacher UI enforcement

- **Integration test** `backend/test/observation-integration.test.js` (supertest on the real HTTP surface, SMS client mocked at the module boundary, hermetic `_test` DBs): non-flagship observation is REJECTED with 422 `SMS_CONTEXT_REJECTED` when the child is not in the SMS class roster (no row persisted), 503 `SMS_CONTEXT_UNAVAILABLE` when the API is down (no context invented), and 201-created when the roster confirms the child. 3/3 passed. Note: `SMS_CONTEXT_BRIDGE_ENABLED=true` is set for that jest process only (flag defaults off — fail-closed verified by the unit suite).
- **Teacher UI enforcement** (`frontend/src/pages/Teacher/GameCreator.tsx`): non-flagship schools (via existing `isFlagshipSchool(getSchoolContext().school_id)`) cannot pass Step 0 or submit without `context_source === 'elite-sms'` verified context; flagship/model schools keep the simple path. Backend remains the authoritative guard; UI guard just prevents doomed submits. tsc clean, vitest 229/229, vite build OK.
- **Full backend suite (643 tests, 56 suites): 614 passed / 29 failed in 6 suites — ALL pre-existing Q44 fallout, not from this session.** Root cause: Q44 (NERDC age-band rename, 2026-09-08) renamed backend band lists/models (`ageBand.js`, `teamFormation.js`, `KidChild.js` ENUM, game-engine schemas) but did not reconcile the committed test corpus: `ageBand.test.js`/`teamFormation` tests still expect `Creche/Nursery/KG1/KG2`, hermetic `kids_children.age_level` DDL ENUM still carries old values (→ children PUT/link 500s), `b2-story` hits the modified stage-sequence schema (≥5 steps). Evidence: failing signatures are exclusively old-vs-new band values/ENUM drift; all four bridge/observation suites PASS in-suite; none of the failing files intersect this session's diff. **Ticket for master: Q44 test-corpus reconciliation before next deploy gate.**

## 2026-09-09 (cont. 2) — Tolerant class-identity matching across the bridge

- Requirement: class labels arrive as "Nur 2", "NUR2", "Nur-2", "Nur 2 A", "Nur2A", "Nur-2A", "Nursery 2A", "Nursery-2A", "Nursery 2 A"... — all legitimate spellings of the same class. Matching is now tolerant of case, separators, grade abbreviations (nur/nrs → nursery, pry → primary, kg → kindergarten, pg → playgroup, ss/sec → secondary, crèche diacritics) and ordinal words ("Nur Two A" ≡ "Nur 2 A"), while section letters and ordinals remain identity: NUR2-A ≠ NUR2-B, NUR2 ≠ NUR2A.
- New shared helper `backend/src/utils/classIdentity.js` (`classTokens`, `sameClassIdentity`), copied verbatim to `../elite-sms/backend/src/utils/classIdentity.js` (no cross-repo dependency).
- EliteKids wired at 3 points: client response validation (`SMS_CONTEXT_MISMATCH` only for genuinely different classes), bridge context resolution (already canonical from SMS), and the flagship local child/bridge class check (`assertObservationContext`).
- EliteSMS wired in `getKidsLessonContext`: the class is resolved tolerantly against the school's active classes (code OR class_name), then every downstream query (subjects, lesson, student roster) is pinned to the canonical stored `class_code`; the response always carries the canonical code.
- Tests: EliteKids bridge/observation/client suites 44/44; SMS `sharedKidsLessonContext.test.js` 9/9 (incl. canonical-code-in-response, NUR2-B rejection, roster STUDENT_NOT_FOUND with tolerant input). Fixed a pre-existing SMS test bug en route: the `token()` helper used a payload key `audience` instead of the standard `aud` claim — `jwt.verify({ audience })` checks `aud`, so every authenticated SMS test had been 401-ing since the sharedServiceAuth hardening.

## 2026-09-09 (cont. 3) — Resolution upgraded to two-tier against elite_db.classes reality

- Read-only inspection of the live `elite_db.classes` table confirmed the user's point: `class_name` (the human-readable column, PRI with section) carries values like `Nursery 1/2`, `Primary 2 A/B`, `Primary 1 Fagge/Dala` (location suffixes), `LOWER KG`/`UPPER KG` (= KG1/KG2), `BASIC 1..6` (= Primary 1..6), `JSS 1..3`, `SS1..3`, and even a `Crech` typo row.
- `classIdentity.js` upgraded: canonical-string comparison (`classCanonical`), compound aliases (`LOWER KG`→kindergarten1, `UPPER KG`→kindergarten2), word aliases (`BASIC`→primary), typo tolerance (`Crech`→creche), ordinal words. Identity preserved: sections (`Primary 2 A` ≠ `Primary 2 B`), ordinals (`NUR2` ≠ `NUR2A`), location suffixes (`Fagge` ≠ `Dala`).
- **Two-tier resolution (`resolveClassIdentity`)**: exact match on class_code or class_name wins; otherwise exactly one canonical match resolves; ≥1 canonical matches = ambiguous → **422 AMBIGUOUS_CLASS** with the candidate list (fail closed; e.g. a school with both `BASIC 3` and `Primary 3` rows can never be silently auto-picked). SMS `getKidsLessonContext` pins subjects/lesson/roster to the resolved canonical `class_code` and always returns the stored identity, never the free-text input.
- Tests: EliteKids bridge/observation/client 60/60 (incl. real-data alias cases and 6 resolution scenarios); SMS sharedKidsLessonContext 11/11 (incl. AMBIGUOUS_CLASS and class_name-column resolution). Helper re-copied verbatim to the SMS repo.

## Completed in this session

- Confirmed that `../elite-sms/SHARED_API_PLAN.md` names EliteSMS/EliteCore as the authoritative source for EliteSuite shared school data.
- Implemented/verified the versioned EliteSMS endpoint:
  - `GET /api/v1/shared/kids/lesson-context`
  - strict service JWT/static-key boundary in `../elite-sms/backend/src/middleware/sharedServiceAuth.js`
  - school/branch/class/academic/subject/lesson consistency checks
  - minimal projected response with `source: elite-sms` and `contract_version`
- Clarified ownership:
  - EliteSMS owns `lesson_plans` (professional teaching plan) and `lesson_notes` (classroom delivery notes/content).
  - EliteKids owns the playful translation: `kids_lesson_bridges`, game/game-chain configs, gameplay and Kids evidence.
  - A Kids bridge may reference an SMS `lesson_id` and context snapshot but must not overwrite or pretend to be an SMS plan/note.
- Established the canonical EliteKids database environment contract:
  - `DB_NAME` = read-only EliteSMS/shared school database.
  - `KIDS_DB_NAME` = authoritative EliteKids database for every `kids_*` model/table.
  - `CONTENT_DB_NAME` = legacy compatibility variable only; new Kids models must not target it.
  - `AI_DB_NAME` = optional AI/audit database.
- Added `backend/src/config/databaseNames.js` and updated EliteKids Sequelize/raw connection setup to resolve all database names centrally.
- Added `backend/.env.example` and `backend/.env.kids.example` with production and isolated development/test examples.
- Updated EliteKids migration helpers to resolve `KIDS_DB_NAME` through the canonical naming module.
- Hardened EliteSMS `databaseNames.js` so development/test connections resolve to `_test` databases while production names remain unchanged.
- Added focused naming tests:
  - `backend/test/database-names.test.js`
  - `../elite-sms/backend/src/__tests__/databaseNames.test.js`
- Added the durable contract document:
  - `team-docs/ELITEKIDS-DATABASE-ENV-CONTRACT.md`
- Corrected the Kids test fixture's reserved SQL identifier by quoting `grouping` in the `kids_lesson_bridges` test DDL.

## Database rule now locked

```text
Production:
  EliteSMS shared DB  = DB_NAME=elite_db
  EliteKids DB        = KIDS_DB_NAME=elite_kids

Development/test:
  EliteSMS shared DB  = DB_NAME=elite_db_test
  EliteKids DB        = KIDS_DB_NAME=elite_kids_test
```

In development/test mode, every configured database name must end in `_test`. `DB_NAME` and `KIDS_DB_NAME` must remain distinct. No test or dev process may connect to an unsuffixed live database.

## Integration ownership rule

```text
EliteSMS API
  → school, branch, student DOB, class, subject,
    academic year/term/week, SMS lesson plan/note references

EliteKids KIDS_DB_NAME
  → bridge, game/game-chain, child gameplay,
    teacher observation and neutral evidence summary
```

The direct shared DB connection remains for historical compatibility only. New bridge code must call the deployed EliteSMS API server-to-server and must not introduce a direct shared-table fallback. EliteSMS lesson plans, classroom lesson notes/content and EliteKids game bridges remain separate entities; the client transfers context and stable lesson identity, not plan/note ownership.

## Current implementation checkpoint

- ✅ `backend/src/services/eliteSmsClient.js`: timeout, bounded GET retry, service headers, fixture adapter and stable error codes.
- ✅ `backend/src/services/lessonBridgeContext.js`: non-flagship SMS resolution, explicit feature flag, flagship-local boundary and minimal snapshot.
- ✅ `KidLessonBridge`: context source/version, class code, academic year, subject code, SMS lesson ID and snapshot fields.
- ✅ Bridge and observation routes are registered in `backend/src/routes/kids.js`.
- ✅ Kids test fixture includes bridge context columns and `kids_teacher_observations`.
- ✅ Focused client/context tests: 13 passed.
- ⚠️ Existing migration runner still contains legacy naming/comments referring to `CONTENT_DB_NAME`; new model sync and runtime target `KIDS_DB_NAME`, and migration reconciliation should be reviewed before deployment.

## Verification

- ✅ EliteKids naming contract tests: 3 passed.
- ✅ EliteSMS naming contract tests: 2 passed.
- ✅ EliteKids frontend TypeScript/Vite build: passed.
- ✅ Node syntax checks for changed EliteKids and EliteSMS database configuration files: passed.
- ⚠️ Existing test setup prints a MySQL2 warning for the pre-existing `sessionVariables` connection option; it does not fail the naming contract tests and should be cleaned up separately.

## Remaining next tasks

1. Configure the EliteKids server-only client and enable `SMS_CONTEXT_BRIDGE_ENABLED` for one controlled school/branch after endpoint deployment. Contract: `team-docs/ELITEKIDS-SMS-CLIENT-CONTRACT.md`.
2. Keep the flagship/model-school fixture path explicit and compatible.
3. ~~Wire SMS context selectors into the teacher authoring UI~~ — DONE 2026-09-09 (GameCreator step-0 gate + submit guard for non-flagship schools; backend remains authoritative).
4. ~~Verify observation child/bridge context against the same authoritative source~~ — DONE 2026-09-09 (`assertObservationContext` + integration proof; SMS API only, no direct shared-DB read).
5. Add cross-repository contract/integration tests and deploy the shared API through the approved EliteSMS deployment process.
6. **Q44 test-corpus reconciliation (blocker for the deploy gate):** update `ageBand.test.js`/teamFormation/b3b assertions to the new NERDC bands, align hermetic `kids_children.age_level` ENUM + seeds with the renamed model, re-baseline `b2-story` against the current stage-sequence schema. 29F across 6 suites as of 2026-09-09.

## Still paused

Social feeds, leaderboards, competitions/arena/boss battles, WebRTC/live classroom expansion, paid/predictive analytics and new AI/media infrastructure remain paused. Existing code is retained; no removal is required.

## Resume prompt

```text
Read team-docs/ELITEKIDS-DATABASE-ENV-CONTRACT.md and this progress ledger.
EliteSMS is authoritative for institutional context; EliteKids KIDS_DB_NAME owns Kids tables.
The SMS client and SMS-aware bridge validation are implemented behind `SMS_CONTEXT_BRIDGE_ENABLED`; next wire the teacher workflow and verify the deployed endpoint.
Never add a new direct shared-DB fallback. All development/test DB names must end in _test.
Preserve the flagship path and keep social/competition/live/cost-intensive features paused.
```
