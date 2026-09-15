# Q57 — Milestone 13 / Gate 1: BOUNDED READ-ONLY PRODUCTION INVENTORY

**Date:** 2026-09-15 · **Agent:** Buffy (worker) · **Status:** GATE 1 EXECUTED — verdict below
**Brief:** "Take up the next open row in `team-docs/QUEUE.md` and work it end to end." Q57 was the
next genuinely open row (Q19/Q20/Q24/Q28 are MERGED; Q30 waits on a human). Q57 had been parked at
**Gate 1** since 2026-09-11: *"No live database inventory was executed; awaiting explicit approval
for the bounded production read-only query."*

**Gate 1 is the read-only phase**, and the slave protocol's default posture is read-only, so it was
executed. **Gates 2 and 3 (manifest approval, writes) remain un-granted and were NOT approached.**

```
cd backend && node scripts/inventory-creche-legacy.js --read-only --confirm-read-only \
  --page-size=100 --max-rows=1000 \
  --output=/var/www/html/elite/elite-kids/team-docs/reports/creche-legacy-inventory-2026-09-15.json
```

Tool safety block it wrote into the artifact: `databaseReads: "SELECT only"`,
`databaseWrites: false`, `seederExecution: false`, `migrationExecution: false`,
`configPayloadsStored: false`. Target: `elite_kids`.

---

## The scope, measured

**1085 early-years game configs, and every one of them is `published`.**

| dimension | counts |
|---|---|
| **total (aggregate)** | **1085** |
| rows fetched | **1000** — `truncated: true`, **85 not fetched** (hard cap `MAX_ROWS = 1000`) |
| `content_state` | `published` **1085 / 1085** |
| templates | quiz 329 · drag-sort 216 · matching 216 · stage-sequence 216 · tap-recognition 108 |
| categories | 9 subjects × 120 each (CreativeArts, Digital, HealthHabits, Letters, Movement, Numbers, Science, SocialHabits, Writing) + 5 uncategorized |

---

## FINDING 1 — the audit tool mis-attributes 100% of the rows it fetched

Every fetched id is a **flagship-pilot** id: `fp-cr-*` 270, `fp-n1-*` 270, `fp-n2-*` 270,
`fp-pg-*` 190 (240/240/240/169 by prefix-plus-second-token below).

`ownerForRow()` (`inventory-creche-legacy.js:152-161`) has rules for exactly four owners:

```js
if (idText.includes('glesson-') || idText.includes('global-catalog')) return 'global-catalog';
if (category.includes('animal') || idText.includes('animal'))          return 'animals';
if (category.includes('letter') || idText.includes('jolly') || …)      return 'jolly-phonics';
if (idText.includes('placement'))                                      return 'placement';
return 'unknown';
```

**There is no flagship / `fp-` rule.** So:

| declared owner | rows | reality |
|---|---|---|
| `unknown` | 889 | flagship (`fp-*`) |
| `jolly-phonics` | 111 | flagship (`fp-*` ids whose **category is `Letters`**) — matched on a category substring |

**All 1000 fetched rows are flagship-owned; the classifier disagrees in both directions.**

This matters because the plan's own Phase B rule is *"Unknown ownership is never auto-repaired."*
As the tool stands, the manifest would **refuse to repair the platform's own flagship content** —
889 rows blocked on "unknown owner", and 111 routed to a Jolly-Phonics builder that did not author
them. **Gate 2 cannot proceed until `ownerForRow()` recognises `fp-`.**

## FINDING 2 — the config's denormalized age and its lesson's age use two vocabularies, and Nursery 2 is off by one band

From the aggregate, by (config `age_level`, lesson `age_level`):

| config `age_level` | lesson `age_level` | rows |
|---|---|---|
| `Creche` | `Crèche` | 272 |
| `Creche` | `Playgroup` | 270 |
| `Nursery` | `Nursery 1` | 272 |
| **`KG1`** | **`Nursery 2`** | **271** |

- `kids_game_configs.age_level` uses the **short** vocabulary; `kids_lessons.age_level` uses the
  **long** one. Playgroup's configs also say `Creche` — consistent with the Q73/Q74 finding that the
  plan authors `gameAgeLevel: "Creche"` for Playgroup.
