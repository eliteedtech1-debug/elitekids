# Q78 — `database/migrate.js` REPAIRED (and a deploy incident it exposed)

**Date:** 2026-09-15 · **Agent:** Buffy (worker) · **Status:** REPAIRED + VERIFIED · **NOT COMMITTED**
**Brief:** "Repair the broken migration runner so it can plan and apply again, routing kids-owned
columns to the kids DB and adding a test."

---

## 1. The repair

Two independent defects, fixed together (fixing one alone restores the other).

### Defect A — the runner could not run at all
`addContentColumns` was referenced at **seven** places (`232, 235, 242, 243, 244, 323, 331`) and
**declared nowhere**, while `CONTENT_COLUMN_PLAN` was never consumed. `node database/migrate.js`
threw `ReferenceError: addContentColumns is not defined` **before it printed a plan** — in dry-run and
`--apply` alike. It could neither plan nor apply anything.

### Defect B — the plan mixed owners, so its ALTERs had no valid target
`COLUMN_PLAN` held `school_setup` alongside `kids_lessons` / `kids_game_configs`, while detection was
scoped to `DATABASE()` on the **main** connection. The kids tables do not exist in `elite_db`, so their
columns always looked missing and the ALTER was then run against the shared DB:

```
❌ Migration failed: Table 'elite_db.kids_lessons' doesn't exist      ← 2026-09-10, the incident Q65 closed
```

### What changed in `backend/database/migrate.js`

| | |
|---|---|
| `COLUMN_PLAN` | **shared DB only** — the two `school_setup` columns |
| `CONTENT_COLUMN_PLAN` | **kids DB only** — `kids_children.password_hash` **plus the four columns that were mis-targeted**: `kids_lessons.is_global`, `kids_game_configs.item_id` / `tier` / `category` |
| `plannedAlterStatements(plan, existingKeys)` | **new, pure** — ALTERs for plan entries not already present; exported |
| `buildColumnPlan(mainExisting, kidsExisting)` | **new, pure** — the single place both halves are produced; exported |
| `main()` step 2 | reads the kids-owned columns from the **`content` connection** (a second, separately scoped lookup) and does `const { addColumns, addContentColumns } = buildColumnPlan(existing, existingKidsColumns)` |
| module tail | `module.exports = {…}` and the `main()` invocation is guarded by `if (require.main === module)`, so tests can import the plans without running the runner |

The `COLUMN_PLAN` header now carries the *why*, because the trap is non-obvious: a kids column
checked against the main DB is indistinguishable from a missing one.

### Verification

- **8 pure tests**, `team-docs/tools/migration-runner-plan.test.js` (see §3 for why it is parked
  there) — ownership of both plans, no kids ALTER in the main plan even in the worst case, the four
  mis-targeted columns now emitted against the kids DB, the "Nothing to do" path, and a
  source-level assertion that `main()` takes **both** arrays from `buildColumnPlan` (the Defect A
  shape). 8/8 in 1.4 s, no database required.
- **End-to-end dry-run against the hermetic `_test` DBs** — the acceptance check that this run was
  previously incapable of reaching:

  ```
  ✅ connected to main DB: elite_db_test      ✅ connected to kids DB: elite_kids_test
  ✅ safety check: main DB 'elite_db_test' looks correct
  ── Planned changes ──
  1 data-fix UPDATE(s) (main DB, scoped)
  3 kids table(s) to create in 'elite_kids_test'
  DRY-RUN — no changes applied.                                              EXIT=0
  ```

  **Zero ALTER statements**, because every planned column genuinely exists — the school_setup pair in
  the main DB and all five kids columns in the kids DB. Before the fix the four kids columns were
  planned on *every* run and the ALTER always failed.
