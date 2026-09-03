# Master Execution Plan — Bridge ALL Discovered Gaps (Team of Expert Agents)

**Date:** 2026-09-03 · **Author:** freebuff/advisor (fb-review) · **Approver:** MASTER (ox-alpha)
**Scope:** every gap discovered across the 2026-09-02/03 review cycle → one team plan with
lanes, briefs, file ownership, gates, and an acceptance checklist = "100% stated goals".
**Compliance:** C1/C2/C4/C5/C7 (see `STANDING-CONSTRAINTS.md`), deploy-on-push, workers do
not self-commit — MASTER reviews and pushes.

---

## 1. The goals (what "100%" means)

| # | Goal | Gap closed by | Spec |
|---|---|---|---|
| G1 | Story game: **objective → illustrated, narrated story scenes** that funnel into gameplay | Scene visual layer (images, backgrounds, characters, transitions, auto-advance) + `game_checkpoint` mid-scene + scene library | `TECH-SPEC-STORY-GAMES-100PCT.md` |
| G2 | **Label-diagram game** (body parts, tree, plants, car, appliances) | New `label-diagram` template + real diagram art + registry/ENUM cleanup | `TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` |
| G3 | **Clock/time games with real analog graphics** + continuous image-queue learning (simple→complex step graphics — clock, human lifecycle, plant growth…) | `AnalogClock` SVG + `stage-sequence` template + U10 content fix | `TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` |
| G4 | **One game = one topic** rule; big topics become series (final story unit may connect) | Teacher-guide rule (✅ done) + U10 "Money & Time" split into U10a–f series | `TECH-SPEC-LABEL-DIAGRAM-CLOCK-GAMES.md` §5, guide |
| G5 | **Learning Path replaces "All Games" tab** — visual path, halting points, progress | `LearningPath.tsx` + `GET /kids/learning-path` on existing series engine | `TECH-SPEC-LEARNING-PATH.md` |
| G6 | **Age isolation**: Year N never sees Year N+1 games; Year N+1 sees lower as passed/spill-over | Server-side band ceiling + spill-over segments + remove fallback-to-all | `TECH-SPEC-LEARNING-PATH.md` |
| G7 | **Weekly goals** (child/teacher set; auto default 1/week) | `kids_learning_goals` table + `GET/POST /kids/goals` + `GoalCard.tsx` | `TECH-SPEC-LEARNING-PATH.md` |
| G8 | Platform house gaps (DB swap, Node 22, chat bug, upsell banner, parent report, etc.) | Wave-3 ops lane per `GAP-ANALYSIS-2026-09-01.md` top-10 | `GAP-ANALYSIS-2026-09-01.md`, `MVP-TO-PROD-DB-SWAP.md` |

**Definition of 100%:** every row above is implemented, tested (suite at baseline fail-set
C-DEBT-01/02 only), deployed live, and verified by an independent QA pass — not just coded.

---

## 2. Team roster (expert agents, one lane per agent)

Infra verified 2026-09-03: `opencode` CLI present (`/home/dev/.opencode/bin/opencode`);
tmux sessions `phaseB2`, `phaseC`, `fb-review` exist (playbook §1: workers die ~30–60 min →
**briefs checkpoint every step**; relaunch = resume from checkpoint).

| Lane | Agent / session | Role (expertise) | Owns (exclusive file set) |
|---|---|---|---|
| **L1-BE** | opencode worker — new tmux `phaseG1` | Backend engine + content engineer (Express/Sequelize/MySQL, JSON Schema, seeds, tests) | `backend/src/**`, `game-engine/schemas/**`, `backend/test/**` |
| **L2-FE** | opencode worker — new tmux `phaseG2` | Frontend game/UX engineer (React/Vite/Tailwind, SVG renderers, i18n, vitest) | `frontend/src/**` (+ `frontend/vite.config.ts`) |
| **L3-QA** | freebuff advisor — tmux `fb-review` (this session) | Advisory QA: contract gates, invariant/i18n audits, copy pass, live-smoke plans, guide docs | `team-docs/**`, `docs/**` (read-only code; writes docs only) |
| **L4-OPS** | MASTER + root workflows | Ops/platform (DB swap, Node 22, .env, systemd, workflow_dispatch) | `.github/workflows/**`, `infra/**`, live `.env`, DBs |

**Rules (C5/C7):** two agents NEVER touch the same file. Lane splits above are disjoint.
Contract hand-offs (API shapes, template ids, i18n keys) are fixed in the specs; L1-BE and
L2-FE may run **in parallel** on those contracts. L4-OPS runs only via MASTER. L3-QA audits
each lane's checkpoints, never co-edits code files.

---

## 3. Workstreams & sequencing

```
Wave 0 (docs, DONE this session): 3 tech specs + guide rule + this plan  ✅
Wave 1 (parallel):
   L1-BE: Backend Engine & Content   ── briefs/be-brief.md
   L2-FE: Frontend Experience        ── briefs/fe-brief.md
   L3-QA: audit gates on every checkpoint
Wave 2 (after Wave 1 lands + MASTER merge):
   L1-BE: learning-path + goals + isolation backend (depends on its own Wave 1 backend)
   L2-FE: LearningPath.tsx + GoalCard.tsx + StudentHome rework
Wave 3 (ops, MASTER + root): DB swap → Node 22 → chat dbm() fix → orphan cleanup
                     (upsell banner + parent report are FE/BE — queue into Wave 2 if lanes free)
```

Ordering inside each lane is written into the brief; **nothing in Wave 2 starts before
Wave 1 is merged** (shared contracts: registry lists, scene v2 shape, preview mode).

---

## 4. Wave 1 lane scopes

