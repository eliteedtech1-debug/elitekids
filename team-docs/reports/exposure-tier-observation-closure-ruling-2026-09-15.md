# Ruling — the exposure tier's closure stays play-driven; the observation is EVIDENCE, not a gate

**Date:** 2026-09-15 · **Worker:** Buffy · **Status: RULED — nothing wired; two preconditions named**
**Question (Q76):** *should a Crèche/Playgroup closure be an **adult observation record wired to the
lock chain**, as `game-size-and-module-standard.md`'s `unitPassed()` pseudocode says — or is
Q72's "a completed play closes it" the right mechanism?*

---

## 1. Ruling

**No — do not wire the observation record into the lock chain now.** Keep Q72's play-closure as the
**unlock** signal, treat the observation as the **evidence** it already is, and make the doc-literal
version an **opt-in policy** that ships *after* the teacher flow it depends on exists.

The pseudocode is not wrong about *what counts as mastery*; it is wrong to put that condition on the
child's next game. Concretely:

| | |
|---|---|
| **The lock chain is a pacing device, not an assessment record.** | `unitPassed()` describes mastery evidence. The platform already *records* that evidence (`kids_teacher_observations`, `neutralLearningSummary`, the portfolio) — the real defect is that the exposure tier's closure is **unverified by an adult**, and the fix for that is the observation pipeline being *used*, not the child's next unit being *hostage* to its data entry. |
| **It would strand every unit on day one, for a reason that is not the child's.** | Live `elite_kids`: **`kids_teacher_observations = 0`**, `kids_progress = 0`, `kids_test_attempts = 0`, `kids_children = 4`. Nothing has ever been observed. This is the Q69 hazard ("Crèche becomes unclosable") in its immediate form rather than a latent one. |
| **There is no way for a teacher to record one.** | `POST/GET/PATCH /kids/observations` (`kidsObservations.js`, ECCE bridge Q54) exist and are staff-only — but **no frontend file references them**: `grep -rn 'observations\|OBSERVATION' frontend/src` returns nothing. Wiring the gate would gate a child on a screen that does not exist. |
| **The doc asks for a human report, not a derived flag.** | "A teacher **records the unit as passed** when all required exposure/practice activities have been observed at the configured evidence level." That is a teacher action on a unit — a distinct feature. Silently reusing `kids_teacher_observations` rows (which carry `observation_level` ∈ independent / with_prompt / emerging / not_yet_observed *per objective*, not per unit-closure) as a lock key would be a second meaning for the same row. |

## 2. What the doc-literal version must ship WITH (if it is ever ordered)

Two preconditions, in this order — the flag must not be switchable before the first:

1. **A teacher flow to record the observation / mark the unit passed** (the missing UI over the
   existing staff endpoints). Until it exists, an observation-driven gate is a wall with no door.
2. **A per-school opt-in**, using the pattern the platform already has —
   `services/featureFlags.js` + an explicit school allow-list (`isFlagshipPilotEnabled`,
   `isSmsContextBridgeEnabled`). **No schema change is needed**; do not add a policy table for this.
   Default is OFF, and play-closure is **retained as the fallback**, so a unit can never strand even
   on an opted-in school.

Trigger to revisit — falsifiable, not a vibe: **when the pilot actually has observations**
(`kids_teacher_observations > 0` with a UI writing them) *and* the master wants adult validation to
gate progression for the youngest children. Until then, Q72 stands.

## 3. What is already true for reporting (so this ruling costs nothing)

The exposure tier's *assessment* is already recorded and surfaced where it belongs: the observation
levels (`independent`, `with_prompt`, `emerging`, `not_yet_observed`), `neutralLearningSummary`,
and the pilot configs' own `adultValidationRequired: true` + `pilot.assessment: "adult observation"`
(now correct for **both** Crèche and Playgroup — Q74). A teacher or parent reading the child's record
sees "observed / not yet observed" without the child's lock chain ever depending on it.

## 4. Reproduction

```bash
grep -rn 'unitPassed' curriculum/00-framework/game-size-and-module-standard.md     # the pseudocode
grep -rn "require adult observation record" curriculum/00-framework/game-size-and-module-standard.md
grep -rn 'observations' backend/src/routes/kids.js                                  # staff-only endpoints
grep -rn 'observations\|OBSERVATION' frontend/src                                   # …and no caller
node -e "…COUNT(*) on kids_teacher_observations…"                                   # live: 0 rows
```
