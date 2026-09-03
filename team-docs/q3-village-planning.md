# NGEd-game 2027 — Q3 "The Village" Planning Doc

**Date:** 2026-09-03
**Author:** worker (kilo session) — plan derived from `team-docs/NGEd-game-2027-ROADMAP.md` §Q3
**Audience:** MASTER + other team (Brainstrom/Codebuff) for sequencing + sign-off
**Status:** DRAFT — pending review
**Calendar:** Q3 2027 (Jul–Sep) per roadmap; sequenced as Class-A → Parent → Teacher AI per §2.12

---

## 0. Where We Are Today (pre-Q3)

- **Q1 2027 "The Brain"** is ~97% complete and deployed live (see `team-docs/reports/q1-handoff.md`, `team-docs/reports/q1-coverage-refresh.md`).
- **Q2 2027 "The Voice"** (speech + drawing + portfolio) is being handled by the other team (per user order 2026-09-03 — **MASTER-reported; no user-order note exists in team-docs**; Q2 speech slices are on main: 8989ebc, 2838e59).
- **Q3 2027 "The Village"** (this plan) is 0% — no code, no DDL, no endpoints, no UI.
- **Q4 2027 "The Future"** (marketplace + offline 2.0 + analytics) is 0%.

### Q1/Q2 dependencies that Q3 needs
| Q3 surface | Needs from Q1 | Needs from Q2 |
|---|---|---|
| Classroom collaboration (teams, class quests) | `kids_learning_goals` (class-wide targets), `kids_teams/peer/class_quests` tables; ADE mastery per skill; SRE review scheduling | Speech games (peer teaching could include audio) |
| Parent Intelligence Dashboard | ADE mastery probability per skill (skill map source), SRE review history (struggle detection), economy XP/streak (engagement signals), garden state | Drawing attempts + speech recordings (Q2 portfolio evidence) |
| Teacher AI Assistant | ADE mastery across the class, economy + streak rollup, analytics events (engagement snapshots), NERDC curriculum mapping (`nerdc_strand` on lessons) | Drawing recognition scores (Q2-D) + pronunciation scores (Q2-B) feed struggle detection |

**Blocker analysis:** Q1 is fully available. Q2 is in progress on the other lane. **Recommendation:** start Q3 Class-A + Parent on the parts that don't need Q2 (class-quest math, parent insights from mastery/streak/engagement). Defer drawing/speech-dependent features (peer teaching with audio, drawing evidence in portfolio) until Q2 lands.

---

## 1. Q3 Vision: "The Village"

> Learning is social. Teachers, parents, and peers form a supportive community around every child.

**Three pillars:**

1. **Classroom Collaboration (§2.9)** — Real-time + async group dynamics: teams, peer teaching, class quests, leaderboard, achievement wall.
2. **Parent Intelligence Dashboard (§2.10)** — Transform parent view from "what happened" to "what it means + what to do" via AI-generated insights + weekly digest.
3. **Teacher AI Assistant (§2.11)** — AI copilot for teachers: insights, suggestions, auto-assign, weekly reports.

**Success metrics (end of Q3):**

| Metric | Current | Target | Source |
|--------|---------|--------|--------|
| Class quest participation rate | 0% | 60% | plan-set target (NOT in roadmap §1) |
| Parent weekly check-in rate | ~5% | 40% | roadmap §1 Success Metrics (line 70) |
| Teacher time on platform | 12 min/wk | 25 min/wk | roadmap §1 Success Metrics (line 69) |
| Peer-teaching events / child / month | 0 | 4 | plan-set target |
| Insights actioned by parents / wk | 0 | 30% | plan-set target |

> **Note (validated 2026-09-03):** "Current" baselines are **roadmap-derived, not verified against live data** — the only verifiable live signal is `team-docs/reports/q1-coverage-refresh.md` (Q1 ~97% deployed; Q2+ tables 4/16). Teacher-time (12→25 min/wk) and parent check-in (5%→40%) match roadmap §1 lines 69–70. Class-quest 60%, peer-teaching 4/mo, and insights-actioned 30% do **not** appear in the roadmap — they are targets set in this plan. Measure true baselines once the W1-2 collab backend lands.

---

## 2. Q3 Deliverables (mirror §2.12 weekly plan)

