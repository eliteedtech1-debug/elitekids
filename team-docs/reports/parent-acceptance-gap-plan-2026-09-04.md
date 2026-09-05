# Parent Acceptance Gap Register and Remediation Plan

**Date:** 2026-09-04  
**Scope:** EliteKids parent signup, onboarding, reporting, parental controls, mode locks, and parent↔child live/WebRTC experience  
**Status:** OPEN PLAN — documentation only; no implementation changes made in this pass  
**Related reports:** `team-docs/reports/flagship-parent-acceptance-2026-09-04.md`, `team-docs/reports/parent-experience-fixes-progress.md`

---

## 1. Current baseline

The parent-facing activity grid, XP trend, bulk results, per-child controls, signup persistence, ownership checks, onboarding privacy checks, Jest deployment installation, and mode-lock hierarchy are implemented and covered by focused tests.

Last recorded local verification:

- Frontend Vitest: **226/226 passed**
- Frontend typecheck/build: **passed**
- Backend parent/signup/children/onboarding coverage: **64/64 passed**
- Backend controls/mode-lock/parent acceptance coverage: **40/40 passed**
- Parent Live/WebRTC signaling: **16/16 passed**
- Syntax and staged whitespace checks: **passed**

The following items remain before complete production parent sign-off.

---

## 2. Complete finding register

| ID | Finding | Severity | Current status | Closure evidence |
|---|---|---:|---|---|
| G-01 | Production deployment and live runtime walkthrough have not yet been reviewed after the push. | High | Open | Deployment log, health checks, and browser smoke report for the deployed commit |
| G-02 | The full backend Jest suite was not run; only focused parent-related suites were executed. | Medium | Open | Full `scripts/run-tests.sh --forceExit` result with baseline failures classified |
| G-03 | Parent account creation and child linking remain separate UI flows; there is no single create-account → link child → dashboard journey. | High | Open | Browser acceptance test covering the complete first-time parent path |
| G-04 | Controls are embedded in an individual child detail view rather than provided as a dedicated family-wide Parent Controls screen. | Medium | Open | Parent dashboard navigation and responsive browser test for family controls |
| G-05 | The activity-grid/chart UX is functional but basic: no clear month labels, legend, selectable date range, or enlarged accessible chart view. | Medium | Open | UI review plus component tests for labels, range selection, legend semantics, and keyboard/screen-reader behavior |
| G-06 | Bulk results are limited to the first 12 visible rows; no filtering, sorting, pagination, or CSV export is available. | Medium | Open | API/UI tests proving filters, stable sorting, pagination, and export correctness |
| G-07 | Parent aggregate queries do not consistently include explicit school predicates; admission numbers may not be globally unique in every installation. | High | Open | Cross-school privacy tests and SQL review showing school-scoped ownership and aggregation |
| G-08 | Several new parent activity/control labels are hard-coded English strings instead of i18n keys. | Medium | Open | i18n key audit, English/Hausa rendering tests, and no untranslated parent literals |
| G-09 | WebRTC verification is signaling-level only; a real browser microphone/media test through deployed TURN remains outstanding. | High | Open | Two-browser live smoke report covering media permissions, offer/answer, ICE/TURN relay, mute/floor controls, and disconnect recovery |

### Explicit non-gaps

- The original missing parent 365-day grid, XP trend, controls panel, bulk-results endpoint/view, signup coverage, and Jest availability blocker are addressed in the pushed implementation.
- The local focused runtime suites are green; the remaining uncertainty is production/full-suite/UI-completeness validation, not an identified failing focused test.

---

## 3. Remediation objectives

1. Prove the pushed code is running correctly in the target production environment.
2. Establish a complete backend regression baseline rather than relying only on focused suites.
3. Make first-time parent onboarding coherent and self-contained.
4. Give families a clear control center without weakening per-child authorization.
5. Make reporting useful at both glance and detail levels.
6. Close cross-school privacy risks before broad parent rollout.
7. Complete English/Hausa localization for all parent-facing copy.
8. Validate actual browser media transport, not just WebSocket signaling.

---

## 4. Ordered implementation plan

### Phase 0 — Production and baseline evidence

**Owner:** release/QA  
**Depends on:** pushed commits `7da4e9c` and `1375f84` being deployed

