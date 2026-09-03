# QA GATE REPORT — Wave 1+2 (BRIDGE-ALL-GAPS, Q19/Q20)

**Lane:** L3-QA (freebuff advisor) · **Date:** 2026-09-03 · **Scope:** audit of the
uncommitted L1-BE (Q19) + L2-FE (Q20) working tree against the contract tables in the
three TECH-SPEC docs, plus invariant/i18n/build gates. Both lanes ran SOLO by freebuff
(opencode teammates 429-blocked) and declared COMPLETE in their progress files — this
report independently re-verifies those claims before MASTER merges.

---

## 1. Gate results (re-run by QA on the uncommitted tree)

| Gate | Command | Result | Verdict |
|---|---|---|---|
| Backend full suite | `jest --runInBand --forceExit` (hermetic) | **382P / 2F / 384** | ✅ PASS |
| Residual failures | — | `test/garden-companion.test.js` ×2 = C-DEBT-01/02 (documented pre-existing, product-decided, ticket-only) | ✅ baseline only |
| Regression matrix | b1-regression in-suite | 25/25 (part of the 382 pass) | ✅ PASS |
| New suites | b2-story + b3-learning-path in-suite | 11/11 + 16/16 (part of the 382 pass) | ✅ PASS |
| Frontend vitest | `vitest run` | **93/93** (7 files, incl. i18n gate 10, learningPath 13, scenes 12, stage-sequence-label 20) | ✅ PASS |
| Frontend typecheck | `tsc --noEmit` | clean | ✅ PASS |
| Frontend build | `npm run build` | OK (5.24s, 542.5 kB main) | ✅ PASS |

**Nothing new failed.** Fail-set = C-DEBT-01/02 only, unchanged per precedent.

## 2. Contract parity audit

### 2.1 Template ids — one list misses a value
Canonical set per briefs/specs = **9** (7 legacy + `label-diagram` + `stage-sequence`).

| List | Values | Notes |
|---|---|---|
| FE `GAME_TEMPLATES` (constants.ts) | 9 (no game-chain) | ✅ matches brief |
| FE `GAME_INTERACTIONS` (types/game.ts) | 9 entries | ✅ |
| FE GameCreator TEMPLATES cards | 9 cards | ✅ |
| FE GamePlay branches + round counts | 9 branches | ✅ |
| i18n en.ts / en.json / ha.json | 0 refs to game-chain | ✅ 9-template copy only |
| BE `VALID_TEMPLATES` (kids.js:683) | **10 (incl. game-chain)** | ⚠️ see F-01 |
| BE model ENUM (KidGameConfig.js) | **10 (incl. game-chain)** | ⚠️ see F-01 |
| Hermetic ENUM ×3 (test/test-db, helpers/test-db, controllers/test-db) | **10 (incl. game-chain)** | ⚠️ see F-01 |
| `database/fix-template-enum.js` NEW_ENUM | **10 (incl. game-chain)** | ⚠️ see F-01 |
| `game-config-invariant.js` EXEMPT | puzzle-split, stage-sequence, **game-chain** | ⚠️ see F-01 |
| `contentGeneratorService.js` templates[] (generation) | 9 | ✅ generation list correct |
| Prod DB `kids_game_configs.template` (elite_content) | **9 values** (label-diagram + stage-sequence present, NO game-chain) | ⚠️ hermetic(10) ≠ prod(9) drift |
| Prod DB rows by template | 9 types, 0 game-chain rows | ✅ |

### 2.2 Scene v2 canonical shape
`game-engine/schemas/scene-script.schema.json` (canonical v2 superset) ↔ SceneEditor
serializer ↔ GamePlay SceneRenderer ↔ backend `canonicalSceneType`/`sceneCardErrors` +
save-time validation ↔ `scene_type` column write — field names consistent
(type/intro..game_checkpoint, durationSec 3–60, transition, image, characters, gameId-iff-
checkpoint). Legacy aliases tolerated both directions. Verified by b2 tests (round-trip,
400s, 422 fail-closed, no-write-in-checkpoint) — all green in-suite.

### 2.3 Learning-path payload
`GET /kids/learning-path` response = `{student:{age_band,class_name}, goal, path[]}` with
units carrying `unit_id/unit_number/title/relation/locked/locked_reason/lessons[{lesson_id,
title, state}]` + per-unit E3f cumulative locks + below-band spillover-first ordering.
Matches spec §2.2 with **one minor drift**: spec example shows a unit-level `topic` field;
implementation omits it (no `topic` column exists — topic lives in the unit `title`, e.g.
"U10c · Intermediate Time & Watch (:15/:30/:45)"). Low severity; see F-03.

### 2.4 i18n gate
i18n vitest suite green (10 tests) — every `t()`/`tN()` key used resolves; en.ts ↔ en.json
↔ ha.json mirror enforced. New `game.labelDiagram.*`, `game.stageSequence.*`,
`student.path.*`, `gameCreator.tpl.labelDiagram/stageSequence.*`, scene-type labels all
present en+ha.

## 3. Findings

### F-01 ⚠️ `game-chain` — undocumented 10th template, backend-only, breaks hermetic/prod parity
`game-chain` appears in **no brief, no spec, no progress file, and nowhere in FE** (registry,
GameCreator, GamePlay, i18n = 0 refs). It was added to BE lists only (mtimes ~09:40-09:41Z,
after L1-BE's own last checkpoint at 09:05Z declared Phase 6 DONE; neither lane's progress
file mentions it). Consequences:
1. **Hermetic-vs-prod enum drift re-introduced** (test DBs = 10, prod elite_content = 9) —
   exactly the class of drift Phase C eliminated. A manual save `template=game-chain` would
   201 in hermetic but 500 in prod (column enum has no such value) → hidden behavioral split.
