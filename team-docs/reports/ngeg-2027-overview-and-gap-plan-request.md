# NGEd-game 2027 — Implementation Overview + Gap Plan Request

**Date:** 2026-09-03
**Author:** worker (kilo session) — overview compiled from `NGEd-game-2027-ROADMAP.md`, `SRS-Q1-NGEd-game.md`, and progress reports
**Audience:** team that will pull + validate this report

---

## Status Summary

- **Overall program (Q1–Q4 2027): ~23% complete** (1 of 4 quarters substantially built)
- **Q1 "The Brain": ~92% complete, DEPLOYED LIVE on :8484**
- **Q2/Q3/Q4: 0% — not started**

---

## Phase % Breakdown

| Phase | Theme | Status | % Done |
|---|---|---|---|
| **Q1 2027** | "The Brain" — ADE + SRE + Economy | **DEPLOYED LIVE** | **~92%** |
| Q2 2027 | "The Voice" — Speech + Drawing + Portfolio | Not started | 0% |
| Q3 2027 | "The Village" — Collaboration + Parent/Teacher AI | Not started | 0% |
| Q4 2027 | "The Future" — Marketplace + Offline 2.0 + Analytics | Not started | 0% |

---

## Q1 2027 — Detailed Breakdown

| Workstream | Spec | Built | % |
|---|---|---|---|
| **ADE** — BKT + Elo + ZPD + struggle detection | SRS §2, §8.1-8.3 | Algo + service + controller + model + DB + GamePlay integration + next-item recommendations | **95%** |
| **SRE** — SM-2+ scheduling | SRS §3, §8.4 | Algo + service + controller + model + ReviewZone (v2 w/ v1 fallback) + review grading loop in GamePlay | **95%** |
| **Economy** — XP, levels, streaks, shop | SRS §4, §8.5-8.6 | Service + controller + 4 tables + 8 FE components (XPBar, StreakCounter, Shop, etc.) + i18n + equipped-state rendering | **95%** |
| **Phase 4 cleanup** (remove v1 ADE/Ebbinghaus engines) | SRS §12 | v1 removal **DEFERRED** — still load-bearing for GamePlay adaptiveProfile + ReviewZone v1 fallback | **30%** |
| **A17 integration tests** | SRS §9 | q1-integration.test.js + q1-e2e 17/17 | **100%** |

---

## Q1 Test Gates — All Green

- Backend Q1 sweep: **77/77** (ade, sre, economy, shop, integration)
- E2E (q1-e2e): **17/17**
- Frontend tsc: clean (exit 0)
- Frontend vitest: **98/98**
- Full backend suite: 476P / 2F (failures = C-DEBT-01/02 baseline garden-companion only)
- Unified login E2E: 11/11
- Build: OK
- **Deployed live** on :8484 (auto-deploy via push to `production`)

---

## Q1 Sub-Features Shipped in Recent Window

1. ADE v2 next-item selection in GamePlay (per-lesson skill_key, "What's next?" panel)
2. SRE v2 full review grading loop (SM-2+ quality mapping from accuracy)
3. Shop equipped-state → skin ring + theme header rendering
4. Error envelope reconciliation (`error_code` per codebase contract)
5. UUID-into-BIGINT bug fix (d40241a) + phantom-column INSERT removal in ADE controller
6. ParentDashboard PIN→password fix (was sending `password: pin || '1234'`)
7. Login school short-name submit-time resolution
8. Auto-hide school short-name input on lookup resolve

---

## Q1 Gaps Discovered (need bridging to reach 100%)