1. Collect the deployment workflow result and the generated `team-docs/reports/deploy-*.log`.
2. Confirm backend health, frontend availability, correct commit, and no startup/migration errors.
3. Run the full backend Jest gate using the deployment-installed dev dependencies.
4. Classify every full-suite failure as fixed, pre-existing baseline, infrastructure, or newly introduced.
5. Run the existing frontend Vitest/build gate again against the deployed source revision.
6. Record all evidence in a production verification report; do not claim complete acceptance until the report is green or exceptions are explicitly approved.

**Exit criteria:** G-01 and G-02 have a signed result, with any remaining failures documented and owned.

---

### Phase 1 — Unified parent signup and onboarding

**Owner:** frontend + backend auth  
**Depends on:** Phase 0 baseline; existing shared EliteSMS credential policy

1. Define the first-time parent journey:
   - create account;
   - resolve/confirm school;
   - sign in automatically or continue with returned token;
   - link one or more children using the approved shared relationship/password flow;
   - land on the parent dashboard.
2. Add a visible onboarding state for parents with zero linked children.
3. Allow adding another child without losing the current authenticated session.
4. Preserve duplicate-phone, invalid-school, invalid-credential, and foreign-child protections.
5. Add API/component/browser tests for successful and failed first-time flows.
6. Update copy so the distinction between creating an account and linking an existing EliteSMS parent is unambiguous.

**Exit criteria:** G-03 is closed by a repeatable browser acceptance test and corresponding backend contract tests.

---

### Phase 2 — Dedicated family controls center

**Owner:** frontend parent experience  
**Depends on:** Phase 1 session/onboarding; existing controls and mode-lock APIs

1. Add a family-level Parent Controls entry point from the dashboard.
2. Show all linked children with independent control summaries.
3. Keep per-child editing for daily minutes, allowed time window, and mode locks.
4. Make control updates optimistic only after successful server response; show current server values after save.
5. Clearly distinguish parent locks from teacher locks and prevent UI affordances that imply a parent can override teacher authority.
6. Add responsive and keyboard-accessible tests.

**Exit criteria:** G-04 is closed with a dedicated family controls screen while all ownership and hierarchy tests remain green.

---

### Phase 3 — Reporting UX expansion

**Owner:** frontend reporting  
**Depends on:** existing parent activity/results APIs; Phase 0 API baseline

#### Activity and XP

1. Add month labels aligned to the 365-day grid.
2. Add a visible activity legend explaining all heat levels.
3. Add accessible labels and a keyboard/screen-reader-friendly summary of daily values.
4. Add date-range choices (for example 30, 90, and 365 days) while keeping 365 as the default.
5. Add an enlarged or detail chart mode for XP trends, with empty/loading/error states.
6. Add tests for date-range requests, labels, trend scaling, empty data, and accessibility text.

#### Bulk results

1. Add server-supported filters for child, mode, date range, lesson, and score band where practical.
2. Add stable sorting and pagination rather than fetching an arbitrary large list and slicing in the browser.
3. Preserve ownership scope in every filtered query.
4. Add CSV export with explicit column names and safe escaping; export only the authenticated parent’s children.
5. Add tests for filter combinations, pagination boundaries, ordering, empty results, and export privacy.

**Exit criteria:** G-05 and G-06 are closed with component/API tests and a browser walkthrough.

---

### Phase 4 — Cross-school privacy hardening

**Owner:** backend data/security  
**Depends on:** Phase 0 test baseline; confirm admission-number uniqueness assumptions with production schema

1. Audit every parent aggregate query in activity, results, progress, controls, reports, portfolio, intelligence, chat, and live presence.
2. Resolve the authenticated parent’s permitted school set from the verified session and relationship records.
3. Add school predicates to progress/result aggregation and child lookups where admission numbers are used.
4. Ensure child IDs from one school cannot be used to query another school with the same admission number.
5. Add fixture data with duplicate admission numbers in different schools and separate parents.
6. Add negative tests for activity, results, controls, mode locks, reports, portfolio, intelligence, and any newly added export endpoints.
7. Review logs and responses to ensure no cross-school identifiers or hidden rows leak through error messages.

**Exit criteria:** G-07 is closed only after cross-school isolation tests pass for all parent data surfaces.

---

### Phase 5 — Parent localization

**Owner:** frontend/i18n  
**Depends on:** Phases 1–3 final copy