2. **Dead-end feature**: VALID_TEMPLATES advertises it; `gameConfigRules` validates it
   (`SCHEMA_GATED_TEMPLATES` + `gameChainErrors` + `game-chain.schema.json`); invariant
   exempts it — but no FE renderer exists, so any stored game-chain could never play.
3. `game-chain.schema.json` is untracked **and gitignored** (`*.json` in .gitignore) → would
   not ship even if committed (see F-02).

**MASTER DECISION 2026-09-03: KEEP `game-chain`** — leave wired in the backend and commit
as-is (schema force-added per F-02). Rationale recorded: game-chain is a teacher-built
ordered multi-round template; keeping it additive is C2-safe. Residual consequences tracked
for a later wave (NOT merge-blockers):
1. **Prod DB enum = 9 values** — `elite_content.kids_game_configs.template` needs the same
   additive 10th value (`game-chain`) via `database/fix-template-enum.js` (script already
   carries the full 10-set) before any prod teacher save of a game-chain lesson succeeds;
   until then such saves 500 at the DB layer. Do this as a MASTER+ROOT deploy step.
2. **No FE renderer for game-chain** — a stored game-chain config cannot play today. It is
   only reachable via API manual save (no GameCreator card). Spec + FE in a later wave.
3. **Hermetic(10) == model(10), prod(9)** — re-lock prod parity with item 1.

### F-02 🔴 BLOCKER (merge-prep): new schema JSON files are gitignored — will not commit
`.gitignore` line 27 = `*.json`. The **existing** `*.schema.json` files under
`game-engine/schemas/` are tracked (added before/with force-add), but the **3 new ones**
(`label-diagram.schema.json`, `stage-sequence.schema.json`, `game-chain.schema.json`) are
untracked AND ignored (`git check-ignore` confirms). A plain `git add -A` silently skips
them. They are read at runtime by `gameConfigRules.loadSchema()` (fs.readFileSync from
`game-engine/schemas/`) on every manual save of the two new templates → a fresh clone
without them 400s all label-diagram/stage-sequence saves ("No schema for template"), and
the hermetic suites that currently pass would fail on clean checkout.

**Action for MASTER at commit: `git add -f` all THREE new schema files**
```bash
git add -f game-engine/schemas/label-diagram.schema.json game-engine/schemas/stage-sequence.schema.json game-engine/schemas/game-chain.schema.json
```
(or add a negation `!game-engine/schemas/*.schema.json` after the `*.json` line).

### F-03 ℹ️ Minor — unit `topic` drift + guide copy
1. Learning-path units omit the spec's optional `topic` field (topic is in the title). If the
   FE path UI wants a separate topic chip later, add `topic` to units/seeds. Cosmetic today.
2. `docs/teacher-game-maker-guide.md` copy predates the registry work: says "One of **7**
   game types", its template table lacks Label Diagram + Stage Sequence, the scene-type
   sentence lists `intro/teach/reinforce/match`, and the Money & Time worked-example names a
   dropped "Clock Reading" game. Guide copy fixed by L3-QA this pass (see §5).

## 4. DB/seed verification (read-only, elite_content)
- `kids_game_configs.template` prod enum already widened to the 9-value set (Phase 5 ran
  fix-template-enum.js); rows: matching 51 / tap 41 / drag 46 / quiz 30 / fill 22 / puzzle 6
  / memory-pairs 3 / **label-diagram 3** / **stage-sequence 6** (207 published + 1 pending).
- `series-money-time` present with 6 units U10a–f (one topic each, unit_number 1–6, prereq
  chain) — one-game-one-topic rule honored in content.
- `kids_scene_scripts.scene_type` column exists (varchar(30) NULL) — canonical-type write OK.
- `kids_learning_goals` **not yet in prod** — auto-created at boot by `syncKidsTables()`
  (model.sync create-if-missing, additive) after deploy; hermetic DDL already has it.
  Live-smoke must confirm post-deploy creation before exercising GET/POST /kids/goals.

## 5. Copy & pedagogy pass (L3-QA, docs only)
`docs/teacher-game-maker-guide.md` updated: 7 → 9 template count; added Label Diagram +
Stage Sequence rows to the choosing-a-template table; scene types sentence now the canonical
5 (intro/teach/reinforce/recap/game checkpoint); Money & Time worked-example "Clock Reading"
cell replaced with the real template (Stage Sequence with analog-clock frames). No code
touched. Pedagogy tone check on new strings (goal card, spill-over, locked reasons, label/
stage-sequence prompts): kid-safe, no discouragement, equity OK.

## 6. Verdict
**G1–G7 code + content claims are VERIFIED on the working tree** (gates green; fail-set =
C-DEBT-01/02 only; seeds present and correct; learning-path isolation/locks/goals
server-side confirmed by b3 in-suite). **NOT merge-ready as-is** until:
1. 🔴 F-02: force-add the NEW schema files at commit — `label-diagram`, `stage-sequence`,
   **and `game-chain`** (all three are gitignored) (or add a gitignore negation).
2. ⚠️ F-01: **MASTER DECIDED 2026-09-03 — KEEP game-chain**; commit as-is. Additive prod
   DB enum widen (10th value) + FE renderer deferred to a later wave (see F-01 notes).
3. Post-merge live-smoke (G-W2, MASTER-run): teacher wizard → Test Play → submit → admin
   Preview → approve → child path (illustrated story → game → recap); Year isolation probe
   (KG1 sees zero KG2/Primary ids); old text-scene lessons still play; goals table created;
   Goal 1/1; /kids/learning-path returns a path for a real child.

**QA lane status: report written, STOPPED. Hand-off to MASTER: review F-01/F-02, then
commit+push (deploy auto-runs; workers do not self-commit).**
