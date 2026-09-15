# Ruling on Q69 — the closure contract is now read, not dead

**Date:** 2026-09-15 · **Worker:** Buffy · **Status: IMPLEMENTED, NOT DEPLOYED** (needs no re-seed)
**Ruling on:** Q69 (open decision since Q68) · **Brief:** *"Make `gamePlan.test` readable by the
progress endpoint so the closure contract stops being dead metadata."*

---

## 1. The ruling, in two lines

| Half | Ruling | Why |
|---|---|---|
| **(i) Does Crèche keep a closure test?** | **No — the content is right and the hard-coded gate was wrong.** A Crèche unit closes on a **completed play**, not on a passing test. | Tier 0 is *exposure*, not assessment: the authored contract says *"Crèche — tier 0 exposure, tap/reveal, **no wrong state** … **no child-facing test**"*, Playgroup+ say *"adult observation"*, §7 says *"Crèche/Playgroup: observation only … a game score never replaces the teacher's observation"*, and all 270 Crèche configs declare `gamePlan.test: null`. The seeder even sets `successThresholdPct: 0` for tier 0, so a score gate had nothing meaningful to score. |
| **(ii) Does `requiredAfterPractice` return to the gate?** | **No.** It stays *reported, never enforced*. | The 2026-09-04 decision recorded in the gate is exactly right: practice-first *"false-locked children who reached a passing test without a distinct archived practice row"*. Restoring it would re-introduce a known false lock, and it would not make Crèche closeable either way. The declared field is the thing that is wrong, not the gate. |

Both halves are **code-only** — see §4.

## 2. What was actually built

One rule, in one place, read by every gate:

`backend/src/services/closureContract.js` (new)
- `closureFor(configJson)` → `{ declared, requires_test, required_after_practice }`.
  **Only an explicit JSON `null`** `gamePlan.test` means "no child-facing test". Anything else —
  absent, `undefined`, a string, a half-written object — **fails closed** to the 2026-09-04 rule
  (passing test, score ≥ 50), so a missing contract can never quietly unlock a unit.
- `lessonStatesFromProgress(rows)` → per lesson `{ practice, testPass, played }`. `played` counts
  `learning`/`practice`/`test` only: `mode: 'checkpoint'` is a **jumped-over** game, not a play
  (kidsCheckpoints writes it with 0 stars/XP for exactly that reason).
- `isLessonComplete(state, closure)` → the gate.
- `loadClosureByLesson(db, ids)` → one batched query (no N+1).

Wired into **three** call sites, so they cannot disagree:
1. `kidsSeries#getCurriculum` (E3 chain) — `lessonComplete` now honours the declaration;
2. `kidsSeries#computeLearningPath` (shared by `/kids/learning-path` and the jump-ahead
   checkpoint) — same, and its lesson nodes now carry
   `closure: { requires_test, required_after_practice }`;
3. `kids#recordGameComplete` — **the progress endpoint reads the lesson's own config and returns
   the verdict it computed**:
   ```json
   "closure": { "declared": true, "requires_test": false, "required_after_practice": null,
                "lesson_state": "passed", "lesson_complete": true }
   ```

A testless lesson that has been played reports `state: 'passed'` — that is the client's existing
word for a *closed* lesson (`LearningPath.tsx` renders ✓ for it, ✓ for nothing else), and it keeps
`GamePlay`'s "next node" walk from looping the child back into a unit they just closed. The truth
of *why* it closed stays legible in the `closure` block (`requires_test: false`), so a UI can say
"Played" without the server pretending a test happened. An approved jump-ahead exemption is still
**never** reported as a pass.

## 3. What this changes in production, exactly

| | before | after |
|---|---|---|
| Crèche (270 lessons, tier 0) | closed only by a passing test its own content says does not exist | closes on a completed play |
| Playgroup…Primary (1,440) | passing test | **unchanged** (they declare a test) |
| every other seed (jolly phonics, global catalog, teacher-made) | passing test | **unchanged** — no declaration ⇒ fail closed |
| the "Crèche becomes unclosable if tier-0 test mode is blocked" hazard (Q69) | latent | **gone** |

