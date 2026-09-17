# ECCE Bridge ↔ EliteSMS Integration — Continuation Report

**Report type:** Session-continuation / implementation handoff  
**Date:** 2026-09-04  
**Product:** EliteKids  
**Authoritative school system:** EliteSMS / EliteCore  
**Current priority:** Make EliteSMS shared APIs the only source for non-flagship school context while preserving the existing flagship model and pausing non-essential cost-intensive features.

---

## 1. Why this report exists

Work has crossed from the EliteKids repository into the sibling `../elite-sms` repository. If the session ends, the next implementation session must resume from this document rather than rediscovering the architecture or drifting toward lower-priority features.

The immediate objective is **not** to build more games, social feeds, leaderboards, AI analytics or real-time features. The immediate objective is to finish the practical ECCE bridge foundation:

```text
EliteSMS authoritative school data
→ EliteSMS shared API
→ EliteKids API client / context resolver
→ teacher lesson bridge
→ game or game-chain
→ child evidence + teacher observation
```

The work must remain affordable for a zero-funding startup and must not create a second school-data database inside EliteKids.

---

## 2. Current product direction

EliteKids is the child-learning and teacher-evidence application. EliteSMS is the school-management system and owns institutional data.

### EliteSMS owns

- School and tenancy identity.
- Branch/campus identity.
- Students and their admission numbers.
- Date of birth (`date_of_birth`, referred to by the product team as `dob`).
- Current class and class label/code.
- Subjects and subject codes.
- Academic year.
- Academic terms, including the canonical names `First Term`, `Second Term`, and `Third Term`.
- Academic weeks and week numbers.
- School lesson records and lesson IDs.
- The school-side curriculum/lesson context required to author a weekly plan.

### EliteKids owns

- Child learning/game-domain enrichment and gameplay data.
- Published game configurations and scene scripts.
- Game series, units and lock state for the Kids learning path.
- Lesson bridge planning records.
- Teacher observations and neutral learning summaries.
- Child game progress, item responses, sessions and offline queues.
- Kids-specific UI settings and optional enrichment features.

### Source-of-truth rule

For non-flagship schools, EliteKids must obtain school context through deployed EliteSMS APIs. It must not read EliteSMS shared tables directly for new bridge functionality, even though direct database access exists in some environments.

The direct database connection is retained only for existing compatibility paths and controlled legacy behavior. New implementation must use the API boundary.

The flagship/model-school path remains compatible with the existing EliteKids-owned seed/catalog behavior. It must not be broken while the SMS integration is introduced.

---

## 3. Advancement already completed before this report

### ECCE and game design foundation

The following design decisions are already established:

1. One primary professional objective per lesson.
2. Concrete experience comes before symbolic digital activity.
3. A game score is evidence, not a diagnosis.
4. Teacher observation is separate from game performance.
5. A `game-chain` is one lesson/unit container containing multiple ordered, complete game components.
6. Each standalone game component has 5–10 meaningful playable items.
7. The total number of items across a chain is not subject to the standalone 5–10 cap.
8. A chain may include `puzzle-split`; nested `game-chain` components are forbidden.
9. Large topics such as counting 1–100 are divided into manageable ordered units/modules without imposing an arbitrary fixed number of units.
10. First Term, Second Term and Third Term are the canonical term display values in the Kids bridge contract.
11. Child-facing content must remain published/reviewed and age/path/lock safe.
12. Teacher and parent summaries must use neutral language and must not compare children or attach diagnostic labels.

### Existing EliteKids implementation relevant to this work

Already present or started:

- `backend/src/models/KidLessonBridge.js`
- `backend/src/controllers/kidsLessonBridges.js`
- `backend/src/models/index.js` registration for `KidLessonBridge`
- `kids_lesson_bridges` in the dedicated Kids DB sync list
- Existing `KidLesson`, `KidCurriculumPoint`, `KidGameConfig`, `KidGameSeries`, `KidGameUnit`, `KidProgress` and tracking models
- Existing game-chain schema, frontend helper and renderer work
- Existing teacher lesson/game authoring pages
- Existing series/unit progression and lock routes
- Existing feature flag service and practical-first pause policy
- Existing `KidTeacherObservation`, observation controller and neutral summary work was started in the same implementation thread, but must be verified before being treated as production-ready

### Documentation already created

