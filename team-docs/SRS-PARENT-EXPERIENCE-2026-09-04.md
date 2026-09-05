# Software Requirements Specification — EliteKids Parent Experience

**Document ID:** SRS-PARENT-EXPERIENCE-2026-09-04  
**Version:** 1.0.0  
**Date:** 2026-09-04  
**Status:** DRAFT — implementation in progress  
**Baseline:** current `main` after parent acceptance commits `7da4e9c` and `1375f84`  
**Related documents:** `team-docs/reports/parent-acceptance-gap-plan-2026-09-04.md`, `team-docs/reports/flagship-parent-acceptance-2026-09-04.md`

---

## 1. Purpose and scope

This SRS defines the complete parent-facing product contract for EliteKids: authentication, child linking, family reporting, learning insights, parental controls, messaging, localization, and live/WebRTC collaboration. It records both the behavior already implemented on `main` and the work required to reach complete production acceptance.

### 1.1 In scope

- Shared EliteSMS parent authentication and ecosystem JWT handoff.
- Parent account/linking onboarding and zero-child recovery.
- Family child list and child ownership boundaries.
- 365-day activity grids, XP trends, streaks, and aggregate results.
- Per-child progress, achievements, portfolio, intelligence, and weekly reports.
- Family-wide controls navigation plus per-child play windows, daily limits, and mode locks.
- Parent↔child notifications, chat, presence, and live/WebRTC signaling/media.
- English/Hausa localization and accessible responsive UI.
- Cross-school privacy, auditability, testing, and production sign-off.

### 1.2 Out of scope

- Changing the shared EliteSMS identity model or password policy.
- Replacing the existing content/game engines.
- Sharing raw peer-identifying data in anonymous comparison.
- Manual production database schema changes without an approved migration.

### 1.3 Product actors

| Actor | Responsibilities | Access boundary |
|---|---|---|
| Parent | View and manage linked children; set parent-level controls; communicate with children | Own linked children in the authenticated school only |
| Child/student | Play games and view own learning data | Own admission number only |
| Teacher/staff | Manage assigned/class data and teacher-level locks | Authorized school/class scope |
| Administrator | School administration and teacher-level authority | Authorized school; superadmin may span schools where explicitly permitted |
| QA/release | Verify deployed behavior and evidence | Test accounts and non-production media only |

---

## 2. Current baseline on `main`

The following baseline is implemented and has focused local coverage:

- Shared parent login with phone, email, or username plus password.
- Parent child discovery from `kids_parent_links`, `kids_children`, and shared `students` relationships.
- Parent child linking with shared credential proof and ownership validation.
- Duplicate-phone signup/linking protections.
- Parent dashboard with child cards, weekly progress, portfolio, intelligence, subscription card, and per-child controls.
- Parent 365-day dense activity series with games, XP, stars, average score, active days, streak, and best day.
- Parent bulk result endpoint and dashboard rendering of recent rows.
- Parental controls for daily minutes and allowed time windows.
- Teacher > parent > child mode-lock hierarchy.
- Parent reports, achievements, notifications, chat, portfolio, weekly digest, insights, and anonymous comparison endpoints.
- Deployment hooks that install the locked backend test dependencies before the Jest gate.

Focused evidence recorded before this SRS:

- Frontend Vitest: 226/226 passed.
- Frontend production typecheck/build: passed.
- Focused backend parent/signup/onboarding/control/realtime suites: passed after serial setup.
- Mode-lock hierarchy defect was corrected and its focused regression passed.

These results are not a substitute for the production walkthrough, full backend baseline, browser media test, or the requirements below that remain open.

---

## 3. Parent journeys

### 3.1 Returning parent

1. Parent opens EliteKids or arrives through an Elite Suite handoff.
2. Parent submits the shared EliteSMS identifier and password.
3. Backend resolves the school from explicit school context, linked school, or approved flagship host mapping.
4. Backend returns an ecosystem JWT containing parent identity, school, and only permitted child admission numbers.
5. Parent lands on the family dashboard.
6. Dashboard loads family activity and results using the same authenticated ownership scope.
7. Parent selects a child for detailed progress, portfolio, insights, reports, or controls.

### 3.2 First-time parent / no linked child