1. Inventory all parent-facing literals in `ParentDashboard.tsx` and child parent components.
2. Add stable English keys in the project’s existing i18n chunk convention.
3. Add Hausa translations for the new keys, marking any pending human review in the translation report rather than silently falling back.
4. Localize validation errors, loading/error states, chart labels, legends, controls, results filters, export messages, and onboarding copy.
5. Add an i18n audit test that fails when parent screens introduce known hard-coded UI literals.
6. Verify layout with longer Hausa strings and small screens.

**Exit criteria:** G-08 is closed with English/Hausa rendering checks and a reviewed translation list.

---

### Phase 6 — Browser WebRTC/TURN acceptance

**Owner:** QA/ops + live frontend/backend  
**Depends on:** Phase 0 deployed environment; valid test parent/child accounts; TURN credentials configured

1. Use two isolated browser contexts with test credentials only.
2. Connect the parent Live page and child Live client through the deployed host.
3. Verify permissions and device selection behavior for microphone access.
4. Verify parent broadcast, child presence, floor grant/revoke, and mute/unmute behavior.
5. Verify WebRTC offer/answer and ICE candidates complete with the deployed TURN path, not only local/direct candidates.
6. Verify audio is actually received in both directions where the product flow requires it.
7. Test disconnect/reconnect, denied microphone permission, stale peer, and tab refresh behavior.
8. Capture browser console, network/WebRTC state, and backend live logs without recording personal audio.
9. Keep signaling contract tests as regression coverage, but add a separate browser smoke result for media transport.

**Exit criteria:** G-09 is closed with a reproducible two-browser report and no unexplained TURN/media failures.

---

### Phase 7 — Final sign-off

**Owner:** release owner + QA + security reviewer  
**Depends on:** Phases 0–6

1. Run full backend and frontend gates from a clean checkout.
2. Run browser acceptance for signup/onboarding, family dashboard, controls, reporting, localization, and WebRTC.
3. Review production deployment logs and health checks.
4. Confirm no unrelated work was accidentally included in the release commit.
5. Update the acceptance report from “scoped gate” to “complete sign-off” only when G-01 through G-09 are closed or explicitly waived.
6. Record residual risks, owner, and due date for any approved waiver.

**Final exit criterion:** no High-severity gap remains open; Medium-severity gaps have either passed acceptance or have an approved product decision.

---

## 5. Proposed work breakdown / queue candidates

These are planning candidates, not yet claimed queue rows:

| Candidate | Scope | Suggested owner | Priority |
|---|---|---|---:|
| PE-G01 | Production deployment log + external parent smoke | release/QA | P0 |
| PE-G02 | Full backend Jest baseline and failure classification | backend/QA | P0 |
| PE-G03 | Unified parent signup/link-child journey | frontend + auth | P1 |
| PE-G04 | Dedicated family controls center | frontend | P1 |
| PE-G05 | Activity grid/chart UX and accessibility | frontend | P2 |
| PE-G06 | Bulk results filtering/pagination/export | frontend + backend | P2 |
| PE-G07 | Cross-school parent aggregate privacy audit | backend/security | P0 |
| PE-G08 | Parent English/Hausa i18n completion | frontend/i18n | P2 |
| PE-G09 | Browser WebRTC/TURN media acceptance | QA/ops | P0 |
| PE-G10 | Final complete parent sign-off | all | P0 |

Recommended order: **PE-G01 → PE-G02 → PE-G07 → PE-G03 → PE-G04 → PE-G05/PE-G06 → PE-G08 → PE-G09 → PE-G10**.

---

## 6. Definition of done

The parent experience is considered fully closed when:

- The deployed commit is externally verified and healthy.
- The full backend suite has a recorded result with no unexplained new failures.
- A new parent can complete signup, child linking, and dashboard entry in one coherent journey.
- Families can manage all children from a dedicated controls center.
- The 365-day report is understandable, accessible, localized, and range-selectable.
- Bulk results support practical filtering, sorting, pagination, and private export.
- Parent aggregate queries are explicitly school-scoped and covered by cross-school negative tests.
- Parent-facing copy is localized in English and Hausa.
- A real two-browser WebRTC/TURN test confirms media transport, controls, and recovery.
- The acceptance report and progress report are updated with evidence and final sign-off.
