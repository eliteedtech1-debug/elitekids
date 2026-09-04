# Q4 "The Future" — Conflict & Risk Map (parallel-safe planning)

**Date:** 2026-09-04
**Author:** opencode (coordinator, hands-off on Q3)
**Purpose:** Let Q3 (freebuff, autonomous, in-flight in working tree) run while Q4 can be scoped/started in parallel. This map identifies what Q4 can build NOW without colliding with freebuff's Q3 files. **No code written by this doc.**

Spec: `team-docs/NGEd-game-2027-ROADMAP.md` §2.13–2.16. Q4 current state: only pre-existing descriptive analytics (`kidsAnalytics.js` + 5 `/kids/analytics/*` routes) — all Q4-deliverable code is 0%.

---

## Overlap key (per Q4 track vs freebuff's Q3 in-flight files)

| Q4 track | New isolated files | **Shared/modified files (CONFLICT RISK)** | Verdict |
|---|---|---|---|
| **2.13 Content Marketplace** | kids_marketplace_listings/_purchases/_reviews tables; KidMarketplace{Listing,Purchase,Review}.js; kidsMarketplace.js; Teacher/Marketplace.tsx, ListingCard, ListingDetail, PublisherDashboard, ReviewForm | **None** — all brand-new paths/filenames | ✅ **SAFE — build anytime** |
| **2.14 Offline-First 2.0** | lib/offline/* (offlineEngine, conflictResolver, serviceWorker, OfflineProgress.tsx); /kids/sync/delta + /kids/sync/schema | **"Modify: all list endpoints (since=)"** + "Modify: all game components" + TeacherAnalytics.tsx → **broad touches over files freebuff/others own** | ⚠️ **RESTRICTED — defer broad surface** |
| **2.15 Analytics Intelligence** | KidPrediction.js (kids_predictions); predictiveAnalytics.js; 4 new /kids/analytics/predictions|early-warnings|population|content-effectiveness | **TeacherAnalytics.tsx** (Q37 modifies this too); conceptually overlaps Q3 §3.3 teacher insights + §3.2 parent insights data surfaces | ⚠️ **PARTIAL — wait for Q3 merge on FE; BE can start** |

---

## Per-track recommendation

### 1. Content Marketplace (§2.13) — SAFE, start immediately
- Zero file overlap with Q3. Greenfield.
- Backend: 3 new tables, 3 models (register in `models/index.js` KIDS_CONTENT_MODEL_FILES/TABLES/SYNC_ORDER), `controllers/kidsMarketplace.js`, route group in `kids.js`, Paystack reuse (`services/paystackService.js`), auth via existing `requireStaff` + `requireChildOwnership` for purchases.
- Frontend: all-new files under `pages/Teacher/Marketplace*` + `components/Listing*`.
- **Depends on:** Paystack creds (already live, shared secret with EliteSMS per NEXT-STEPS), revenue-share 70/30 + payout policy (needs MASTER spec — human-last).
- Can be run to green independently.

### 2. Offline-First 2.0 (§2.14) — RESTRICTED
- The "since=" param on **all list endpoints** and "modify all game components" are broad, cross-cutting edits that will collide with Q3/Q2 merge waves.
- Only the **isolated append-only parts** are safe now:
  - new files `lib/offline/*` (offlineEngine BKT+SRS, conflictResolver, serviceWorker, OfflineProgress.tsx) — buildable without touching existing game components.
  - Backend `POST /kids/sync/delta` + `GET /kids/sync/schema` as **new** endpoints (additive, no modification of existing endpoints).
- Defer: adding `since=` to every existing list endpoint, and wiring all 11 game templates offline.
- **Depends on:** Q2 offline-progress fix + Q1 SRS state to be stable.

### 3. Analytics Intelligence (§2.15) — SPLIT
- **Backend (safe now):** `predictiveAnalytics.js` + `KidPrediction` (kids_predictions) + 4 new additive endpoints. Uses existing analytics data + Q1 mastery/review. No Q3 file touched.
- **Frontend (wait):** `TeacherAnalytics.tsx` integration must wait — Q37 (freebuff) is restructuring TeacherAnalytics. PredictionCard/EarlyWarningPanel/PopulationInsights/ContentScoreboard are new files (safe), but wiring them into TeacherAnalytics conflicts.
- **Conceptual overlap:** teacher insights (§3.3) and parent insights (§3.2) feed the same mastery/struggle signals. Coordinate so Q4 early-warnings don't duplicate Q3 teacher-struggling endpoints — decide canonical source at Q3 merge.

---

## Suggested parallel plan (while freebuff owns Q3)

| Order | Safe Q4 work | Conflict posture |
|---|---|---|
| 1 | **Marketplace backend** (§2.13 BE) | SAFE — none |
| 2 | **Analytics predictive backend** (§2.15 BE — new endpoints only) | SAFE — additive only |
| 3 | Offline lib new files only (`lib/offline/*`, sync delta/schema endpoints) | SAFE if isolated |
| 4 | Marketplace frontend (§2.13 FE) | SAFE — new files |
| 5 | Analytics FE / TeacherAnalytics + Offline "modify all" | **WAIT for Q3 merge** |

---

## Open items for MASTER (human-last, none block safe track 1–2)
- Marketplace revenue-share / payout rules + fee handling.
- Paystack marketplace split-payment approach (one account vs subaccounts).
- Analytics predictive model choice (Python ML vs rule-based-first in Node) — roadmap says Python+Node wrapper; recommend rule-based v1 mirroring Q3 insight engine.
- Offline SRS/BKT client-side correctness review scope.

---

## How to track
Q4 rows not yet in `team-docs/QUEUE.md` — add Q39 (marketplace BE), Q40 (marketplace FE), Q41 (predictive analytics BE), Q42 (offline isolated), Q43 (analytics FE + offline broad, gated on Q3 merge) once MASTER approves this map.

*End of Q4 conflict/risk map — no code written.*