1. Parent creates or confirms the shared EliteSMS account through the approved identity flow.
2. Parent signs in without creating a Kids-only password or PIN.
3. If no child is linked, dashboard explains the difference between account creation and child linking.
4. Parent submits a child admission number and any required school context.
5. Backend verifies the child exists in that school and that the shared relationship identifies the authenticated parent.
6. Parent may link another authorized child without losing the current session.
7. Parent returns to the family dashboard with updated children and reports.

### 3.3 Parent controls

1. Parent opens a dedicated family controls entry point.
2. Parent sees every linked child and each child’s current server state.
3. Parent edits daily minutes, allowed play window, and child-level mode locks independently.
4. Server validates ownership, range, time format, school scope, and hierarchy.
5. UI confirms the saved server state and clearly distinguishes teacher locks from parent locks.

### 3.4 Reporting

1. Family overview defaults to 365 days.
2. Parent can read a dense activity grid with month labels, legend, accessible daily summaries, and a selected range.
3. Parent can inspect XP trend details and empty/loading/error states.
4. Parent can filter, sort, paginate, and export only their children’s results.
5. Exports contain safe column names, escaped values, and no foreign-school rows.

---

## 4. Functional requirements

### 4.1 Authentication and session

| ID | Requirement | Priority |
|---|---|---:|
| AUTH-01 | Authenticate parents only against the shared EliteSMS users/parents credential, never a Kids-local PIN. | P0 |
| AUTH-02 | Require an active account and explicit or safely resolved school context. | P0 |
| AUTH-03 | Issue a JWT compatible with Elite Suite app switching and include parent identity and school scope. | P0 |
| AUTH-04 | Never include a child from another school, even when admission numbers or parent contact values collide. | P0 |
| AUTH-05 | Return actionable errors for missing credentials, inactive account, unknown school, and wrong password without disclosing account existence unnecessarily. | P1 |
| AUTH-06 | Preserve the current session while linking additional authorized children. | P1 |

### 4.2 Child linking and onboarding

| ID | Requirement | Priority |
|---|---|---:|
| ONB-01 | Show a single coherent first-time path from signup/sign-in to child linking and dashboard entry. | P1 |
| ONB-02 | A parent may link only an active shared student in the requested school. | P0 |
| ONB-03 | Ownership must be proven by canonical parent relationship or approved verified contact match; client-supplied parent IDs are never trusted. | P0 |
| ONB-04 | Duplicate linking is idempotent and does not create duplicate profiles. | P1 |
| ONB-05 | Zero-child parents receive a clear next action and can retry linking without signing out. | P1 |
| ONB-06 | Interface onboarding status and completion must enforce the same child ownership rule for parents. | P0 |
| ONB-07 | Invalid, inactive, foreign-school, and already-linked cases have stable HTTP status and user-safe messages. | P1 |

### 4.3 Family and child reporting

| ID | Requirement | Priority |
|---|---|---:|
| REPORT-01 | Family activity defaults to a dense 365-day series and supports approved ranges such as 30, 90, and 365 days. | P2 |
| REPORT-02 | Each day exposes games, XP, stars, and average score without gaps in the selected range. | P1 |
| REPORT-03 | Activity totals include games, XP, stars, active days, current streak, and best day. | P1 |
| REPORT-04 | XP trend is visually readable, has a text summary, and handles empty, loading, and error states. | P2 |
| REPORT-05 | Bulk results support child, mode, date, lesson, and score filters where supported by the API. | P2 |
| REPORT-06 | Bulk results use stable sorting and pagination; the UI must not silently truncate the user’s dataset. | P2 |
| REPORT-07 | CSV export uses explicit headers, safe escaping, and the same ownership/filter scope as the on-screen result. | P2 |
| REPORT-08 | Progress, achievements, portfolio, intelligence, digest, comparison, and printable reports use identical ownership and school scope. | P0 |
| REPORT-09 | Reports must not expose password hashes, private credentials, foreign identifiers, or peer identities. | P0 |

### 4.4 Controls and hierarchy

