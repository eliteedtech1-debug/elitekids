# Tech Spec — Flagship `elite` Model School + EliteKids Subscriptions

**Author:** Codebuff (with Elite EduTech Systems Ltd)
**Date:** 2026-09-01
**Status:** Draft — for review before Phase-1 execution

---

## 0. Purpose

`elite` is the **flagship model school** owned by **Elite EduTech Systems Ltd**.
It is NOT a real school — it is a living demo of how EliteKids works in any
school, and simultaneously the **on-ramp for kids who have no school** on the
Elite suite. Everything a real school gets (series, domestication, mode locks,
reports) is demonstrated on `elite`, and parents without a school can register
directly, try the free tier, and subscribe.

This spec covers four workstreams:

1. **A. Flagship `elite` school** — identity, aliases, self-registration.
2. **B. Global content + domestication** — how `elite` creates content that any
   school extends/copies by mapping series → their own subjects.
3. **C. Subscription & access model** — school subscriptions, parent
   self-service plans (free tier + paid), pricing, entitlements.
4. **D. Parent controls + live chat** — parental control, reports, mode locks,
   and socket.io talk with the child.

---

## A. Flagship `elite` school

### A.1 Identity

| Field | Value |
|---|---|
| `school_id` | `SCH-KIDS` (keep — existing flagship id, referenced by seeders) |
| `short_name` | **`elite`** (primary), aliases: `kids`, `practice` (back-compat) |
| `school_name` | `Elite EduTech Systems Ltd — Model School` |
| Domain | `elite.elitekids.com.ng` (plus `kids.`/`practice.` aliases) |
| Owner | Elite EduTech Systems Ltd |
| `kids_stand_alone` | `1`, `nursery_section` `1`, `cbt_stand_alone` `1` (full suite demo) |

### A.2 Changes to `seeders/flagshipKidsSeed.js`

- Add `'elite'` to `FLAGSHIP_SHORT_NAME`/`FLAGSHIP_ALIASES`/`FLAGSHIP_SUBDOMAINS`
  so `flagshipIdForAlias('elite') === 'SCH-KIDS'` (school lookup + login already
  honor flagship aliases via `routes/user.js` and `controllers/auth.js`).
- Update the seeded school display name to the Elite EduTech Systems Ltd model
  school (idempotent UPDATE on boot, keep `SCH-KIDS` id).
- **Self-registration is flagship-only** (`isFlagshipRequest`): parents on
  `elite.*` may create an account directly (see C.5). Real-school parents go
  through their school (no self-signup).

---

## B. Global content + domestication (largely EXISTS)

### B.1 What already exists (verified in code)

- **Global content**: `elite` (and any school) creates series/lessons;
  `kids_lessons.is_global` marks shared content.
- **Domestication**: `POST /kids/series/:id/domesticate {subject_code}` —
  maps a **whole series** to a local subject (e.g. *Numbers game series* →
  `MATHEMATICS` for KG), materializes school-owned lesson copies carrying
  `source_lesson_id` + `owner_school_id` lineage, records the mapping in
  `kids_series_subject_maps`. Idempotent (no duplicate copies).
- **Listing**: `GET /kids/series-domestications`.
- **Subject binding**: lesson subjects resolve local-first (domesticated copy's
  subject) else the global lesson subject (`convertTestScores` logic).

### B.2 Gaps to close

| # | Gap | Change |
|---|---|---|
| B-1 | Domestication is staff-only in caller's school; `elite`-owned global series should be visibly marked | Add `is_global` + `owner_school_id` to series listing; badge "Elite Global" |
| B-2 | No "copy without remap" (pure fork) | Add `mode: 'copy' | 'domesticate'` to the endpoint (domesticate = map+copy, copy = fork only) |
| B-3 | No UI in teacher portal | Teacher "Browse Global Library → Add to My Subjects" screen (frontend phase) |

---

## C. Subscription & access model

### C.1 Access rule (the core)

> **Every child who wants to access series must have their school subscribed to
> EliteKids.** On the flagship `elite` school, kids without a school can log in
> directly: **free tier = limited games; paid subscription = all games.**

Formal entitlement per child:

```
canAccessSeries(child, school_id):
  if school_id == SCH-KIDS (flagship):
     if parent.subscription active:  ALL series
     else:                          FREE_TIER_SERIES (limited set)
  else (real school):
     if school has active EliteKids subscription:  ALL series
     else:                                          NONE (blocked with upsell)
```

### C.2 Pricing (configurable, never hardcoded)

| Plan code | Billing period | Price (NGN) | Notes |
|---|---|---|---|
| `kids_term`   | term | **500** | configurable via DB |
| `kids_annual` | year | **1 200** | configurable via DB |

- Prices live in a `kids_subscription_plans` table (seeded at boot if empty) —
  changing a price is a DB UPDATE, no deploy.
- Currency: `NGN` only (Paystack kobo conversion: `amount * 100`).

### C.3 Tables (created in `elite_content` — kids-owned)

```sql
kids_subscription_plans (
  id CHAR(36) PK, code VARCHAR(30) UNIQUE, name VARCHAR(80),
  amount_ngn INT NOT NULL, billing_period ENUM('term','annual') NOT NULL,
  currency CHAR(3) DEFAULT 'NGN', is_active TINYINT(1) DEFAULT 1,
  created_at, updated_at
)

kids_subscriptions (
  id CHAR(36) PK,
  subscriber_type ENUM('school','parent') NOT NULL,
  school_id VARCHAR(20) NULL,          -- school subscriber
  parent_user_id VARCHAR(50) NULL,     -- flagship parent subscriber
  plan_code VARCHAR(30) NOT NULL,
  status ENUM('free','active','expired','cancelled') DEFAULT 'free',
  starts_at DATETIME, expires_at DATETIME,
  max_children INT DEFAULT 0,          -- 0 = unlimited
  created_at, updated_at
)

kids_payments (
  id CHAR(36) PK,
  subscription_id CHAR(36) NOT NULL,
  reference VARCHAR(100) UNIQUE NOT NULL,   -- paystack ref
  amount_ngn INT NOT NULL,
  status ENUM('pending','success','failed') DEFAULT 'pending',
  gateway VARCHAR(20) DEFAULT 'paystack',
  gateway_response JSON NULL,
  paid_at DATETIME NULL,
  created_at
)
```

