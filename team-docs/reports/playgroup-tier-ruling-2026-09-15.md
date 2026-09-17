# Ruling — Playgroup's declared test: **align the plan with the contract**

**Date:** 2026-09-15 · **Worker:** Buffy · **Status: RULED — implementation NOT applied** (needs one order)
**Question (Q73):** *keep Playgroup's declared `gamePlan.test`, or align the plan with the contract
doc's Crèche-and-Playgroup rule?* · Found while implementing Q72 (which made the declaration live).

---

## 1. The decision

**Align. Playgroup declares NO child-facing test — `gamePlan.test: null`, `assessment: "adult
observation"` — exactly as the authoring standard prescribes.**

The plan/seeder's Playgroup band is the odd one out, not the documents. The rule is written down in
**seven** places, including the framework's own unit-completion pseudocode:

| Where | What it says |
|---|---|
| `game-ready-curriculum-contract.md:69` (tier table) | Playgroup assessment = **"adult observation, not a quiz score"** |
| `game-ready-curriculum-contract.md:75` | **"For Crèche and Playgroup, adult observation is the assessment and `test` should not be surfaced."** |
| `game-ready-curriculum-contract.md:125` (§7) | **"Crèche/Playgroup: observation only"** (`independent`, `with prompt`, `emerging`, `not yet observed`) |
| `year-plan-and-game-authoring-standard.md:313` | **"For Crèche/Playgroup, set `test: null` and use `assessment: \"adult observation\"`."** |
| `year-plan-and-game-authoring-standard.md:184` | "Game surface: Tier 0–1 tap/matching with adult observation, **never a child-facing test**." |
| `year-plan-and-game-authoring-standard.md:267-268` | table: Playgroup → **"teacher observation only"** |
| `subject-game-blueprint.md:12` | Playgroup → `tap → matching → **adult observation**` |
| `game-size-and-module-standard.md:151` + §"Unit completion pseudocode" | **"For Crèche/Playgroup, use `assessment: \"adult observation\"` … do not force a child-facing Test"**, and `unitPassed()` → *"if ageBand is Creche and exposureOnly: require adult observation record, else: require passing test"* |
| `flagship-pilot-approval.md:69` | "Crèche/Playgroup use adult observation rather than a child-facing test." |
| `curriculum/playgroup/schemes/three-term-scheme.md:3` | the Playgroup scheme itself: "the game remains short, concrete and **observation-led**" |

The plan's **own** design intent agrees: Playgroup carries `gameAgeLevel: "Creche"` (its content is
authored at Crèche cognitive level) and its progression is the one-class-fits-all **ladder**, whose
declared accumulation is *"weekly games feed the learner average; the ladder unlocks as the average
rises"* — never a test.

## 2. The only argument for keeping it, and why it fails

Playgroup is one year older than Crèche (`ageBand.js`: *"1-2 → Crèche, 3 → Playgroup, 4 → Nursery 1"*),
so a scored quiz is not *absurd* the way it is for a two-year-old. But:
- every assessment document above treats **Crèche + Playgroup as one assessment group** (`Tier 0–1`,
  observation only), and the authoring standard names Playgroup **explicitly** in its `test: null`
  instruction — there is no reading of it that leaves Playgroup with a test;
- the content is already authored at Crèche level (`gameAgeLevel: "Creche"`), so the tier-1 knobs
  (4 choices, `context` prompt, `successThresholdPct: 60`) are applied to exposure games — the
  seeder even writes `assessment: 'low-stakes practical and game evidence'` for Playgroup, which is
  the tier-1 string, contradicting the standard's "use `assessment: \"adult observation\"`";
- 3 of the 10 week templates are `quiz` (`TEMPLATE_BY_WEEK`), and the seeder reuses the learning
  template for the test — so on quiz weeks a Playgroup child is served a **4-option scored quiz as
  the closure gate** for a unit whose scheme says "observation-led".

## 3. What the ruling implies (not applied — see §4)

**Root cause:** the seeder infers the *assessment mode* from `tier`, which is a *learning-difficulty*
knob — `test: band.tier === 0 ? null : { … }`, `assessment: band.tier === 0 ? 'adult observation' : …`,
`successThresholdPct: band.tier === 0 ? 0 : 60`. Playgroup is `tier: 1`, so it inherits Playgroup's
learning difficulty *and*, wrongly, Nursery's assessment.

The patch is therefore a **declared assessment per band**, not another tier hack:

1. `curriculum/00-framework/flagship-annual-pilot-plan.json` — give each band an explicit
   `"assessment": "adult observation" | "game evidence"` (or `"childFacingTest": false|true`):
   `creche` false, **`playgroup` false**, `nursery-1…primary` true.
2. `backend/src/seeders/flagshipAnnualPilotSeed.js` — read it for `gamePlan.test`,
   `assessment` and `successThresholdPct` instead of `tier === 0`, keeping `tier` for the
   learning/practice knobs it was meant for (choices, promptMode, duration, xp).
3. Re-seed (or an equivalent targeted update) — see §4.

Behaviour after that, given Q72's gate reads the declaration: a Playgroup unit closes on a
**completed play**, exactly as a Crèche unit now does. No gate code changes further.

## 4. Why this is not applied yet — the re-seed is the gate, not the edit

The gate reads **prod's** configs, and prod's 270 Playgroup games still declare a test. So:

- the edit alone changes **nothing** for a child until prod is re-seeded;
- committing the seeder edit without re-seeding makes tracked source disagree with prod in exactly
  the fields `team-docs/tools/diff-pilot-vs-prod.mjs` compares — **re-opening the Q60 drift that was
  just closed**, which is precisely what Q69 said must be an explicit order, not a silent patch;
- re-seeding touches live content rows for a pilot school (270 configs, 27 weeks × subjects).

So the ruling is recorded and the patch is ready; **applying it and re-seeding is one order**, the
same shape as Q60's reconciliation.

## 5. Also exposed by this ruling (separate, smaller decisions)

- **Choices:** the seeder gives Playgroup 4 choices; the tier table says **2–3**. Same patch site.
- **`successThresholdPct: 60` / `durationTargetSec: 120`** for Playgroup vs Crèche's `0` / `60`.
  Exposure games have no meaningful score gate; these follow the same fix.
- **The standard's closure for the exposure tier is an *adult observation record*, and that is not
  wired to the lock chain.** `unitPassed()`'s `require adult observation record` branch has no
  implementation: `kids_teacher_observations` / `POST /kids/observations` (the ECCE bridge, Q54) and
  `neutralLearningSummary` exist, but **nothing in `kidsSeries` reads them**, so observations do not
  complete a lesson or unlock a unit. Q72's "a completed play closes it" is the pragmatic
  substitute. Implementing the observation-driven closure literally is a **bigger** decision (it
  would strand Crèche/Playgroup units wherever a teacher has not recorded an observation) — raised
  here so it is a decision rather than an assumption.
- **`getUnitLockStatus` / `getUnitSuggestedMode`** would still require a pass on their legacy path
  after this change; they remain unreachable from the child (no caller in `frontend/src`). See Q72 §5.

## 6. Reproduction

```bash
grep -rn 'adult observation\|observation only\|test should not be surfaced\|no child-facing' curriculum/ --include=*.md
grep -n '"tier"' curriculum/00-framework/flagship-annual-pilot-plan.json      # playgroup → tier 1
grep -n 'requiredAfterPractice\|band.tier === 0' backend/src/seeders/flagshipAnnualPilotSeed.js
sed -n '95,110p' backend/src/seeders/flagshipAnnualPilotSeed.js              # TEMPLATE_BY_WEEK has quiz
```