- `team-docs/reports/ecce-outcome-engagement-findings.md`
- `team-docs/reports/ecce-game-bridge-gap-map.md`
- `team-docs/SRS-ECCE-OUTCOME-GAME-BRIDGE.md`
- `team-docs/ECCE-GAME-BRIDGE-DATA-CONTRACTS.md`
- `team-docs/ECCE-GAME-BRIDGE-IMPLEMENTATION-ROADMAP.md`
- `team-docs/PRACTICAL-FIRST-FEATURE-PAUSE-POLICY.md`
- `team-docs/reports/ecce-game-bridge-progress.md`

The SRS defines the bridge phases. This report adds the cross-repository EliteSMS dependency that must be respected before further bridge implementation.

---

## 4. The EliteSMS API work already discovered

EliteSMS contains a shared API plan in:

```text
../elite-sms/SHARED_API_PLAN.md
```

The plan explicitly identifies EliteSMS as the authoritative source for the EliteSuite ecosystem and defines shared endpoints under `/api/shared/*`.

### Existing/shared API routes inspected

```text
../elite-sms/backend/src/routes/shared.js
../elite-sms/backend/src/controllers/sharedController.js
```

The currently inspected shared router exposes authenticated routes for:

- `GET /api/shared/students`
- `GET /api/shared/students/bulk`
- `GET /api/shared/students/:admission_no`
- `GET /api/shared/teachers`
- `GET /api/shared/teachers/:id`
- `GET /api/shared/classes`
- `GET /api/shared/classes/:code/students`
- `GET /api/shared/sections`

The controller already applies school filtering and, when present, branch filtering using the authenticated user context. Student data includes fields useful to EliteKids such as:

- `admission_no`
- names
- `date_of_birth`
- `class_code`
- `class_name`
- `section`
- `status`
- `academic_year`
- `branch_id`
- `school_id`

### Existing EliteSMS source fields verified

From the EliteSMS models/controllers inspected:

- Student primary identifier: `students.admission_no`.
- Student age source: `students.date_of_birth`.
- Student class context: `students.class_code`, `students.class_name`, `students.current_class`, `students.section`.
- Student tenancy: `students.school_id`, `students.branch_id`.
- Subject primary identifier: `subjects.subject_code`.
- Subject display name: `subjects.subject`.
- Subject class association: `subjects.class_code`.
- Academic period storage: `academic_calendar.academic_year`, `academic_calendar.term`, `begin_date`, `end_date`, `status`, `total_weeks`, `branch_id`, `school_id`.
- Week data exists in the EliteSMS schema/procedure family through `academic_weeks` and related calendar logic.
- School lessons are handled by the EliteSMS `lessons` route/controller and carry `lesson_id`, class, subject, academic year, term and other lesson fields through the stored procedure interface.

### Existing EliteSMS route registration

EliteSMS uses a route-loader style in:

```text
../elite-sms/backend/src/index.js
```

Routes are registered through a mixture of:

```js
require('./routes/<route>')(app)
app.use('/api/<prefix>', require('./routes/<route>'))
```

The shared route must be registered in the deployed EliteSMS server, not only documented. The exact production route registration must be verified in the current `../elite-sms/backend/src/index.js` before deployment.

---

## 5. Important blockers discovered

### Blocker A — the shared plan is broader than the actual shared router

`SHARED_API_PLAN.md` describes subjects, academic years, branches, school and other endpoints. The inspected `shared.js` currently contains only part of that plan. Do not make EliteKids depend on an endpoint until it exists, is registered, is tenant-safe and has a contract test.

The first missing/needed practical context endpoint should be implemented in EliteSMS as a purpose-built read-only lesson context endpoint rather than making EliteKids call many unrelated endpoints for every form.

### Blocker B — authentication consistency must be verified

The inspected `shared.js` imports:

```js
const { authenticateToken } = require('../middleware/auth');
```

The inspected `../elite-sms/backend/src/middleware/auth.js` is permissive and can fall back to request headers. This is not sufficient as the final production trust boundary for cross-application school data.

Before production use, the shared API must use a real service-to-service authentication mechanism, preferably one of:

1. A signed service JWT issued/validated by EliteSMS with an explicit `elitekids:read-context` scope; or
2. A restricted service API key plus school/branch claims and rotation plan.

Do not send a normal teacher JWT from the browser directly to EliteSMS as the long-term integration design. The EliteKids backend should call EliteSMS server-to-server.

### Blocker C — direct DB and API paths currently coexist

