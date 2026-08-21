#!/usr/bin/env node
'use strict';

/**
 * Production-safe EliteKids migration runner.
 * Direct port of elite-cbt-api/database/migrate.js (the pattern the user
 * validated for elite-cbt) — same safety posture, kids-specific plan.
 *
 * Usage:
 *   node database/migrate.js              # DRY-RUN: show planned changes, change nothing
 *   node database/migrate.js --apply      # take backups, then apply
 *   node database/migrate.js --apply --skip-backup
 *   node database/migrate.js --apply --skip-data     # skip the data-fix UPDATEs
 *   node database/migrate.js --help
 *
 * Safety features:
 *   - Default is a DRY-RUN. Changes only happen with --apply.
 *   - Refuses to run if the main DB does not look like the elite school DB
 *     (must contain `users`, `school_setup` and `students`).
 *   - Backs up every shared table it modifies via mysqldump (single-transaction)
 *     before touching it. Backups land in logs/kids-migration-backups/<timestamp>/.
 *   - Every schema change is additive (column added only if missing) — existing
 *     elite-api data is never altered, dropped, or overwritten.
 *   - Addon tables are created in the CONTENT DB (elite_content) + AI DB
 *     (the AI DB, AI_DB_NAME), never in the shared DB used by elite-api.
 *   - A full run log is written to logs/kids-migration-<timestamp>.log.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_BACKUP = args.includes('--skip-backup');
const SKIP_DATA = args.includes('--skip-data');
const HELP = args.includes('--help') || args.includes('-h');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const BACKUP_DIR = path.join(LOG_DIR, 'kids-migration-backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(LOG_DIR, `kids-migration-${timestamp}.log`);
const RUN_BACKUP_DIR = path.join(BACKUP_DIR, timestamp);

const CFG = {
  mainDb: process.env.DB_NAME,
  contentDb: process.env.CONTENT_DB_NAME || 'elite_content',
  aiDb: process.env.AI_DB_NAME || 'elite_bot', // elite_bot = AI DB on the prod server (elite-api default)
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD || '',
};

const logLines = [];
function log(msg = '') {
  logLines.push(msg);
  console.log(msg);
}
function flushLog() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, logLines.join('\n') + '\n');
  } catch (_) { /* best-effort */ }
}

const usage = `Usage: node database/migrate.js [--apply] [--skip-backup] [--skip-data]

  (no flag)          Dry run — print every planned change, change nothing.
  --apply            Take backups, then apply all changes.
  --skip-backup      Apply without running mysqldump backups (not recommended).
  --skip-data        Apply schema changes but skip the data-fix UPDATEs.
`;

