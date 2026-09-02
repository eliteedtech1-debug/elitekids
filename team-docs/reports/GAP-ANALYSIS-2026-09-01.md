# EliteKids — Full Gap Analysis: Planning vs Implementation

**Date:** 2026-09-01  
**Analyst:** opencode (codebase audit)  
**Scope:** All planning/spec documents cross-referenced against actual code  
**Method:** Read every plan doc → verify code existence → check wiring → check routes → check tests → check deployment

---

## 1. FULLY IMPLEMENTED

These planned items have complete code, routes, frontend wiring, and tests where applicable.

### 1.1 Flagship `elite` School Identity
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| FLAGSHIP-SPEC §A.1-A.2 | `elite` short_name, wildcard subdomain, `SCH-KIDS` id | `seeders/flagshipKidsSeed.js:14` — `FLAGSHIP_SHORT_NAME = 'elite'`, `flagshipShortNameFromHost()`, `isFlagshipRequest()` all implemented |
| EXECUTION-PLAN Phase 0.1 | Add `elite` to flagship aliases | Done — aliases `kids`/`practice` map via `flagshipIdForAlias()` |
| EXECUTION-PLAN Phase 0.2 | Update display name → "Elite EduTech Systems Ltd — Model School" | Done — `flagshipKidsSeed.js:69-70` idempotent UPDATE |

**Files:** `backend/src/seeders/flagshipKidsSeed.js`, `backend/src/controllers/auth.js`

### 1.2 Unified Parent Login (No PIN)
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| NEXT-STEPS §Current | Parent login = shared EliteSMS credential, PIN deleted | `kidsParent.js:45-51` — unified login, `parent_pin` is dead, shared JWT |
| FLAGSHIP-SPEC §C.5 | `POST /kids/parent/login` with shared password | Route wired at `kids.js:289`, verified by `unified-login.test.js` |

**Test:** `backend/test/unified-login.test.js` (8/8 passing per NEXT-STEPS)

### 1.3 Subscriptions + Paystack
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| FLAGSHIP-SPEC §C.1-C.4 | Plans, payments, entitlement middleware | `kidsSubscription.js` — full controller (458 lines): plans CRUD, initiate, verify, webhook with HMAC, entitlement guard |
| EXECUTION-PLAN Phase 1.1-1.6 | Paystack service, controller, routes, tests | `paystackService.js` (73 lines), `kidsSubscription.js`, routes at `kids.js:320-326` |
| FLAGSHIP-SPEC §C.3 | Tables: `kids_subscription_plans`, `kids_subscriptions`, `kids_payments` | All 3 tables created via `ensureSchema()` at boot |
| EXECUTION-PLAN Phase 1.6 | Unit test: subscription.test.js | `backend/test/subscription.test.js` exists, 15/15 passing |

**Files:** `backend/src/controllers/kidsSubscription.js`, `backend/src/services/paystackService.js`

### 1.4 Entitlement Gate
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| FLAGSHIP-SPEC §C.1 | `canAccessSeries(child, school_id)` logic | `kidsSubscription.js:167` — `resolveEntitlement()` implements the exact rule |
| EXECUTION-PLAN Phase 2.1-2.2 | `requireKidsEntitlement` middleware | `kidsSubscription.js:428` — middleware exists, exports via `requireKidsEntitlement` |
| FLAGSHIP-SPEC §C.4 | `GET /kids/subscription/status` | Route at `kids.js:322` |

**Test:** `backend/test/subscription.test.js` — free_tier, all_games, none scenarios tested

### 1.5 Deploy Pipeline
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| NEXT-STEPS §Current | Self-hosted runner, `deploy.yml`, concurrency group | `.github/workflows/deploy.yml` (106 lines) — full pipeline: git fast-forward, npm ci, frontend build+rsync, health check |
| EXECUTION-PLAN | Deterministic deploys with `npm ci` | Done — deploy.yml uses `npm ci` for backend + frontend |

**File:** `.github/workflows/deploy.yml`

### 1.6 Security — requireChildOwnership
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| NEXT-STEPS §Current | `requireChildOwnership()` guard on 20+ endpoints | Applied across `kidsParental.js`, `kidsGarden.js`, `kidsModeLock.js`, `kidsSession.js`, `kidsTracking.js`, `kidsRetry.js` |