| ID | Requirement | Priority |
|---|---|---:|
| CTRL-01 | Provide a dedicated family-wide controls screen or entry point. | P1 |
| CTRL-02 | Show independent controls for every linked child. | P1 |
| CTRL-03 | Validate daily play minutes from 0 through 480 and validate time values. | P1 |
| CTRL-04 | Enforce parent ownership and school scope on read, write, and play-allowed checks. | P0 |
| CTRL-05 | Enforce teacher > parent > child authority for mode locks. | P0 |
| CTRL-06 | Parent may not override or remove a teacher lock; equal-rank parent writes are rejected. | P0 |
| CTRL-07 | Class-wide locks are staff-only and school-scoped. | P0 |
| CTRL-08 | UI shows the authoritative saved state after mutations and never implies a parent can override a teacher. | P1 |

### 4.5 Communication and live experience

| ID | Requirement | Priority |
|---|---|---:|
| LIVE-01 | Parent notifications and chat are readable only by an authorized parent/child relationship in the same school. | P0 |
| LIVE-02 | Presence and broadcast routing are school-scoped and recipient-scoped. | P0 |
| LIVE-03 | Signaling supports offer, answer, and ICE candidate exchange. | P1 |
| LIVE-04 | Browser acceptance verifies actual microphone/media receipt through the deployed TURN path. | P0 |
| LIVE-05 | Denied permission, stale peers, disconnect, reconnect, and refresh have safe recovery behavior. | P1 |
| LIVE-06 | Test evidence must not record personal audio or retain unnecessary media. | P1 |

### 4.6 Localization and accessibility

| ID | Requirement | Priority |
|---|---|---:|
| UX-01 | Parent-facing copy is represented by stable i18n keys, not new hard-coded literals. | P2 |
| UX-02 | English and Hausa strings cover onboarding, reports, controls, validation, loading, errors, and export messages. | P2 |
| UX-03 | Activity cells have accessible names; the chart has a text equivalent and meaningful empty state. | P2 |
| UX-04 | Controls, filters, dialogs, and navigation are keyboard operable and responsive on small screens. | P2 |
| UX-05 | Longer Hausa strings do not clip or destroy the layout. | P2 |

---

## 5. API contract

### 5.1 Common conventions

- Authentication: `Authorization: Bearer <JWT>`.
- JSON success envelope: `{ success: true, data, message? }`.
- JSON error envelope: `{ success: false, message }`.
- Parent child identifiers are admission numbers, but every parent data query must also bind the authenticated school scope.
- A missing parent school scope is a denial for privacy-sensitive parent operations, not an invitation to perform a global admission-number query.

### 5.2 Existing parent endpoints

| Method | Route | Purpose | Required authorization |
|---|---|---|---|
| POST | `/kids/parent/login` | Shared parent login and child discovery | Public request; credential checked server-side |
| POST | `/kids/parent/register` | Link an authorized shared child | Shared parent credential + school |
| GET | `/kids/parent/children` | List linked children | Parent |
| GET | `/kids/parent/children/activity?days=N` | Family activity grid and totals | Parent |
| GET | `/kids/parent/results?limit=N` | Family result rows | Parent |
| GET | `/kids/parent/child/:adm/progress` | Weekly/all-time progress | Owning parent or staff |
| GET | `/kids/parent/child/:adm/achievements` | Badges and competition history | Owning parent or staff |
| GET | `/kids/parent/child/:adm/controls` | Merged controls and mode locks | Owning parent or staff |
| GET | `/kids/parent/child/:adm/report` | Printable weekly report | Owning parent or staff |
| GET | `/kids/parent/notifications` | Notification inbox | Parent |
| POST | `/kids/parent/notifications/:id/read` | Mark notification read | Owning parent |
| GET | `/kids/parent/insights/:childId` | Generated parent insights | Owning parent or staff |
| GET | `/kids/parent/weekly-digest/:childId` | Seven-day digest | Owning parent or staff |
| GET | `/kids/parent/comparison/:childId` | Opt-in anonymous comparison | Owning parent or staff |
| POST | `/kids/parent/action-ack` | Acknowledge owned action item | Owning parent or staff |
| POST | `/kids/parent/opt-in` | Toggle anonymous comparison | Owning parent or staff |
| GET/POST | `/kids/parental-controls` | Read/write play controls | Owning parent or staff |
| GET | `/kids/parental-controls/check` | Evaluate current play permission | Owning parent or staff |
| GET/POST/DELETE | `/kids/mode-lock*` | Read/write/remove mode locks | Parent for own child; staff by school/class |
| GET/POST | `/kids/onboarding/status`, `/kids/onboarding/complete` | Interface onboarding | Child or owning parent/staff as product permits |
| GET/POST | `/kids/chat/:adm/*` | Parent↔child chat and receipts | Authorized relationship |
| GET | `/kids/portfolio/:childId[/export]` | Portfolio and export | Owning parent or staff |

