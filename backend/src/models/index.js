'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EliteKids — model registry (mirrors elite-cbt-api/src/models/index.js)
 *
 * Three Sequelize connections:
 *   1. `sequelize`  → main shared school DB (DB_NAME, e.g. elite_db) — users,
 *                     students, teachers, parents, school_setup, classes,
 *                     subjects, school_locations. READ/use only.
 *   2. `content`    → elite_content (CONTENT_DB_NAME) — kids_* content tables
 *                     (lessons, game configs, scene scripts, progress, …).
 *   3. `ai`         → AI DB (AI_DB_NAME; elite_bot on the prod server) —
 *                     kids_content_generation_audit.
 *   4. `kids`       → dedicated kids DB (KIDS_DB_NAME, elite_kids) — C1 target
 *                     home for kids/game-domain tables. Provisioned; kids
 *                     models still read/write elite_content until a supervised
 *                     data move is approved (elite_content also hosts other
 *                     apps' tables, so moves need human review).
 *
 * The shared school DB is NEVER altered by this service. Addon tables are only
 * created in elite_content / the AI DB via syncKidsTables() (create-if-missing,
 * never alter) + additive column reconciles in database/migrate.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
require('dotenv').config();

const basename = path.basename(__filename);

// ── Tables this addon OWNS (created in elite_content / the AI DB) ────────────
const KIDS_CONTENT_TABLES = [
  'kids_children',
  'kids_lessons',
  'kids_game_configs',
  'kids_scene_scripts',
  'kids_progress',
  'kids_content_approvals',
  'kids_prescreen_log',
  'kids_denylist_rules',
  'kids_generation_jobs',
  // Docs 12-17: New tables for reconciled features
  'kids_game_series',
  'kids_game_units',
  'kids_curriculum_points',
  'kids_library_games',
  'kids_class_game_variants',
  'kids_game_item_responses',
  'kids_engagement_snapshots',
  'kids_mastery_progress',
  'kids_test_attempts',
  'kids_review_schedule',
  'kids_interface_onboarding',
  'kids_garden_state',
  'kids_companion_state',
  'kids_session_state',
  'kids_parental_controls',
  'kids_mode_locks',
];

const KIDS_AI_TABLES = ['kids_content_generation_audit'];

// Model files bound to the content DB (elite_content)
const KIDS_CONTENT_MODEL_FILES = [
  'KidChild.js',
  'KidLesson.js',
  'KidGameConfig.js',
  'KidSceneScript.js',
  'KidProgress.js',
  'KidContentApproval.js',
  'KidPrescreenLog.js',
  'KidDenylistRule.js',
  'KidGenerationJob.js',
  // Docs 12-17: New models for reconciled features
  'KidGameSeries.js',
  'KidGameUnit.js',
  'KidCurriculumPoint.js',
  'KidLibraryGame.js',
  'KidClassGameVariant.js',
  'KidGameItemResponse.js',
  'KidEngagementSnapshot.js',
  'KidMasteryProgress.js',
  'KidTestAttempt.js',
  'KidReviewSchedule.js',
  'KidInterfaceOnboarding.js',
  'KidGardenState.js',
  'KidCompanionState.js',
  'KidSessionState.js',
  'KidParentalControl.js',
  'KidModeLock.js',
];

// Model files bound to the AI DB (AI_DB_NAME; elite_bot on the prod server)
const KIDS_AI_MODEL_FILES = ['KidContentAuditLog.js'];

// Shared-school read models (never sync'd, never altered)
const SHARED_MODEL_FILES = ['User.js', 'Student.js', 'SchoolSetup.js'];

const buildOptions = (database) => ({
  host: process.env.DB_HOST,
  dialect: 'mysql',
  dialectModule: require('mysql2'),
  port: parseInt(process.env.DB_PORT) || 3306,
  dialectOptions: {
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: 'Z',
    dateStrings: true,
    charset: 'utf8mb4',
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 60000,
    ssl: process.env.DB_SSL_ENABLED === 'true' ? undefined : false,
    flags: '-FOUND_ROWS',
  },
  pool: {
    max: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    min: parseInt(process.env.DB_MIN_CONNECTIONS) || 1,
    acquire: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 45000,
    idle: parseInt(process.env.DB_IDLE_TIMEOUT) || 20000,
  },
  define: {
    timestamps: true,
    freezeTableName: true,
  },
  logging:
    process.env.NODE_ENV === 'development' && process.env.LOG_SQL === 'true'
      ? (sql) => console.log('[SQL]', sql)
      : false,
});

const db = {};

// 1) Main connection → shared school DB
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  buildOptions(process.env.DB_NAME)
);