| Week | Deliverable | Owner | Lane | Notes |
|------|-------------|-------|------|-------|
| W1-2 | Collaboration schema DDL + pure algorithms (XP-share math, team-formation heuristic, class-quest scoring) | opencode/Buffy | L1-BE | No DB writes until W3; testable as pure functions |
| W3 | Collaboration backend (controllers + routes + WebSocket) | opencode/Buffy | L1-BE | `kidsCollaboration.js`, WS at `/kids/teams/ws` |
| W4-5 | Collaboration frontend (TeamChallenge, PeerTeachingBoard, ClassQuest, CollaborationBadge) | opencode/Buffy | L2-FE | WebSocket client (reuse E4 coturn/WS infra) |
| W4-5 | Parent insight engine (rule-based first, AI optional) | opencode/Buffy | L1-BE | `insightGenerator.js`; deterministic rules to start |
| W6-8 | Parent dashboard redesign (InsightCard, ActionItem, WeeklyDigest, ComparisonChart) | opencode/Buffy | L2-FE | Build on existing `ParentDashboard.tsx` |
| W7-8 | Teacher AI assistant backend (insights, suggestions, auto-assign, weekly report) | opencode/Buffy | L1-BE | Reuse parent insight engine + class analytics |
| W9-10 | Teacher AI assistant frontend (InsightsPanel, StudentAlertCard, ContentSuggestion, AutoAssignDialog) | opencode/Buffy | L2-FE | Embed in `TeacherAnalytics.tsx` |
| W11 | Cross-track integration testing (class quest + parent digest + teacher report end-to-end) | all | L3-QA | `q3-integration.test.js` |
| W12 | E2E browser smoke + deploy | all | L4-OPS | Auto-deploy via push to `production` |

**Total effort:** 15 weeks per roadmap. With Q1 lessons + Q2 in flight, **realistic compressed plan: 12–14 weeks** with one track per week (no parallel), or **8–10 weeks with 2 parallel BE/FE pairs** as above.

---

## 3. Detailed Sub-Plans

### 3.1 Classroom Collaboration (§2.9)

**Backend (W1–W3):**

| ID | Task | Deps | File |
|----|------|------|------|
| C1 | `kids_teams` DDL + Sequelize model | nothing | `backend/database/q3-collab-parent-teacher-migration.js`, `backend/src/models/KidTeam.js` |
| C2 | `kids_peer_teaching` DDL + model | nothing | new |
| C3 | `kids_class_quests` DDL + model | nothing | new |
| C4 | `kids_team_members` DDL + model | C1 | new |
| C5 | `kids_team_challenges` DDL + model (real-time session rows) | C1 | new |
| C6 | Pure algorithm: team-formation heuristic (cluster kids by age band + recent XP) | Q1 progress data | `backend/src/services/teamFormation.js` |
| C7 | Pure algorithm: class-quest scoring (whole-class vs target, individual contribution %) | C3 | `backend/src/services/classQuestScoring.js` |
| C8 | Controller `kidsCollaboration.js` — REST endpoints | C1–C7 | new |
| C9 | WebSocket hub at `/kids/teams/ws` — real-time team challenge events | C8, E4 WS infra | `backend/src/sockets/collaboration.js` |
| C10 | Routes registered in `kids.js` | C8 | modify |
| C11 | Test suite: `q3-collab.test.js` (algorithms + REST + WS contract) | C6–C10 | new |

**Endpoints (REST):**
- `POST /kids/teams/create` — teacher/auto-creates a team
- `GET  /kids/teams/:id` — team details
- `POST /kids/teams/:id/join` — student joins
- `GET  /kids/teams/:id/challenge` — current active challenge
- `POST /kids/teams/:id/challenge/submit` — submit an answer
- `POST /kids/peer-teach/record` — record a peer explanation
- `GET  /kids/peer-teach/board?subject=` — browse peer explanations
- `GET  /kids/class-quest/active` — current class quest
- `POST /kids/class-quest/contribute` — student contributes (answer / play)
- `GET  /kids/class-quest/leaderboard` — class standings

**WebSocket events:**
- `team:created`, `team:joined`, `team:left`
- `challenge:started`, `challenge:tick`, `challenge:answer`, `challenge:ended`
- `class-quest:progress`, `class-quest:completed`
- `peer-teach:new` (broadcast to class)

**Frontend (W4–W5):**

