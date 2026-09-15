#!/usr/bin/env node
'use strict';

/**
 * Jump-ahead checkpoint schema migration.
 *
 * Creates the tables owned by the checkpoint ("test out") feature:
 *   - kids_checkpoint_exams       (KidCheckpointExam)
 *   - kids_checkpoint_policies    (KidCheckpointPolicy) — who may confirm
 *
 * Lives in the EliteKids-owned database (KIDS_DB_NAME, e.g. elite_kids) and is
 * intentionally NOT listed in KIDS_CONTENT_TABLES, so the running service never
 * runs its DDL: `models.syncKidsTables()` at boot skips it. Schema changes are
 * applied HERE, by a migration run on its own.
 *
 * Usage:
 *   node database/kids-checkpoint-exams-migration.js            # DRY-RUN (default)
 *   node database/kids-checkpoint-exams-migration.js --apply    # create if missing
 *   node database/kids-checkpoint-exams-migration.js --help
 *
 * Safety:
 *   - Additive only. CREATE TABLE IF NOT EXISTS for exactly these two tables.
 *     Never ALTER, never DROP, never any other table.
 *   - The shared EliteSMS school DB (DB_NAME) is never touched; the migration
 *     refuses to run if the Kids connection resolves to the shared database.
 *   - Existing rows and existing tables are left untouched.
 */

require('dotenv').config();

const TABLES = ['kids_checkpoint_exams', 'kids_checkpoint_policies'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const HELP = args.includes('--help') || args.includes('-h');

const usage = `Usage: node database/kids-checkpoint-exams-migration.js [--apply]

  (no flag)   Dry run — report whether the checkpoint table is missing.
  --apply     Create it in KIDS_DB_NAME (additive only).
  --help      Show this message.
`;

if (HELP) {
  console.log(usage);
  process.exit(0);
}

async function run() {
  const db = require('../src/models');
  const { kids, sequelize } = db;

  const targetDb = kids.config.database;
  const sharedDb = sequelize.config.database;

  console.log('EliteKids — jump-ahead checkpoint tables migration');
  console.log(`  kids DB   : ${targetDb}`);
  console.log(`  shared DB : ${sharedDb} (untouched)`);
  console.log(`  mode      : ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  if (targetDb === sharedDb) {
    throw new Error(
      `Refusing to run: the Kids connection resolved to the shared school DB (${targetDb}). ` +
      'Checkpoint tables are Kids-owned — check KIDS_DB_NAME.'
    );
  }

  // Read-only information_schema probe.
  const [rows] = await kids.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?)',
    { replacements: [targetDb, TABLES] }
  );
  const existing = new Set(rows.map((r) => r.TABLE_NAME));
  const missing = TABLES.filter((t) => !existing.has(t));

  console.log(`\n  present   : ${TABLES.filter((t) => existing.has(t)).join(', ') || '(none)'}`);
  console.log(`  missing   : ${missing.join(', ') || '(none)'}`);

  if (!missing.length) {
    console.log('\nNothing to do — schema already up to date.');
    return;
  }

  if (!APPLY) {
    missing.forEach((t) => console.log(`  + would CREATE TABLE IF NOT EXISTS \`${t}\``));
    console.log('\nDRY-RUN — no changes applied. Re-run with --apply to create them.');
    return;
  }

  // DDL is generated from the Sequelize model, so the created table always
  // matches what the application expects (no hand-written drift).
  for (const table of missing) {
    const model = Object.values(db).find((m) => typeof m?.getTableName === 'function' && m.getTableName() === table);
    if (!model) throw new Error(`No model is registered for ${table}.`);
    await model.sync({ force: false });
    console.log(`  ✓ ${table} created`);
  }

  console.log(`\n✅ Jump-ahead checkpoint tables ensured in '${targetDb}'.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`❌ Migration failed: ${err.message}`);
    process.exit(1);
  });