### 1.7 Parent Live-Control UI (e3fLive)
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| FLAGSHIP-SPEC §D.3 | Parent role in `e3fLive.js`, `ParentLive.tsx` mirrors `TeacherLive.tsx` | `e3fLive.js` (full controller), `frontend/src/pages/Parent/ParentLive.tsx` exists |
| NEXT-STEPS §Current | "Live" tab added to `ParentChildren.tsx` | `ParentChildren.tsx:19` imports `Radio` icon (Live tab present) |

**Tests:** `backend/test/e5-parent-live.test.js` (6/6), `e4-webrtc-signaling.test.js` (10/10)

### 1.8 Adaptive Difficulty Engine
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §5.1 | `kidsAdaptive.js` — difficulty 1-5, rule-based | `kidsAdaptive.js` (238 lines) — `updateProfile()`, `getProfile()`, `getRecommended()`, `getDueReviews()` |
| SPRINT-8 S8-6 | Adaptive Difficulty Frontend in GamePlay | Routes at `kids.js:269-272`, frontend integration done |
| ECCE-ROADMAP #7 | Adaptive via `KidMasteryProgress` or new profiles | `kids_adaptive_profiles` table created via `ensureSchema()` |

**Test:** Tested indirectly via subscription + adaptive route tests

### 1.9 Spaced Repetition
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §5.2 | `kidsSpacedRep.js` — due reviews, completion | `kidsSpacedRep.js` (121 lines) — `getDueReviews`, `markReviewComplete`, `getReviewStats` |
| SPRINT-8 S8-5 | Frontend: `ReviewZone.tsx` | `frontend/src/components/ReviewZone.tsx` (152 lines) — fully functional |
| ECCE-ROADMAP #8 | Spaced repetition via `KidReviewSchedule` | Routes at `kids.js:275-277` |

### 1.10 Competition Engine (E5)
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §4.1-4.2 | Enhanced arena, competition analytics | `e3fArena.js`, `kidsCompetition.js` (full controllers) |
| Routes | Arena games, dashboard, progress, reactions | All wired at `kids.js:250-255` |

**Test:** `backend/test/e3f-practice-test-gate.test.js`

### 1.11 Boss Battles (E6)
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §4.3 | Boss raids, damage, guardians | `kidsBoss.js` — full controller with 6 guardians (Sango, Anansi, Amina, Baobab, Mami Wata, Elegua) |
| Frontend | `BossBattleOverlay.tsx` | `frontend/src/components/BossBattleOverlay.tsx` (218 lines) — HP bar, damage, guardians |

**Test:** `backend/test/e6-boss-battles.test.js`

### 1.12 Festival of Guardians
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §4.4 | Festival controller, state management | `kidsFestival.js` (full controller) — create, dealDamage, getActive, history, guardians |
| Routes | Festival endpoints | `kids.js:297-302` — all 5 festival routes |

### 1.13 Match History / Rivalry
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §4.1, §7.2 | `kidsMatchHistory.js` | `kidsMatchHistory.js` — record, getHistory, getRivalry, getMatchStats |
| Routes | Match history endpoints | `kids.js:329-330,337` |

### 1.14 Teacher Quick-Create
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §6.2 | Phone-first quiz creator | `kidsQuickCreate.js` — full controller (create, addQuestions, publish, delete) |
| Frontend | `TeacherQuickCreate.tsx` | `frontend/src/components/TeacherQuickCreate.tsx` — embedded in `TeacherArena.tsx:10` |
| Routes | Quiz CRUD endpoints | `kids.js:304-311` — 7 routes |

### 1.15 Parent Dashboard Backend
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §6.1 | Parent links, notifications, child progress | `kidsParent.js` (497 lines) — login, register, getChildren, progress, achievements, notifications |
| Routes | Parent endpoints | `kids.js:288-295` — 7 routes |
| Frontend | ParentChildren, ParentActivities, ParentDashboard | All 3 exist: `ParentChildren.tsx` (605 lines), `ParentActivities.tsx`, `ParentDashboard.tsx` (381 lines) |

### 1.16 Multi-School Analytics
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §7.1 | Analytics: overview, classes, struggling, games, leaderboard | `kidsAnalytics.js` — 5 endpoints |
| Routes | Analytics endpoints | `kids.js:313-318` — 5 routes |