| # | Gap | Owner Lane | Effort | Notes |
|---|---|---|---|---|
| G1 | **Phase 4 v1 engine removal** (kidsAdaptive.js + kidsSpacedRep.js) | L1-BE | M | Deferred — v1 is still routed and load-bearing (GamePlay adaptiveProfile badge, v1 UPDATE, ReviewZone v1 fallback). Requires v2 parity proof + v1 route unregistration + migration. |
| G2 | **Legacy streak localStorage migration** | L2-FE | XS | NO-OP verdict in takeover: single key `elitekids-streak` since initial commit, backend is source of truth, localStorage = offline cache only. MASTER may overrule. |
| G3 | **A17 contract test gap-fill** | L1-BE | S | Already done this session — caught 8 missing frontend error_code mappings, all fixed. **CLOSED**. |
| G4 | **LEVELS table discrepancy** | L2-FE | XS | Frontend `types/adaptive.ts` LEVELS = 10 entries (1,2,3,5,7,10,15,20,25,30); backend `LEVELS` = 14 entries. Non-blocking but should be reconciled. |
| G5 | **Garden decoration rendering** | L2-FE | S | `GardenScene` compact doesn't accept props — equipped garden items not yet rendered. Shop purchase persists; render path missing. |
| G6 | **G-W2 real-browser live-smoke** (teacher wizard → admin approve → child path) | L3-QA | M | Needs real browser + staff account. Chromium present at /snap/bin/chromium on VPS. Pending human QA. |
| G7 | **Elite EduTech logo artwork** for `badge_url` | L2-FE | XS | Currently using brand mark `/logo.svg`. Real artwork URL needed to swap. |
| G8 | **PAT exposure in origin remote URL** | ROOT | XS | `ghp_` token embedded in `.git/config` origin URL. Needs ROOT revocation. |

---

## Q2 2027 Gaps — "The Voice" (Multi-Modal Intelligence)

| # | Item | Spec | Status |
|---|---|---|---|
| Q2-A | Speech recognition service (Whisper API + Web Speech API) | §2.5 | 0% |
| Q2-B | Voice games (speech-letter/word/sentence/story/count) — 5 templates | §2.5 | 0% |
| Q2-C | Drawing recognition engine (TensorFlow.js + QuickDraw) | §2.6 | 0% |
| Q2-D | Drawing games (draw-recognition/tracing/writing/pattern/creative) — 5 templates | §2.6 | 0% |
| Q2-E | Learning Portfolio (skill map + evidence + export) | §2.7 | 0% |
| Q2-F | Pronunciation Coach, ReadingTracker, SpeechGame FE components | §2.5 | 0% |
| Q2-G | DrawingCanvas, TracingGuide, DrawingFeedback FE components | §2.6 | 0% |

**Effort (per roadmap): 21 weeks total** (8 speech + 8 drawing + 5 portfolio)

---

## Q3 2027 Gaps — "The Village" (Social Learning)

| # | Item | Spec | Status |
|---|---|---|---|
| Q3-A | Classroom collaboration (teams + peer teaching + class quests + WebSocket) | §2.9 | 0% |
| Q3-B | Parent intelligence dashboard (insights + weekly digest + action items) | §2.10 | 0% |
| Q3-C | Teacher AI assistant (insights + suggestions + auto-assign + reporting) | §2.11 | 0% |

**Effort (per roadmap): 15 weeks total** (6 collab + 5 parent + 4 teacher)

---

## Q4 2027 Gaps — "The Future" (Platform Evolution)

| # | Item | Spec | Status |
|---|---|---|---|
| Q4-A | Content marketplace (listings + Paystack + reviews + revenue share) | §2.13 | 0% |
| Q4-B | Offline-first 2.0 (IndexedDB + service worker + conflict resolution + offline AI) | §2.14 | 0% |
| Q4-C | Analytics intelligence (predictions + early warning + population insights) | §2.15 | 0% |

**Effort (per roadmap): 20 weeks total** (6 marketplace + 8 offline + 6 analytics)

---

## Architecture Evolution Gaps (cross-cutting)

- **Monolith → Modular split:** Roadmap §3.1 — currently still single Express app, no API gateway, no separate AI/Marketplace/Sync services
- **New services not built:** Adaptive Engine (in-proc), Speech, Drawing, Insight, Analytics (Python ML), Marketplace, Sync — all roadmap §3.2 targets missing
- **DB connection pool:** Still 4 connections; roadmap target is 6 (+marketplace, +analytics)
- **16 new tables** planned (kids_adaptive_state ✓, kids_economy ✓, kids_shop_items ✓, kids_purchases ✓, kids_speech_logs ✗, kids_drawing_logs ✗, kids_portfolios ✗, kids_teams ✗, kids_peer_teaching ✗, kids_class_quests ✗, kids_insights ✗, kids_marketplace_* ✗, kids_predictions ✗, kids_content_effectiveness ✗) — **4/16 done (25%)**

