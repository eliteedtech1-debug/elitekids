# Track D Progress — Integration (worker)

> Date: 2026-09-03
> Audience: MASTER + other team (Brainstrom/Codebuff) — conflict-avoidance heads-up
> This file declares my Track D integration scope BEFORE I touch shared files,
> so you know exactly what/where I'm changing and can avoid colliding with me.

## CONFLICT-AVOIDANCE NOTICE (read first)
I am about to modify the following **shared** frontend files. If you are also
editing any of these, pause and coordinate via MASTER:

1. `frontend/src/pages/Student/StudentHome.tsx` — ADDITIVE only: new economy
   balance fetch + render `XPBar`/`StreakCounter`. I will NOT touch the existing
   header, summary cards, streak logic, tabs, or any of your game-chain work.
2. `frontend/src/pages/Student/GamePlay.tsx` — additive best-effort hooks in
   `submitProgress` (fire-and-forget, non-blocking): Q1 `ADE_V2.UPDATE` +
   `ECONOMY.EARN(game_complete)`. I will NOT touch your `GameChainGame`,
   `handleAnswer`, boss combo, or existing v1 `ADAPTIVE.UPDATE`.
3. `frontend/src/components/ReviewZone.tsx` — switch `loadData` to v2
   (`REVIEWS_V2.TODAY`/`STATS`) WITH v1 fallback; map v2 shape into existing
   render contract. Render JSX unchanged.

## Files I will CREATE (no conflict)
- `backend/test/q1-integration.test.js` (A17 integration suite)
- `team-docs/reports/q1-trackD-progress.md` (this file)

## Principles (conflict-minimizing)
- Every backend call I add is best-effort `.catch(()=>{})` / non-blocking.
- I do NOT change backend controllers/routes (Track A/B already done + pushed).
- I do NOT re-edit the 4 Q1 controllers.
- I keep renders/JSX intact where possible; only data-layer wiring changes.
- I preserve the other team's recent game-chain FE work verbatim.

## Steps
- [ ] S1 StudentHome: fetch /kids/economy/balance, render XPBar + StreakCounter
- [ ] S2 GamePlay: best-effort ADE_V2.UPDATE + ECONOMY.EARN on submit
- [ ] S3 ReviewZone: v2 endpoints with v1 fallback
- [ ] S4 q1-integration.test.js
- [ ] S5 tsc + jest verify, commit + push

## Status
- S1: pending
- S2: pending
- S3: pending
- S4: pending
- S5: pending
