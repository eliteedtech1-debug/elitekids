'use strict';
/**
 * Q1 Migration: Create SRE v2 table (kids_review_schedule_v2)
 * Run: node backend/database/q1-sre-migration.js [--dry-run]
 */
const dbm = () => require('../src/models');

const DRY_RUN = process.argv.includes('--dry-run');

const SQL = `
CREATE TABLE IF NOT EXISTS kids_review_schedule_v2 (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  skill_key VARCHAR(100) NOT NULL,
  item_id VARCHAR(50) NOT NULL,

  ease DECIMAL(5,3) NOT NULL DEFAULT 2.500,
  interval_days INT NOT NULL DEFAULT 1,
  repetitions INT NOT NULL DEFAULT 0,
  last_quality TINYINT NULL,

  next_review_at DATETIME NOT NULL,
  last_reviewed_at DATETIME NULL,

  status ENUM('active', 'completed', 'suspended') NOT NULL DEFAULT 'active',

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_review_v2_child_item (child_admission_no, skill_key, item_id),
  KEY idx_review_v2_child (child_admission_no),
  KEY idx_review_v2_next (next_review_at),
  KEY idx_review_v2_status (status)
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
  console.log('✓ kids_review_schedule_v2 created');
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