---

## Content Strategy Gaps (NERDC coverage)

Per roadmap §4.1, 2026 coverage ~30%; 2027 target 95%:

| Subject | Current | Target |
|---|---|---|
| Phonics & Reading | partial | 95% (existing + speech) |
| Mathematics | partial | 95% (existing + drawing) |
| Science | low | 70% (new gen) |
| Social Studies | low | 60% (new gen) |
| Creative Arts | low | 95% (drawing + speech) |
| Physical & Health | low | 50% (new gen) |
| Civic Education | low | 40% (new gen) |
| Bible/Koran | low | 30% (opt-in) |

**Content generation pipeline** is in place (roadmap §4.2) but no AI quality scoring + pedagogy validation gate as separate from safety pipeline (Doc 13). Pedagogy Enforcement Layer (01-PLANNING/13) is spec-only.

---

## Performance Targets (roadmap §3.4) — Untested

- API <100ms p95 — **not measured**
- Game load <2s — **not measured**
- Offline sync <30s — **partial only** (current offline = 25% maturity)
- Speech <500ms — N/A (not built)
- Drawing <1s — N/A (not built)
- 10K concurrent users — **not load-tested** (current scale: ~200 DAU)

---

## Monetization Tiers (roadmap §5.1) — Unbuilt

- Free / Basic (₦2,000) / Pro (₦5,000) / School (₦50,000) — none of the gating logic exists. Current state = single tier via Elite SMS subscription.

---

## ⚠️ Request to Reviewing Team

1. **Validate the % breakdown above** — re-derive from `NGEd-game-2027-ROADMAP.md` §0 (where we are today) vs current `main`. Cross-check the 8 Q1 sub-features list against commits `dc9c1dd`, `b81e89c`, `8638561`, `b9fc445`, `191e75e`, `31295c3`, `7234975`, `d54b2ae`, `1b610ec`.
2. **Sign-off (or correct) the Q1 = 92% verdict** and the deferred v1-removal rationale.
3. **Produce a bridging plan to 100% Q1** (G1–G8) with owner lanes + effort estimates + ordering. Recommended order: G3 (already done) → G4 → G2 → G5 → G1 → G7 → G8 → G6.
4. **Produce a Q2 kickoff plan** (Q2-A…Q2-G) — confirm 21-week effort estimate, sequence speech vs drawing vs portfolio, identify Q2 dependencies on Q1 (e.g., economy XP for speech/drawing rewards, ADE BKT for portfolio skill map).
5. **Flag any items missed** in this overview (docs not yet reviewed in this pass: `01-PLANNING/08`, `10`, `11`, `12`, `14`; also `FLAGSHIP-ELITE-SCHOOL-SPEC.md`, `TECH-SPEC-LEARNING-PATH.md`, `MVP-TO-PROD-DB-SWAP.md` cross-impact).
6. **Persist your validation + bridging plan** as `team-docs/reports/q1-bridge-to-100.md` (or similar) so it can be merged into the QUEUE for the next worker session.

---

## Source Files (read these to validate)

- `team-docs/NGEd-game-2027-ROADMAP.md` — authoritative 2027 plan
- `team-docs/SRS-Q1-NGEd-game.md` — Q1 spec
- `team-docs/Q1-WORK-SPLIT.md` — parallel track plan
- `team-docs/reports/q1-progress.md` — Q1 worker progress
- `team-docs/reports/q1-trackD-progress.md` — Track D integration
- `team-docs/reports/takeover-progress.md` — takeover session
- `team-docs/reports/q22-q23-ops-verified.md` — Q22/Q23 ops status
- `team-docs/reports/be-progress.md` — backend lane
- `team-docs/reports/qa-gate-wave1.md` — QA gate
- `team-docs/reports/ROOT-ACTIONS-REQUIRED.md` — outstanding root actions

---

*Memory note: persist your reply into `team-docs/reports/q1-bridge-validation-<yourname>.md` and append a milestone to your worker progress file. Do NOT reference past session IDs.*