### 5.3 Required reporting expansion

The results API should evolve from `limit`-only to a validated contract:

```text
GET /kids/parent/results
  child_admission_no?  mode?  lesson_id?
  from?  to?  min_score?  max_score?
  sort_by=completed_at|score|xp
  sort_dir=asc|desc
  page=1  page_size=25
  format=json|csv
```

The JSON response should include `results`, `children`, `page`, `page_size`, `total`, and `has_next`. CSV responses must use `Content-Disposition: attachment`, UTF-8-safe output, and consistent headers.

---

## 6. Data and privacy requirements

### 6.1 School-scoped identity

Every parent request must derive a non-empty school scope from the verified JWT/session or an explicitly validated school context. Admission numbers are identifiers within a school boundary, not globally trusted security keys.

For content tables, parent queries must use both:

```sql
child_admission_no = :adm
AND school_id = :school_id
```

For shared school tables, parent relationship queries must use both the parent relationship and:

```sql
s.admission_no = :adm
AND s.school_id = :school_id
```

For link tables, use:

```sql
parent_phone = :phone
AND child_admission_no = :adm
AND school_id = :school_id
AND verified = 1
```

### 6.2 Surfaces requiring the audit

The school predicate is mandatory in:

- Child lists and child linking.
- Activity, results, progress, achievements, and printable reports.
- Portfolio, adaptive state, speech evidence, and weekly digest.
- Goals, onboarding, parental controls, mode locks, and chat.
- Notifications, presence, push subscriptions, and WebRTC recipient routing.
- Any future family export, filters, pagination, or analytics endpoint.

### 6.3 Security behavior

- Fail closed when a parent has no verified school scope.
- Do not infer school from an arbitrary admission number.
- Do not allow a request header to expand a verified parent’s JWT school scope.
- Staff bypasses remain bounded by their existing school/class authorization; superadmin exceptions must be explicit.
- Errors must not reveal whether a foreign-school admission number exists.
- Exports and aggregate responses must be generated from the already authorized child set, not from a second unscoped query.

### 6.4 Retention and audit

- Keep parent control mutations attributable to actor, school, child, and timestamp.
- Keep live/WebRTC logs diagnostic and short-lived; never store raw microphone audio for acceptance testing.
- Record production verification evidence without credentials, tokens, or personal media.

### 6.5 Current migration boundary

The following source tables currently have a `school_id` column and are safe to scope directly in this pass:

- `kids_children`
- `kids_progress`
- `kids_adaptive_state_v2`
- `kids_speech_logs`
- `kids_mode_locks`
- `kids_badges`, competition analytics, and boss-run tables where present
- `kids_parent_links`

The following parent-intelligence tables currently identify children only by admission number and therefore require an additive migration before their queries can be school-filtered safely:

- `kids_insights`
- `kids_action_items`
- `kids_learning_goals`
- `kids_interface_onboarding`
- `kids_parent_notifications`
- `kids_failed_items`
- `kids_review_schedule_v2`
- other legacy `student_id`-keyed tracking/state tables

The migration must add a non-null school identifier with a backfill plan, add composite indexes/uniqueness where needed, update model definitions, and be tested against duplicate admissions in two schools. Until then, parent endpoints must not pretend those tables are school-safe by adding ORM predicates for columns that do not exist; they remain an explicit P0/P1 migration item and should fail closed where the current ownership boundary cannot guarantee isolation.

---

## 7. UI requirements

### 7.1 Dashboard

- Family header shows the active parent session and sign-out/app-switch actions.
- Child cards show name, admission number, school label, and a clear details action.
- Zero-child state offers link-child action without implying that a Kids PIN is required.
- Family overview groups activity and results across only linked children.

### 7.2 Activity and XP

