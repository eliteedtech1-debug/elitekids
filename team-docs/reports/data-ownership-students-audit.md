# Data ownership — student records (directive audit + plan)

**Date:** 2026-09-15
**Directive (MASTER):** (1) an app must keep *its own* tables — no cross-app tables;
(2) primary data must never be duplicated — `kids_children` duplicates `students`,
so student records must be fetched **via the elite-sms APIs** (`../elite-sms`).
MASTER explicitly authorised creating the missing elite-sms endpoints if they don't exist.

## 1. Verified current state (read-only inspection)

| Check | Result |
|---|---|
| `elite_db.kids_children` | **does not exist** — `SHOW TABLES LIKE 'kids%'` on `elite_db` returns only `kids_badges`, `kids_weekly_points` |
| `elite_db.kids_badges`, `kids_weekly_points` | referenced **only** by `backend/src/controllers/*.bak-*` files (dead copies). No live code path → stale tables, drop candidates |
| `elite_kids.kids_children` (the duplicate) | exists, **4 rows**; model `backend/src/models/KidChild.js` is bound to the kids DB (`KIDS_CONTENT_MODEL_FILES`), not to `elite_db` |
| Kids backend reading the SMS `students` table directly | **42 references across 17 files** (below) |
| Old student→kids copy job | already disabled: `KIDS_SKIP_DB_SYNC=1` in `backend/.env` |

So the *table placement* is already clean; what is not clean is (a) the duplicated
child profile in `elite_kids` and (b) 42 direct reads of another app's table.

### 1a. Direct cross-app reads (`FROM students` / `db.Student`) — must become API calls

```
kidsParent.js 7    kidsBoss.js 5     kids.js 4        e3fArena.js 4
auth.js 4          kidsLeaderboard.js 3   routesHelper.js 2
kidsCompetition.js 2   e4VoiceNotes.js 2   e3fLive.js 2
sockets/chat.js 1  services/ageBand.js 1   kidsPredictiveAnalytics.js 1
kidsPortfolio.js 1 kidsGoals.js 1   kidsAnalytics.js 1   config/passport.js 1
```

Highest risk: `controllers/auth.js#studentLogin` — it authenticates against
`elite_db.students.password` (raw SQL) and falls back to a Kids-local
`kids_children.password_hash`. That is the login path for every child.

### 1b. Duplicated primary fields in `elite_kids.kids_children` (17 files)

`full_name`, `age_level`, `class_code`, `status`, `parent_user_id`, `parent_phone`,
`password_hash` — all of these are SMS-owned. Kids-owned additions that are legitimately
Kids-only: `avatar_url` (which avatar the child picked), `allow_anonymous_comparison`
(privacy preference), and any companion/garden preference.

Referenced in: `services/ageBand.js`, `models/KidChild.js`, `controllers/kids.js`,
`services/routesHelper.js`, `controllers/kidsPortfolio.js`, `models/index.js`,
`models/KidAgeDeclaration.js`, `controllers/kidsTeacher.js`, `kidsSeries.js`,
`kidsParentIntelligence.js`, `kidsParent.js`, `kidsGoals.js`, `models/Student.js`,
`index.js`, `kidsAge.js`, `auth.js`, `config/passport.js`.

## 2. Proposed elite-sms API surface (to create)

Kids needs exactly three shapes; all read-only, service-to-service, shared
`JWT_SECRET_KEY` (already the documented cross-app contract).

| Endpoint (elite-sms) | Purpose | Fields |
|---|---|---|
| `GET /api/internal/students/:admission_no` | one child by admission no (+ `school_id` to disambiguate) | `admission_no, student_name, school_id, branch_id, class_name, current_class, class_code, section, status, user_type, parent_id, parent_phone` |
| `POST /api/internal/students/lookup` | batch (leaderboards, arenas, analytics) | `admission_nos: []` → same rows |
| `POST /api/internal/students/authenticate` | verify a child's password **inside SMS** (hash never leaves the SMS DB) | `{ admission_no, school_id, password }` → `{ ok, student }` |

Notes: no new secrets (shared JWT + an `x-internal-service: elite-kids` header),
rate-limited, and the response deliberately excludes `password`.

## 3. Phased migration (each phase independently deployable)

1. **Kids-side client** — `backend/src/services/smsStudents.js`: cached, timeboxed
   fetch of the three endpoints, single place that knows the SMS base URL
   (`ELITE_SMS_API_URL`), with the existing DB read as a *temporary* fallback.
2. **Read-only reads** — replace the 42 sites file by file, highest-traffic first
   (`routesHelper.js`, `portsHelper`-style lookups, leaderboards, analytics), then
   the feature controllers. No behaviour change; each file verified by the
   backend acceptance gate (`scripts/run-tests.sh`).
3. **Band resolution** (`services/ageBand.js`) — `resolveBandForAdmission` already
   prefers the SMS row; switch its `db.Student.findOne` to the API, keeping
   `kids_band_placements` (Kids-owned) as-is.
4. **Login** — `studentLogin` calls the SMS authenticate endpoint; the Kids-local
   `password_hash` fallback is retired only after a pre-flight check that no
   in-use child depends on it (4 rows in `kids_children` today, so likely zero).
5. **Drop the duplicate** — after steps 1–4, stop writing `kids_children` except
   Kids-only columns; split the Kids-only fields into a narrow `kids_profiles`
   table keyed by `admission_no` (no identity columns), then drop `kids_children`.
6. **Cleanup** — drop `elite_db.kids_badges` / `kids_weekly_points` (dead), and the
   `.bak-*` copies that still reference them.

**Never in this migration:** any `ALTER` on `elite_db` tables (C2), and no writes
of student primary data from Kids.

## 4. Open questions for MASTER

1. Which elite-sms router file should host the internal endpoints (naming
   convention for internal/service routes)?
2. Is `ELITE_SMS_API_URL` an internal loopback (`127.0.0.1:<sms port>`) or the
   public origin?
3. Sequencing: land phase 1+2 before the Kids-side `kids_profiles` split (safer),
   or in parallel?
