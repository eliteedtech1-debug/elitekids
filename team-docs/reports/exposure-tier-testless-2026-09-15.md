# The exposure tier is testless — in the plan, in prod, and in the UI

**Date:** 2026-09-15 · **Worker:** Buffy · **Status: DONE — PROD RE-SEEDED, NOT DEPLOYED (code)**
**Implements:** the Q73 ruling (align Playgroup with the contract) and the Q69/Q72 closure contract,
end to end. **Touches production data** (§4) — `elite_kids.kids_game_configs`, 270 rows.

---

## 1. What was wrong (one line)

The seeder inferred the **assessment mode** from `tier` — a *learning-difficulty* knob — so Playgroup
(`tier: 1`) was written a child-facing 4-option quiz test with a score gate, while four framework
documents say the exposure tier is observation-led and must declare `test: null` (Q73 §1).

## 2. The change — the mode is now DECLARED per band

**`curriculum/00-framework/flagship-annual-pilot-plan.json`** — every band declares its assessment,
next to its tier:

| band | tier | `assessment` |
|---|---|---|
| creche | 0 | `adult observation` |
| **playgroup** | **1** | **`adult observation`** ← was implicitly test-led |
| nursery-1 / nursery-2 / kindergarten / primary | 1 / 2 / 2 / 3 | `low-stakes practical and game evidence` |

**`backend/src/seeders/flagshipAnnualPilotSeed.js`** — `assessmentModeForBand(band)` reads it, and
`baseConfig` now derives three fields from it instead of `band.tier === 0`:

- `gamePlan.test` → `null` for the observation-led tier (the closure contract the gate reads),
- `pilot.assessment` → `adult observation` (was the tier-1 string for Playgroup),
- `successThresholdPct` → `0` (an observation-led unit has no score gate to pass).

`durationTargetSec` is deliberately left on `tier` (it is a *planning target*, and the docs say so).

**Validation now enforces both halves**, so neither can silently spread: a band that does not declare
a mode fails loudly, every observation-led config must be `test: null` + `adult observation` + no score
gate, and **every other config must still declare a child-facing test**.

## 3. The UI — a testless lesson is never offered a Test

`GET /kids/learning-path` already serves each lesson's closure (Q72). Now the client uses it:

- `lib/utils/learningPath.ts` — `LessonClosure` on `PathLesson`, plus
  `lessonRequiresTest(lesson)`, **fail-closed** (only an explicit `requires_test === false` hides the
  Test; an unknown lesson keeps it).
- `StudentHome.tsx` → `lessonLock` carries `requiresTest` onto every PLAY card.
- `PlayTab.tsx` — the per-card **Test** action renders only when `requiresTest !== false`; the card
  keeps Learn and Practice.
- `GamePlay.tsx` — the Test **tab** is hidden (`ownRequiresTest === false`), a stale `?mode=test` link
  is coerced to `practice`, and the “practice → Test →” next-action CTA is suppressed. Staff and
  preview sessions still see Test (unchanged).

## 4. The production re-seed (the part that touches live rows)

Run in this order, each step verified before the next:

1. **Snapshot (read-only).** `team-docs/tools/snapshot-playgroup-closure.mjs` → pre-seed state:
   `Crèche 270 testless / 0 with test`, `Playgroup 270 with test / 0 testless`.
   Artifact: `reports/playgroup-closure-snapshot-20260915T183938Z.json` (**rollback source**).
2. **Pre-flight diff.** `team-docs/tools/diff-pilot-vs-prod.mjs` → **exactly 270 mismatches, all
   `kids_game_configs.config_json`**, every other table and every other field `identical`. This is the
   proof the write's blast radius was the 270 Playgroup configs and nothing else.
3. **Re-seed.** `node src/seeders/flagshipAnnualPilotSeed.js --confirm` → *“seeded: 1710 games in
   published state”*, counts unchanged (1710/1710/1530/51/1710/1710).
4. **Verify.** diff tool → **`IN SYNC — tracked source reproduces prod`** (the Q60 drift stays closed,
   now with both sides agreeing that Playgroup is testless). Snapshot again →
   `Crèche 270/270 testless`, `Playgroup 270/270 testless`, `0 with test`.

**Rollback, if it is ever needed:** revert the two source edits and re-run `--confirm` (source is the
authority for these rows), or restore the three fields from the snapshot artifact. Nothing else reads
or writes them.

## 5. Verification

- **Backend gate: 69/69 suites · 799/799 tests, exit 0** (+3 tests over Q72's 796). `node
  src/seeders/flagshipAnnualPilotSeed.js --dry-run` → `valid: true, errors: 0`, counts unchanged.
- New seed tests: the per-band table is asserted band by band; **540 configs are testless** (270 Crèche
  + 270 Playgroup) and every other band still declares `{ choices: 4, requiredAfterPractice: true }`
  with a 60% gate; a band that drops its `assessment` fails validation.
- **Frontend: `tsc` clean · vitest 280/280 · `build:staging` + compat-css guard green.** New tests:
  `lessonRequiresTest` (incl. the fail-closed cases) and a **call-site contract** that PLAY gates its
  card Test on `requiresTest !== false` and that GamePlay gates/coerces on `ownRequiresTest`.
- **Mutation-checked:** removing the PlayTab guard fails the call-site test; file byte-identical after.

## 6. Flagged, not changed

- **Playgroup keeps `tier: 1`** for its *learning* knobs, so its games still offer **4 choices** where
  `game-ready-curriculum-contract.md` §3 says **2–3**. Same patch site, different decision (that is a
  difficulty knob, not an assessment one) — left alone so this change stays exactly as ruled.
- **`durationTargetSec`** for Playgroup is still 120 (Crèche uses 60). Planning target only.
- **The UI hides a Test; nothing server-side blocks test MODE.** A crafted request can still POST a
  `mode: 'test'` progress row for a testless lesson; it closes the lesson either way, so nothing
  unlocks that should not. Blocking the mode outright would need `kids_mode_locks`-style enforcement —
  not ordered, not done.
- **NOT DEPLOYED.** The re-seed changed **production data**; the *code* that hides the Test and the
  seeder/plan edits are committed-in-tree only. `git push origin main` is the deploy and needs an
  explicit order. Live release is still `20260915T154251Z-8b35aa5`, so for now a Crèche/Playgroup
  child is still *offered* a Test it no longer owes — and the deployed gate, which does not read the
  declaration yet, still *demands* it.

## 7. Reproduction

```bash
node team-docs/tools/snapshot-playgroup-closure.mjs     # read-only: exposure-band closure fields
node team-docs/tools/diff-pilot-vs-prod.mjs             # read-only: must print IN SYNC
cd backend && node src/seeders/flagshipAnnualPilotSeed.js --dry-run   # validation only
bash scripts/run-tests.sh test/flagship-annual-pilot-seed.test.js --forceExit
cd ../frontend && npx vitest run src/lib/utils/learningPath.test.ts
```
