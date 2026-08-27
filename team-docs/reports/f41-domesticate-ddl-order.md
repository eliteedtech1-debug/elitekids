# FB-TASK-3 P3 — safest migration ordering to remove DDL from domesticate request path

**Date:** 2026-08-23 · **Agent:** fb-review (advisory, read-only) · **DRAFT ONLY — do not execute against prod.**

---

## Current state

`ensureDomesticationSchema` (kidsModeLock.js:470-488) runs on **every first domesticate request**:

```
Step 1: CREATE TABLE IF NOT EXISTS kids_series_subject_maps  (new table, InnoDB)
Step 2: SELECT COUNT(*) from INFORMATION_SCHEMA.COLUMNS to check if source_lesson_id exists on kids_lessons
Step 3 (if missing): ALTER TABLE kids_lessons ADD COLUMN source_lesson_id, owner_school_id, + 2 indexes
```

**Problems with request-time DDL:**
- DDL on the request path means first-call latency spike (ALTER TABLE on large kids_lessons can take seconds → lock contention).
- MySQL DDL is implicit-commit — partial failure leaves schema in intermediate state.
- Under concurrent requests, multiple calls race on the same DDL (CREATE TABLE is safe, ALTER is not).
- C2 standing-constraint violation: schema changes need explicit order, not piggybacked on a request.

## Proposed migration script

A one-time migration to be run **before** the next deploy (or at startup via a migration runner). Execute in the following exact order:

### Step 1 — `kids_series_subject_maps` (new table, no dependencies)

```sql
CREATE TABLE IF NOT EXISTS kids_series_subject_maps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  series_id VARCHAR(50) NOT NULL,
  school_id VARCHAR(20) NOT NULL,
  branch_id VARCHAR(20) NOT NULL DEFAULT '',
  subject_code VARCHAR(50) NOT NULL,
  mapped_by VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_series_school (series_id, school_id, branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Why first**: brand-new table, zero dependencies on existing data, safe to CREATE IF NOT EXISTS. No data loss risk.

### Step 2 — Nullable columns on `kids_lessons` (no data loss)

```sql
ALTER TABLE kids_lessons
  ADD COLUMN source_lesson_id VARCHAR(50) NULL AFTER is_global,
  ADD COLUMN owner_school_id VARCHAR(20) NULL AFTER source_lesson_id;
```

**Why second**: columns are nullable → existing rows receive NULL automatically → zero data loss. No backfill needed — domesticated copies populate them going forward.

**Idempotency**: wrap in `IF NOT EXISTS` via INFORMATION_SCHEMA check (same pattern as current code):

```sql
SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_lessons' AND COLUMN_NAME = 'source_lesson_id';
-- if n = 0, run the ALTER
```

**Performance note**: `ALTER TABLE kids_lessons` on large tables may lock. On MySQL 8.0+ use `ALGORITHM=INPLACE, LOCK=NONE` if the column addition is instant (nullable, no default change). Monitor with `SHOW PROCESSLIST`.

### Step 3 — Indexes on `kids_lessons` (after columns exist)

```sql
ALTER TABLE kids_lessons
  ADD INDEX idx_lessons_source (source_lesson_id),
  ADD INDEX idx_lessons_owner (owner_school_id);
```

**Why after columns**: indexes reference columns that must exist first. MySQL 8.0.29+ supports `ADD INDEX IF NOT EXISTS`; older versions need the INFORMATION_SCHEMA guard.

**Can be combined with Step 2** in a single ALTER statement (MySQL allows multiple clauses in one ALTER). Recommended for minimal lock time:

```sql
ALTER TABLE kids_lessons
  ADD COLUMN source_lesson_id VARCHAR(50) NULL AFTER is_global,
  ADD COLUMN owner_school_id VARCHAR(20) NULL AFTER source_lesson_id,
  ADD INDEX idx_lessons_source (source_lesson_id),
  ADD INDEX idx_lessons_owner (owner_school_id);