if (HELP) {
  console.log(usage);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Migration plan (shared elite DB — additive only)
// ---------------------------------------------------------------------------
// [table, column, DDL fragment]. A column is only added if it is missing.
const COLUMN_PLAN = [
  // school_setup: module gate (default 0 = feature off — non-breaking)
  ['school_setup', 'kids_stand_alone', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['school_setup', 'kids_url', 'VARCHAR(50) NULL DEFAULT NULL'],
  ['kids_lessons', 'is_global', 'TINYINT(1) NOT NULL DEFAULT 0'],
  // Docs 12-17: Denormalized tier/category/item_id on game configs for PedagogyValidator queries
  ['kids_game_configs', 'item_id', 'VARCHAR(50) NULL DEFAULT NULL'],
  ['kids_game_configs', 'tier', 'INT NULL DEFAULT NULL'],
  ['kids_game_configs', 'category', 'VARCHAR(50) NULL DEFAULT NULL'],
];

// Data-fix UPDATEs — all scoped to NULL/missing values only.
const DATA_STEPS = [
  ['school_setup kids module flag backfill (only for nursery_section=1 schools that already run cbt_stand_alone)',
    "UPDATE `school_setup` SET `kids_stand_alone` = 1 WHERE `nursery_section` = 1 AND `cbt_stand_alone` = 1 AND `kids_stand_alone` = 0",
    ['school_setup.nursery_section', 'school_setup.cbt_stand_alone', 'school_setup.kids_stand_alone']],
  ['school_setup kids module auto-enable for Elite plan subscribers',
    "UPDATE `school_setup` ss JOIN `rbac_school_packages` rsp ON ss.school_id = rsp.school_id JOIN `subscription_packages` sp ON rsp.package_id = sp.id SET ss.kids_stand_alone = 1 WHERE sp.package_name = 'Elite' AND rsp.is_active = 1 AND ss.kids_stand_alone = 0",
    ['school_setup.kids_stand_alone', 'rbac_school_packages.is_active', 'subscription_packages.package_name']],
];

const GUARD_TABLES = ['users', 'school_setup', 'students'];
const BACKUP_TABLES = ['school_setup'];

// Kids tables created in the CONTENT DB by model sync (create-if-missing only)
const KIDS_CONTENT_TABLE_LIST = [
  'kids_children', 'kids_lessons', 'kids_game_configs', 'kids_scene_scripts',
  'kids_progress', 'kids_content_approvals', 'kids_prescreen_log',
  'kids_denylist_rules', 'kids_generation_jobs',
  // Docs 12-17: New tables for reconciled features
  'kids_game_series', 'kids_game_units', 'kids_curriculum_points',
  'kids_library_games', 'kids_class_game_variants', 'kids_game_item_responses',
  'kids_engagement_snapshots', 'kids_mastery_progress', 'kids_test_attempts',
  'kids_review_schedule', 'kids_interface_onboarding', 'kids_garden_state',
  'kids_companion_state', 'kids_session_state', 'kids_parental_controls',
];
const KIDS_AI_TABLE_LIST = ['kids_content_generation_audit'];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const db = require('../src/models');
  const { sequelize, content, ai } = db;

  log('==================================================');
  log('ELITE KIDS MIGRATION RUNNER');
  log(`mode      : ${APPLY ? 'APPLY' : 'DRY-RUN'}${SKIP_BACKUP ? ' (backups skipped)' : ''}${SKIP_DATA ? ' (data updates skipped)' : ''}`);
  log(`main DB   : ${CFG.mainDb}`);
  log(`content DB: ${CFG.contentDb}`);
  log(`AI DB     : ${CFG.aiDb}`);
  log('==================================================\n');

  // ---- 1. Connect + guard -------------------------------------------------
  try {
    await sequelize.authenticate();
    log(`✅ connected to main DB: ${CFG.mainDb}`);
  } catch (e) {
    log(`❌ cannot connect to main DB (${CFG.mainDb}): ${e.message}`);
    log('   Check DB_* settings in .env');
    process.exitCode = 1;
    return;
  }
  try {
    await content.authenticate();
    log(`✅ connected to content DB: ${CFG.contentDb}`);
  } catch (e) {
    log(`❌ cannot connect to content DB (${CFG.contentDb}): ${e.message}`);
    log('   Set CONTENT_DB_NAME in .env (kids_* tables live here).');
    process.exitCode = 1;
    return;
  }
  let aiConnected = true;
  try {
    await ai.authenticate();
    log(`✅ connected to AI DB: ${CFG.aiDb}`);
  } catch (e) {
    // the AI DB may not exist yet on some servers — warn but continue (DEC-002)
    log(`⚠️ cannot connect to AI DB (${CFG.aiDb}): ${e.message}`);
    log('   Kids content generation audit will be unavailable until it exists.');
    aiConnected = false;
  }

  const [present] = await sequelize.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`,
    { replacements: { tables: GUARD_TABLES } }
  );
  const presentNames = new Set(present.map((r) => r.TABLE_NAME));
  const missing = GUARD_TABLES.filter((t) => !presentNames.has(t));
  if (missing.length) {
    log(`❌ SAFETY CHECK FAILED: main DB '${CFG.mainDb}' is missing table(s): ${missing.join(', ')}`);
    log('   This does not look like the elite school database — aborting.');
    process.exitCode = 1;
    return;
  }
  log(`✅ safety check: main DB '${CFG.mainDb}' looks correct (users, school_setup, students present)`);

  // ---- 2. Compute missing columns -----------------------------------------
  const [allCols] = await sequelize.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)`,
    { replacements: { tables: [...new Set(COLUMN_PLAN.map((c) => c[0]))] } }
  );
  const existing = new Map();
  for (const c of allCols) existing.set(`${c.TABLE_NAME}.${c.COLUMN_NAME}`, c);

  const addColumns = COLUMN_PLAN.filter(([t, c]) => !existing.has(`${t}.${c}`))
    .map(([t, c, ddl]) => `ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${ddl}`);

  // ---- 3. Data steps (guard column deps) ----------------------------------
  const dataSteps = SKIP_DATA ? [] : DATA_STEPS.filter(([, , deps]) =>
    !deps || deps.every((d) => existing.has(d))
  );

  // ---- 4. Content DB + AI DB kids tables ----------------------------------
  const [contentTables] = await content.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'kids_%'`
  );
  const existingContent = new Set(contentTables.map((r) => r.TABLE_NAME));
  const missingContent = KIDS_CONTENT_TABLE_LIST.filter((t) => !existingContent.has(t));

  let missingAi = [];
  if (aiConnected) {
    const [aiTables] = await ai.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'kids_%'`
    );
    const existingAi = new Set(aiTables.map((r) => r.TABLE_NAME));
    missingAi = KIDS_AI_TABLE_LIST.filter((t) => !existingAi.has(t));
  } else {
    missingAi = KIDS_AI_TABLE_LIST;
  }

  // ---- 5. Report / apply ----------------------------------------------------
  const summary = { addColumns, dataSteps, missingContent, missingAi };

  log('\n── Planned changes ────────────────────────────────────────────────');
  if (!addColumns.length && !summary.dataSteps.length && !missingContent.length && !missingAi.length) {
    log('Nothing to do — schema already up to date.');
  } else {
    if (addColumns.length) {
      log(`\n${addColumns.length} ADD COLUMN(s) (main DB):`);
      addColumns.forEach((sql) => log(`  + ${sql};`));
    }
    if (summary.dataSteps.length) {
      log(`\n${summary.dataSteps.length} data-fix UPDATE(s) (main DB, scoped):`);
      summary.dataSteps.forEach((d) => log(`  ~ ${d[0]}`));
    }
    if (missingContent.length) {
      log(`\n${missingContent.length} kids table(s) to create in '${CFG.contentDb}':`);
      missingContent.forEach((t) => log(`  + CREATE TABLE IF NOT EXISTS \`${t}\``));
    }
    if (missingAi.length) {
      log(`\n${missingAi.length} kids AI table(s) to create in '${CFG.aiDb}':`);
      missingAi.forEach((t) => log(`  + CREATE TABLE IF NOT EXISTS \`${t}\``));
    }
  }
  log('\n────────────────────────────────────────────────────────────────');

  if (!APPLY) {
    log('\nDRY-RUN — no changes applied.');
    log('Review the plan above, then run with --apply to execute.');
    return;
  }

  // ---- 6. Backups ----------------------------------------------------------
  if (SKIP_BACKUP) {
    log('\n⚠️  --skip-backup: proceeding WITHOUT backups.');
  } else {
    const { spawnSync } = require('child_process');
    const probe = spawnSync('which', ['mysqldump'], { encoding: 'utf8' });
    if (probe.status !== 0 || !probe.stdout.trim()) {
      log('❌ mysqldump not found on PATH. Refusing to run without backups.');
      log('   Install mysql client tools, or explicitly pass --skip-backup (not recommended).');
      process.exitCode = 1;
      return;
    }
    fs.mkdirSync(RUN_BACKUP_DIR, { recursive: true });
    log(`\n💾 Backing up shared tables to ${RUN_BACKUP_DIR}`);
    for (const table of BACKUP_TABLES) {
      const [existsRow] = await sequelize.query(
        `SELECT COUNT(*) AS n FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t`,
        { replacements: { t: table } }
      );
      if (!existsRow[0] || !existsRow[0].n) {
        log(`   - ${table}: table does not exist, nothing to back up`);
        continue;
      }
      const file = path.join(RUN_BACKUP_DIR, `${CFG.mainDb}.${table}.sql`);
      try {
        const dump = execFileSync('mysqldump', [
          '-h', CFG.host,
          '-P', String(CFG.port),
          '-u', CFG.user,
          '--single-transaction',
          '--quick',
          '--no-tablespaces',
          '--set-gtid-purged=OFF',
          '--skip-comments',
          CFG.mainDb,
          table,
        ], { env: { ...process.env, MYSQL_PWD: CFG.password }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });
        fs.writeFileSync(file, dump);
        log(`   ✓ ${table} → ${path.basename(file)}`);
      } catch (e) {
        log(`   ✗ ${table} backup FAILED: ${(e.stderr || e.message).toString().slice(0, 300)}`);
        log('   Aborting before applying any changes.');
        process.exitCode = 1;
        return;
      }
    }
  }

  // ---- 7. Apply -------------------------------------------------------------
  log('\n── Applying ───────────────────────────────────────────────────');
  try {
    for (const sql of addColumns) {
      await sequelize.query(sql);
      log(`  + applied: ${sql}`);
    }
    for (const [, sql] of dataSteps) {
      await sequelize.query(sql);
      log(`  ~ applied: ${sql.split('\n').join(' ')}`);
    }
    if (missingContent.length || missingAi.length) {
      await db.syncKidsTables();
      log(`  + kids tables ensured in '${CFG.contentDb}' + '${CFG.aiDb}'`);
    }
  } catch (e) {
    log(`❌ Migration failed: ${e.message}`);
    log('   Backups (if taken) are available at ' + RUN_BACKUP_DIR);
    process.exitCode = 1;
    return;
  }

  // ---- 8. Close -------------------------------------------------------------
  try {
    await sequelize.close();
    if (content) await content.close();
    if (ai) await ai.close();
  } catch (_) { /* ignore */ }

  log('\n✅ Elite Kids migration applied successfully.');
  if (!SKIP_BACKUP) log(`   Backups: ${RUN_BACKUP_DIR}`);
  log(`   Log: ${LOG_FILE}`);
}

main()
  .then(() => { flushLog(); process.exit(process.exitCode || 0); })
  .catch((e) => {
    console.error('Unhandled error:', e);
    flushLog();
    process.exit(1);
  });
