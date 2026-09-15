# Crèche content + placement implementation — commit so the deploy gate can pass

**Date:** 2026-09-15
**Base commit:** `535a91e` (bridge review + teacher authoring screen)
**Scope order:** commit the crèche/placement implementation the failing suites exercise; guard the
Jolly Phonics seeder entry point; then re-run the deploy.

## Why the gate was red

The gate (`.github/workflows/deploy.yml` step 1 → `scripts/run-tests.sh`) runs on a tree that CI
itself rewrites:

```
git stash create            # save WIP so it is recoverable
git reset --hard origin/main
scripts/run-tests.sh        # ← the gate
```

`git reset --hard` reverts **tracked** modifications but leaves **untracked** files alone. The
crèche/placement work was exactly that split:

| Half | State before this fix | Survives `git reset --hard`? |
|---|---|---|
| The implementation | tracked modifications to 7 files | **no** — reverted |
| The contract specs | untracked (`backend/test/*.test.js`) | yes — still run |

So the gate ran specs whose implementation had just been deleted. Locally the same tree was green
(65/65) only because the working tree still held the implementation — which is why the failure
looked like a CI-only mystery.

The wiped implementation was recoverable: stash `fa375e1478a426996a83829ea0fe4bb8ed2aa261`
(`/tmp/elitekids-local-stash-1789430141.txt`), and
`team-docs/tmp/uncommitted-tracked-20260914T235520Z.patch`.

## What this commit contains

All seven implementation files were restored byte-for-byte from that stash (no hand-retyping), then
verified. They are one coherent change: crèche content must be adult-led observation with real,
visible choices — never a reading quiz.

| File | Change |
|---|---|
| `backend/src/seeders/jollyPhonicsSeriesSeed.js` | Creche U1 tap game carries `inputMode: 'tap'`, an explicit `correctId` per item id, `rounds` built one-per-sound (`buildCrechePhonicsRounds`), plus `scenario`/`speechText`/`assessment`; **entry point guarded** |
| `backend/scripts/seed-animals-series.js` | crèche band gets concrete `scenario` + `assessment: 'adult observation'`, visual pair/quiz choices (emoji rendered as `data:` images), `fill-in-blank` excluded for crèche; exports `genConfig`, `templatesForAge`, `UNITS` |
| `backend/src/seeders/globalCatalogSeed.js` | `buildCatalogConfig()` — creche rows get `promptMode: 'context'`, `responseMode: 'image'`, `inputMode: 'tap'`, `assessment: 'adult observation'`, per-question `scenario` and emoji options; existing rows now **converge** their `config_json` on the next idempotent boot instead of only future inserts |
| `backend/src/services/contentGeneratorService.js` | CRÈCHE SAFETY CONTRACT in the AI system prompt (adult-led, no reading, no unexplained option rows), and creche `assessment`/`inputMode` stamped on generated configs |
| `backend/src/controllers/kids.js` | `toRuntimeGameConfig()` preserves `id` on adapted `assets.objects` and **keeps an explicit `correctId`** instead of falling back to array position; exported for the contract test |
| `backend/src/controllers/kidsPlacement.js` | Playgroup fixture no longer asks for audio it cannot play: `Look at the pictures. Which one shows a loud drum?` with the `drum` option present |
| `frontend/src/pages/Student/GamePlay.tsx` | `TapGame` renders the `rounds[]` format (one round per sound, per-round `correctId`, ids preserved), the consumer half of the same contract |

**Test suites promoted from untracked to tracked** — they are the specs for the above and were the
reason the gate could go red in the first place:

- `backend/test/jolly-phonics-creche-contract.test.js`
- `backend/test/tap-recognition-contract.test.js`
- `backend/test/placement-content-contract.test.js`
- `backend/test/creche-content-contract.test.js`

## The Jolly Phonics entry-point guard

Brief: *a unit test must never trigger seeding or `process.exit`.*

Before, the file ended in a bare IIFE, so **merely `require()`ing it started a seed and called
`process.exit`** — and `process.exit` inside a jest worker kills the whole run before the summary.
The old failure text was exactly that: the full suite reported a DB-path `process.exit(1)` instead
of a test failure.

```js
// before
(async () => { ... process.exit(0) ... process.exit(1) ... })();

// after
if (require.main === module) (async () => { ... })();
module.exports = { UNITS, buildConfig, buildCrechePhonicsRounds };
```

Matches the convention already used by `moneyTimeBridgeSeed.js` and `flagshipAnnualPilotSeed.js`
(the same guard `scripts/seed-animals-series.js` uses).

## Evidence (all re-run on this commit)

| Check | Result |
|---|---|
| Full backend gate (`scripts/run-tests.sh --forceExit`) | **65/65 suites, 724/724 tests**, rc=0 — log `team-docs/reports/gate-creche-placement-20260915T051544Z.log` |
| `require()` the seeder, no seeding, no exit | `exports: UNITS, buildConfig, buildCrechePhonicsRounds` · `UNITS: 5` · u1 tap `rounds: 6`, `inputMode: tap`, `correctId: s` · **exit=0** |
| Frontend typecheck | `tsc --noEmit` clean |
| Frontend tests | 20 files, **229/229 passed** |
| Frontend production build | `npm run build:staging` rc=0 · `GamePlay-7e1E9_aW.js 157.57 kB` · `guard:compat-css passed — 194.3KB, 0 modern-only features` |
| Syntax | `node --check` on all four backend files |

## Still untracked after this commit (deliberately)

- `backend/test/creche-legacy-inventory.test.js` + `backend/scripts/inventory-creche-legacy.js` —
  a legacy-inventory audit, a different concern; it passes either way, but committing the suite
  without its script would make it fail on a fresh clone, so both stay out of scope here.
- `backend/.env.kids.example`, the `curriculum/**` and `team-docs/**` additions — other tracks.
- The flagship-pilot track (`flagshipAnnualPilotSeed.js` + its test) is green in its committed form
  and was left untouched rather than half-adopted.
- `backend/src/seeders/animalsNumbersExpansionSeed.js` still has an unguarded `process.exit` at its
  foot. Nothing requires it today, so it is latent rather than live, but it is the same defect class
  the Jolly Phonics guard fixes — flagged, not changed (out of the dispatched scope).