| ID | Task | Deps | File |
|----|------|------|------|
| C12 | `useCollaborationSocket` hook (WS client w/ reconnect) | C9 | `frontend/src/lib/realtime/useCollaborationSocket.ts` |
| C13 | `TeamChallenge.tsx` — real-time team game UI (lobby + live + results) | C12 | new |
| C14 | `PeerTeachingBoard.tsx` — browse + record peer explanations | C8 | new |
| C15 | `ClassQuest.tsx` — class-wide progress bar + leaderboard strip | C8 | new |
| C16 | `CollaborationBadge.tsx` — peer-teaching achievement chip | C8 | new |
| C17 | `StudentHome.tsx` integration — notification rail + team/quest entry points | C12–C16 | modify |
| C18 | Vitest for hooks + components | C12–C16 | `frontend/src/lib/realtime/*.test.ts`, component tests |

**Dependency on Q2:** C14 (peer teaching) can record audio explanations only if Q2 speech is live. **Defer audio recording to a Q3.1 follow-up; ship text-only peer teaching in v1.**

---

### 3.2 Parent Intelligence Dashboard (§2.10)

**Backend (W4–W5):**

| ID | Task | Deps | File |
|----|------|------|------|
| P1 | `kids_insights` DDL + model | Q1 mastery + economy | new |
| P2 | `kids_action_items` DDL + model | P1 | new |
| P3 | Rule-based insight engine (deterministic) | Q1 ADE mastery, economy, streak, garden, goals | `backend/src/services/insightGenerator.js` |
| P4 | Weekly digest builder (last 7 days rollup) | P3, `kids_progress` | new |
| P5 | Anonymous peer comparison (opt-in, percentile within age band) | P3, `kids_engagement_snapshot` | new |
| P6 | Controller `kidsParentIntelligence.js` | P1–P5 | new |
| P7 | Push notification scheduler (optional, deferred to Q4) | P6 | out of scope for v1 |
| P8 | Routes registered in `kids.js` | P6 | modify |
| P9 | Test suite: `q3-parent.test.js` (rules + endpoints) | P3–P8 | new |