EliteKids currently has shared-school Sequelize models/queries for legacy features. That is historical compatibility, not the new bridge contract. New code must not silently fall back from a failed EliteSMS API call to a broad direct database query, because that would hide integration outages and reintroduce inconsistent source-of-truth behavior.

If a fallback is required temporarily, it must be:

- Explicitly feature-flagged.
- Limited to the flagship/model-school path or development fixtures.
- Observable in logs.
- Never used to expose a higher school/branch/class scope.

### Blocker D — one canonical lesson context endpoint is still needed

The current shared endpoints are entity-oriented. The bridge needs a coherent weekly planning cell. Calling students, classes, subjects, academic year, weeks and lessons separately creates extra requests and increases mismatch risk.

Recommended endpoint:

```http
GET /api/v1/shared/kids/lesson-context
```

Required query/filter inputs:

```text
school_id — derived from service/auth context; never trusted from a browser body
branch_id — optional only when the caller is allowed to access the branch
class_code — required for class-scoped context
academic_year — optional; defaults to active year
term — optional; defaults to active term
week_number — optional; defaults to the active/current week
subject_code — optional; filters the subject list
lesson_id — optional; resolves one authoritative EliteSMS lesson
```

The endpoint should return one normalized response containing:

- school
- branch
- class
- age context derived from the selected student/class roster or class configuration
- academic year
- term
- week
- available subjects
- selected lesson, if requested
- outcome/curriculum references, if EliteSMS already owns them
- `source: "elite-sms"`
- `contract_version`
- `as_of`

No private guardian/financial fields should be returned to EliteKids for this use case.

---

## 6. Canonical cross-application contract to preserve

### Identity

| Concept | Canonical source | Canonical field |
|---|---|---|
| School | EliteSMS | `school_id` |
| Branch | EliteSMS | `branch_id` |
| Child | EliteSMS student | `admission_no` |
| Date of birth | EliteSMS student | `date_of_birth` |
| Class | EliteSMS | `class_code`, display `class_name` |
| Subject identity | EliteSMS | `subject_code` |
| Subject display | EliteSMS | `subject` |
| Lesson | EliteSMS | `lesson_id` |
| Outcome | Reviewed curriculum source; temporary Kids catalog allowed only where explicitly documented | `outcome_id` |
| Academic year | EliteSMS | `academic_year` |
| Term | EliteSMS | `term` normalized to `First Term`, `Second Term`, `Third Term` |
| Week | EliteSMS | `week_number` within the selected academic year/term |

### Age-band derivation

For non-flagship schools, age must be derived from the EliteSMS student `date_of_birth` using one documented as-of date and the existing EliteKids age-band resolver. A class label must not silently override a valid DOB-derived age.

The API should return the DOB-derived age information needed by EliteKids, but EliteKids must not expose the date of birth unnecessarily in teacher or parent UI.

Suggested response fields:

```json
{
  "age": {
    "as_of": "2026-09-04",
    "years": 4,
    "band": "Nursery 2",
    "source": "elite-sms.date_of_birth"
  }
}
```

### Tenant and branch rule

- `school_id` is always server-derived from verified auth/service claims.
- A requested `branch_id` must be checked against the authenticated service scope and school.
- A class must belong to the school and selected branch.
- A subject must belong to the selected class/school/branch.
- A lesson must belong to the school and must match the requested class/subject/academic context when those filters are supplied.
- Cross-school and unauthorized cross-branch requests fail closed.

---

## 7. What must not be changed now

Do not spend the next session on these items unless a production failure directly blocks the practical bridge:

- Leaderboards and public ranking.
- Social feeds.
- Chat or classroom social networking.
- WebRTC/live classroom features.
- Competition/arena/boss-battle systems.
- Paid analytics and predictive analytics.
- New AI providers or paid infrastructure.
- New media pipelines.
- Removing already-built features. They may remain in the repository but should stay paused behind the existing feature policy.

The practical first rollout is:

```text
Teacher selects SMS class/week/subject/lesson
→ creates or edits bridge
→ selects game/game-chain
→ publishes after review
→ child plays
→ teacher records observation
→ teacher sees neutral evidence summary
```

---

## 8. Exact next implementation sequence

### Step 1 — Implement EliteSMS API contract and endpoint

Repository: `../elite-sms`