### 1.17 Game Library (Frontend)
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §10 | `lib/game/` modules: combo, dice-roll, milestones, power-ups, reactions, sound-effects, victory | All 7 files exist in `frontend/src/lib/game/`: `combo.ts`, `dice-roll.ts`, `milestones.ts`, `power-ups.ts`, `reactions.ts`, `sound-effects.ts`, `victory.ts` |

### 1.18 Revision / Reinforcement
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| ECCE-ROADMAP implied | Revision controller | `kidsRevision.js` — getRevisionStatus, getNudges, getFailedItems, recordFailed, markRetryCorrect, getWeeklySummary |
| Frontend | `RevisionCard.tsx` | `frontend/src/components/RevisionCard.tsx` (187 lines) |
| Routes | Revision endpoints | `kids.js:279-286` — 6 routes |

### 1.19 Voice Notes
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| BLUEPRINT §2 current state | Voice notes (async) | `e4VoiceNotes.js` — full controller |
| Routes | Voice note endpoints | `kids.js:331-335` — 4 routes |
| Frontend | `TeacherVoiceNotes.tsx` | `frontend/src/pages/Teacher/TeacherVoiceNotes.tsx` exists (but no route — see Partially Implemented) |

### 1.20 i18n — P0 Through P3 Complete
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| i18n-MIGRATION §5 P0-P3 | Consolidation, teacher/student/parent surface extraction | `en.ts` (1024 lines), `locales/en.json`, `locales/ha.json`, `i18n.test.ts` |
| SPRINT-8 S8-1 | P3 — locale files + RTL | `locales/en.json` + `locales/ha.json` exist |
| ECCE-ROADMAP #3 | String externalization | ~580 keys in `en.ts`, all teacher/student/parent surfaces extracted |

**Test:** `frontend/src/lib/i18n/i18n.test.ts` — key resolution gate

### 1.21 Offline Progress Reconciliation
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| ECCE-ROADMAP #2 | Route failed submitProgress through sync queue | `syncBatch` controller exists, routes at `kids.js:17` |
| P4-ROADMAP #2 | Offline progress fix | Status: ✅ implemented (p4-roadmap-plan.md) |

**Test:** `backend/test/e2-sync-batch.test.js`

### 1.22 NERDC Curriculum Code Layer
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| ECCE-ROADMAP #1 | `nerdc_code/strand/sub_strand` on KidLesson + KidCurriculumPoint | Status: ✅ implemented (p4-roadmap-plan.md), `NerdcReport.tsx` frontend exists |

### 1.23 Performance Budget / Lazy Routes
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| ECCE-ROADMAP #11 | Route-split, code-split emoji, lazy GamePlay | `App.tsx` — lazy imports for GamePlay, all teacher routes; main bundle 520KB→363KB |
| P4-ROADMAP #11 | ✅ done | Status confirmed |

### 1.24 Storage Budget Management
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| ECCE-ROADMAP #6 | Quota guard on prefetch paths | Status: ✅ done (p4-roadmap-plan.md) — 7 unit tests |

### 1.25 Service Worker & Sync Hardening
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| ECCE-ROADMAP #4 | SW v3, cache purge, background sync, retry caps | Status: ✅ done (p4-roadmap-plan.md) |

### 1.26 Domestication
| Source | What Was Planned | What Exists |
|--------|-----------------|-------------|
| FLAGSHIP-SPEC §B.1 | `POST /kids/series/:id/domesticate`, `GET /kids/series-domestications` | Routes at `kids.js:242-243`, controller in `kidsModeLock.js` |

---

## 2. PARTIALLY IMPLEMENTED

These items have backend code but are missing frontend wiring, tests, or deployment configuration.

### 2.1 Parent Dashboard Frontend — Mixed State
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §D.1 | Merged controls + mode lock in one call | Backend has `getChildProgress`, `getChildAchievements` | Missing: `GET /kids/parent/child/:adm/controls` merged endpoint (spec D-1) |
| FLAGSHIP-SPEC §D.1 | Printable weekly report | `GET /kids/parent/child/:adm/report?week=` NOT implemented | Gap: no weekly report endpoint |
| BLUEPRINT §6.1 | Full parent dashboard with push notifications | `ParentDashboard.tsx` exists (381 lines) but uses hardcoded `/kids/parent/login` and PIN auth (M3 audit finding) | Gap: PIN-based login in ParentDashboard.tsx:29 conflicts with unified login spec |