**Endpoints:**
- `GET  /kids/parent/insights/:childId` — personalized insights (today's snapshot + weekly)
- `GET  /kids/parent/weekly-digest/:childId` — last 7 days rollup
- `GET  /kids/parent/comparison/:childId` — anonymous opt-in peer comparison
- `POST /kids/parent/action-ack` — mark an action item done
- `POST /kids/parent/opt-in` — toggle anonymous comparison

**Rule engine seed (deterministic, no LLM in v1):**
- "Streak at risk" — `lastPlayDate = yesterday` AND `current ≥ 3`
- "Mastered X" — `mastery_probability ≥ 0.85` for any skill (delta from last week)
- "Struggling with Y" — `mastery_probability < 0.40` for 2+ sessions AND review not yet scheduled
- "Strongest subject" — argmax(mastery) over the week
- "Needs attention" — subject with flat mastery for 2+ weeks
- "Goal on track" — `goal.done / goal.target` projection vs week remaining
- "Reading time up" — `sum(session_duration_ms)` delta week-over-week
- "Mood: engaged / bored" — heuristic from session frequency + accuracy drop (placeholder for Q4 ML)

**Frontend (W6–W8):**

| ID | Task | Deps | File |
|----|------|------|------|
| P10 | `InsightCard.tsx` — single insight display (icon + headline + body + age) | P6 | new |
| P11 | `ActionItem.tsx` — checkbox recommendation | P6 | new |
| P12 | `WeeklyDigest.tsx` — last 7 days summary view | P6 | new |
| P13 | `ComparisonChart.tsx` — opt-in anonymous bar chart | P6 | new |
| P14 | `ParentNudge.tsx` — toast for high-priority insight (e.g. streak at risk) | P6 | new |
| P15 | `ParentDashboard.tsx` redesign — restructure into Today's / Weekly / Compare / Actions | P10–P14 | modify |
| P16 | Vitest components | P10–P14 | new |

**Builds on existing:** `frontend/src/components/ParentDashboard.tsx` (459 lines, basic). Strip down + add new sections.

---

### 3.3 Teacher AI Assistant (§2.11)

**Backend (W7–W8):**

| ID | Task | Deps | File |
|----|------|------|------|
| T1 | `kids_teacher_insights` DDL + model | Q1 analytics + P3 | new |
| T2 | `kids_content_suggestions` DDL + model | C7 + NERDC | new |
| T3 | `teacherAssistant.js` service — class-level insight aggregation (P3 reused + rolled up across the class) | P3, Q1 analytics | new |
| T4 | Content-gap detection (per class: which NERDC strands have low coverage vs assignment) | T3, NERDC tables | in T3 |
| T5 | Auto-assign heuristic (BKT mastery low → push matching lesson; ADE struggling → schedule review) | T3, Q1 ADE | in T3 |
| T6 | Weekly class report generator (rollup + PDF-ready JSON) | T3 | new |
| T7 | Controller `kidsTeacher.js` | T1–T6 | new |
| T8 | Routes registered in `kids.js` | T7 | modify |
| T9 | Test suite: `q3-teacher.test.js` | T3–T8 | new |

**Endpoints:**
- `GET  /kids/teacher/insights` — class-level insights (struggling students, mastery deltas)
- `GET  /kids/teacher/suggestions` — content/activity suggestions (gap detection)
- `POST /kids/teacher/auto-assign` — auto-assign based on analytics
- `GET  /kids/teacher/weekly-report` — generated class report (JSON; PDF deferred to Q4)
- `GET  /kids/teacher/struggling` — list of students with mastery < threshold (default 0.40)

**Frontend (W9–W10):**

| ID | Task | Deps | File |
|----|------|------|------|
| T10 | `TeacherInsightsPanel.tsx` — sidebar with class insights | T7 | new |
| T11 | `StudentAlertCard.tsx` — struggling student card | T7 | new |
| T12 | `ContentSuggestion.tsx` — suggested activity card with one-click assign | T7 | new |
| T13 | `AutoAssignDialog.tsx` — confirmation modal for auto-assign | T7 | new |
| T14 | `TeacherAnalytics.tsx` integration — embed T10–T13 in existing analytics view | T10–T13 | modify |
| T15 | Vitest components | T10–T13 | new |

**Builds on existing:** `frontend/src/pages/Teacher/TeacherAnalytics.tsx`. Wire new components as new tabs/cards.

---

## 4. Database Schema Additions (Q3)

**9 new tables** (per `team-docs/reports/q1-coverage-refresh.md` table tracker — currently 4/16 Q2+ tables done, 0 Q3 tables):

```
kids_teams                 (C1) — team definition (id, class_id, name, created_by, created_at)
kids_team_members          (C4) — many-to-many: child ↔ team
kids_team_challenges       (C5) — real-time challenge session rows
kids_peer_teaching         (C2) — recorded peer explanations (text v1, audio v1.1 after Q2)
kids_class_quests          (C3) — class-wide challenges (target_metric, target_value, period)
kids_insights              (P1) — generated insights per child per week
kids_action_items          (P2) — recommended actions + ack state
kids_teacher_insights      (T1) — class-level insights (rollup of P3)
kids_content_suggestions   (T2) — content gap + auto-assign records
```

**Tracker impact:** 4/16 (25%) → 13/16 (81%) after Q3.

---

## 5. Cross-Cutting Concerns

### 5.1 Authentication & Authorization
- **Students** read their own team / quest / peer-teach data; write to their own contributions.
- **Parents** read their linked children's insights + weekly digest; write action-acks.
- **Teachers** read their class's insights + write auto-assign.
- Reuse existing `auth` middleware + `admissionAllowed` pattern from `kidsGoals.js`.

### 5.2 WebSocket Auth
- Reuse E4's `/kids/chat` socket pattern (lazy-arrow `dbm()` per `team-docs/reports/q22-q23-ops-verified.md`; socket file: `backend/src/sockets/chat.js`, registered in `backend/src/index.js:94`).
- WS room keys: `class:<class_id>`, `team:<team_id>`, `quest:<quest_id>`.

### 5.3 i18n
- New keys go into `frontend/src/lib/i18n/en.ts` + `frontend/src/lib/i18n/locales/en.json` + `frontend/src/lib/i18n/locales/ha.json` (pattern from Q1).
- All new copy is child-safe + warm (tone set by Q1 streak-reminder copy pass — `34df723`).

### 5.4 Performance
- Class insights are N+1 risk (per-student mastery) — must pre-aggregate per class per week.
- Use Redis-style cache or memoize per-request (Q1 already uses request-scoped memos).
- Anonymous comparison must be pre-computed nightly (cron in Q4); in v1, compute on-demand with <200ms p95 target.

### 5.5 Privacy (ECCE-sensitive)
- Peer teaching: NO audio in v1 (Q2 dependency). Text only, screened.
- Anonymous comparison: opt-in, age-band-only, never raw scores.
- Parent insights: NEVER cross-child (each parent sees only their linked children).
- COPPA / Nigerian Data Protection Regulation: confirm with MASTER before launch.

---

## 6. Open Questions for MASTER

1. **WebSocket re-use:** confirm E4 coturn infra at `/kids/chat` is the right home for `/kids/teams/ws` (or spin up a new one).
2. **Push notifications:** schedule in Q3 or defer to Q4? Push requires a push provider (FCM / OneSignal).
3. **LLM for insights:** rule-based only in v1, or trial an LLM call per insight? (Cost + latency + privacy implications.)
4. **Auto-assign scope:** teacher-confirm-on-every-assign, or bulk "apply all" with rollback?
5. **Parent weekly digest delivery:** in-app only, or also email? Email needs transactional email provider.
6. **Class quest creation:** teacher-driven, admin-driven, or auto-generated weekly? Auto-generation needs a smart heuristic.
7. **Data retention:** peer-teaching text records + class-quest contributions — how long to keep?
8. **COPPA / NDPR review:** has the data-handling spec for the new tables been reviewed by MASTER / legal?

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Q2 (speech/drawing) not ready → peer-teach audio + drawing portfolio blocked | M | Ship text-only peer-teach v1; defer audio to Q3.1 |
| LLM cost blow-up on insight generation | M | Rule-based v1; LLM opt-in via MASTER question above |
| WebSocket scaling at 10K concurrent (Q4 target, but Q3 needs to plan) | M | Use existing E4 infra; load test in W11 |
| N+1 on class insights | H | Pre-aggregate nightly; cache per class+week |
| Teacher adoption (low teacher time on platform is a roadmap target) | M | Auto-assign + suggestions must save time, not add steps |
| Privacy / parent data access | H | Reuse `admissionAllowed` + opt-in for comparison; MASTER review |
| E4 coturn was for voice — overloading for collab may degrade chat | M | Separate WS paths but same port; rate-limit per room |

---

## 8. Definition of Done (per track)

**Class-A DONE when:**
- [ ] 5 new tables migrated (kids_teams, kids_team_members, kids_team_challenges, kids_peer_teaching, kids_class_quests)
- [ ] 9 REST endpoints + WS hub live
- [ ] TeamChallenge / PeerTeachingBoard / ClassQuest / CollaborationBadge deployed
- [ ] StudentHome shows team/quest/peer notifications
- [ ] `q3-collab.test.js` + vitest green; backend 100% Q3 sweep; live-smoke OK

**Parent Intelligence DONE when:**
- [ ] 2 new tables (kids_insights, kids_action_items)
- [ ] 5 endpoints live
- [ ] InsightCard / ActionItem / WeeklyDigest / ComparisonChart deployed
- [ ] ParentDashboard redesigned (Today / Weekly / Compare / Actions)
- [ ] `q3-parent.test.js` + vitest green; rule engine covers 8 seed rules

**Teacher AI DONE when:**
- [ ] 2 new tables (kids_teacher_insights, kids_content_suggestions)
- [ ] 5 endpoints live
- [ ] InsightsPanel / StudentAlertCard / ContentSuggestion / AutoAssignDialog deployed
- [ ] TeacherAnalytics embeds new tabs
- [ ] `q3-teacher.test.js` + vitest green

**Cross-track DONE when:**
- [ ] `q3-integration.test.js` end-to-end: class quest → parent digest → teacher report all reference same data
- [ ] Auto-deploy verified live
- [ ] Privacy / COPPA sign-off from MASTER
- [ ] Q3 ships before Q4 kickoff (Oct 2027)

---

## 9. Files to Create / Modify (Q3)

**Create (~30 files):**
- 9 backend models (KidTeam, KidTeamMember, KidTeamChallenge, KidPeerTeaching, KidClassQuest, KidInsight, KidActionItem, KidTeacherInsight, KidContentSuggestion)
- 4 backend services (teamFormation, classQuestScoring, insightGenerator, teacherAssistant)
- 3 backend controllers (kidsCollaboration, kidsParentIntelligence, kidsTeacher)
- 1 backend socket (sockets/collaboration.js)
- 1 backend migration script (q3-collab-parent-teacher-migration.js — same file as C1; covers all 9 Q3 tables)
- 4 backend test files (q3-collab, q3-parent, q3-teacher, q3-integration)
- 12 frontend components (TeamChallenge, PeerTeachingBoard, ClassQuest, CollaborationBadge, InsightCard, ActionItem, WeeklyDigest, ComparisonChart, ParentNudge, TeacherInsightsPanel, StudentAlertCard, ContentSuggestion, AutoAssignDialog)
- 1 frontend hook (useCollaborationSocket)
- 8 frontend test files
- 3 i18n locale updates (en.ts, en.json, ha.json — extend existing)

**Modify (~10 files):**
- `backend/src/routes/kids.js` — add 3 route groups
- `backend/src/index.js` — register collab socket
- `backend/src/services/ageBand.js` — extend for class-level rollups (if needed)
- `frontend/src/pages/Student/StudentHome.tsx` — notification rail
- `frontend/src/components/ParentDashboard.tsx` — redesign
- `frontend/src/pages/Teacher/TeacherAnalytics.tsx` — embed
- `frontend/src/lib/api/endpoints.ts` — add Q3 endpoint constants
- `frontend/src/lib/types/adaptive.ts` — add Q3 types

---

## 10. Sequencing Recommendation

**Realistic sequencing given Q2 is in flight and Q1 is done:**

```
W1-2  ─ C1-C7, T1-T2 (DDL + pure algorithms, parallelizable)
W3    ─ C8-C11 (collab controller + WS + tests)
W4-5  ─ P1-P5 (insight engine)  ‖  C12-C18 (collab FE)
W6-7  ─ P6-P9 (parent controller + tests)
W8    ─ T3-T9 (teacher assistant)  ‖  P10-P13 (parent FE)
W9-10 ─ T10-T15 (teacher FE)
W11   ─ Cross-track integration + browser smoke
W12   ─ Deploy + verify + sign-off
```

This compresses 15 weeks of roadmap effort into 12 calendar weeks by running collaboration + parent + teacher in parallel where dependencies allow.

---

## 11. QUEUE Updates (proposed for next worker session)

Append to `team-docs/QUEUE.md`:

| # | Task | Assigned | Status |
|---|------|----------|--------|
| Q24 | Q3 Class-A backend (collab DDL + algorithms + controller + WS) | opencode phaseH1 | QUEUED |
| Q25 | Q3 Class-A frontend (TeamChallenge + PeerTeaching + ClassQuest) | opencode phaseH2 | QUEUED |
| Q26 | Q3 Parent Intelligence backend (insight engine + controller) | opencode phaseH1 | QUEUED |
| Q27 | Q3 Parent Intelligence frontend (dashboard redesign) | opencode phaseH2 | QUEUED |
| Q28 | Q3 Teacher AI backend (insights + suggestions + auto-assign + weekly report) | opencode phaseH1 | QUEUED |
| Q29 | Q3 Teacher AI frontend (insights panel + alert cards + suggestions) | opencode phaseH2 | QUEUED |
| Q30 | Q3 integration + browser smoke + deploy | all | QUEUED |

---

## 12. Cross-References

- `team-docs/NGEd-game-2027-ROADMAP.md` §Q3 (§2.9–2.12) — authoritative spec
- `team-docs/SRS-Q1-NGEd-game.md` — Q1 contract (Q3 depends on these endpoints/tables)
- `team-docs/reports/q1-handoff.md` — Q1 closure confirmation
- `team-docs/reports/q1-coverage-refresh.md` — current Q1 gap board
- `team-docs/reports/ngeg-2027-overview-and-gap-plan-request.md` — program overview
- `team-docs/Q1-WORK-SPLIT.md` — template for the Q3 work-split doc to come
- `team-docs/QUEUE.md` — current task board (Q3 rows to be added)

---

*This plan is a DRAFT — awaiting MASTER review + sequencing confirmation before any Q3 code is written. Q2 lane is the other team's focus this session.*
