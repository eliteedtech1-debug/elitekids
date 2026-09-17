# Deploy gate — ECCE bridge push (2026-09-14)

**Brief:** push the ECCE bridge commits to `main` and watch the deploy gate finish.

**Result: pushed, and the gate FAILED at step 1 of 4.** Nothing was published.

```
To https://github.com/eliteedtech1-debug/elitekids.git
   65d86e3..535a91e  main -> main

commits  535a91e  feat(ecce): review/publish/recall + teacher authoring screen
         0176bdc  fix(ecce): bind bridge models to the kids DB, mount the bridge
                  routes, apply the playable-item contract
```

## The failure

`/tmp/elitekids-backend-gate-20260914T235548Z.log`:

```
FAIL test/jolly-phonics-creche-contract.test.js
FAIL test/tap-recognition-contract.test.js
```

No `Test Suites:` summary line — the run ended early, and the log also carries
`❌ Seed failed: Encoding not recognized: 'cesu8'` with
`● process.exit called with "1"` at `src/seeders/jollyPhonicsSeriesSeed.js`.

The workflow stops on a failed gate, so **step 1 never completed**: no backend
service restart, no nginx step, no frontend publish, no external verify.

## Root cause — the gate no longer sees uncommitted work

Step 1 of the workflow is:

```
git stash create            → the local edits are saved as a stash commit
git reset --hard origin/main → the tree is replaced by what is on main
bash ../scripts/run-tests.sh --forceExit   ← the gate runs HERE
```

So from the moment the checkout is reset, the gate evaluates **only committed
code**. Two of the test files in the tree are untracked (they survive the reset)
and they exercise code that only ever existed as *uncommitted* working-tree
changes:

| Suite | Requires | Why it fails on committed code |
|---|---|---|
| `test/jolly-phonics-creche-contract.test.js` | `{ UNITS, buildConfig }` from `src/seeders/jollyPhonicsSeriesSeed.js` | The crèche seeder work added those exports; the committed seeder does not have them |
| `test/tap-recognition-contract.test.js` | `{ toRuntimeGameConfig }` from `src/controllers/kids.js` | The runtime-config adapter exists only in the uncommitted controller change |

Reproduced on the clean tree exactly as CI sees it:

```
✕ preserves object ids and correctId when adapting assets format
✕ does not replace an explicit answer key with array position
✕ builds one explicit ID-based round per sound
TypeError: toRuntimeGameConfig is not a function
TypeError: Cannot read properties of undefined (reading 'find')
Test Suites: 2 failed, 2 total
```

**Why the gate looked green earlier today.** The fix applied for this same suite
on 2026-09-14 was to *restore the pre-reset working tree* (the stash the workflow
had preserved). That made the whole suite pass locally — 65/65, 726/726 — but it
never put the implementation on `main`, because it belongs to the crèche and
placement tracks rather than to the ECCE bridge brief. A working tree is not a
deployable artefact: with reset-then-test ordering, anything uncommitted is
invisible to the gate.

Second, smaller defect the same run exposes: the full suite loads
`src/seeders/jollyPhonicsSeriesSeed.js`, and in that context its bottom-of-file
`process.exit(1)` fired on a failed DB connection — which **kills the jest run
before it can print a summary**. A unit test must not be able to trigger seeding.

## Impact

| | |
|---|---|
| Frontend | **not** deployed. Site still serves `releases/20260914T232452Z-fbc021a` — `curl → 200` |
| Backend | `/health` → 200; the git reset changed files only |
| Live checkout | now clean at `535a91e`; the wiped edits are recoverable |

Recovery of the stashed edits (created by that CI run):

```
/tmp/elitekids-local-stash-1789430141.txt → fa375e1478a426996a83829ea0fe4bb8ed2aa261
git checkout fa375e14 -- <paths>      # or: git stash apply fa375e14
```

A plain-text dump also exists from before the push:
`team-docs/tmp/uncommitted-tracked-20260914T235520Z.patch` (1754 lines) plus
`team-docs/tmp/untracked-20260914T235520Z.txt` (44 paths).

## What it takes to make the gate green

Either:

1. **Commit the implementation those two suites exercise** — the crèche seeder
   exports (`UNITS`, `buildConfig`) and the `toRuntimeGameConfig` adapter in the
   kids controller, i.e. the crèche/placement WIP that is currently only in the
   stash. This is the honest fix: the tests describe real behaviour that is not on
   `main`; or
2. **Remove/guard the two suites** if that work is not ready to land.

Plus, independently: make the seeder impossible to run from a test —
`if (require.main === module)` around its entry point — so a unit test can never
open a production-shaped DB connection or call `process.exit`, and the gate always
prints its summary.

Until one of those lands, **no push can deploy**: the gate fails before it reaches
the frontend step.
