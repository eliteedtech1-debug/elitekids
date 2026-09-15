# Jump-ahead checkpoints — "I already know this, let me start higher"

**Date:** 2026-09-15
**Base commit:** `5fda5ba` (deploy gate green; bridge work live in production)
**Order:** an advanced learner must be able to jump a stage by proving the
prerequisite, instead of grinding through content they already know.

## The gap this fills

The learning path was already strict and already had two of the three pieces:

| Piece | Before |
|---|---|
| Band-level placement | **existed** — `/kids/placement/*` sets the child's band by consecutive NERDC steps |
| Unit-chain locks | **existed** — `getLearningPath` locks a unit while ANY earlier unit is unfinished; a unit is done only when every lesson has a passing Test (E3f) |
| A "prove it and skip" checkpoint | **missing** — nothing let a child bypass an unfinished unit |

So an advanced learner was stuck behind a chain they could not test out of. The
placement quiz sets the *ceiling*; it does not open the chain.

## What was built

**One assessment, not one per unit.** A checkpoint covers **every unfinished unit
the subject still has up to the child's band ceiling** and, on approval, marks
those units exempt so the chain unlocks in a single step.

**Questions come from the blocking units' own published games**
(`services/checkpointAssessment.js`), one derived per lesson, at least one per
unit. A question is only derived when the game itself states a single correct
answer — `tap-recognition`, `quiz`, `matching`, `drag-sort`, `fill-in-blank`.
`game-chain` / `label-diagram` / `stage-sequence` are skipped, never guessed at.
Option counts reuse the canonical per-game bounds from `gameConfigRules`
(10, 15 for Primary).

**Integrity rules (server-side, in one pure module):**
- every unit in the chain must be probed; a unit with no answerable content
  refuses the exam rather than issuing it with a gap;
- more units than the assessment can cover → refused (`chain_too_long`), because
  skipping a foundation silently is worse than not offering the jump;
- pass = score ≥ 80% **AND** at least one correct answer in every unit. Acing
  four of five units is not a pass;
- grading always re-reads the issued set, never client data;
- a `thin` flag (fewer questions than the preferred 5) is surfaced to the
  reviewer instead of blocking a legitimately small chain.

**A pass is a recommendation, not an unlock.** `kid_progress` rows are written
with `mode='checkpoint'` — which the mastery rule
(`mode==='test' && score>=50`) deliberately does NOT accept — so an approved jump
satisfies the lock while staying visible as **tested out**, never as mastery.
Zero stars, zero XP for games the child did not play. The path reports
`state: 'tested_out'` and `exempt: true`, and the student's Home labels the card
"Tested out" instead of a green tick (and never suggests it as "Up Next").

## Who confirms — the rule, and its exceptions

**Rule:** a child cannot judge their own prerequisite, so the API refuses to let
the learner sign off. `approve` / `reject` are **admin-level**; the learner may
only attempt. An approval is refused (`409 not_eligible`) on a below-threshold
score or on a unit never answered correctly, and the endpoint re-checks the
child's band so an old assessment cannot unlock a different chain.

**Exception 1 — the self-paced flagship.** The flagship tenants have no active
teacher by design, so a passing checkpoint confirms itself, recorded as
`decided_by='self:flagship-self-paced'`, `self_approved=1`.

**Exception 2 — staff-steerable policy (school → class → child).** Staff control
who may confirm, most specific wins:

```
child  →  class  →  school  →  platform default
```

so a school can stay supervised overall and hand auto-jump to a selected child
who already works ahead, or run self-paced and hold one child back under close
monitoring. A stored scope beats the platform default **in both directions**.
Every auto-unlock is labelled by what did it — `auto:policy:child` with the
setter's id in the note, vs `self:flagship-self-paced` — so an audit trail never
reads as a teacher approval that did not happen.

**The privilege belongs to the SCHOOL, not the game.** The same lessons and game
configs are played by normal and flagship schools alike (content is shared, and
`is_global` content is visible to everyone the path covers). Nothing about the
content — its author, its school, its category — can grant the exception, and
because no human throttles attempts on an auto path, that path also closes a
failed attempt as a decline and enforces a 12-hour re-attempt cool-down
(mirroring the placement window). An unresolvable school is not self-paced, so it
**fails closed** to human confirmation.

