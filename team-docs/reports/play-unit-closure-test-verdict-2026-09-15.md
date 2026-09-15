# PLAY — "each unit's overview/summary game and its closure test": verdict

**Date:** 2026-09-15 · **Worker:** Buffy
**Closes:** the open TODO in `reports/play-unit-grouping-progress.md` (the brief's second
half — "surface each unit's overview/summary game and its closure test").
**Does not touch:** PLAY's subject-section rendering (Q53), which is unchanged and correct.

---

## 1. The item, and what it turned out to be

The brief asked PLAY to surface, per unit, (a) the unit's **overview/summary game** and
(b) its **closure test**. Split apart, these are two different questions with two
different answers — one is a content question, the other is a gate question:

| Half | Verdict |
|---|---|
| overview / summary game | **cannot exist as written** — no such content row is authored anywhere, in any band |
| closure test | **exists and is already surfaced** — it is the unit's own game played in `test` mode; a passing test is what closes the unit |

The earlier note in the progress report — *"There is no such row in the API; building it
literally would mean inventing a backend concept"* — was right about the *summary game*
but incomplete about the *closure test*: the closure test is not absent, it is
**declared in the content and read by nothing**. Details below, each with the query or
grep that produced it.

---

## 2. There is no overview/summary game — proven from the content inventory

A unit's games come from `kids_game_units.content_items`; the games themselves are
`kids_game_configs` rows. Every template the pilot uses, live:

```
=== kids_game_configs WHERE lesson_id LIKE 'fp-%' ===
quiz              513
matching          342
drag-sort         342
stage-sequence    342
tap-recognition   171
                 ────
                 1710
```

**There is no `summary`, `overview`, `recap` or `revision` template.** The five that
exist are the whole vocabulary (`game-engine/schemas/`), so "surface each unit's
overview/summary game" names a row that no band authors. Producing it is an **authoring
brief** — write and seed a new game type plus ~1,530 games — not a UI or API change.
(The *scene* layer does have a `recap` scene type — `TECH-SPEC-STORY-GAMES-100PCT.md` §2.1
`type: intro|teach|reinforce|recap|game_checkpoint` — but that is a scene inside a game,
not a per-unit game.)

Unit shape, live (`kids_game_units`, band code parsed from the unit id):

| band | units | games | units with a prerequisite |
|---|---:|---:|---:|
| cr Crèche | 270 | 270 | 261 |
| pg Playgroup | 270 | 270 | 261 |
| n1 Nursery 1 | 270 | 270 | 261 |
| n2 Nursery 2 | 270 | 270 | 261 |
| kg Kindergarten | 270 | 270 | 261 |
| pr Primary | 180 | 360 | 174 |

So in the five early bands **one unit is one game** — the game *is* the unit, and its
Test **is** the unit's closure. Only Primary carries two games per unit. That is the
cadence finding from the progress report, now measured against live rather than inferred.

---

## 3. The closure test DOES exist — declared per game, and read by nothing

The flagship seeder writes a closure contract into every game config
(`flagshipAnnualPilotSeed.js#baseConfig`):

```js
gamePlan: {
  learning: { template, tier, choices },
  practice: { template, tier, choices },
  test: band.tier === 0 ? null : { template, tier, choices: 4, requiredAfterPractice: true },
}
```

Live, that declaration is exactly:

```
=== config_json.gamePlan.test, flagship configs ===
band            games  test_json_null  requires_practice_first
Crèche            270         270        –
Playgroup         270           0        270
Nursery 1         270           0        270
Nursery 2         270           0        270
Kindergarten      270           0        270
Primary           360           0        360
```

> Probe note: the first run of this check reported **"0 nulls" for every band** because
> `JSON_EXTRACT(...) IS NULL` does **not** see a JSON `null` — MySQL keeps it as a JSON
> null, not SQL NULL. `JSON_TYPE(JSON_EXTRACT(...)) = 'NULL'` is the correct test. The
> wrong predicate is exactly the kind of check that reports "all good" while measuring
> nothing; the tool now uses the correct one.

