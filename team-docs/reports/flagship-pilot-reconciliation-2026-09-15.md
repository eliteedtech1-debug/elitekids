# Flagship pilot reconciliation — tracked source vs the served catalog (2026-09-15)

**Status: reconciled and verified. `team-docs/tools/diff-pilot-vs-prod.mjs` prints `IN SYNC`.**
Gate 67/67 suites · 772/772 tests. Banked locally; not deployed (source-only change).

Closes **Q60**. Supersedes the *"prod content is not reproducible from tracked source"* warning
in `team-docs/QUEUE.md` and the "1350 rows" figures in `PROJECT_STATE.md`, `curriculum/README.md`
and `curriculum/00-framework/year-plan-and-game-authoring-standard.md`.

---

## 1. What prod actually serves

Read-only inventory of `elite_kids` (`team-docs/tools/inventory-flagship-drift.mjs`):

| | fp- lessons | series | units | games/unit |
|---|---:|---:|---:|---:|
| Crèche | 270 | 9 | 270 | 1 |
| Playgroup | 270 | 9 | 270 | 1 |
| Nursery 1 | 270 | 9 | 270 | 1 |
| Nursery 2 | 270 | 9 | 270 | 1 |
| Kindergarten | 270 | 9 | 270 | 1 |
| **Primary** | **360** | **6** | **180** | **2** |
| **total** | **1,710** | **51** | **1,530** | |

Plus 8 `GLESSON-*` rows (`globalCatalogSeed`, RANK0–RANK3) = the **1,718** published global lessons
the PLAY walks measured, and the "path-less" group of 8 in the PLAY grid.

All 1,710 pilot rows are `published` — no `pending_human_review` rows remain.

## 2. What the tracked source produced

`git show HEAD:backend/src/seeders/flagshipAnnualPilotSeed.js` and the plan JSON at HEAD:
**5 bands, 9 subjects, 1 game/unit → 1,350 lessons, 45 series, 1,350 units, `pending_human_review`.**

The drift was therefore:

1. **A whole band missing** — `primary` (360 lessons, 6 series, 180 units) existed only in the DB.
2. **A second game per week rule** — Primary units hold two `content_items` (slots 1 and 2, ids suffixed `-s2`).
3. **The published posture** — prod published everything; tracked code wrote `pending_human_review`.
4. **The lesson text** — prod ends `"Actively tested and validated for the 2026/2027 pilot."`, tracked code wrote `"Adult validation is required before child use."`.
5. **Playgroup's pedagogy ladder** — 270 Playgroup configs carry a `pedagogy` block; tracked code had none.
6. **`content_items` shape** — every unit (including early-years) carries an explicit `slot`.

## 3. Root cause of the drift

Not a merge accident and not a schema mismatch. `git log -S'fp-pr-' --all` and
`git log -S'primarySubjects' --all` are **empty**: no commit on any branch ever contained the Primary
work. The 2026-09-10 report (`team-docs/reports/band-count-progress.md`, itself untracked) records it
as done, including a `--confirm` production seed that published 1,710 games.

The deploy workflow runs `git stash create` + **`git reset --hard origin/main`** in this same
checkout (step 1 of `.github/workflows/deploy.yml`). Uncommitted work in the working tree is
therefore destroyed by the next deploy. The DB kept the seeded rows; the source vanished.

**Three fragments survived**, which is what made the drift look like an inconsistency rather than a
disappearance:

- `gameConfigRules.js` — `PLAYABLE_ITEM_MAX_PRIMARY = 15` + `playableItemCap()` (landed later, in
  `0176bdc`). The tracked validator already expected a Primary band at 15 items.
- `curriculum/00-framework/game-size-and-module-standard.md` — documents the Primary 5–15 exception
  and "two games per subject per week".
- `backend/src/controllers/kidsLessonBridges.js` — a comment referencing the same range.

## 4. The reconciliation (source-side only — no production writes)

