# S8-FB2 — Animals/Numbers U5-U10 Content Verification (Q15)

**Role:** fb-review (read-only) — no writes made.
**Date:** 2026-09-02
**Method:** read-only SQL against live `elite_content` DB on VPS (62.72.0.209, user
`elite`) + static review of the committed seed `backend/src/seeders/animalsNumbersExpansionSeed.js`.

---

## Live DB state (verified, read-only)

Tables: `kids_game_series`, `kids_game_units`, `kids_lessons`, `kids_game_configs`,
`kids_curriculum_points`. All queries used `SELECT` only.

**Series where U5-U10 content lives (UUID-based, NOT the seed's string ids):**

| Series | id | Cat |
|--------|----|-----|
| Animals — Nigerian Farm & Wild | `eb386a93-6843-4928-9b75-59a1d17d613a` | Animals |
| Number Sense Gym | `766a9eb2-2744-412c-87bc-d0ee54c4c256` | Numbers |

### Numbers U5-U10 — PASS
- 6 units (unit_numbers 5–10), prereq chain intact (5→NULL, 6→5 … 10→9).
- **3 published games per unit**, every game ≥5 items:

| Unit | Games (template:count) |
|------|------------------------|
| U5 | tap:10, match:5, sort:10 |
| U6 | quiz:5, match:5, sort:5 |
| U7 | quiz:5, match:5, fib:5 |
| U8 | quiz:5, match:5, sort:5 |
| U9 | quiz:5, match:5, sort:5 |
| U10 | quiz:5, match:5, sort:5 |

- All referenced lessons exist and are `content_state='published'`.
- 5 quiz configs: correctIndex all in-range, no duplicate option labels.

### Animals U9-U10 — PASS (scope-adjusted)
- Series already had U1–U8 (UUID units, Nigerian farm/wild curriculum). The expansion
  added **U9–U10 only** (matching the "Animals U9-U10" plan, not the seed's full U5-U10).

| Unit | Games |
|------|-------|
| U9 | tap:6, quiz:5, match:5 |
| U10 | tap:6, quiz:5, sort:5 |

- All lessons published; quiz correctIndex in-range; no duplicate options (2 quiz configs).
- **No current duplicate unit_numbers** in the Animals series (U5–U8 exist only as UUID).

### Curriculum points — PASS
- 24 rows referencing seeded item ids (1 per seeded game: 6 Animals U9/U10 + 18 Numbers).

### Series→subject map — NOTE
- `kids_series_subject_maps` is **globally empty** (no rows for any series). Not specific
  to this content; subject routing for these series may be resolved server-side or unused
  in this DB. Flag if subject filtering is expected to gate the ladder.

---

## Finding — seed file does NOT match live DB (GAP)

`backend/src/seeders/animalsNumbersExpansionSeed.js` hard-codes **string PKs**:

- Series ids `series-animals`, `series-numbers` — **absent** from `kids_game_series`.
- Unit ids `unit-animals-u5..u10`, `unit-numbers-u5..u10`; only `unit-numbers-u*` and
  `unit-animals-u9/u10` exist live, and *only* the numbers ones + animals-u9/u10 landed.
- Config/lesson ids `gc-series-animals-u9-tap` / `l-…` — **absent**; live uses real UUIDs
  (`gc-eb386a93-…-u9-tap`, `l-766a9eb2-…-u5-tap`).

Consequences if the committed seed is (re)run against prod:
1. Upserts a phantom `series-animals` + `series-numbers` (never seen live).
2. Would insert `unit-animals-u5..u8` string units → **duplicate unit_number 5-8** in the
   Animals series (already occupied by UUID units) → ladder ambiguity.
3. Seed's final log claims "36 new lessons"; only **24** landed live (Animals U5-U8 were
   intentionally omitted — already existed).

**Verdict:** the seed source-of-truth was superseded by a UUID-remapped run that landed
24 units (Animals U9/U10 + Numbers U5-U10). The committed file should be reconciled
(target the real UUIDs, and gate Animals to U9-U10) or clearly marked superseded/stale.

---

## Verdict Summary

| Requirement | Verdict |
|-------------|---------|
| Numbers U5-U10 present, 3 games × ≥5 items, published | **PASS** |
| Animals U5-U10 present (as seeded) — only U9-U10 landed | **PARTIAL/GAP (scope drift from seed file)** |
| No duplicate unit_numbers in a series | **PASS** (current DB) |
| Quiz correctIndex integrity + no dup options | **PASS** (7/7 configs) |
| Lessons published & linked | **PASS** |
| Curriculum points per game | **PASS** (24) |
| Seed script matches live DB | **GAP** — string PKs vs UUID, phantom series, dup-if-rerun |
| Series→subject map present | **NOTE** — table globally empty |

## Recommended follow-up (worker, not applied here)
1. Reconcile `animalsNumbersExpansionSeed.js` to target the real UUID series ids and seed
   only Animals U9-U10 (not U5-U8), or annotate it as snapshot-only.
2. Confirm `series→subject` mapping is intentionally not used in this DB.
# S8-FB2 content verification (Q15) — progress
2026-09-02T19:21:57Z [COMPLETE] Report: team-docs/reports/s8-fb2-content-verification.md
- Verified read-only live elite_content on VPS (62.72.0.209).
- Numbers U5-U10: PASS (6 units x 3 published games, all >=5 items, prereq chain ok).
- Animals U9-U10: PASS (2 units added, 3 games each published). Animals U5-U8 NOT seeded (pre-existing).
- Quiz integrity: 7/7 configs correctIndex in-range, no dup options.
- Curriculum points: 24 (one per seeded game). Lessons all published.
- GAP: committed seed uses string PKs (series-animals, gc-series-*) NOT in DB; live uses UUIDs. Rerunning seed would dup Animals U5-U8 + create phantom series. Only 24 of claimed 36 games landed.
- NOTE: kids_series_subject_maps globally empty. QUEUE Q15 -> DONE.

