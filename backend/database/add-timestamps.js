/**
 * Migration: Add createdAt/updatedAt columns to kids_* tables.
 * 
 * Run via: node database/add-timestamps.js
 * 
 * Idempotent — skips tables that already have the columns.
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const KIDS_TABLES = [
  'kids_children', 'kids_lessons', 'kids_game_configs', 'kids_scene_scripts',
  'kids_progress', 'kids_content_approvals', 'kids_prescreen_log',
  'kids_generation_jobs', 'kids_game_series', 'kids_game_units',
  'kids_curriculum_points', 'kids_library_games', 'kids_class_game_variants',
  'kids_game_item_responses', 'kids_engagement_snapshots', 'kids_mastery_progress',
  'kids_test_attempts', 'kids_review_schedule', 'kids_interface_onboarding',
  'kids_garden_state', 'kids_companion_state', 'kids_session_state',
  'kids_parental_controls', 'kids_mode_locks', 'kids_denylist_rules',
];

async function main() {
  const sequelize = new Sequelize(
    process.env.CONTENT_DB_NAME || 'elite_content',
    process.env.DB_USERNAME,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 3306,
      dialect: 'mysql',
      dialectModule: require('mysql2'),
      logging: false,
    }
  );

  console.log(`Connected to ${process.env.CONTENT_DB_NAME || 'elite_content'} at ${process.env.DB_HOST}`);
  let added = 0;
  let skipped = 0;

  for (const table of KIDS_TABLES) {
    try {
      // Check if createdAt column exists
      const [rows] = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :table AND COLUMN_NAME = 'createdAt'`,
        { replacements: { db: process.env.CONTENT_DB_NAME || 'elite_content', table } }
      );

      if (rows.length > 0) {
        skipped++;
        continue; // Already has createdAt
      }

      // Add createdAt and updatedAt
      await sequelize.query(
        `ALTER TABLE \`${table}\`
         ADD COLUMN createdAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
         ADD COLUMN updatedAt DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
      console.log(`  ✅ Added timestamps to ${table}`);
      added++;
    } catch (err) {
      if (err.message.includes('Duplicate column')) {
        skipped++;
      } else {
        console.error(`  ⚠️  ${table}: ${err.message}`);
      }
    }
  }

  await sequelize.close();
  console.log(`\nDone: ${added} tables updated, ${skipped} already had timestamps`);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