## Surface

| Route | Who | Purpose |
|---|---|---|
| `GET /kids/checkpoint?student_id&series_id` | learner (or staff) | issue, or resume, the attempt |
| `POST /kids/checkpoint/:id/submit` | the child themself | answer; grades server-side |
| `GET /kids/checkpoint/status?student_id` | learner (or staff) | latest attempt per subject |
| `GET /kids/checkpoint/queue` | staff | submitted attempts awaiting a decision |
| `POST /kids/checkpoint/:id/approve` / `reject` | admin | confirm / decline |
| `GET /kids/checkpoint/policy?student_id` | staff | effective rule + every override in play |
| `GET /kids/checkpoint/policy/list` | staff | all overrides for the school |
| `PUT` / `DELETE /kids/checkpoint/policy` | admin | grant / clear a scope |

**UI** — learner: a "Test out of these levels" card beside the locked group on
Home, rendering the questions inline, then pending / unlocked / retry-after.
Staff: `/teacher/checkpoints` (nav: "Test-outs") with the queue, the resolve
panel and the **Auto-jump permission** panel (whole-school switch, class/child
grant, clear), plus a one-click "Allow auto-jump for this child" on any request.

## Schema (migration-only, no boot DDL)

```
kids_checkpoint_exams      (KidCheckpointExam)    — attempts, issued set, decisions
kids_checkpoint_policies   (KidCheckpointPolicy)  — child | class | school grants
```

Both bound to `KIDS_DB_NAME` and deliberately **absent from `KIDS_CONTENT_TABLES`**
so the running service never runs their DDL — per the rule that DDL is applied
separately:

```
node database/kids-checkpoint-exams-migration.js            # DRY-RUN (default)
node database/kids-checkpoint-exams-migration.js --apply    # create if missing
```

Additive only. Live dry-run: **`missing: kids_checkpoint_exams,
kids_checkpoint_policies`** — `--apply` NOT yet run (needs an explicit order).
Rollout is safe until then: a missing table degrades to "no exemptions" and "no
policy", and the checkpoint endpoints answer `503 schema_missing`. Verified live:
`Table 'elite_kids.kids_checkpoint_exams' doesn't exist` is swallowed by the path
helper, and `computeLearningPath` stays exported and functional.

`kid_progress.mode` is `STRING(20)`, not an ENUM, so `'checkpoint'` needed no DDL
change.

## Verification

| Check | Result |
|---|---|
| Full backend gate | **66/66 suites · 761/761 tests** (`team-docs/reports/gate-checkpoint-20260915T054726Z.log`) |
| New suite | `test/checkpoint-jump-ahead.test.js` — 37 assertions |
| Path-engine regression | `b3-learning-path`, `b3b-age-declaration`, `e3f-practice-test-gate` all green after the refactor |
| Frontend | `tsc` clean · 229/229 vitest · `build:staging` rc=0 (`CheckpointReviews`, `CheckpointPolicyPanel` chunks) |
| Migration dry-run | both tables reported missing in `elite_kids`; `elite_db` untouched |

The suite pins the parts that are easy to get wrong: the answer key never leaves
the server (`not.toContain('correctId')`), an unmounted route would 404 so each is
probed for 401, a perfect pass does NOT move the chain until a human confirms,
a failed attempt cannot be approved even by an admin, exempt rows are
`mode='checkpoint'` with 0 stars/XP and **no** `mode='test'` row exists, a shared
`is_global` lesson authored by the flagship is assessed identically and stays the
player's school privilege, the same content gets the same questions under a
normal and a self-paced school (deep-equal), and the policy precedence
(child > class > school > default) holds in both directions.

## Deliberate omissions

- **Not applied to live** — the migration is a production schema write; it waits
  for an explicit order (same rule as the ECCE bridge tables).
- **No publish/audit event stream** for decisions (matches the bridge review gap).
- `getUnitSuggestedMode` still uses the legacy `KidTestAttempt`/item-id model; it
  was left alone (an exemption does not break it, and changing it is a separate
  brief). `getUnitLockStatus` and `getLearningPath` both honour exemptions.