1. Add a versioned read-only route for the Kids lesson context.
2. Add strict service authentication and scope checking.
3. Resolve school and branch from verified claims, not arbitrary body/query values.
4. Query academic year/term/week, class, subjects and lesson using existing EliteSMS tables/procedures/models.
5. Project only the fields required by EliteKids.
6. Return `{ success: true, data, meta }` with a contract version.
7. Add route/controller unit tests and tenant/branch isolation tests.
8. Register the route in the deployed EliteSMS application.
9. Document the deployment and required environment variables.

### Step 2 — Implement EliteKids server-to-server client

Repository: EliteKids (`backend`)

1. Add `ELITE_SMS_API_BASE_URL`.
2. Add a server-only service credential configuration; never expose it to Vite/browser code.
3. Add an `eliteSmsClient` using the already available HTTP dependency (`axios` or native fetch convention).
4. Add timeout, bounded retry for GET only, structured error classification and no secret logging.
5. Add `getLessonContext()` with typed response normalization.
6. Make failures explicit (`SMS_CONTEXT_UNAVAILABLE`), not an empty success response.
7. Add a development/test fixture adapter, not a production direct-DB fallback.

### Step 3 — Make the lesson bridge SMS-context aware

Repository: EliteKids (`backend/src/controllers/kidsLessonBridges.js`, model and tests)

1. Store the authoritative context identifiers on the bridge: `school_id`, `branch_id`, `class_code`/class identity, `lesson_id`, `subject_id`/subject code, `academic_year`, `term_name`, `week_number`, `context_source`, `context_version`.
2. Before creating/submitting a non-flagship bridge, resolve the context from EliteSMS.
3. Reject mismatches between client values and SMS response.
4. Permit existing flagship fixtures through the documented flagship path.
5. Do not copy large SMS records into Kids DB; store stable IDs and the minimal snapshot needed for audit/display.
6. Keep bridge drafts teacher-editable, but make institutional identity fields server-authoritative.

### Step 4 — Update teacher authoring UI

Repository: EliteKids frontend

1. Replace free-text school/class/subject/term/week inputs for non-flagship schools with SMS context selectors.
2. Load one context payload where possible rather than one request per field.
3. Show source label: `School information from EliteSMS`.
4. Show a clear unavailable state with retry; do not silently show a wrong class or empty “success”.
5. Preserve a simple flagship/demo path.
6. Keep the teacher workflow practical: outcome → objective → concrete activity → game/game-chain → evidence plan → save draft.

### Step 5 — Finish Phase 3 evidence against the same identity context

1. Observation creation must verify the child and lesson bridge belong to the same school/class context.
2. The observation API may use `admission_no` for the child, but the child roster must be validated against EliteSMS for non-flagship schools.
3. Store observation evidence in the dedicated Kids DB.
4. Keep summaries neutral and separate digital evidence from professional observation.
5. Do not add composite scores or peer comparisons.

### Step 6 — Add rollout and pause controls

1. Add a feature flag for `SMS_CONTEXT_BRIDGE_ENABLED` or an equivalent existing flag convention.
2. Default it off in development until contract tests pass.
3. Enable it for one controlled school/branch first.
4. Keep social/competition/live features paused according to `team-docs/PRACTICAL-FIRST-FEATURE-PAUSE-POLICY.md`.
5. Add an operational report for API availability, not an expensive analytics dashboard.

---

## 9. Acceptance checklist for the next session

The integration is not ready to claim complete until all applicable checks pass:

- [ ] EliteSMS has a deployed, versioned lesson-context endpoint.
- [ ] The endpoint authenticates EliteKids as a service and does not rely on permissive fallback headers in production.
- [ ] A school cannot request another school's context.
- [ ] A branch-scoped caller cannot request another branch without explicit permission.
- [ ] A lesson returned for a class/subject/week matches all requested identifiers.
- [ ] Term values are normalized to `First Term`, `Second Term`, `Third Term` in the cross-app response.
- [ ] Week number is validated against the selected academic year/term.
- [ ] Subject identity uses EliteSMS `subject_code`; display name is not used as the primary key.
- [ ] Child age is derived from `date_of_birth` with an explicit as-of date.
- [ ] EliteKids backend calls EliteSMS server-to-server.
- [ ] No browser bundle contains the EliteSMS service credential.
- [ ] No new EliteSMS shared table is created by EliteKids.
- [ ] No new direct shared-DB query is introduced for the bridge path.
- [ ] A non-flagship teacher can select a valid SMS class, term, week and subject.
- [ ] A non-flagship teacher can save a draft bridge with the SMS context.
- [ ] A mismatched lesson/class/subject is rejected with a field-level error.
- [ ] A flagship/model-school fixture still loads and can author a bridge.
- [ ] A published bridge remains protected by existing content review/publish gates.
- [ ] A child can still play existing published games if the SMS API is temporarily unavailable.
- [ ] A teacher can record observation evidence separately from game evidence.
- [ ] Targeted backend tests pass.
- [ ] Frontend typecheck/build passes.
- [ ] An updated progress report records exact changed files and known gaps.