- **Two mutations, each caught, file byte-identical after (`6cd35dda…`):**
  - a kids table put back into `COLUMN_PLAN` → **3 tests fail**;
  - `addContentColumns` dropped from the `buildColumnPlan` destructuring (Defect A's shape) →
    **1 test fails**.
- **Full backend gate: 69 / 69 suites, 799 / 799 tests, exit 0.**

---

## 2. ⚠️ INCIDENT — this repair broke a deploy, and the mechanism matters

```
19:35:12Z  Running job: deploy                 (for 39e379a)
19:38:46Z  Job deploy completed with result: Failed
```

**What happened, in order:**

1. At **19:35:12Z** a deploy started for `39e379a` (`fix(edge): raise nginx proxy buffers …`), pushed
   by someone else.
2. The deploy's **step 1** runs `git stash create` + **`git reset --hard origin/main`** in this same
   checkout (`deploy.yml:57,64`). That **reverted my uncommitted `backend/database/migrate.js` edit**,
   restoring the still-broken runner. **Untracked files survive the reset.**
3. The gate's `jest` then discovered **`backend/test/migration-runner-plan.test.js`** — my new,
   untracked test — and ran it **against the reverted, broken runner**: `FAIL … 7 of 8 tests failed`
   (the six ownership specs plus "reaches the plan"), exactly as it should, because the fix was gone.
4. My test's then-current `spawnSync` case also let a child process write past Jest teardown
   (`Cannot log after tests are done`, `process.exit called with "1"`), adding noise to the same log.
5. The gate failed → **the frontend publish never ran** → `39e379a` is on `origin/main` but
   **NOT deployed**. Live is still `releases/20260915T190853Z-b3cca8f`.

**Two generalisable lessons, both new:**

- **An untracked file participates in the deploy gate.** `testMatch` is `backend/test/**/*.test.js`,
  and `git reset --hard` does not delete untracked files — so an untracked test can *change a deploy's
  outcome* while being invisible to the commit history. This is the mirror of Q60/Q56: there, untracked
  files *survived* a deploy silently; here, one *blocked* a deploy.
- **A fix and its test can be split apart by the reset**: the tracked half is reverted, the untracked
  half stays. Committing them together is not a formality, it is the only way the pair stays coherent.

### Mitigation applied

- The test was **parked at `team-docs/tools/migration-runner-plan.test.js`** — outside Jest's
  `<rootDir>` (`backend/`), so it cannot be discovered by any gate run. It must be moved back to
  `backend/test/` **in the same commit** as the runner fix, never before.
- The `spawnSync`/CLI case was **removed** and replaced by the pure `buildColumnPlan` specs plus the
  source-level assertion, so the test needs no database and cannot leak past teardown.
- **The full gate was re-run on the current tree: 69/69 · 799/799, exit 0** — the checkout is
  deployable again.

### Outstanding (needs an order — neither is something I should do unprompted)

1. **Commit the fix and the test together** (runner + `backend/test/migration-runner-plan.test.js`
   moved out of `team-docs/tools/`). Until that happens the next deploy's reset will **silently
   revert the repair** and the bug returns — the Q60 mechanism, again.
2. **Re-run the deploy for `39e379a`** (or any subsequent push). Its content is committed and its
   gate is now clean, but nothing shipped, so `origin/main` and the live release disagree.

---

## 3. Safety

No `--apply` was run at any point. The dry-run above targeted the **hermetic `_test` databases**
(`elite_db_test` / `elite_kids_test` / `elite_bot_test`), not production, and wrote only its own
gitignored log in `backend/logs/`. No production database was read or written, no `.env` was opened
with a file tool, and no seeder or migration was executed.

## Artifacts / evidence

- `backend/database/migrate.js` — the repair (uncommitted; md5 `6cd35ddace9ba5b8f518f52bf2ff7df8`)
- `team-docs/tools/migration-runner-plan.test.js` — the parked test (8 specs)
- `team-docs/reports/gate-after-incident-20260915T194210Z.log` — 69/69 · 799/799, exit 0
- `/tmp/elitekids-backend-gate-20260915T193648Z.log` — the **failed** deploy gate, showing
  `FAIL test/migration-runner-plan.test.js`
- `journalctl --user -u elitekids-runner.service --since 19:34` — `Job deploy completed with result: Failed`
- `backend/database/migrate.js:91-100, 129-146, 229-241, 355-372` — the split plans, the pure builders,
  the two per-owner lookups, and the exports