```

### Step 4 — Verify (post-migration sanity)

```sql
-- Verify columns exist
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_lessons'
  AND COLUMN_NAME IN ('source_lesson_id', 'owner_school_id');

-- Verify table exists
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_series_subject_maps';

-- Verify indexes
SHOW INDEX FROM kids_lessons WHERE Key_name IN ('idx_lessons_source', 'idx_lessons_owner');
```

## Post-migration code changes

1. **Remove `await ensureDomesticationSchema()`** from both `domesticateSeries` (:510) and `listDomestications` (:567) in kidsModeLock.js. The schema is pre-applied; no runtime DDL needed.

2. **Optional: keep `ensureDomesticationSchema` as a guarded safety net** during phased rollout:
   ```js
   // Startup migration gate — remove after full rollout
   if (process.env.RUN_DDL_MIGRATION === 'true') {
     await ensureDomesticationSchema();
   }
   ```
   This runs ONCE at boot, not per-request, and is controlled by an env flag. Remove after verifying production schema.

3. **Delete `kidsModeLock.js.bak-fb17b`** — stale backup file (found in repo, contains older version of the code).

## Rollback plan

| Action | Risk | Reversibility |
|---|---|---|
| Drop `kids_series_subject_maps` | Only used by domestication | Safe if no domestications have been published in prod |
| Drop `source_lesson_id` / `owner_school_id` columns | Only used by domestication lineage | Safe if no domesticated copies exist; `SET NULL` is the current default |
| Re-add `ensureDomesticationSchema` to request path | Restores original behavior | One-line code revert |

**Zero-risk rollback**: if migration is applied but domestication hasn't been used yet in prod, all changes are fully reversible (new empty table, nullable columns with NULL values).

## Migration ordering summary

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CREATE TABLE kids_series_subject_maps (IF NOT EXISTS)       │ ← no deps, safe first
│ 2. ALTER TABLE kids_lessons ADD COLUMN source_lesson_id,       │ ← nullable, zero data loss
│    owner_school_id + indexes (single ALTER)                    │
│ 3. Verify (INFORMATION_SCHEMA checks)                          │ ← post-migration sanity
│ 4. Deploy app code (remove ensureDomesticationSchema calls)    │ ← after DDL is live
│ 5. Clean up: remove RUN_DDL_MIGRATION flag, delete .bak file  │ ← after rollout confirmed
└─────────────────────────────────────────────────────────────────┘
```

**Key constraint**: Steps 1-3 must complete BEFORE Step 4 (app deploy). The app code currently calls `ensureDomesticationSchema` — if DDL hasn't run, the app does it at runtime (backward compatible). But once DDL is pre-applied, the runtime call is harmless (IF NOT EXISTS + column check → no-op). This means Steps 1-3 and Step 4 can be deployed in **any order** without breakage — the current code is self-healing. The advisory ordering above is for CLEANLINESS, not for correctness.

---

**No files edited. Advisory draft complete.**

---

## EXECUTION LOG — APPLIED TO PROD (2026-08-24 ~05:0xZ, supervisor go received)

- Pre-flight: maps table ABSENT, lesson cols ABSENT, 0 domestication rows -> maximum rollback safety.
- Step1 OK (CREATE IF NOT EXISTS). Steps2+3 OK single ALTER (156-row table, instant). Verify: cols+table+2 indexes all present.
- Step4 OK: both runtime callsites removed from kidsModeLock.js (:510,:584 -> comment; fn kept dormant). Backups .bak-f41.
  Probes post-restart: /health ok; domesticate unauth=401; student list-domestications=403 (requireStaff chain intact).
- Step5 OK: stale kidsModeLock.js.bak-fb17b deleted.
- NOTE: full staff-auth domesticate roundtrip still to be exercised in normal use; schema pre-applied so first call is pure DML now.