**Priority:** HIGH — ParentDashboard.tsx is orphan (no route in App.tsx:96 — actually it IS routed at `/parent/dashboard`). But it still uses PIN auth (`pin: pin || '1234'`) which contradicts the unified login spec.

### 2.2 Server-Side Mode Lock Enforcement
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §D.2 | Child-facing mode-change endpoint refuses when lock active | `kidsModeLock.js` exists with lock logic | Gap: child-facing endpoint doesn't refuse when lock is active (spec says "server refuses mode change when a lock exists") |

**Priority:** MEDIUM — currently enforced client-side only.

### 2.3 Series Listing Global Badge (B-1)
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §B.2 B-1 | Add `is_global` + `owner_school_id` to series listing; badge "Elite Global" | Series listing exists in `kidsSeries.js` | Gap: no `is_global` badge in response or frontend |

**Priority:** MEDIUM — teacher UX improvement.

### 2.4 Copy Without Remap (B-2)
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §B.2 B-2 | `mode: 'copy' | 'domesticate'` on domesticate endpoint | `domesticateSeries` exists | Gap: no `copy` mode — only domesticate (map+copy) |

**Priority:** LOW — copy without remap is a convenience, not blocking.

### 2.5 Teacher Global Library UI (B-3)
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §B.2 B-3, EXECUTION-PLAN Phase 5.3 | "Browse Global Library → Add to My Subjects" screen | No frontend component exists | Gap: no teacher browse-global-library UI |

**Priority:** MEDIUM — teachers can't discover elite global content from the UI.

### 2.6 Free Tier Series Seeding
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| EXECUTION-PLAN Phase 2.3 | `FREE_TIER_SERIES` defined + seeded on `elite` | `requireKidsEntitlement` exists, `free_tier` tier is returned | Gap: no explicit `FREE_TIER_SERIES` list or `is_free_tier` flag on `kids_game_series` — entitlement logic just returns tier string |

**Priority:** LOW — works implicitly but no explicit free-tier series list.

### 2.7 Entitlement Frontend — Upsell Banner
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| EXECUTION-PLAN Phase 2.5 | Upsell banner on 403 (`SUBSCRIBE` → plans page), lock icons on free-tier | No frontend upsell component exists | Gap: no 403 → upsell redirect, no lock icons on series |

**Priority:** HIGH — subscribed users can pay, but non-subscribed see no path to subscribe from the game UI.

### 2.8 Frontend Tests
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| ECCE-ROADMAP #11 implied | vitest configured, @testing-library/react installed | `i18n.test.ts` exists | Gap: zero vitest test files for components (full-system-audit L1) |

**Priority:** LOW — not blocking production but no regression safety net.

### 2.9 i18n — P4 Backend Error Codes
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| i18n-MIGRATION §5 P4 | `error_code` on API error responses, client `mapApiError` | Backend returns raw `message` strings | Gap: no `error_code` field on error responses |

**Priority:** MEDIUM — blocks P5 localization of error messages.

### 2.10 i18n — P5 Nigerian Locales
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| i18n-MIGRATION §5 P5 | en-NG real content, yo/ha/ig lazy dicts, switcher UI, TTS voice map | `locales/ha.json` exists (starter), `en.ts` has ~580 keys | Gap: no `yo.ts`, `ig.ts`; no language switcher UI; no TTS per-locale voice map |

**Priority:** LOW — foundational files exist but full localization not started.

---

## 3. PLANNED BUT NOT STARTED

These items appear in planning documents with no corresponding code.

### 3.1 Socket.io / Real-Time Chat
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §D.3 | socket.io server (`src/sockets/chat.js`), JWT handshake, rooms by `child_admission_no`, `kids_chat_messages` persistence | No socket.io dependency in `package.json`, no chat controller, no `kids_chat_messages` table | Gap: ENTIRE real-time chat system not built |
| EXECUTION-PLAN Phase 0.4 | Add `socket.io` dependency to `backend/package.json` | NOT done | Gap: dependency not added |
| EXECUTION-PLAN Phase 4.4-4.5 | socket.io server, chat persistence, history endpoint | NOT done | Gap: entire chat system missing |

**Priority:** HIGH (per spec, parent↔child chat is a key feature)

