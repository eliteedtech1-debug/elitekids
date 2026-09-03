# TASK QUEUE (master-maintained; workers self-dispatch in order)
| # | Task | Assigned | Status |
|---|------|----------|--------|
| Q1 | B2 media repair (briefs/b2-media-repair.md) | phaseB2 | DONE 2026-08-23 |
| Q2 | C test matrix (briefs/c-test-matrix-expansion.md) | phaseC | DONE |
| Q3 | Asset baseline sweep | fb-review | DONE 2026-08-23 |
| Q4 | B3 kids-web hardening | phaseB2 | DONE 2026-08-23 |
| Q5 | CI runner wiring | phaseC | DONE |
| Q6 | ECCE roadmap spike | phaseC | DONE |
| Q7 | D content factory | phaseD | DONE 2026-08-23 |
| Q8 | S8-4: Auth hardening — series-domestications requireStaff | opencode | DONE 2026-08-26 |
| Q9 | S8-3: kids_curriculum_points renumber — PA-U refs to current units | opencode | DONE 2026-08-26 |
| Q10 | S8-1: i18n P3 — locale files + RTL foundation | opencode | DONE 2026-08-26 |
| Q11 | S8-5: Spaced repetition frontend — SpacedReview.tsx on StudentHome | opencode | DONE 2026-08-26 |
| Q12 | S8-6: Adaptive difficulty frontend — GamePlay uses adaptive profiles | opencode | DONE 2026-08-26 |
| Q13 | S8-2: Content expansion — Animals/Numbers U5-U10 ladder | opencode | DONE 2026-08-26 |
| Q14 | S8-FB1: QA checklist — i18n P3 key audit | fb-review | DONE 2026-09-02 (reports/s8-fb1-i18n-audit.md) |
| Q15 | S8-FB2: QA checklist — Animals/Numbers U5-U10 content verification | fb-review | DONE 2026-09-02 (reports/s8-fb2-content-verification.md) |
| Q16 | S8-FB3: Teacher guide update — spaced repetition docs | fb-review | DONE 2026-09-02 (docs/teacher-game-maker-guide.md; reports/s8-fb3-teacher-guide.md) |
| Q17 | S8-FB4: Copy pass — review card, adaptive hints, locale validation | fb-review | DONE 2026-09-02 (reports/s8-fb4-copy-pass.md) |
| Q18 | E4 Phase 1: WebRTC realtime broadcast | opencode | DONE 2026-09-02 — coturn TURN installed+active via coturn-setup.yml workflow; 3478 relaying; LIVE_WEBRTC=1 in .env (reports/e4-coturn-Q18.md) |
| Q19 | BRIDGE L1-BE: backend engine + content (registry cleanup, label-diagram + stage-sequence schemas/validation, scene v2 backend + scene-library, learning-path + age isolation + goals API, U10a-f series split + sample content) — briefs/be-engine-brief.md | opencode phaseG1 | CODE-COMPLETE + QA-VERIFIED 2026-09-03 (executed solo by freebuff; be-progress.md Phases 1–6; QA gate reports/qa-gate-wave1.md) — UNCOMMITTED, pending MASTER merge (F-01 KEPT game-chain — prod enum widen + FE renderer deferred; F-02 force-add 3 schemas) |
| Q20 | BRIDGE L2-FE: frontend experience (registry parity, AnalogClock + LabelDiagram + StageSequence renderers, scene visual layer + SceneRenderer + checkpoint, LearningPath + GoalCard replacing All-Games tab) — briefs/fe-experience-brief.md | opencode phaseG2 | CODE-COMPLETE + QA-VERIFIED 2026-09-03 (executed solo by freebuff; fe-progress.md P1–P4; QA gate reports/qa-gate-wave1.md) — UNCOMMITTED, pending MASTER merge |
| Q21 | BRIDGE L3-QA: advisory audits + gate reports per wave (contract parity, i18n, invariants, live-smoke plan) — briefs/qa-bridge-gaps.md | fb-review | DONE 2026-09-03 (reports/qa-gate-wave1.md — gates green, F-01/F-02 findings, guide copy pass; post-merge live-smoke = MASTER G-W2) |
| Q22 | BRIDGE L4-OPS: MVP→prod DB swap (MVP-TO-PROD-DB-SWAP.md) | MASTER + ROOT | QUEUED 2026-09-03 — Wave 3, after Q19/Q20 merge |
| Q23 | BRIDGE L4-OPS: Node 20→22 + chat dbm() bug + orphan cleanup | MASTER + ROOT | QUEUED 2026-09-03 — Wave 3 |
