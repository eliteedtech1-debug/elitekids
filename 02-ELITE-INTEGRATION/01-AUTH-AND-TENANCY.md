# Elite Integration — Auth & Tenancy

How elite-kids authenticates users and resolves the school — **identical in shape to
`elite-cbt-api`**, so read that repo alongside this doc.

## 1. The shared JWT

All Elite apps (EliteCore, EliteCampus, EliteCBT, EliteKids) sign JWTs with the
**same** `JWT_SECRET_KEY` environment variable. A token issued by elite-api is
accepted by elite-kids-api, and vice-versa. This is what makes a teacher/parent able
to log into elitekids.com.ng with their existing SMS credentials.

**Payload** (as produced by `elite-api/src/middleware/sessionAuth.js` →
`generateLoginToken`):

```json
{
  "id": "user_id_or_admission_no",
  "user_type": "Admin | Teacher | Parent | Student | ...",
  "school_id": "SCH/29",
  "branch_id": "BRCH00001",
  "email": "user@school.ng",
  "lastActivity": "2026-08-17T10:00:00.000Z",
  "iat": 1780000000,
  "sessionCreated": "2026-08-17T10:00:00.000Z",
  "renewalCount": 0,
  "admission_no": "only_for_student_tokens"
}
```

**Rules (hard):**
- `JWT_SECRET_KEY` in elite-kids-api **must equal** elite-api's value. It is read from
  `process.env` only — never committed.
- `passport-jwt` strategy resolves the token against the **shared school DB**
  (`users`, `students`, `teachers`, `parents` tables) — never against addon tables.
- The strategy enforces role priority the same way elite-cbt-api does: a user with a
  genuine `teachers` row classified as `teacher` may only authenticate as teacher.
- Students authenticate with `admission_no` + `school_id` from the token, looked up in
  the shared `students` table.

## 2. Login endpoints (implemented by elite-kids-api, mirroring elite-cbt-api)

| Endpoint | Body | Who | Notes |
| --- | --- | --- | --- |
| `POST /users/login` | `{ username, password, school_id }` | Admin / Teacher / **Parent** | Rate-limited (10/min/IP). Parent rows live in the `parents` table linked by `user_id` (user_type `parent`). |
| `POST /students/login` | `{ username: admission_no, password, school_id }` | Student (tablet mode) | Rate-limited. Nursery kids mostly use the parent-linked child picker instead; this exists for school tablets. |
| `GET /verify-token` | — | any | Returns `{ success, user, school }`. Used on app boot (mirrors elite-core's `init`). |
| `POST /auth/forgot-password` | `{ email\|phone, school_id }` | any | OTP flow; `password_reset_tokens` lives in the main DB (already created by elite-cbt migrations — reuse it). |
| `POST /auth/reset-password` | `{ email\|phone, otp_code, new_password, school_id }` | any | Same table. |

**Parents**: elite-api supports `user_type='parent'` with a `parents` table
(`user_id`, password, contact). elite-kids-api's `/users/login` must look up the
`parents` table when the account is a parent (mirror elite-api's
`profileController`/`user.js` login logic), then sign a normal token.

**Children are not login principals.** A nursery child never types a password — the
parent picks the child after logging in. `kids_children.admission_no` links the child
to the shared `students` row.

## 3. Token verification middleware

Mirror `elite-cbt-api/src/middleware/authBypass.js` + `sessionAuth.js`:

- `passport.authenticate('jwt', { session: false })` on every protected route.
- `conditionalAuth` — tries auth, lets the request through without a user (for
  semi-public routes like school lookup).
- After auth, `req.user` carries the DB row (with `user_type` normalized from
  `user_type || role`).

## 4. Tenancy — school + branch resolution

Identical to elite-cbt:

1. **Subdomain → school short name.** The SPA derives `short_name` from
   `window.location.hostname` (`<school>.elitekids.com.ng` → `school`), excluding
   `www/app/api/admin/portal/test/staging/demo` and handling multi-part TLDs
   (`.com.ng`, `.co.uk`, …). Copy `elite-cbt/src/lib/utils/school.ts` `getSubdomain()`.
2. **School lookup.** `GET /schools/get-details?query_type=select-by-short-name&short_name=X`
   reads `school_setup` in the shared DB and returns the row (badge_url, school_name,
   motto, colors via `badge_url`/skin, `kids_stand_alone` flag, …).
3. **Tenant headers.** The SPA sends `X-School-Id` + `X-Branch-Id` on every request
   (informational; identity comes from the JWT). Adapters: `X-Admin-Needs-Branch`,
   `x-academic-year`, `x-term`.
4. **Branch selection.** Admin flows reuse elite-core's `selected_branch` /
   `school_locations` pattern — copy `getSchoolContext()` + `createAuthHeaders()` from
   `elite-core/src/feature-module/Utils/Helper.tsx` (or the slimmer port in
   `elite-cbt/src/lib/utils/school.ts`).

## 5. Module access gate (Kids Stand-Alone)

A school can only use elite-kids when the **Kids Stand-Alone** module is enabled —
the direct analogue of `cbt_stand_alone`:

- Column: `school_setup.kids_stand_alone TINYINT(1) NOT NULL DEFAULT 0`
  (added idempotently by the migration runner — see 04-MIGRATION-AND-DEPLOY).
- Frontend gate: `hasKidsAccess(school) => Number(school?.kids_stand_alone) >= 1`
  (deny-by-default; copy `elite-cbt/src/features/auth/lib/cbt-access.ts` + its unit test).

## 6. Flagship practice school

Mirror `elite-cbt-api/src/seeders/flagshipSchoolSeed.js`:

- `SCH-KIDS` / short_name `kids` / "Elite Kids Academy", created idempotently on boot.
- Aliases (`practice`, `kids`) resolve to `SCH-KIDS` for `elitekids.com.ng` base domains.
- A flagship admin (`admin@elitekids.ng`) + a few demo children are seeded so the
  parent/teacher demo works out of the box.
- **Self-registration restriction** (mirror the elite-cbt fix): `POST /auth/student-register`
  may only create accounts into the flagship school, never into `SCH-ELITE` or other
  schools.

## 7. CORS

Copy `elite-cbt-api/src/middleware/corsAuthFix.js`: `ALLOWED_ORIGINS` comma-separated,
wildcard subdomain matching (`https://*.elitekids.com.ng`), deny cross-origin when the
env list is empty, credentials allowed, exposed `Authorization` header.
