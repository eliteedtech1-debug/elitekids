# Elite Integration — API Contract (elite-kids-api)

Every endpoint the addon API exposes, with auth + tenant requirements. Route prefixes
mirror elite-cbt-api's flat style (`/users/login`, `/schools/get-details`, …) so the
frontend port from elite-cbt is mechanical.

## Conventions

- **Auth**: `Authorization: Bearer <jwt>` (passport-jwt). Protected = the route column
  says "auth".
- **Tenant**: `X-School-Id`, `X-Branch-Id` headers (informational; JWT is the source
  of truth).
- **Response shape**: `{ success: true, data }` / `{ success: false, message, errors? }`.
- **Rate limiting**: 10/min/IP on auth endpoints, 300/min/IP global (mirror elite-cbt-api).
- **Child data rule**: every endpoint that touches child data requires auth. No exceptions.

## Auth & school (mirror elite-cbt-api `src/routes/user.js`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/users/login` | public (rate-limited) | Admin/Teacher/**Parent** login → `{ success, token, user, school_id }` |
| POST | `/students/login` | public (rate-limited) | Student (admission_no) login for tablets |
| GET | `/verify-token` | public | Validate token → `{ success, user }` |
| POST | `/auth/forgot-password` | public | OTP to email/phone (main DB `password_reset_tokens`) |
| POST | `/auth/reset-password` | public | Reset with OTP |
| POST | `/auth/select-school` | public | Multi-school selection token → fresh JWT |
| GET | `/schools/get-details` | public | `?query_type=select-by-short-name&short_name=X` → `school_setup` row (crest, name, `kids_stand_alone`, skin) |
| GET | `/schools/check-shortname` | public | Onboarding check |

## Children (parent + teacher)

> **Data model note:** Kids = `elite_db.students WHERE section = 'Nursery'`.
> The `kids_children` table is an enrichment layer (avatar, age_level, kids-app
> parent linking) in `elite_content`; canonical student data lives in `students`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/kids/children` | auth | Children linked to the logged-in parent (`parent_user_id`) — parent dashboard; staff see the whole school |
| GET | `/kids/children/:admissionNo` | auth (owner/staff) | One child + progress summary (XP/stars/games) |
| POST | `/kids/children` | auth (Admin/Teacher) | Create a child profile (`admission_no`, `full_name`, `age_level`, `parent_user_id`) — validates the student exists in the shared `students` table |
| POST | `/kids/children/link` | auth (Parent) | Self-service link: parent claims a child by `admission_no`; ownership verified against the shared `students` row (`parent_id`/`guardian_id` = user id/email, or phone/email match) |
| PUT | `/kids/children/:admissionNo` | auth (Admin/Teacher/Parent-owner) | Update profile/avatar/age level/status; re-link (`parent_user_id`) is staff-only |
| DELETE | `/kids/children/:admissionNo` | auth (Admin/Teacher) | Soft delete → `status=Inactive` (keeps progress history) |
| GET | `/kids/teacher/class/:classCode` | auth (Teacher/Admin) | Class roster + per-child engagement (teacher dashboard) |

## Lessons & content (teacher/admin)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/kids/lessons` | auth (Teacher/Admin) | Create lesson → enqueue AI generation job (`content_state=generated`) |
| GET | `/kids/lessons` | auth (Teacher/Admin) | Teacher's lessons with state filter |
| GET | `/kids/lessons/:id` | auth | Lesson + linked game configs/scene scripts (any state, staff only) |
| POST | `/kids/lessons/:id/generate` | auth (Teacher/Admin) | Re-run AI generation → Game Config JSON + Scene Script JSON (validated) |
| PATCH | `/kids/lessons/:id` | auth (Teacher/Admin) | Edit title/text/subject |
| DELETE | `/kids/lessons/:id` | auth (Teacher/Admin) | Delete (cascades configs/scripts) |
| GET | `/kids/lessons/:id/game` | auth + `published` only | Child-facing: resolved Game Config (signed asset URLs) |
| GET | `/kids/lessons/:id/scenes` | auth + `published` only | Child-facing: resolved Scene Script |

> `GET /kids/lessons/:id/game` and `/scenes` **filter `content_state='published'` in
> SQL** — a non-published or `recalled` config returns 404. This is enforced at the
> API layer, not by convention.

## Progress (child + parent + teacher)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/kids/progress/game-complete` | auth | `{ child_admission_no, lesson_id, game_config_id, score, stars, xp, idempotency_key }` — idempotent on `(child, lesson, config, key)`; only the child's own admission_no (or a parent/teacher of that child) may post |
| GET | `/kids/progress/child/:admissionNo` | auth (child/parent/teacher) | Stars/badges/XP per child |
| GET | `/kids/progress/lesson/:lessonId` | auth (Teacher/Admin) | Per-lesson completion/engagement stats |

## Review & safety pipeline (teacher/admin)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/kids/approvals` | auth (Teacher/Admin) | Review queue: generated content awaiting human review |
| POST | `/kids/approvals/:id/decide` | auth (Teacher/Admin) | `{ decision: approve|reject, reason? }` → flips content state (approved → published when approved) |
| GET | `/kids/denylist` | auth (Admin) | List denylist rules |
| POST | `/kids/denylist` | auth (Admin) | Add rule (audited: `added_by`, timestamp) |
| GET | `/kids/audit` | auth (Admin) | Query `kids_content_generation_audit` (AI DB — `elite_bot` on this server) |

## System

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | public | `{ status: 'ok' }` |
| GET | `/` | public | Service banner |

## Child-facing response: resolved Game Config

The child-facing `GET /kids/lessons/:id/game` returns the stored `config_json` with
asset keys resolved to short-lived signed URLs:

```json
{
  "success": true,
  "data": {
    "gameId": "kg1-animals-matching-01",
    "template": "matching",
    "lessonId": "kg1-basic-science-animals",
    "ageLevel": "KG1",
    "durationTargetSec": 60,
    "assets": {
      "background": "https://.../signed/.../bg.webp?X-Amz-Expires=300",
      "items": [
        { "id": "cat", "image": "https://.../cat.webp?...", "audio": "https://.../cat-meow.mp3?..." }
      ]
    },
    "rewards": { "starsOnComplete": 3, "xp": 20 },
    "successThresholdPct": 70
  }
}
```
Validated against `game-engine/schemas/<template>.schema.json` server-side before
storage and again before serving.