| File | Change |
|---|---|
| `curriculum/00-framework/flagship-annual-pilot-plan.json` | `primarySubjects` (6 NERDC primary subjects with codes + emoji), the `primary` band entry (tier 3, 6 objectives, `gamesPerWeek: 2`, `itemsPerGame: 15`), a `ladder` block on Playgroup and Primary (levels, ramp, rewards, XP-penalty thresholds), and a new `publication` block owning the content state, approval stamp and lesson-text suffix |
| `backend/src/seeders/flagshipAnnualPilotSeed.js` | `subjectsForBand()`, per-band `gamesPerWeek`/`itemsPerGame`, the slot loop with the **week+5 second-template** rule, `pedagogyFor()` (6-level ramp + domain rotation + XP penalties), 15-item Primary labels (rotating 15-keyword lists, non-wrapping numeracy ladder), `slot`-carrying `content_items`, published state + approval stamp, and validation for all of it |
| `game-engine/schemas/quiz.schema.json`, `stage-sequence.schema.json` | `maxItems` 10 → **15** (questions, steps, assessment). `validateManualConfig` runs ajv against these, so the tracked `PLAYABLE_ITEM_MAX_PRIMARY = 15` contract was previously unimplementable — 15-item Primary configs failed validation. The per-band 10 cap is still enforced by `playableItemCap` |
| `backend/test/flagship-annual-pilot-seed.test.js` | 3 → 8 tests locking the reconciled contract (counts, Primary slots, the week+5 pairing, the ladder ramp incl. Playgroup's caps, 15 vs 5 items, the served lesson text, the published posture) |
| `backend/src/index.js` | boot log now reports the state from `PLAN.publication` instead of hard-coding `pending_human_review` |
| `curriculum/README.md`, `curriculum/00-framework/year-plan-and-game-authoring-standard.md`, `PROJECT_STATE.md` | the 5-class/1,350-row coverage claims, the Primary band row, and the pending-vs-published handover text |

Facts derived from the served rows rather than guessed (all verified before encoding):

- **Pedagogy level** = `ceil(unit_number / 5)`, capped at 6.
- **`domainOfKnowledge`** = `['cognitive','psychomotor','affective'][(week-1 + slot-1) % 3]` — fits all 60 Primary and all 30 Playgroup games.
- **Second-game template** = the template of the week five ahead, wrapping in the term (w1 pairs tap-recognition/quiz; w6 pairs quiz/tap-recognition).
- **Primary labels**: 15 rotating keywords per subject (start = `shift × 5 mod 15`); numeracy **never wraps** (1–15, 16–30, … 88–102), while early-years numeracy wraps at 3/5/5/10/20.
- **Playgroup is age-capped**: never `high` load, never `generalization`, `xpPenaltyOnWrong = 0`. Primary penalises 5 XP from level 3.
- **`weeklyGame`** = the week's slot (1 or 2), not the unit.

## 5. Verification

`team-docs/tools/diff-pilot-vs-prod.mjs` builds the rows in memory from the seeder and compares them
to `elite_kids` field by field across all six pilot tables (timestamps compared by presence only):

```
kids_lessons (fp-)           source=1710 prod=1710  onlyInSource=0 onlyInProd=0   fields: identical
kids_game_configs (fp-)      source=1710 prod=1710  onlyInSource=0 onlyInProd=0   fields: identical
kids_game_units (fp-)        source=1530 prod=1530  onlyInSource=0 onlyInProd=0   fields: identical
kids_game_series (fp-)       source=51   prod=51    onlyInSource=0 onlyInProd=0   fields: identical
kids_curriculum_points (fp-) source=1710 prod=1710  onlyInSource=0 onlyInProd=0   fields: identical
kids_library_games (fp-)     source=1710 prod=1710  onlyInSource=0 onlyInProd=0   fields: identical
IN SYNC — tracked source reproduces prod
```

This is deep, not just counts: `config_json` is compared as fully-sorted JSON, so every item label,
baked SVG asset, question, step, pedagogy value and template must match.

The seeder also validates cleanly on its own: `node src/seeders/flagshipAnnualPilotSeed.js --dry-run`
→ `valid: true, errors: []`, `{bands: 6, subjects: 9, primarySubjects: 6, terms: 3, weeksPerTerm: 10,
games: 1710, series: 51, units: 1530, curriculumPoints: 1710, libraryGames: 1710}`.

One bug found in my own first attempt — `NUMERACY_CEILING_BY_BAND[bandId] || 5` collapsed Primary's
deliberate `null` ("no ceiling") back into 5, which wrapped its numbers 1–15, 1–15… instead of
1–15, 16–30… The diff tool caught it as 59 mismatching configs; the fix is a `hasOwnProperty` check.
Worth noting because it is exactly the class of error a count-only check would have missed.

## 6. What this does and does not do

- **No production writes.** Nothing was seeded, updated or re-run; the reconciliation is source-side.
  The DB is the source of truth and the plan now describes it.
- **Does not restore the approval gate.** The pilot is published directly, per the 2026-09-10 user
  directive. That is now explicit and single-sourced in `PLAN.publication`, so re-introducing adult
  review is a one-line plan change — but it is a product decision, not a defect this task fixed.
- **Does not touch the 8 `GLESSON-*` rows.** They come from the tracked `globalCatalogSeed`, so they
  were never part of the drift.
- **Not deployed.** This is source-only; `git push origin main` would trigger a full gate + publish
  for a change that alters no served row.
