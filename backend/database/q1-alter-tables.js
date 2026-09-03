'use strict';
/**
 * Q1 Migration: Add columns to existing tables (safe, additive)
 * Run: node backend/database/q1-alter-tables.js [--dry-run]
 */
const dbm = require('../src/models');

const DRY_RUN = process.argv.includes('--dry-run');

// Each item: { table, column, ddl }
const ALTERS = [
  // kids_game_item_responses
  {
    table: 'kids_game_item_responses',
    column: 'quality',
    ddl: `ALTER TABLE kids_game_item_responses ADD COLUMN quality TINYINT NULL COMMENT 'SM-2 quality rating 0-5' AFTER correct`,
  },
  {
    table: 'kids_game_item_responses',
    column: 'skill_key',
    ddl: `ALTER TABLE kids_game_item_responses ADD COLUMN skill_key VARCHAR(100) NULL COMMENT 'ADE skill key' AFTER quality`,
  },
  {
    table: 'kids_game_item_responses',
    column: 'mastery_before',
    ddl: `ALTER TABLE kids_game_item_responses ADD COLUMN mastery_before DECIMAL(5,4) NULL COMMENT 'mastery before this response' AFTER skill_key`,
  },
  {
    table: 'kids_game_item_responses',
    column: 'mastery_after',
    ddl: `ALTER TABLE kids_game_item_responses ADD COLUMN mastery_after DECIMAL(5,4) NULL COMMENT 'mastery after this response' AFTER mastery_before`,
  },

  // kids_progress
  {
    table: 'kids_progress',
    column: 'xp_breakdown',
    ddl: `ALTER TABLE kids_progress ADD COLUMN xp_breakdown JSON NULL COMMENT 'detailed XP calculation' AFTER xp`,
  },
  {
    table: 'kids_progress',
    column: 'mastery_updates',
    ddl: `ALTER TABLE kids_progress ADD COLUMN mastery_updates JSON NULL COMMENT 'per-skill mastery changes' AFTER xp_breakdown`,
  },
  {
    table: 'kids_progress',
    column: 'reviews_scheduled',
    ddl: `ALTER TABLE kids_progress ADD COLUMN reviews_scheduled INT NULL COMMENT 'number of reviews scheduled' AFTER mastery_updates`,
  },
  {
    table: 'kids_progress',
    column: 'streak_current',
    ddl: `ALTER TABLE kids_progress ADD COLUMN streak_current INT NULL COMMENT 'streak at time of completion' AFTER reviews_scheduled`,
  },
];

async function columnExists(content, table, column) {
  const [rows] = await content.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c`,
    { replacements: { t: table, c: column } }
  );
  const row = (Array.isArray(rows) ? rows : [])[0] || { cnt: 0 };
  return Number(row.cnt) > 0;
}

async function run() {
  const { content } = dbm();

  for (const alter of ALTERS) {
    if (DRY_RUN) {
      console.log(`[DRY RUN] ${alter.table}.${alter.column}`);
      console.log(alter.ddl);
      continue;
    }

    const exists = await columnExists(content, alter.table, alter.column);
    if (exists) {
      console.log(`✓ skip ${alter.table}.${alter.column} (exists)`);
      continue;
    }

    try {
      await content.query(alter.ddl);
      console.log(`✓ ${alter.table}.${alter.column} added`);
    } catch (err) {
      console.log(`✗ ${alter.table}.${alter.column}: ${err.message}`);
    }
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
