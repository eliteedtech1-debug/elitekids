# Execution Plan — Flagship `elite` School + Subscriptions

**Date:** 2026-09-01 · **Owner:** Codebuff + Elite EduTech Systems Ltd
**Depends on:** `team-docs/FLAGSHIP-ELITE-SCHOOL-SPEC.md` (this plan implements it)

Legend: ✅ done · 🟦 in progress · ⬜ todo

---

## Phase 0 — Foundation (backend, config-only) ⬜

**Goal:** no user-visible change; wire the platform so Phase 1+ have a home.

| # | Task | Status |
|---|---|---|
| 0.1 | Add `elite` to flagship aliases in `seeders/flagshipKidsSeed.js` (short_name, aliases, subdomains) | ⬜ |
| 0.2 | Update seeded school display name → "Elite EduTech Systems Ltd — Model School" (idempotent) | ⬜ |
| 0.3 | Add `PAYSTACK_SECRET_KEY` (+ comment "same value as elite-api") to `.env.example`; add to the live kids `.env` on the VPS with the same value as elite-sms | ⬜ |
| 0.4 | Add `socket.io` dependency to `backend/package.json` | ⬜ |
| 0.5 | Migration file for the 4 new tables (`kids_subscription_plans`, `kids_subscriptions`, `kids_payments`, `kids_chat_messages`) in `elite_content` | ⬜ |
| 0.6 | Seed `kids_subscription_plans`: `kids_term` 500 NGN, `kids_annual` 1200 NGN, `kids_free` 0 | ⬜ |

**Exit criteria:** boot is clean; new tables exist in `elite_content`;
`flagshipIdForAlias('elite') === 'SCH-KIDS'`.

---

## Phase 1 — Payment gateway (Paystack, same credentials as EliteSMS) ⬜

**Goal:** parents and schools can pay for EliteKids with the platform Paystack
key — initialize → Paystack popup → verify → activate.

| # | Task | Status |
|---|---|---|
| 1.1 | `backend/src/services/paystackService.js` — `initializeTransaction(data)` + `verifyTransaction(reference)` against `https://api.paystack.co` with `PAYSTACK_SECRET_KEY` (mirror elite-sms `paystackService.js`; no vendor-subaccount complexity needed for platform plans) | ⬜ |
| 1.2 | `backend/src/controllers/kidsSubscription.js` — `listPlans`, `getStatus`, `initiate`, `verify`, `webhook` | ⬜ |
| 1.3 | Webhook HMAC-SHA512 signature check (`x-paystack-signature`) + amount-match guard (kobo == plan price) | ⬜ |
| 1.4 | Routes in `routes/kids.js`: `GET /kids/subscription/plans` (public), `GET status` (auth), `POST initiate` (auth), `POST verify` (auth), `POST /kids/paystack/webhook` (raw body) | ⬜ |
| 1.5 | Idempotent activation: one reference → one success (repeat verify returns already-active) | ⬜ |
| 1.6 | Unit test: `backend/test/subscription.test.js` — plan list, initiate creates pending sub + paystack call (mocked), verify activates + idempotent, webhook bad signature rejected, amount mismatch rejected | ⬜ |

**Exit criteria:** `npm test -- test/subscription.test.js` green; manual Paystack
sandbox payment (test card `4084 0840 8408 4081`) activates a subscription.

---

## Phase 2 — Entitlement gate ⬜

**Goal:** the access rule is enforced server-side.

| # | Task | Status |
|---|---|---|
| 2.1 | `backend/src/services/entitlement.js` — `getEntitlement(schoolId, parentUserId)` and `canAccessSeries(child, schoolId)` per spec C.1 | ⬜ |
| 2.2 | `requireKidsEntitlement` middleware applied to series list/detail + published-game routes: real school w/o subscription → 403 `SUBSCRIPTION_REQUIRED`; flagship free parent → only `FREE_TIER_SERIES` | ⬜ |
| 2.3 | Define `FREE_TIER_SERIES` (e.g. series flagged `is_free_tier` in `kids_game_series`, or first N series) + seed on `elite` | ⬜ |
| 2.4 | `GET /kids/subscription/status` returns: plan, expires_at, entitlements (all_games | free_tier | none), children count | ⬜ |
| 2.5 | Frontend: upsell banner on 403 (`SUBSCRIBE` → `/kids/subscription/plans`) + free-tier lock icons on locked series | ⬜ |