---

## 10. Suggested test fixture

### EliteSMS context fixture

```json
{
  "school_id": "SCH/TEST001",
  "branch_id": "BR/MAIN",
  "class": {
    "class_code": "NUR2-A",
    "class_name": "Nursery 2 A",
    "section": "Nursery"
  },
  "academic": {
    "academic_year": "2026/2027",
    "term": "First Term",
    "week_number": 3,
    "week_start": "2026-09-14",
    "week_end": "2026-09-18"
  },
  "subjects": [
    {
      "subject_code": "SBJ0001",
      "subject_name": "Numeracy",
      "class_code": "NUR2-A",
      "status": "Active"
    }
  ],
  "lesson": {
    "lesson_id": "SMS-LESSON-001",
    "subject_code": "SBJ0001",
    "class_code": "NUR2-A",
    "academic_year": "2026/2027",
    "term": "First Term",
    "week_number": 3
  },
  "age": {
    "years": 4,
    "band": "Nursery 2",
    "as_of": "2026-09-04",
    "source": "elite-sms.date_of_birth"
  },
  "source": "elite-sms",
  "contract_version": "1.0"
}
```

### Required negative fixtures

1. Wrong `school_id` → 403.
2. Wrong branch → 403.
3. Unknown class → 404.
4. Subject not assigned to class → 404 or 422.
5. Lesson belongs to another subject/class → 422.
6. Invalid term such as `Term 1` → normalize only at the SMS boundary if unambiguous; otherwise reject.
7. Week 11 in a 10-week term → reject.
8. Missing DOB → return `age.source = "class_or_teacher_context"` only if the product contract explicitly permits it; never invent an age.
9. SMS API unavailable → explicit integration error for context-dependent authoring; existing published child gameplay remains available.
10. Browser attempts to use service credential → impossible because the credential exists only in backend environment.

---

## 11. Current status at handoff

| Area | Status | Meaning |
|---|---|---|
| ECCE findings/SRS | Documented | Design baseline exists |
| Game-chain semantics | Implemented/documented | One lesson container, independent component counts |
| Practical-first pause policy | Documented/started | Do not prioritize social/competition/live expansion |
| Lesson bridge model/controller | Started | Must be reconciled with authoritative SMS context |
| Teacher observation/neutral summary | Started | Must be verified and linked to SMS-validated child context |
| EliteSMS shared API plan | Exists | Broad plan exists, implementation coverage is partial |
| EliteSMS shared entity endpoints | Partial | Students/teachers/classes/sections inspected |
| Purpose-built Kids lesson-context endpoint | Not yet implemented | **Next cross-repository coding task** |
| Production-grade service authentication | Not yet confirmed | **Blocking security task** |
| EliteKids SMS server client | Not yet implemented | After SMS endpoint contract |
| Frontend SMS context selectors | Not yet implemented | After backend client |
| End-to-end bridge with SMS context | Not yet complete | Main practical milestone |

---

## 12. Resume prompt for a new session

Use this prompt to continue without losing priority:

```text
Read team-docs/reports/ecce-bridge-sms-integration-continuation.md first.

Continue the ECCE bridge integration only. EliteSMS (../elite-sms) is the authoritative
source for non-flagship school, branch, class, student DOB, subject, academic year, term,
week and lesson context. Do not add new direct shared-DB reads for this path. First implement
and test the versioned EliteSMS lesson-context API with strict service authentication and
school/branch isolation. Then implement the EliteKids server-to-server client. Preserve the
flagship model-school path. Do not work on social feeds, leaderboards, competitions, WebRTC,
paid analytics or new AI infrastructure. Add focused tests and update this report after each
cross-repository milestone.
```

---

## 13. Final priority statement

The most important unfinished work is not another game feature. It is the trustworthy bridge between:

```text
what the school has scheduled in EliteSMS
→ what the teacher plans in EliteKids
→ what the child plays
→ what the teacher observes
→ what the next lesson should be
```

Everything else should remain secondary until this path works reliably for one real school, one branch, one class, one subject, one term/week and one lesson.