### 3.2 Parent Child Controls Endpoint
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| FLAGSHIP-SPEC §D.1 D-1 | `GET /kids/parent/child/:adm/controls` — merged controls + mode lock + today's play stats | NOT implemented | Gap: endpoint doesn't exist |
| FLAGSHIP-SPEC §D.1 D-2 | Per-child and per-subject play limits | NOT implemented | Gap: only global parental controls exist |
| FLAGSHIP-SPEC §D.1 D-3 | `GET /kids/parent/child/:adm/report?week=` — printable weekly report | NOT implemented | Gap: weekly report endpoint missing |

**Priority:** MEDIUM — parental controls exist but the merged dashboard call and report are missing.

### 3.3 Child-Facing Mode Change Server Guard
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| EXECUTION-PLAN Phase 4.3 | Child-facing mode-change endpoint refuses when lock exists | NOT implemented server-side | Gap: only client-side hiding |

**Priority:** MEDIUM

### 3.4 Global Library UX
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| EXECUTION-PLAN Phase 5.1 | Series listing shows `is_global` badge | NOT implemented | Gap: no badge in API or UI |
| EXECUTION-PLAN Phase 5.3 | Teacher "Browse Global Library → Add to My Subjects" screen | NOT implemented | Gap: no frontend component |

**Priority:** MEDIUM

### 3.5 Boss Personality Lines
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.3 "Boss Personality Lines" | Voice lines during battle: attack, half-HP, defeated quotes | `kidsBoss.js` has guardian data but no personality lines/quotes in the data | Gap: no personality text in guardian definitions |

**Priority:** LOW — cosmetic, not functional.

### 3.6 Difficulty Tiers for Bosses
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.3 "Difficulty Tiers" | Easy/Normal/Hard selecting HP/question scaling | `kidsBoss.js` has `difficulty ENUM('easy','normal','hard')` in schema | Gap: difficulty is stored but not used to scale HP in `submitDamage` |

**Priority:** LOW — schema ready, logic not implemented.

### 3.7 Tournament Lobby / Countdown
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.2 "Tournament Lobby" | 60-second countdown, team assignment reveal, sound at 3-2-1 | NOT implemented | Gap: no lobby UI or countdown logic |

**Priority:** LOW

### 3.8 Social Reactions (Frontend)
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.2 "Social Reactions" | Floating emoji animation after scoring | `lib/game/reactions.ts` exists (backend logic) | Gap: no frontend component renders reactions in competition view |

**Priority:** LOW — backend ready, frontend not wired.

### 3.9 Effort Badges
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.2 "Effort Badges" | "Most Improved", "Speed Demon", "Perfectionist", etc. | `kidsLeaderboard.js` exists for basic badges | Gap: no effort-specific badge logic |

**Priority:** LOW

### 3.10 Story-Driven Learning
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §5.4 | `story_intro`, `story_outro`, `story_context` on game configs | NOT implemented | Gap: no story fields in game config schema or rendering |

**Priority:** LOW

### 3.11 Power-Up Backend
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.3, §9 | `GET /kids/power-ups`, `POST /kids/power-ups/use` | `lib/game/power-ups.ts` (frontend, localStorage) exists | Gap: no backend endpoint, no `kids_power_ups` table usage (table exists but zero code references per audit L6) |

**Priority:** LOW — power-ups work client-side only.

### 3.12 MVP Spotlight
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.2 "Tournament MVP Spotlight" | Full-screen card with stats after tournament | NOT implemented | Gap: no MVP calculation or UI |

**Priority:** LOW

### 3.13 Dice-Roll Team Assignment (Frontend Animation)
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.1 "Dice-Roll Team Assignment" | Animated dice roll with 80ms stagger | `lib/game/dice-roll.ts` exists | Gap: dice-roll logic exists but not visibly animated in competition creation UI |

**Priority:** LOW — animation, not functional.

### 3.14 Rope Animation / Milestone Bursts (Frontend)
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §4.1 | Real-time rope animation, milestone confetti | `lib/game/milestones.ts` exists | Gap: no `StudentArenaPanel` rope animation rendering (panel exists but orphan — see §4) |

**Priority:** LOW

### 3.15 Sound Effects Engine Integration
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| BLUEPRINT §7.3 | 15 synthesized sounds wired into all game events | `lib/game/sound-effects.ts` exists | Gap: sounds exist but integration into GamePlay/Arena/Boss is partial (audit §12 "Needs Integration") |

**Priority:** LOW

### 3.16 ELITESMS Migration Plan
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| ELITESMS_MIGRATION_PLAN | Merge elite-core + elite-api into elite-sms unified repo | NOT started — this is for a different repo (EliteSMS, not EliteKids) | Gap: N/A for EliteKids codebase — this plan is for EliteSMS |