**Exit criteria:** a non-subscribed test school gets 403 on series; flagship
free parent sees only free series; subscribed parent/all-school sees everything.

---

## Phase 3 — Flagship self-registration & multi-child ⬜

**Goal:** parents without a school can join on `elite.*` and enroll many kids.

| # | Task | Status |
|---|---|---|
| 3.1 | Extend `POST /kids/parent/register` on flagship hosts (`isFlagshipRequest`): `{name, phone, email, password}` → shared users/parents + `kids_subscriptions` row `free` | ⬜ |
| 3.2 | Enroll child: reuse `/kids/children/link` + register flow — verify admission exists in `students` (shared DB), then link; all children under parent's subscription | ⬜ |
| 3.3 | Frontend: "No school? Join Elite Kids" path on `elite.elitekids.com.ng` login page (`PublicLoginSwitcher`), registration + child-enrollment wizard | ⬜ |
| 3.4 | Verify unified login works for the new flagship account (no re-login across suite apps) | ⬜ |

**Exit criteria:** parent registers on `elite.`, logs in with the same
credential on any suite app, links ≥2 children, free tier active.

---

## Phase 4 — Parent controls, reports, mode locks, live chat ⬜

**Goal:** parents can control and talk to their child.

| # | Task | Status |
|---|---|---|
| 4.1 | `GET /kids/parent/child/:adm/controls` — merged parental controls + mode lock + today's play stats | ⬜ |
| 4.2 | `GET /kids/parent/child/:adm/report?week=` — printable weekly report (reuse progress + achievements + tracking digest) | ⬜ |
| 4.3 | Child-facing mode-change guard: server refuses mode change when a lock exists (complement `getUnitSuggestedMode`) | ⬜ |
| 4.4 | socket.io: server (`src/sockets/chat.js`), JWT handshake, rooms by `child_admission_no`, events per spec D.3 | ⬜ |
| 4.5 | `kids_chat_messages` persistence + unread count + `GET /kids/parent/chat/:adm` history | ⬜ |
| 4.6 | Frontend: chat bubble in parent dashboard; child sees chat in the game lobby; mode-change push swaps UI mode immediately | ⬜ |

**Exit criteria:** parent sends a message → child's open device receives it in
<1s; history persists; unread badge works; a locked mode cannot be changed by
the child.

---

## Phase 5 — Global library UX (domestication polish) ⬜

**Goal:** teachers can find and adopt global content from `elite`.

| # | Task | Status |
|---|---|---|
| 5.1 | Series listing shows `is_global`/`owner_school_id` badge ("Elite Global") | ⬜ |
| 5.2 | Add `mode: copy|domesticate` to `POST /kids/series/:id/domesticate` (spec B-2) | ⬜ |
| 5.3 | Teacher frontend "Browse Global Library → Add to My Subjects" screen | ⬜ |

**Exit criteria:** teacher at any school domesticates an `elite` global series
into their KG Mathematics in <1 min; lesson copies carry lineage.

---

## Rollout & verification

1. Deploy Phase 0+1 together (config + payment only — no access change yet).
2. Verify Paystack sandbox payment end-to-end.
3. Flip Phase 2 gate ON after confirming real schools' subscriptions are
   recorded (migration seeds existing subscribers as `active` for 1 term).
4. Phase 3–5 ship per sprint; each phase has its own exit criteria above.
5. Full smoke: elite parent (free tier) → limited games → subscribe (NGN 500)
   → all games + chat + mode locks; real school teacher → domesticate elite
   series → class test → convert scores.

## Risks

- **Gate timing**: turning on the entitlement gate before subscriptions are
  recorded locks out real schools → Phase 2 ships only after the subscriber
  migration is confirmed.
- **Paystack key drift**: the kids `.env` must be manually kept in sync with
  elite-api's `PAYSTACK_SECRET_KEY`; add a boot-time warning if unset.
- **socket.io auth**: handshake auth must reuse the JWT strategy; never trust
  room membership from the client (server derives rooms from `kids_parent_links`).
- **Amount tampering**: webhook + verify both check amount == plan price.
