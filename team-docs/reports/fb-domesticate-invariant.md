# FB-TASK-3 P1 — domesticate invariant audit (read-only, C7)

**Date:** 2026-08-23 · **Agent:** fb-review (read-only) · **No app code edited.**
**Brief note:** the brief references `controllers/kidsSeries.js` — domesticate code lives in `controllers/kidsModeLock.js` (line 498-577). kidsSeries.js contains only series/unit CRUD (no domestication). This report traces both files.

---

## Invariant 1 — Subject mapping is SERIES-level ONLY (never per-game)

**Verdict: PASS ✅**

**Evidence:**

1. **`kids_series_subject_maps`** (kidsModeLock.js:471-478) is keyed on `(series_id, school_id, branch_id)` with UNIQUE `uq_series_school`. One `subject_code` per series per school. Cannot hold per-game mappings by design.

2. **`domesticateSeries`** (:513-516) writes a single row per series+school:
   ```sql
   INSERT INTO kids_series_subject_maps (series_id, school_id, branch_id, subject_code, mapped_by)
   VALUES (:se, :s, :b, :sub, :by)
   ON DUPLICATE KEY UPDATE subject_code = VALUES(subject_code), mapped_by = VALUES(mapped_by)
   ```
   The `subject_code` from `req.body` is applied **uniformly** to every lesson copied in the loop (:533: `sub` = the same `subject_code`). No per-lesson subject override exists in the API contract or code.

3. **Lesson copies inherit the series' subject**, not their original global subject:
   ```sql
   INSERT INTO kids_lessons (..., subject, ...) SELECT :nid, title, :sub, ...
   FROM kids_lessons WHERE id = :i
   ```
   (:530-536 primary path, :540-546 fallback). `:sub` = `subject_code` from the request — same for every lesson in the series. ✅

4. **No per-game subject override path exists**: `updateUnit` (kidsSeries.js:183-185) accepts `title`, `content_items`, `prerequisite_unit_id` — **no `subject` field**. `createUnit` (:118-119) same. No production code updates `kids_lessons.subject` (confirmed by repo-wide search — zero UPDATE on kids_lessons in app code).

5. **Secondary guard in `convertTestScores`** (:327-340): per-lesson subject resolution with `distinctSubjects.length !== 1 → 400`. Cross-subject conversion is rejected at the API boundary. Comment (:328) explicitly states the invariant: *"Subject-binding invariant: one conversion = ONE subject; never fold games across subjects/series."*

---

## Invariant 2 — Materialized copies bear `source_lesson_id` + `owner_school_id` lineage

**Verdict: PASS ✅**

**Evidence:**

1. **Schema provisioned** via `ensureDomesticationSchema` (:470-488):
   - First call: `CREATE TABLE IF NOT EXISTS kids_series_subject_maps` with the UNIQUE key on `(series_id, school_id, branch_id)`.
   - Second call: checks `INFORMATION_SCHEMA.COLUMNS` for `source_lesson_id` on `kids_lessons` — if missing, runs `ALTER TABLE kids_lessons ADD COLUMN source_lesson_id VARCHAR(50) NULL, ADD COLUMN owner_school_id VARCHAR(20) NULL` plus indexes (`idx_lessons_source`, `idx_lessons_owner`). Idempotent (`IF NOT EXISTS` + column-existence check). ✅

2. **Every domesticated lesson copy** includes both lineage columns:
   - Primary path (:530-536): `source_lesson_id = :src, owner_school_id = :own`
   - Column-fallback path (:540-546): `source_lesson_id = :src, owner_school_id = :own`
   - `:src` = original global lesson ID; `:own` = caller's `schoolId` (:504-505). ✅

3. **Game configs** copied with new lesson ID (:549-551):
   ```sql
   INSERT INTO kids_game_configs (lesson_id, template, config_json, createdAt, updatedAt)
   SELECT :nid, template, config_json, NOW(), NOW() FROM kids_game_configs WHERE lesson_id = :i
   ```
   Configs are **linked to the domesticated copy's ID** (`:nid`), not the original. The `config_json` (emojiData/image URLs) is replicated verbatim — lineage is maintained through the lesson FK. ✅