**Priority:** N/A — out of scope for EliteKids.

### 3.17 MVP → Prod DB Swap
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| MVP-TO-PROD-DB-SWAP | Move elite_db_test → elite_db, elite_content_test → elite_content, elite_kids_test → elite_kids | NOT executed — still on `_test` databases | Gap: app still runs on MVP test databases |

**Priority:** HIGH — production readiness requires this cutover.

### 3.18 Node.js 20 EOL Upgrade
| Source | What Was Planned | What Exists | Gap |
|--------|-----------------|-------------|-----|
| full-system-audit L3 | Node.js 20 EOL April 2026 — plan upgrade to Node 22 LTS | NOT started | Gap: still on Node 20 (EOL passed April 2026) |

**Priority:** MEDIUM — security risk.

---

## 4. IMPLEMENTED BUT NOT PLANNED

These items exist in the codebase but are not referenced in any planning document.

### 4.1 StudentArenaPanel.tsx (Orphan)
- `frontend/src/pages/Student/StudentArenaPanel.tsx` exists but is never imported by App.tsx
- Not referenced in any plan as a standalone page
- **Status:** Orphan component (audit H7)

### 4.2 StudentCurriculumPanel.tsx (Orphan)
- `frontend/src/pages/Student/StudentCurriculumPanel.tsx` exists but never imported
- **Status:** Orphan component (audit H7)

### 4.3 StudentLiveBar.tsx (Orphan)
- `frontend/src/pages/Student/StudentLiveBar.tsx` exists but never imported
- **Status:** Orphan component (audit H7)

### 4.4 StudentLeaderboardPanel.tsx
- `frontend/src/pages/Student/StudentLeaderboardPanel.tsx` exists but never imported by App.tsx
- **Status:** Orphan — no route

### 4.5 StickerButton.tsx, EmojiPicker.tsx (Orphan)
- Components exist but never imported (audit H7)

### 4.6 TeacherBossRaid.tsx (Missing)
- Referenced in audit M5 (`TeacherBossRaid.tsx:58,104`) but file does NOT exist in current tree
- Likely deleted or renamed

### 4.7 OfflineBanner.tsx
- Only referenced in JSDoc, never imported (audit H7)

### 4.8 kidsPowerUps Table (Zero Code References)
- Table exists in DB but zero code reads/writes it (audit L6)

### 4.9 37 Empty kids_* Tables
- Tables exist with 0 rows: boss_raid, festival, match_history, tournament_games, etc. (audit L5)
- Schema created but features not actively used yet

### 4.10 Kids Session State (Auto-Save)
- `kidSession.js` exists with save/resume/delete — not explicitly planned in any doc but implements save/resume from ECCE-ROADMAP #16

### 4.11 Teacher Analytics Controller
- `kidsAnalytics.js` exists with 5 endpoints — partially covered by BLUEPRINT §7.1 but implementation details not in any specific plan

### 4.12 Onboarding System
- `kidsOnboarding.js` exists with `getOnboardingStatus`, `completeOnboarding` — not in any plan doc

---

## 5. STALE / OUTDATED PLANS

### 5.1 ELITESMS_MIGRATION_PLAN.md
- **Status:** STALE — this plan is for EliteSMS (different app), not EliteKids
- **Action:** Move to EliteSMS repo or archive

### 5.2 SESSION-PLAYBOOK.md
- **Status:** OPERATIONAL — still relevant for agent ops but not a feature plan
- **Action:** Keep as operational reference

### 5.3 01-PLANNING/ Directory (18 files)
- **Status:** HISTORICAL — these are early planning docs from initial development
- Many items are now implemented; some are superseded by later plans
- **Key docs still relevant:**
  - `15-CURRICULUM-MAPPING-*.md` — partially implemented
  - `16-GAMIFICATION-DEPTH-*.md` — partially implemented (garden, companions)
  - `17-ENGAGEMENT-AND-ACCESSIBILITY-*.md` — partially implemented
- **Key docs superseded:**
  - `01-GAME-ENGINE-INTEGRATION-PLAN.md` — game engine fully integrated
  - `03-EXECUTION-ROADMAP.md` — superseded by EXECUTION-PLAN-ELITE-SCHOOL.md
  - `08-FINAL-PHASE-VIDEO-GAME-CONVERGENCE.md` — video game convergence not pursued

