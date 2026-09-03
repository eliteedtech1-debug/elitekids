# BRIEF — L3-QA: Advisory runbook for Bridge-All-Gaps execution

**Lane:** L3-QA (freebuff/fb-review) · **Role:** read-only advisor — audits, sweeps,
reviews, docs. NEVER co-edit code files with L1-BE/L2-FE. Progress:
`team-docs/reports/qa-bridge-progress.md`.

## What QA does at each gate
1. **Contract parity audit** — after each Wave-1 checkpoint, diff the lane's changes against
   the contract tables in the three TECH-SPEC docs:
   - Template ids consistent across: backend `VALID_TEMPLATES`, model ENUM, hermetic ENUMs,
     `game-config-invariant.js`, `contentGeneratorService` modes, frontend `GAME_TEMPLATES`,
     `GAME_INTERACTIONS`, GameCreator TEMPLATES cards, GamePlay branches — **no list may
     miss a template**.
   - Scene v2 canonical shape used by: schema JSON, SceneEditor serializer, GamePlay
     SceneRenderer, backend validation/pass-through — same field names everywhere.
   - `/kids/learning-path` payload matches §2.2 shape (student band, goal, path units w/
     locks/spillover/lesson states).
2. **i18n gate** — every new `en.ts` key has matching `en.json` + `ha.json`; run the i18n
   vitest; report orphans/missing.
3. **Invariant sweep** — run `scripts/run-tests.sh` regression matrix; confirm full-suite
   fail-set is exactly C-DEBT-01/02 (garden-companion) and nothing new.
4. **Copy & pedagogy pass** — new game template cards, goal strings, spill-over copy, scene
   type labels: kid-safe tone, no discouragement, equity rules (Doc 16) respected; update
   `docs/teacher-game-maker-guide.md` only for guide content (never code).
5. **Live-smoke plan** (post-merge, MASTER-run) — checklist:
   - Teacher: wizard → (story scenes illustrated) → Test Play → submit.
   - Admin: Preview pending game → play (story → checkpoint → game → recap) → approve.
   - Child KG1: Learning Path default → sees only ≤KG1 → locked unit reason → play →
     unit unlocks → Goal 1/1 ✅.
   - Isolation probe: request as KG1 student returns zero KG2/Primary lesson ids.
   - Old text-scene lessons still play (regression).

## Deliverables
- One gate report per wave: `team-docs/reports/qa-gate-waveN.md` (findings, verdict, PASS/FAIL).
- Final acceptance check against G1–G8 table in `EXECUTION-PLAN-BRIDGE-ALL-GAPS.md`.