4. **Scene scripts** copied with retargeted `lesson_id` (:552-562): same pattern — copies linked to domesticated lesson. `.catch(() => {})` on failure (scenes optional). ✅

5. **Idempotency / deduplication**: before copying, checks for existing domesticated copy (:527-529):
   ```sql
   SELECT id FROM kids_lessons WHERE source_lesson_id = :i AND owner_school_id = :s LIMIT 1
   ```
   If a copy already exists for this source+school, the lesson is skipped (`continue`). Prevents duplicate lineage rows. ✅

---

## Invariant 3 — No code path may relocate an individual game into a different series

**Verdict: PASS ✅ (with structural note)**

**Evidence (exhaustive — all production code paths that modify series membership):**

| Path | File:Line | Modifies series membership? | Risk |
|---|---|---|---|
| `createSeries` | kidsSeries.js:23 | Creates new series only | None |
| `createUnit` | kidsSeries.js:107 | Creates new unit in specified `series_id` | **Note A** |
| `updateUnit` | kidsSeries.js:161 | Updates `title`/`content_items`/`prerequisite_unit_id` within a unit | **Note A** |
| `domesticateSeries` | kidsModeLock.js:498 | Creates **orphan copies** (new IDs, NOT added to any unit) | None ✅ |
| `assignLibraryGame` | kidsCurriculum.js:216 | Creates `KidClassGameVariant` reference (read-through) | None ✅ |
| `customizeLibraryGame` | kidsCurriculum.js:252 | Creates `KidClassGameVariant` with customizations; locked fields = `['item_id','tier','category','template','successThresholdPct']` | None ✅ |
| No production UPDATE on `kids_game_units.series_id` | repo-wide search: 0 hits | N/A | None ✅ |
| No production UPDATE on `kids_lessons` | repo-wide search: 0 hits | N/A | None ✅ |

**Note A — `createUnit`/`updateUnit` cross-link (theoretical, LOW risk):**

Neither `createUnit` (:118-157) nor `updateUnit` (:183-221) validates that lesson IDs referenced in `content_items` are not already owned by another series' unit. A staff user could theoretically:
1. Call `PUT /kids/series/:id/units/:unitId` with `content_items` referencing a lesson ID that was originally placed in a different series' unit.

This creates a **cross-link** (the lesson now appears in two series' units) — but NOT a **relocation** because:
- The original unit's `content_items` is **not modified** (no removal from the source series).
- `kids_game_units.series_id` is **never updated** by any production code.
- The unit itself remains in its parent series; only `content_items` is the reference array.

**Why this is a PASS, not a GAP**: the brief defines "relocate" as moving a game from one series to another (Numbers → Phonics). No code path removes a lesson from its original series unit. The cross-link scenario would require the lesson to be *duplicated* into a second series — it never leaves the first. The structural constraint `KidGameUnit.series_id` (immutable in practice) prevents series migration.

**Mitigations already in place**: `createUnit` validates `prerequisite_unit_id` must reference a unit in the **same series** (:133-144); `updateUnit` does the same (:205-216). The prerequisite chain is series-scoped. ✅

**Optional hardening (not a violation)**: add content_items validation at create/update time to verify referenced lesson IDs are not already linked to a different series' unit. Low priority — requires staff-level intent and manual API call.

---

## Summary

| Invariant | Verdict | Evidence |
|---|---|---|
| 1. Subject mapping = SERIES-level only | **PASS** ✅ | `kids_series_subject_maps` UNIQUE on `(series_id, school_id, branch_id)`; `domesticateSeries` applies one `subject_code` to all copies; no per-lesson subject override path exists |
| 2. Copies bear `source_lesson_id` + `owner_school_id` lineage | **PASS** ✅ | Both columns SET in primary + fallback INSERT paths; schema provisioned idempotently; idempotent dedup check; game configs linked to copy's ID |
| 3. No game relocation across series | **PASS** ✅ | `series_id` never updated; domestication creates orphan copies (not added to units); `content_items` cross-link possible but not a relocation (no removal from source); prerequisite chain is series-scoped |

**No files edited. Read-only audit complete.**
