# Q57 Gate 1 — flagship ownership rule applied (2026-09-15)

**Brief:** give `ownerForRow()` a flagship rule so the Crèche audit can build a repair
manifest for the content the platform actually authored.

**Status:** DONE. Code change + 7 specs + a read-only re-run of the inventory.
This closes **FINDING 1** of `q57-gate1-inventory-2026-09-15.md`, whose recommended next
order was exactly this.

---

## The change

`backend/scripts/inventory-creche-legacy.js` — `ownerForRow()` gains one rule, placed
**first**:

```js
if (idTokens.some((token) => token.startsWith('fp-'))) return 'flagship';
```

Tokens are `row.id`, `row.lesson_id`, `config.gameId`, `config.lessonId`, `config.series_id`
— every id shape `flagshipAnnualPilotSeed.js` generates (`fp-<band>-<term>-w<NN>-<subject>`,
`fp-series-`, `fp-unit-`, `fp-cp-`, `fp-lib-`).

**Order is the fix, not a detail.** The jolly-phonics rule matches a *category* substring
(`Letters`) and was claiming 111 flagship rows it did not author. Placing the flagship rule
after it leaves those 111 mis-attributed — proven by mutation 2 below.

`classifyRow()` already routes `owner === 'flagship'` to `owned-source-repair-candidate`
(line 246), so no other change was needed.

## Verification

**7 new specs** in `backend/test/creche-legacy-inventory.test.js` → suite **11/11 pass**:

| spec | asserts |
|---|---|
| attributes the platform's own flagship rows instead of unknown | `fp-nursery1-t1-w03-letters` + category `Letters` → `flagship` (was `jolly-phonics`) |
| routes unpublished flagship rows to owned-source repair | `content_state: 'generated'` → `owned-source-repair-candidate` |
| recognizes flagship ownership from any of its generated id shapes | `id`, `lesson_id`, `config.series_id`, `config.lessonId` |
| does not claim non-flagship rows for the flagship owner | `gc-jp-*` stays `jolly-phonics`; unmatched stays `unknown` |

**Two mutations, both caught** (file restored byte-identical, `d9010f63…`):
- delete the rule → 3 failures.
- **move the rule after jolly-phonics → 3 failures.** The precedence bug is pinned.

**Read-only re-run** (`--read-only --confirm-read-only --max-rows=1000`):

| | before | after |
|---|---|---|
| `byOwner` | `unknown: 889`, `jolly-phonics: 111` | **`flagship: 1000`** |
| scope (aggregate total) | 1085 | 1085 |

Artifact: `team-docs/reports/q57-gate1-inventory-20260915T203140Z.json`.
`limits`: `maxRows 1000`, `returnedRows 1000`, `truncated: **true**`.

---

## Two things the next reader must not mis-read

### 1. `byRepairAction` is still 100% `replacement-required-before-publication-change`

Not a regression — a **pre-existing rule, ordered deliberately ahead of owner**:

```js
if (owner === 'unknown') repairAction = 'human-review-unknown-owner';
else if (row.content_state === 'published' || row.content_state === 'approved')
  repairAction = 'replacement-required-before-publication-change';   // ← wins
else if (owner === 'flagship' || ...) repairAction = 'owned-source-repair-candidate';
```

All 1000 fetched rows are `published` (and all 1085 in scope), so **every** row is
replacement-gated regardless of owner. So:

- the repair manifest must be built from **`byOwner`** — that is what now works — *not* from
  `repairAction === 'owned-source-repair-candidate'`, which is unreachable for published rows;
- `owned-source-repair-candidate` is only reachable for **unpublished** content. If Gate 2/Phase B
  keys off that action, it will find nothing, and that is a **policy decision to make, not a bug
  to patch silently**.

### 2. Scope is 1085 but only 1000 rows are fetchable

`MAX_ROWS = 1000` is a hard cap and `DEFAULT_MAX_ROWS = 500`; the CLI has **no keyset
`--after` option** (`parseArgs` accepts only `--page-size`, `--max-rows`, `--output`). The
earlier report's recommendation to add `--after` so all 1085 are covered **was not part of
this brief and was not done** — the owner split is proven on 1000 of 1085 (85 unfetched).

## Durability caveat (important)

`backend/scripts/inventory-creche-legacy.js` and `backend/test/creche-legacy-inventory.test.js`
are both **untracked** (`??`). The fix therefore lives **only in this checkout's working tree**:
it survives `git reset --hard` here, but a clean clone gets the four-owner version back.
Committing the tool + its test is a separate order.

Related, from Q78: untracked files under `backend/test/**` **do** participate in the deploy
gate. Both new suites pass, so the next gate is unaffected.

## Files

- `backend/scripts/inventory-creche-legacy.js` — `ownerForRow()` flagship rule (**untracked file**)
- `backend/test/creche-legacy-inventory.test.js` — 7 new specs (**untracked file**)
- `team-docs/reports/q57-gate1-inventory-20260915T203140Z.json` — read-only re-run artifact

No writes to the database: the tool has no write mode (`runCli()` refuses without
`--read-only --confirm-read-only`), and every query is a `SELECT`.