- Default range is 365 days.
- Month labels align with grid columns.
- Legend explains each activity level.
- Each cell exposes date, games, XP, stars, and score summary to assistive technology.
- Range selector supports 30/90/365 and preserves loading/error/empty states.
- Expanded XP view provides readable axis/summary text rather than relying on SVG alone.

### 7.3 Results

- Display child, lesson, mode, score, XP, stars, and completion date.
- Filter and sort controls are explicit and resettable.
- Pagination communicates total and current page.
- CSV export confirms the selected scope and reports failures accessibly.

### 7.4 Controls

- Dedicated family controls entry point lists all children.
- Per-child editor includes play minutes, start/end window, and mode locks.
- Teacher-owned locks are read-only to parents and visibly labeled.
- Save buttons disable during request and refresh from server response.

### 7.5 Accessibility

- All interactive controls have labels and visible focus states.
- No information is conveyed by color alone.
- Touch targets are usable on small screens.
- Toast-only errors have an inline or live-region equivalent for critical actions.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Privacy | No cross-school or cross-parent data exposure; negative tests cover duplicate admission numbers. |
| Reliability | Parent dashboard degrades individual additive reports without blocking core progress where specified. |
| Performance | Family overview uses bounded, indexed queries and paginated results; no unbounded browser slicing. |
| Compatibility | JWT and shared credentials remain compatible with EliteSMS and AppSwitcher. |
| Observability | Production verification records deployed commit, health, startup errors, backend gate, and browser smoke outcomes. |
| Accessibility | Keyboard, screen reader, responsive layout, and English/Hausa checks are part of acceptance. |
| Localization | New parent copy must be keyed and translated before sign-off. |
| Testability | Focused unit/API tests plus clean-checkout backend/frontend gates and browser acceptance. |

---

## 9. Verification and acceptance plan

### 9.1 Automated backend

1. Run focused parent/auth/onboarding/control/mode-lock/portfolio/intelligence/chat/live suites serially.
2. Run the complete backend Jest suite from a clean dependency installation.
3. Add duplicate-admission fixtures in two schools and assert denial/isolation for every parent surface.
4. Assert no parent endpoint returns a foreign `school_id`, child, aggregate row, lock, report, notification, or export record.

### 9.2 Automated frontend

1. Run all Vitest tests.
2. Run TypeScript check and production build.
3. Add component coverage for zero-child onboarding, family controls, activity labels/legend/ranges, result filters/pagination/export, English/Hausa, and keyboard behavior.

### 9.3 Browser acceptance

- New parent: account/sign-in → link child → dashboard → add second child.
- Returning parent: dashboard → activity → results → child details → controls → report/export.
- Privacy: two parent sessions and duplicate admission values across schools.
- Localization: English and Hausa at desktop and mobile widths.
- Live: two isolated browsers, microphone permission, offer/answer/ICE, TURN relay, media receipt, mute/floor, reconnect, and denial recovery.

### 9.4 Production sign-off evidence

A release is not fully accepted until the report contains:

- Deployed commit and workflow result.
- Backend health/startup/migration outcome.
- Full backend suite result and failure classification.
- Frontend test/build result.
- Browser parent journey result.
- Cross-school privacy result.
- WebRTC/TURN media result.
- Known residual risks and explicit owner/waiver where applicable.

---

## 10. Implementation status and ordered work

| Phase | Work | Status |
|---|---|---|
| P0 | School-scoped ownership helper and parent aggregate audit | In progress |
| P0 | Production deployment/full backend baseline evidence | Open — requires deployed environment |
| P1 | Unified signup → child link → dashboard UX | Open |
| P1 | Dedicated family controls screen | Open |
| P2 | Activity/XP accessibility and range UX | Open |
| P2 | Results filtering, pagination, and CSV export | Open |
| P2 | Parent English/Hausa i18n completion | Open |
| P0 | Browser WebRTC/TURN media acceptance | Open — requires deployed TURN and test accounts |
| P0 | Final clean-checkout and release sign-off | Open |

### Definition of done

The parent experience is complete when all P0–P2 requirements have passing automated or browser evidence, no High-severity privacy or runtime gap remains, the deployed commit is externally verified, and the acceptance report records either closure or an approved waiver for every finding G-01 through G-09.