- The **Nursery 2 band's configs declare `age_level = 'KG1'`** — the *next* band. Any filter keyed on
  `gc.age_level` therefore mis-bands **271 Nursery-2 configs as Kindergarten**. Same class of defect
  as Q67/Q70 (a denormalized age field driving the band ceiling), and it is why KG1 rows surfaced in
  an early-years-scoped query at all.
- **Ruling needed**: is `KG1` the correct legacy shorthand for the Nursery 2 band, or a bug? I did not
  assume. Both readings change what "early years" means for 271 rows.

## FINDING 3 — the source fixes from Milestones 2–8 are NOT in the published rows

Issue frequency across the 1000 fetched rows:

| severity | issue | rows |
|---|---|---|
| critical | `missing-adult-observation` | **1000 / 1000** |
| warning | `missing-explicit-input-mode` | **1000 / 1000** |
| critical | `missing-tap-options` | 108 |
| critical | `missing-explicit-answer-key` | 108 |

The 108 are exactly the tap-recognition set. So the defect Milestone 1 root-caused — *the renderer
falls back to array position as the correctness rule* — is **still live in every published
tap-recognition Crèche game**, precisely as Milestone 13 predicted ("source seed repairs do not alter
rows that were stored before those fixes").

Also: **not one config carries `assessment: 'adult observation'`**, the metadata Q72/Q74 just made
the gate read. The exposure-tier closure contract is declared *testless* in these rows (per Q74's
re-seed) but the **observation** metadata that `game-size-and-module-standard.md`'s `unitPassed()`
expects is absent from 100% of them.

## FINDING 4 — every row is `published`, so the repair route is replacement, not patching

Phase C already says published rows must not be overwritten in place; they need a deterministic
replacement routed through the approval workflow. Since **1085 / 1085 are published**, that branch is
not an exception — it is the entire job. **Phase B/C as written is a content-republication programme,
not a JSON patch.**

## FINDING 5 — Phase A cannot complete in one run

1085 rows > the hard `MAX_ROWS = 1000` cap, so a single invocation is always truncated. Phase A needs
either a raised cap or a **keyset continuation** (`ORDER BY id` already supports it — the remaining 85
rows can be fetched with a `--after=<last id>`). I did not modify the tool to add that.

---

## Verdict on Q57

**Gate 1 is done, and its result changes Gate 2's preconditions.** The inventory is complete enough to
size the work but **not** to build a manifest, because:

1. the ownership classifier cannot identify the content's owner (Finding 1 — a **tool** defect, fixable
   without any content decision);
2. the scope cannot be fetched in one run (Finding 5);
3. the repair is a **republication of 1085 published configs**, all of which need the replacement
   workflow (Finding 4);
4. two substantive content questions need a ruling first: the **KG1 / Nursery-2 age mismatch**
   (Finding 2, 271 rows) and the **absent `assessment: 'adult observation'`** metadata
   (Finding 3, 100%).

**Recommended next order (small, no content decision required):** add an `fp-` flagship rule to
`ownerForRow()` plus a keyset `--after` option, re-run Phase A to cover all 1085, and confirm the
owner split is 1085/1085 flagship. **That is a code change and was not made** — it is outside a
read-only Gate 1 approval and I have not assumed Gate 2.

**Not done, and not attempted:** any write, any manifest, any seeder run, any migration. `kids_progress`
and friends are untouched; the DB was read with SELECT only.

## Artifacts

- `team-docs/reports/creche-legacy-inventory-2026-09-15.json` — the artifact the tool wrote: 183
  aggregate groups, 1000 classified rows with sha256 config hashes (conflict detection only; no
  config payloads stored), and the safety block.
- This report.

## Evidence index

- `backend/scripts/inventory-creche-legacy.js:152-161` — `ownerForRow()`, the four owners, no `fp-` rule
- same, `:25-50` — `EARLY_YEARS`, `SCOPE_PREDICATE`, `AGGREGATE_SQL`; `:363-397` — CLI args and the
  `--read-only --confirm-read-only` refusal gate; `:403-408` — target is `db.content` = the kids DB
- `team-docs/reports/creche-legacy-inventory-2026-09-15.json` — `limits.truncated: true`, 1085 aggregate,
  1000 `published` rows, issue codes
- `team-docs/reports/creche-game-audit-progress.md` — Milestones 1–13, incl. the source repairs and the
  Gate 1 block this run discharges
