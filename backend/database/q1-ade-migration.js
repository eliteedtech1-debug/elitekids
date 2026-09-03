'use strict';
/**
 * Q1 Migration: Create ADE v2 table (kids_adaptive_state_v2)
 * Run: node backend/database/q1-ade-migration.js [--dry-run]
 */
const dbm = require('../src/models');

const DRY_RUN = process.argv.includes('--dry-run');

const SQL = `
CREATE TABLE IF NOT EXISTS kids_adaptive_state_v2 (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  skill_key VARCHAR(100) NOT NULL,

  mastery_probability DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
  bkt_p_learning DECIMAL(5,4) NOT NULL DEFAULT 0.3000,
  bkt_p_guess DECIMAL(5,4) NOT NULL DEFAULT 0.2500,
  bkt_p_slip DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
  bkt_p_transit DECIMAL(5,4) NOT NULL DEFAULT 0.1000,

  elo_rating INT NOT NULL DEFAULT 1000,
  current_difficulty TINYINT NOT NULL DEFAULT 3,

  total_attempts INT NOT NULL DEFAULT 0,
  correct_attempts INT NOT NULL DEFAULT 0,
  avg_response_time_ms INT NOT NULL DEFAULT 0,
  last_5_response_times JSON,

  consecutive_wrong INT NOT NULL DEFAULT 0,
  struggle_count_today INT NOT NULL DEFAULT 0,
  last_struggle_at DATETIME NULL,

  streak_days INT NOT NULL DEFAULT 0,
  last_practiced_at DATETIME NULL,

  zpd_lower DECIMAL(5,3) NOT NULL DEFAULT 0.300,
  zpd_upper DECIMAL(5,3) NOT NULL DEFAULT 0.700,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_adaptive_v2_child_skill (child_admission_no, skill_key),
  KEY idx_adaptive_v2_child (child_admission_no),
  KEY idx_adaptive_v2_mastery (mastery_probability),
  KEY idx_adaptive_v2_difficulty (current_difficulty),
  KEY idx_adaptive_v2_review (last_practiced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function run() {
  if (DRY_RUN) {
    console.log('[DRY RUN] Would execute:');
    console.log(SQL);
    return;
  }
  const { content } = dbm();
  await content.query(SQL);
  console.log('✓ kids_adaptive_state_v2 created');
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