### L1-BE — Backend Engine & Content (one agent, sequential phases)
Phases inside the brief, in order:
1. **Registry/ENUM cleanup** (drift found): append-only ENUM realignment to 9 templates in
   `KidGameConfig.js`, `test-db.js` ×2, `test/helpers/test-db.js`; fix `GAME_TEMPLATES`
   (frontend-owned — coordinate key with FE; actual edit in FE file).
2. **New templates backend**: `game-engine/schemas/label-diagram.schema.json`,
   `stage-sequence.schema.json` (ordered simple→complex step frames + closing assessment;
   AnalogClock is a graphic kind inside it — MASTER decision 2026-09-03, no standalone
   clock-reading template); extend `VALID_TEMPLATES`, `contentGeneratorService.js`
   prompt/mode maps, `pedagogyValidator.js` per-template checks, `game-config-invariant.js`.
3. **Scene engine backend**: v2 scene validation on save, real `scene_type` write,
   pass-through in `toRuntimeGameConfig`/`getGamePreview`/`getPublishedScenes`,
   `GET /kids/scene-library` (backgrounds/characters seed), `GET /kids/story-templates`.
4. **Learning-path backend**: server-side `classToAgeLevel` + band ceiling in listLessons,
   `GET /kids/learning-path` (units + locks via E3f gate + spill-over),
   `kids_learning_goals` model + boot reconcile + `GET/POST /kids/goals`.
5. **Content**: split U10 into U10a–f series (one topic/unit); time units are `stage-sequence`
   lessons (AnalogClock frames o'clock → :15 → :30 → :45, simple→complex);
   label-diagram sample lessons (Human Body, Tree, Car) via B2 media pipeline.
6. Tests throughout: `b2-story.test.js`, `b3-learning-path.test.js`, isolation tests.

### L2-FE — Frontend Experience (one agent, sequential phases)
1. **Registry parity + starter configs**: constants/types/i18n for the 2 new templates,
   GameCreator cards + `getConfigTemplate` entries.
2. **AnalogClock.tsx + LabelDiagram.tsx + StageSequence renderer**; `stage-sequence`
   (ordered steps[] — analog-clock/image/emoji kinds, narration, auto-advance, closing
   assessment[]) + `label-diagram` (hotspot hit-testing, both modes) branches in GamePlay.
3. **Scene visual layer**: `scenes.ts` normalizer, SceneEditor v2 fields (image/background/
   character/duration/transition/type incl. checkpoint), GamePlay `SceneRenderer`
   (background → characters → image → text → narration audio-or-TTS → auto-advance),
   `game_checkpoint` embed.
4. **Learning Path**: `LearningPath.tsx` (Duolingo-style path, phase gates, spill-over
   segment, current marker), `GoalCard.tsx`, StudentHome: path = default tab, remove flat
   All-Games grid as primary, keep festival/leaderboard, subject tabs become in-band filter.
5. i18n keys (en + ha) + vitest for every new component; `tsc --noEmit` + build clean.

### L3-QA (advisor — this lane)
- Audit every L1/L2 checkpoint against the contract tables in the specs.
- i18n key gate (`en.ts` vs `en.json`/`ha.json`), invariant checks, copy pass.
- Post-merge verification plan + live-smoke checklist (teacher → admin → child paths).

---

## 5. Briefs (dispatch files, one per lane)

| Lane | Brief file | Model to run (per playbook) |
|---|---|---|
| L1-BE | `team-docs/briefs/be-engine-brief.md` | `opencode run --model opencode/big-pickle "$(cat …)"` in tmux `phaseG1` |
| L2-FE | `team-docs/briefs/fe-experience-brief.md` | same, tmux `phaseG2` |
| L3-QA | `team-docs/briefs/qa-bridge-gaps.md` (runbook) | fb-review (this session) |
| L4-OPS | checklists exist: `MVP-TO-PROD-DB-SWAP.md`, Node 22 plan in GAP-ANALYSIS | MASTER |

Dispatch template (playbook §7):
```bash
cp team-docs/briefs/be-engine-brief.md /tmp/be.md
tmux new-session -d -s phaseG1 'opencode run "$(cat /tmp/be.md)" > /tmp/be.log 2>&1'
```

---

## 6. Gates & verification (MASTER-run)

| Gate | When | Check | Exit |
|---|---|---|---|
| G-W1 | After Wave-1 merges | L3-QA audit report; `tsc --noEmit`, build, regression 25/25, full suite = baseline fail-set only, vitest incl. new suites | ✅ |
| G-W2 | After Wave-2 merges | Same + live smoke (teacher wizard → Test Play → submit → admin Preview → approve → child path: illustrated story → game → recap; Year isolation; goal 1/1) | ✅ |
| G-W3 | After Wave-3 ops | `MVP-TO-PROD-DB-SWAP` checklist green; Node 22 health | ✅ |

**Acceptance (100%):** all G1–G8 rows implemented + tested + deployed + QA-verified.

---

## 7. Risks & rules of engagement

- **No two agents on one file** (C5). If a phase needs a file owned by the other lane,
  file a hand-off note in the owning lane's progress file instead of editing it.
- Workers checkpoint every step to `team-docs/reports/<lane>-progress.md`; assume session
  death → resume from last checkpoint (playbook §1).
- Never read `.env` with Read tools (bash grep/cut only); never self-commit prod code;
  no git push (deploy auto-runs on push — MASTER only).
- ENUM/ALTER changes append-only with defaults (C2); kids tables stay out of shared DBs (C1).
- All generated docs live in `team-docs/` (C4).

## 8. QUEUE rows (proposed; MASTER to confirm)

See QUEUE.md additions Q19–Q23 in the same commit batch as this plan.