// 2) Content connection → kids_* content tables (elite_content)
const contentSequelize = new Sequelize(
  process.env.CONTENT_DB_NAME || 'elite_content',
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  buildOptions(process.env.CONTENT_DB_NAME || 'elite_content')
);

// 3) AI connection → audit log (AI_DB_NAME; defaults to elite_bot, which is the
//    AI DB that actually exists on the prod server — elite-api's own default.
//    Provision/set AI_DB_NAME=elite_ai where that DB exists.)
const aiSequelize = new Sequelize(
  process.env.AI_DB_NAME || 'elite_bot',
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  buildOptions(process.env.AI_DB_NAME || 'elite_bot')
);

// 4) Dedicated kids-domain DB (KIDS_DB_NAME, e.g. elite_kids). C1 target home.
//    No models bound yet — kids tables still live in elite_content; this
//    instance is ready for the supervised data move (see team-docs reports).
const kidsSequelize = new Sequelize(
  process.env.KIDS_DB_NAME || 'elite_kids',
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  buildOptions(process.env.KIDS_DB_NAME || 'elite_kids')
);

// Auto-load model files
fs.readdirSync(__dirname)
  .filter((file) => file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js' && !file.startsWith('index'))
  .forEach((file) => {
    try {
      let target = sequelize;
      if (KIDS_CONTENT_MODEL_FILES.includes(file)) target = contentSequelize;
      else if (KIDS_AI_MODEL_FILES.includes(file)) target = aiSequelize;
      const model = require(path.join(__dirname, file))(target, Sequelize.DataTypes);
      db[model.name] = model;
    } catch (error) {
      console.error(`❌ Failed to load model ${file}: ${error.message}`);
    }
  });

// Run associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) db[modelName].associate(db);
});

db.sequelize = sequelize;
db.content = contentSequelize;
db.ai = aiSequelize;
db.kids = kidsSequelize;
db.Sequelize = Sequelize;

/**
 * Sync ONLY addon-owned tables (into elite_content + the AI DB).
 * Shared tables (users, students, parents, school_setup, …) already exist in the
 * main school DB — we must never create or alter them here.
 */
db.syncKidsTables = async () => {
  const contentModels = Object.values(db).filter(
    (m) => m && typeof m.getTableName === 'function' && KIDS_CONTENT_TABLES.includes(m.getTableName())
  );
  const aiModels = Object.values(db).filter(
    (m) => m && typeof m.getTableName === 'function' && KIDS_AI_TABLES.includes(m.getTableName())
  );

  // Parent tables sync before children so FKs resolve on first creation
  const SYNC_ORDER = [
    'kids_children',
    'kids_lessons',
    'kids_game_configs',
    'kids_scene_scripts',
    'kids_progress',
    'kids_content_approvals',
    'kids_prescreen_log',
    'kids_denylist_rules',
    'kids_generation_jobs',
    // Docs 12-17: New tables in dependency order
    'kids_game_series',
    'kids_game_units',
    'kids_curriculum_points',
    'kids_library_games',
    'kids_class_game_variants',
    'kids_game_item_responses',
    'kids_engagement_snapshots',
    'kids_mastery_progress',
    'kids_test_attempts',
    'kids_review_schedule',
    'kids_interface_onboarding',
    'kids_garden_state',
    'kids_companion_state',
    'kids_session_state',
    'kids_parental_controls',
    'kids_mode_locks',
  ];
  const ordered = SYNC_ORDER
    .map((name) => contentModels.find((m) => m.getTableName() === name))
    .filter(Boolean);

  for (const model of ordered) {
    await model.sync({ force: false }); // creates table if missing, never alters
  }
  for (const model of aiModels) {
    await model.sync({ force: false });
  }

  console.log(
    `✅ Kids tables synced into ${contentSequelize.config.database} (${ordered.map((m) => m.getTableName()).join(', ')})`
  );
  if (aiModels.length) {
    console.log(`✅ Kids AI tables synced into ${aiSequelize.config.database} (${aiModels.map((m) => m.getTableName()).join(', ')})`);
  }
};

module.exports = db;
