# PHASE C — Pre-existing failure tickets + debt ledger

**Date:** 2026-08-23 · **Agent:** phaseC (ox-alpha) · **Baseline:** 40F/225P/265T (B1 STEP5) → **Now: 4F/286P/290T**
Full-suite evidence: `team-docs/reports/c-full-suite-run{1,2,3,4}.log` (run4 = final).

**Resume re-verification 2026-08-28 (256T→325T corpus):** run1 3F/322P, run2 2F/323P. Deterministic residual =
garden-companion C-DEBT-01/02 only. C-DEBT-03 (kids-routes multi-config) + C-DEBT-04 (series-units lock-status)
NO LONGER reproduce (later E3f/S8 work resolved them). New intermittent C-DEBT-05 (children progress-summary
pollution) logged below. Regression matrix (b1-regression.test.js) 25/25 in-suite + standalone. Evidence:
`reports/c-ci-run-20260828T16*.log` + `reports/ci-last-run.txt`.

---

## VERDICT

Fail-set shrank **40 → 4**. The residual 4 are pre-existing shared-fixture/ordering debt that only became
*reachable* once earlier 500s were fixed — they never executed successfully before. All are ticketed below;
none are regressions introduced by phase C (`b1-regression.test.js`: 25/25 PASS in-suite and standalone).

---

## FIXED ALONG THE WAY (for the record — each was a live prod defect)

| # | Fix | Files | Why it mattered |
|---|-----|-------|-----------------|
| C-F1 | Mode-lock INSERTs forced UUID strings into `id BIGINT AUTO_INCREMENT` under STRICT sql_mode → every POST /kids/mode-lock 500'd; prod table had **0 rows** ever | `src/controllers/kidsModeLock.js` | Mode locking was completely dead in prod |
| C-F2 | `removeModeLock` rank check `<=` blocked equal rank, but admin/superadmin collapse to teacher ⇒ **no role could ever unlock anything** | `src/controllers/kidsModeLock.js` | Locks were unremovable one-way trap |
| C-F3 | `assetsSaved` declared block-scoped but read outside ⇒ ReferenceError **500'd every approve/reject AFTER committing state** (response lied about failure; UI retried → double side-effects risk) | `src/controllers/kids.js` (decideApproval) | Approvals flow appeared broken to users while silently mutating data |
| C-F4 | Hermetic test DDL drifted from prod schema: 4 tables had BIGINT ids where prod is VARCHAR(50); missing `updatedAt` cols; missing `is_global`; snake vs camel case | `test/helpers/test-db.js` | ~26 suite failures; tests exercised a DB that doesn't exist |
| C-F5 | kidsTracking digest queried raw `created_at` on camelCase columns (prod truth) | `src/controllers/kidsTracking.js` | Digest always 500 for students with responses |
| C-F6 | Garden grow mutated Sequelize JSON array in place → update could be treated as unchanged and **silently skip persistence** | `src/controllers/kidsGarden.js` | Intermittent loss of garden growth |
| C-F7 | Retry teacher-flags leaked rows from other schools as `student:null` instead of school-scoping | `src/controllers/kidsRetry.js` | Cross-school data exposure in flags list |
| C-F8 | kidsSession resume ordered by nonexistent `updated_at` (prod col is `updatedAt`) | `src/controllers/kidsSession.js` | Save/resume always 500 |

## RESIDUAL FAILURES (4) — TICKETS

### C-DEBT-01 · GET /kids/garden auto-init contract ambiguity (garden-companion.test.js)
Test "auto-initializes garden for a student with no data" (NUR-006) asserts `elements.length > 0`, but
`getGarden` plants an empty `[]`. Either the product spec wants starter elements (then implement), or the
test should expect 0 (then fix test). Needs product decision. **Blocker:** no.

### C-DEBT-02 · Garden grow stage regressed after sibling write (garden-companion.test.js)
"does not downgrade" still sees `sprout` after a tier-2 grow persisted `bloom`. Controller logic looks
correct (max-stage guard); suspicion is JSON getter cloning across requests or element identity
(`existingIdx`) mismatch. Needs focused debug with two sequential API calls against a persistent DB.
**Blocker:** no.

### C-DEBT-03 · getPublishedGame returns arbitrary config for multi-config lessons (kids-routes.test.js)
LESSON-1 has GAME-1 + GAME-1-T1/T2 published; endpoint returned "Cat Recognition" instead of base
"Match the Colors" depending on which suites ran first. Query needs deterministic ordering
(e.g. `ORDER BY tier ASC, createdAt ASC`). Order-dependent flake today. **Blocker:** no.

### C-DEBT-04 · series-units lock-status polluted by cross-suite passes (series-units.test.js)
lock-status for NUR-001 flipped to unlocked because retry tests now successfully record PASS attempts on
fixture items (they crashed before C's fixes). Tests need per-student/item namespaces or per-file reseeding.
**Blocker:** no.

### C-DEBT-05 · children.test.js progress summary polluted by shared NUR-001 fixture (children.test.js)
Added 2026-08-28 resume. "returns the child + progress summary for the owning parent" asserts absolute
`total_stars===3` from the seed row PROG-1, but growing sibling suites (tracking, retry, e2-sync-batch,
curriculum, e6-boss-battles, e4, session, kids-routes, e3f-gate) legitimately record progress rows for the
shared NUR-001 fixture BEFORE children.test.js runs → `total_stars: 18` (total_xp/total_stars/games_completed
all drift). Same root family as C-DEBT-04 (shared hermetic DB, no per-file reseed). Observed INTERMITTENT in
`--runInBand` full-suite (run1 16:12Z failed with 18; run2 16:18Z passed) — timing/order dependent; but ALSO
reachable standalone via sibling suite writes. Fix options (product call): per-file reseed/namespace
progress writes on dedicated students (suggested), or delta-based assertion, or scoped fixture rows.
**Blocker:** no (CI gate must treat as known-set alongside C-DEBT-01/02).

---

## SCHEMA DRIFT DISCOVERED (needs human/migration decision — NOT altered, C2 honored)

### C-DRIFT-01 · prod `elite_content.kids_session_state` ≠ Sequelize model
Prod columns: `id bigint AI, student_id, lesson_id varchar(100), session_data json, last_saved_at,
createdAt, updatedAt, session_id`. Model + hermetic DDL expect `current_item_id, current_tier,
saved_state`. Any prod call to save/resume hits missing columns. Aligning requires either model rewrite
or ALTER — both out of C's scope.

### C-DRIFT-02 · Round-count ≥5 invariant does NOT hold across all prod published configs
Audit of elite_content (read-only):
- matching: min pairs = 1 (of 32) · tap-recognition: min items = 3 (of 32) · quiz: 12/15 rows lack `questions`
- fill-in-blank: 2/18 lack `sentences` · drag-sort: all 40 pass ≥5
- `puzzle-split` (5 configs): carries NO rounds collection by design (difficulties ladder) — helper exempts it
The B1 claim ("15 Jolly Phonics published configs ≥5") holds for the Jolly Phonics set specifically.
Enforcing globally would require content remediation — ticket for master.

### C-DRIFT-03 · Legacy hermetic fixtures violate ≥5 invariant by design (GAME-1, GAME-1-T1, GAME-1-T2 carry 2 pairs each)
Explicitly exempted via `LEGACY_EXEMPT_IDS` in `test/helpers/game-config-invariant.js`. Do not extend the list;
new published configs must comply (locked by b1-regression.test.js).