### C.4 API (all under `/kids/subscription`)

| Method + path | Auth | Purpose |
|---|---|---|
| `GET  /kids/subscription/plans` | none (public) | list active plans + prices |
| `GET  /kids/subscription/status` | auth | current entitlement for the caller's school (staff) or parent |
| `POST /kids/subscription/initiate` | auth (parent or staff) | `{plan_code}` → Paystack initialize → `{authorization_url, reference}`; upserts a pending subscription |
| `POST /kids/subscription/verify` | auth | `{reference}` → verify with Paystack → activate subscription (set `expires_at`), idempotent |
| `POST /kids/paystack/webhook` | Paystack signature | gateway webhook → same activation path (no user session) |

Entitlement middleware (`requireKidsEntitlement`) is applied to series/game
routes: blocks 403 `SUBSCRIPTION_REQUIRED` for non-subscribed schools and
non-subscribed flagship parents; flagship free tier sees only
`FREE_TIER_SERIES`.

### C.5 Flagship parent self-registration (no school)

- `POST /kids/parent/register` on flagship hosts (`isFlagshipRequest`):
  `{name, phone, email, password}` → creates the shared `users`/`parents`
  account (same credential as EliteSMS login) **and** a `kids_subscriptions`
  row with `status='free'` + `plan_code='kids_free'`.
- Login is the **same unified login** (`/kids/parent/login` — shared password),
  so the parent can switch between EliteKids and any Elite suite app with no
  re-login.
- Parents can **enroll as many kids** as they want: link each child by
  `admission_no` (the existing `/kids/children/link` + register flow) — all
  children under one subscription (parent-level), `max_children=0` (unlimited)
  on paid plans.

---

## D. Parent controls + live chat

### D.1 Parental controls (EXISTS — extend)

Already present: daily play-time limit, time-of-day windows,
`GET/POST /kids/parental-controls`, `GET .../check`. Extend:

| # | Change |
|---|---|
| D-1 | Return controls merged with the child's **mode lock** in one parent dashboard call (`GET /kids/parent/child/:adm/controls`) |
| D-2 | Add **per-child** and **per-subject** play limits (optional) |
| D-3 | Performance report endpoint: reuse `getChildProgress` + `getChildAchievements` (already built) and add a printable weekly report (`GET /kids/parent/child/:adm/report?week=`) |

### D.2 Mode locks (EXISTS — enforce "kids should not change")

`kidsModeLock.js` already implements the **Teacher > Parent > Child**
hierarchy with `learning|practice|test` and per-student + class-wide scopes.
The "if set game mode kids should not change" rule = **the child cannot change
mode** — enforced client-side by hiding the mode switcher when a lock exists
and server-side by the existing `getUnitSuggestedMode`/lock lookups.

Gap: the child-facing mode-change endpoint should refuse when a lock is active
(server-side guard), not just hide the button.

### D.3 Live chat via socket.io (NEW)

Parents talk directly to their child in real time.

- **Transport**: add `socket.io` to the kids backend (the repo currently ships
  `ws` for WebRTC signaling; socket.io is additive, rooms keyed by
  `child_admission_no`).
- **Auth**: JWT from the `authorization` handshake header (`passport-jwt`
  strategy reuse); room join allowed only if the caller is the child's linked
  parent or a teacher/admin of the child's school.
- **Events**:

| Event | Direction | Payload |
|---|---|---|
| `chat:send` | parent → server | `{ child_admission_no, text }` |
| `chat:message` | server → child's device(s) | `{ from, text, ts }` |
| `chat:read` | child → server → parent | `{ message_id }` |
| `mode:changed` | parent/teacher → child | `{ lesson_id, locked_mode }` — child UI switches mode immediately |
| `presence` | both | online/offline of child device |

- **Storage**: persist messages in `kids_chat_messages`
  (`id, child_admission_no, from_user_id, from_role, text, read_at, created_at`)
  so the parent dashboard shows history; unread count in the parent app.
- **Sockets never replace the mode-lock authority**: `mode:changed` is a live
  push of the existing `kids_mode_locks` state; the server still validates on
  the next HTTP call.

---

## E. Non-goals / deferred

- No card storage or recurring billing automation in v1 — Paystack is
  pay-once per term/year; expiry is enforced by `expires_at`.
- No refunds workflow (admin manual action).
- No school-tier plans yet (flat per-school price; per-child pricing is a
  future option).
- socket.io mobile push (use existing web-push for offline notices instead).

---

## F. Security & integrity

- Paystack secret key comes from `PAYSTACK_SECRET_KEY` in the kids `.env` —
  **same value as EliteSMS's** (one platform key). Never logged, never
  committed.
- Webhook endpoint verifies Paystack's `x-paystack-signature` (HMAC SHA512 of
  the raw body with the secret key) before activating.
- Verify endpoint re-checks `transaction.status === 'success'` AND the
  `amount` matches the plan price (kobo) to prevent amount tampering.
- Entitlement is checked server-side on every series/game access; the
  frontend hiding buttons is UX only, not security.
- All new tables are created in `elite_content` (kids-owned), never in the
  shared `elite_db`.
