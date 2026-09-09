require('dotenv').config();

const app = require('./app');
const models = require('./models');
const { ensureFlagshipKidsSchool, ensureFlagshipKidsAdmin } = require('./seeders/flagshipKidsSeed');
const { ensureGlobalCatalog } = require('./seeders/globalCatalogSeed');
const { seedFlagshipAnnualPilot } = require('./seeders/flagshipAnnualPilotSeed');
const DENYLIST_SEED = require('./seeders/denylistSeed');

/**
 * Check for missing columns and log a WARNING if any are missing.
 * Does NOT alter anything — safe to run at boot.
 * When missing columns are detected, run:
 *   node database/migrate.js --apply
 * from the backend directory to apply them safely (with backups).
 */
async function auditMissingColumns() {
  const { sequelize, content, ai } = models;

  // Shared DB columns to check (school_setup)
  const SHARED_COLS = [
    ['kids_stand_alone', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['kids_url', 'VARCHAR(50) NULL DEFAULT NULL'],
  ];
  try {
    const [cols] = await sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'school_setup'`
    );
    const existing = new Set(cols.map((c) => c.COLUMN_NAME));
    const missing = SHARED_COLS.filter(([name]) => !existing.has(name));
    if (missing.length) {
      console.log(`⚠️  DB AUDIT: ${missing.length} column(s) missing from school_setup (main DB):`);
      missing.forEach(([name, ddl]) => console.log(`     ${name} — ${ddl}`));
      console.log('   → Run: cd backend && node database/migrate.js --apply');
    }
  } catch (err) {
    console.error('⚠️  DB audit (school_setup):', err.message);
  }

  // Content DB columns to check
  const CONTENT_COL_PLAN = [
    ['kids_lessons', 'duration_target_sec', 'INT NULL DEFAULT NULL'],
    ['kids_lessons', 'published_at', 'DATETIME NULL DEFAULT NULL'],
    ['kids_lessons', 'nerdc_code', 'VARCHAR(100) NULL DEFAULT NULL'],
    ['kids_lessons', 'nerdc_strand', 'VARCHAR(100) NULL DEFAULT NULL'],
    ['kids_lessons', 'nerdc_sub_strand', 'VARCHAR(100) NULL DEFAULT NULL'],
    ['kids_session_state', 'session_id', 'VARCHAR(50) NULL DEFAULT NULL'],
    ['kids_children', 'allow_anonymous_comparison', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ];
  try {
    const missingContent = [];
    for (const [table, col, ddl] of CONTENT_COL_PLAN) {
      const [tblCols] = await content.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'`
      );
      if (!tblCols.length) continue; // table not created yet — sync() will make it
      const existing = new Set(tblCols.map((c) => c.COLUMN_NAME));
      if (!existing.has(col)) {
        missingContent.push([table, col, ddl]);
      }
    }
    if (missingContent.length) {
      console.log(`⚠️  DB AUDIT: ${missingContent.length} column(s) missing from content DB tables:`);
      missingContent.forEach(([table, col, ddl]) => console.log(`     ${table}.${col} — ${ddl}`));
      console.log('   → Run: cd backend && node database/migrate.js --apply');
    }
  } catch (err) {
    console.error('⚠️  DB audit (content DB):', err.message);
  }

  // AI DB audit table column check
  try {
    const [auditCols] = await ai.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_content_generation_audit'`
    );
    const existing = new Set(auditCols.map((c) => c.COLUMN_NAME));
    if (!existing.has('denylist_result')) {
      console.log('⚠️  DB AUDIT: kids_content_generation_audit missing column: denylist_result (VARCHAR(20) NULL DEFAULT NULL)');
      console.log('   → Run: cd backend && node database/migrate.js --apply');
    }
  } catch (err) {
    console.error('⚠️  DB audit (AI DB):', err.message);
  }
}

// ─── Database sync + server start ─────────────────────────────────────────────
const port = process.env.PORT || 34600;
console.log('DEBUG: process.env.PORT =', process.env.PORT, '→ binding port:', port);

// Boot sequence: sync tables (CREATE IF NOT EXISTS — safe) → audit columns
// (detect missing, log warning, DO NOT ALTER) → seeds → listen.
//
// DDL changes (ALTER TABLE) are deliberately NOT done at boot.
// Use database/migrate.js --apply for controlled, backed-up schema changes.
models.syncKidsTables()
  .then(() => auditMissingColumns())
  .then(() => ensureFlagshipKidsSchool())
  .then((fs) => {
    if (fs?.created) console.log('🏫 Flagship kids school created:', fs.school_id);
    return ensureFlagshipKidsAdmin();
  })
  .then(async () => {
    // Seed denylist rules if empty (idempotent)
    const count = await models.KidDenylistRule.count().catch(() => 0);
    if (count === 0) {
      for (const rule of DENYLIST_SEED) {
        await models.KidDenylistRule.create({ rule: rule.rule, category: rule.category, active: 1, added_by: 'seed' }).catch(() => {});
      }
      console.log(`🚫 Seeded ${DENYLIST_SEED.length} denylist rules`);
    }
    return null;
  })
  .then(async () => {
    // Explicit annual pilot seed: opt-in only, never enabled by ordinary boot.
    // Rows remain pending_human_review until the adult approval workflow runs.
    if (process.env.KIDS_ANNUAL_PILOT_SEED === 'true' && process.env.KIDS_ANNUAL_PILOT_SEED_CONFIRM === 'true') {
      try {
        const seeded = await seedFlagshipAnnualPilot({ db: models });
        console.log(`📚 Annual pilot seeded: ${seeded.counts.games} games in pending_human_review.`);
      } catch (e) {
        console.warn('⚠️ Annual pilot seed skipped:', e.message);
      }
    } else if (process.env.KIDS_ANNUAL_PILOT_SEED === 'true') {
      console.warn('⚠️ Annual pilot seed requested but not confirmed; set KIDS_ANNUAL_PILOT_SEED_CONFIRM=true to write it.');
    }
    return null;
  })
  .then(async () => {
    // Global catalog floor: every band gets playable published games so no
    // student (demo schools, SMS-imported elder kids) ever sees an empty
    // dashboard. Idempotent — safe on every boot.
    try {
      const seeded = await ensureGlobalCatalog();
      if (seeded.createdLessons > 0 || seeded.createdGames > 0) {
        console.log(`🎮 Global catalog seeded: +${seeded.createdLessons} lessons, +${seeded.createdGames} games (${seeded.total} total)`);
      }
    } catch (e) {
      console.warn('⚠️ Global catalog seed skipped:', e.message);
    }
    return null;
  })
  .then(() => {
    console.log('✅ Databases synced');
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 elite-kids-api listening on port ${port}`);
      require('./controllers/e3fLive').attach(server);
      try { require('./sockets/chat').attach(server); } catch (e) { console.warn('⚠️ Chat socket skipped:', e.message); }
      try { require('./sockets/collaboration').attach(server); } catch (e) { console.warn('⚠️ Collab socket skipped:', e.message); }
    });
    server.timeout = 120000;

    const shutdown = async (signal) => {
      console.log(`\n${signal} received — shutting down...`);
      server.close(async () => {
        try {
          await models.sequelize.close();
          if (models.content) await models.content.close();
          if (models.ai) await models.ai.close();
          console.log('✅ Databases closed');
        } catch (e) {
          console.error('Error closing DB:', e.message);
        }
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    console.error('❌ DB sync failed:', err.message);
    process.exit(1);
  });

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