No re-seed, no migration, no `gamePlan` edit: the change *reads* data the live configs already
carry, so **the repo/prod drift closed in Q60 is not re-opened**. `kids_progress` is still 0 rows
live, so nothing changes retroactively.

## 4. Verification

`backend/test/lesson-closure-contract.test.js` — **14 tests**: the contract's 10 declaration
shapes, multi-config disagreement, the `checkpoint`-is-not-a-play rule, the gate for both contract
kinds, exemption-never-a-pass, and three endpoint/gate integrations (a Crèche unit closed by one
learning-mode play on `/kids/curriculum` — which also unlocks unit 2; a declared-test lesson still
refusing to close on practice alone; a **configless** lesson still needing a pass).

**Mutation-checked, both directions, files byte-identical afterwards:**

| mutation | caught by |
|---|---|
| gate ignores the declaration (both sites reverted to `testPass`) | ✕ *"ONE learning-mode play closes the testless Crèche unit"*, ✕ *"the learning path serves the same contract"* |
| the endpoint ignores the declaration (`closure = REQUIRES_TEST`) | ✕ same Crèche test, ✕ *"the declared-test lesson is NOT closed by practice alone"* |

**Full gate: 69/69 suites · 796/796 tests, exit 0** (was 68/782 — +1 suite, +14 tests, zero
`FAIL`). The pre-existing E3f suite passes untouched, which is the regression proof that no band
without a declaration changed behaviour.

```bash
bash scripts/run-tests.sh test/lesson-closure-contract.test.js --forceExit
bash scripts/run-tests.sh --forceExit          # 69/69 · 796/796
```

## 5. Flagged, not changed

- **The declaration now contradicts the authored plan for Playgroup.** `gamePlan.test` is declared
  for **1,440** configs, and the plan gives Playgroup `tier: 1` — so Playgroup keeps a child-facing
  quiz while the contract doc says *"For Crèche **and Playgroup**, adult observation is the
  assessment and `test` should not be surfaced."* That is a **content/plan** decision (edit the
  plan + seeder → re-seed → re-opens Q60), so it is left to the master. Reading the declaration
  immediately made this visible — which is the point of the change.
- **The client still offers a Test for a testless lesson.** PLAY gives every `has_games` card a
  Test button and `GamePlay` offers the Test tab once a lesson is `practice_done`
  (`defaultModeFor('practice_done') === 'test'`). Nothing server-side blocks it (only
  teacher/parent `kids_mode_locks` can), and now the payload carries `closure.requires_test: false`
  so the UI *can* hide it. Wiring that is a frontend brief; no frontend file was touched here.
- **`requiredAfterPractice` is unenforced by ruling.** The plan still declares it for 1,440 configs
  and it is now served in every closure payload for display. If the master wants the plan to stop
  claiming practice-first, that is a plan+seeder edit **and a re-seed decision** (Q69 §ii).
- **`getUnitSuggestedMode` / `getUnitLockStatus` still require a passing test** on their legacy
  `prerequisite_unit_id` + `KidTestAttempt` path, so for a Crèche unit they can disagree with the
  live chain. Neither is reachable from the child: `frontend/src/lib/api/endpoints.ts` declares
  `LOCK_STATUS` / `SUGGESTED_MODE` but **no component calls them** (grep over `frontend/src`), and
  the child's real chain is `/kids/learning-path` + E3f. Left alone deliberately; recorded so the
  divergence is a decision, not a surprise.
- **The idempotent retry path** (`duplicate: true`) returns the stored record without the `closure`
  block — a retry of an already-recorded play, so there is nothing new to report.
- **NOT DEPLOYED.** `git push origin main` is the deploy and needs an explicit order. Live is still
  `20260915T154251Z-8b35aa5`.

## 6. Reproduction

```bash
bash scripts/run-tests.sh test/lesson-closure-contract.test.js --forceExit
# who writes the contract, and who now reads it:
grep -rn 'gamePlan' backend/src
# the declaration itself — crèche is the only tier 0, i.e. the only testless band:
grep -n '"tier"' curriculum/00-framework/flagship-annual-pilot-plan.json
```