### 5.4 BLUEPRINT-v3-reality.md
- **Status:** VISIONARY — aspirational roadmap, many items not yet built
- **Still relevant items:** Boss personality lines (#5), difficulty tiers (#6), tournament lobby (#7), social reactions (#8), story-driven learning (#11), effort badges (#9)
- **Superseded items:** Parent dashboard (now built differently), sound effects (built), combo/power-ups/victory (built)

### 5.5 S8-2 Content Expansion (Animals/Numbers U5-U10)
- **Status:** COMPLETED per sprint-8 audit — `animalsNumbersExpansionSeed.js` exists
- **Action:** Mark as done in sprint-8 brief

---

## 6. SUMMARY MATRIX

| Category | Count | Key Items |
|----------|-------|-----------|
| **Fully Implemented** | 21 | Flagship identity, unified login, subscriptions, Paystack, entitlement, deploy, security, live, adaptive, spaced rep, competition, boss battles, festival, match history, quick-create, parent dashboard, analytics, game library, revision, voice notes, i18n P0-P3 |
| **Partially Implemented** | 10 | ParentDashboard.tsx (PIN auth), mode lock server guard, global badge, copy mode, global library UI, free tier series, upsell banner, frontend tests, i18n P4, i18n P5 |
| **Planned But Not Started** | 18 | Socket.io chat, parent controls merged endpoint, weekly report, global library UX, boss personality lines, difficulty tiers, tournament lobby, reactions frontend, effort badges, story-driven learning, power-up backend, MVP spotlight, dice-roll animation, rope animation, sound integration, ELITESMS migration (N/A), DB swap, Node upgrade |
| **Implemented But Not Planned** | 12 | 5 orphan frontend components, kidsPowerUps table, 37 empty tables, session state, analytics, onboarding |
| **Stale Plans** | 5 | ELITESMS migration, SESSION-PLAYBOOK (ops), 01-PLANNING historical, BLUEPRINT visionary, S8-2 done |

---

## 7. TOP PRIORITY GAPS

| # | Gap | Source | Impact | Effort |
|---|-----|--------|--------|--------|
| 1 | **MVP → Prod DB Swap** | MVP-TO-PROD-DB-SWAP.md | HIGH — app on test databases | 2-4 hours |
| 2 | **Socket.io / Parent-Child Chat** | FLAGSHIP-SPEC §D.3 | HIGH — key differentiator feature | 3-5 days |
| 3 | **Entitlement Upsell Banner** | EXECUTION-PLAN Phase 2.5 | HIGH — non-subscribed parents can't discover payment | 1 day |
| 4 | **Parent Controls Merged Endpoint** | FLAGSHIP-SPEC §D.1 | MEDIUM — parent dashboard incomplete | 1 day |
| 5 | **Weekly Report Endpoint** | FLAGSHIP-SPEC §D.1 D-3 | MEDIUM — parent value proposition | 1 day |
| 6 | **Global Library UX** | EXECUTION-PLAN Phase 5 | MEDIUM — teachers can't discover elite content | 2 days |
| 7 | **Node.js 20 → 22 Upgrade** | full-system-audit L3 | MEDIUM — security (EOL passed) | 2-4 hours |
| 8 | **i18n P4 (Backend Error Codes)** | i18n-MIGRATION §5 P4 | MEDIUM — blocks P5 localization | 1-2 days |
| 9 | **ParentDashboard.tsx PIN Auth Fix** | M3 audit finding | MEDIUM — contradicts unified login | 30 min |
| 10 | **Orphan Components Cleanup** | H7 audit finding | LOW — maintenance overhead | 1 hour |

---

*Report generated: 2026-09-01*
*Sources: NEXT-STEPS.md, FLAGSHIP-ELITE-SCHOOL-SPEC.md, EXECUTION-PLAN-ELITE-SCHOOL.md, MVP-TO-PROD-DB-SWAP.md, SESSION-PLAYBOOK.md, ELITESMS_MIGRATION_PLAN.md, i18n-l10n-migration.md, BLUEPRINT-v3-reality.md, sprint-8-harden-and-expand.md, full-system-audit-2026-08-26.md, ecce-roadmap.md, p4-roadmap-plan.md, STANDING-CONSTRAINTS.md, 01-PLANNING/ (18 files)*
