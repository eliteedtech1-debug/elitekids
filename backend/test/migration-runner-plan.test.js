'use strict';

/**
 * Regression tests for the migration runner — Q78.
 *
 * Guards two independent defects found on 2026-09-15. Both must be fixed
 * together:
 *
 *   1. `COLUMN_PLAN` mixed shared-DB tables (`school_setup`) with kids-DB tables
 *      (`kids_lessons`, `kids_game_configs`), while column detection was scoped
 *      to `DATABASE()` — the MAIN connection. The kids tables do not exist there,
 *      so their columns always looked missing and the ALTER was then run against
 *      the shared DB, where it failed with
 *      `Table 'elite_db.kids_lessons' doesn't exist` (2026-09-10, Q65).
 *
 *   2. `addContentColumns` was referenced in seven places but declared nowhere,
 *      so the runner threw `ReferenceError: addContentColumns is not defined`
 *      before it printed a plan — in both modes, i.e. it could neither plan nor
 *      apply anything.
 *
 * Fixing only one restores the other, so these specs cover both.
 *
 * Deliberately PURE: no database, no child process, no `main()`. The runner's
 * plan is resolved by an exported pure function, so it is fully testable in
 * isolation. An earlier revision launched the CLI via spawnSync; that both
 * depended on a live test DB and leaked output past Jest teardown, so it was
 * replaced by the source-level assertion below.
 */

const fs = require('fs');
const path = require('path');

const {
  COLUMN_PLAN,
  CONTENT_COLUMN_PLAN,
  buildColumnPlan,
} = require('../database/migrate');

const isKidsOwnedTable = (table) => String(table).startsWith('kids_');
const keysOf = (plan) => new Set(plan.map(([table, column]) => `${table}.${column}`));
const tablesTouched = (statements) => statements.map((sql) => sql.match(/ALTER TABLE `([^`]+)`/)[1]);

describe('migration runner — plan ownership', () => {
  it('keeps only shared-DB tables in COLUMN_PLAN', () => {
    expect(COLUMN_PLAN.length).toBeGreaterThan(0);
    expect(COLUMN_PLAN.map(([table]) => table).filter(isKidsOwnedTable)).toEqual([]);
  });

  it('keeps only kids-owned tables in CONTENT_COLUMN_PLAN', () => {
    expect(CONTENT_COLUMN_PLAN.length).toBeGreaterThan(0);
    expect(CONTENT_COLUMN_PLAN.map(([table]) => table).filter((t) => !isKidsOwnedTable(t))).toEqual([]);
  });

  it('never plans a kids-table ALTER against the main DB (the 2026-09-10 failure)', () => {
    // Worst case: the main DB reports none of its own columns as present, so
    // every entry in the MAIN plan looks missing. A kids table in that plan is
    // exactly how the doomed ALTER was produced, so it must never appear.
    const { addColumns } = buildColumnPlan(new Set(), new Set());

    expect(addColumns).toHaveLength(COLUMN_PLAN.length);
    // Match the TABLE, not the column: `school_setup.kids_stand_alone` is a
    // legitimate shared-DB column whose name merely starts with `kids_`.
    expect(tablesTouched(addColumns).filter(isKidsOwnedTable)).toEqual([]);
    expect(tablesTouched(addColumns)).toEqual(COLUMN_PLAN.map(([table]) => table));
  });

  it('reconciles the kids columns in the kids DB, including the four that were aimed at the shared DB', () => {
    const { addContentColumns } = buildColumnPlan(new Set(), new Set());
    const touched = tablesTouched(addContentColumns);

    expect(touched).toContain('kids_lessons');
    expect(touched).toContain('kids_game_configs');
    expect(touched.every(isKidsOwnedTable)).toBe(true);
    expect(addContentColumns.some((sql) => /kids_lessons` ADD COLUMN `is_global`/.test(sql))).toBe(true);
    expect(addContentColumns.filter((sql) => /kids_game_configs` ADD COLUMN `(item_id|tier|category)`/.test(sql)))
      .toHaveLength(3);
  });

  it('reports nothing to do when every planned column already exists', () => {
    // The "Nothing to do — schema already up to date." path, and the acceptance
    // check for the repaired runner against production.
    const { addColumns, addContentColumns } = buildColumnPlan(
      keysOf(COLUMN_PLAN),
      keysOf(CONTENT_COLUMN_PLAN)
    );
    expect(addColumns).toEqual([]);
    expect(addContentColumns).toEqual([]);
  });

  it('plans only the columns that are genuinely missing', () => {
    const { addColumns, addContentColumns } = buildColumnPlan(
      new Set(['school_setup.kids_stand_alone']),
      new Set(['kids_children.password_hash'])
    );
    expect(addColumns).toEqual([
      'ALTER TABLE `school_setup` ADD COLUMN `kids_url` VARCHAR(50) NULL DEFAULT NULL',
    ]);
    expect(addContentColumns).toHaveLength(CONTENT_COLUMN_PLAN.length - 1);
  });
});

describe('migration runner — the plans cannot go missing again', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrate.js'), 'utf8');

  it('produces both plans from one place and destructures them in main()', () => {
    // Defect 2 was a dangling reference: a plan identifier used by main() but
    // never assigned. Asserting that main() takes BOTH arrays from the single
    // builder is the deterministic, database-free way to catch that shape.
    expect(source).toMatch(/const \{ addColumns, addContentColumns \} = buildColumnPlan\(/);
  });

  it('exposes the builder so the split stays testable', () => {
    expect(typeof buildColumnPlan).toBe('function');
    expect(Object.keys(buildColumnPlan(new Set(), new Set())).sort())
      .toEqual(['addColumns', 'addContentColumns']);
  });
});