**Nothing reads that declaration.** `grep -rn "gamePlan" backend/src frontend/src game-engine`
returns, besides the seeder that writes it, only `kidsLessonBridges.js#validateGamePlan`,
which is a *different* `gamePlan` (`gamePlan.components`, teacher-bridge lesson plans).
It is not validated on save, not served by `toRuntimeGameConfig`, not consulted by the
progress endpoint, and not consulted by `computeLearningPath`.

**So the closure test the brief asked for is already in the child's hands** — PLAY gives
every `has_games` card a **Test** button, and a passing test is what closes the lesson and
unlocks the next unit (the E3f gate: `lessonComplete = testPass`, `mode === 'test' && score >= 50`,
`kidsSeries.js`). For the five early bands, that one test **is** the unit's closure.

---

## 4. Two contradictions the dead declaration carries — decisions, not bugs to patch

1. **Crèche is declared testless but gated on a test.** All 270 Crèche games declare
   `test: null`, yet the implemented gate requires a **passing test** for a lesson to
   complete and the unit to unlock. Nothing blocks test mode (mode validation accepts
   `learning|practice|test`; only teacher/parent `kids_mode_locks` restrict a mode), so
   today a Crèche child can still close a unit with the test its own content says it does
   not have. **If test mode were ever blocked for tier 0, Crèche would become
   unclosable** and its chain would stall at unit 1. One of the two is wrong.
2. **`requiredAfterPractice: true` (1,440 configs) contradicts the 2026-09-04 decision**
   recorded verbatim in the gate: *"a passing TEST (score >= 50) alone completes a lesson
   and unlocks the next unit — a separate raw practice-mode row is NOT required (it was
   false-locking children who reached a passing test without a distinct archived practice
   row)."* The plan still says practice-first; the code deliberately does not.

Both are **content-contract** questions. Fixing either means editing the plan JSON +
seeder and deciding whether prod is re-seeded — i.e. it would **re-open the repo/prod
drift closed in Q60**, so it must be an explicit order, not a silent edit. Played-out
behaviour is unaffected either way.

---

## 5. Closure has never fired in production

```
kids_progress           0 rows
kids_test_attempts      0 rows
kids_mastery_progress   0 rows
kids_economy            9 rows   (streak writes only)
```

**No lesson has ever been completed in the live DB.** The E3f gate, the lock chain and
every per-unit closure claim therefore rest on the automated suites and nothing else —
and no PLAY closure change could be validated against live data, because there is none.
Worth knowing before anyone reads "the pilot is live" as "the pilot has learners".

---

## 6. Why no code change was made

- The **summary-game** half cannot be built: the content does not exist in any band, and
  inventing a row would be authoring, not engineering.
- The **closure-test** half is already surfaced at the only grain the content has: one
  closure step per game, which in the five early bands *is* the unit. PLAY already shows
  it three ways — the per-card **Test** action (the closure), the **passed** badge (this
  unit closed), and the section header's **`{done}/{total} units`** (closed units per
  subject, the aggregate the brief's "surface each unit's closure" reduces to). Adding a
  unit sub-header would put a header on a card for 270 of 270 units per subject.
- The one genuine defect in this area is the content's own stale declaration (§4), and
  that is a decision for the master, not a silent patch.

---

## 7. Reproduction

```bash
node team-docs/tools/probe-closure-test.mjs      # read-only: §2, §3, §5
node team-docs/tools/inventory-flagship-drift.mjs # unit/game counts per band
grep -rn "gamePlan" backend/src frontend/src game-engine   # §3
```

All queries are SELECTs. Nothing was written to the kids DB or the shared DB.

The scripts themselves live in `team-docs/tools/`, which `.gitignore:29` excludes by policy
("track reports & briefs, exclude tmp/logs/screenshots") — so every query that produced a
number above is quoted inline in this report and the finding is reproducible from the report
alone.
