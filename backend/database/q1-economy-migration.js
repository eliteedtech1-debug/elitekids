'use strict';
/**
 * Q1 Migration: Create economy tables (kids_economy, transactions, shop, milestones)
 * Run: node backend/database/q1-economy-migration.js [--dry-run]
 */
const dbm = () => require('../src/models');

const DRY_RUN = process.argv.includes('--dry-run');

const SQLS = [
  // kids_economy
  `CREATE TABLE IF NOT EXISTS kids_economy (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    xp_total INT NOT NULL DEFAULT 0,
    xp_session_today INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1,
    streak_current INT NOT NULL DEFAULT 0,
    streak_longest INT NOT NULL DEFAULT 0,
    streak_freeze_count TINYINT NOT NULL DEFAULT 0,
    last_play_date DATE NULL,
    current_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    title VARCHAR(100) NULL,
    total_games INT NOT NULL DEFAULT 0,
    perfect_games INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_economy_child (child_admission_no),
    KEY idx_economy_level (level),
    KEY idx_economy_xp (xp_total)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // kids_economy_transactions
  `CREATE TABLE IF NOT EXISTS kids_economy_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    action VARCHAR(50) NOT NULL,
    amount INT NOT NULL,
    base_amount INT NOT NULL,
    perfect_bonus INT NOT NULL DEFAULT 0,
    streak_bonus INT NOT NULL DEFAULT 0,
    multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    context JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_econ_tx_child (child_admission_no),
    KEY idx_econ_tx_action (action),
    KEY idx_econ_tx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // kids_shop_purchases
  `CREATE TABLE IF NOT EXISTS kids_shop_purchases (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    cost INT NOT NULL,
    equipped BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_purchase_child_item (child_admission_no, item_id),
    KEY idx_purchase_child (child_admission_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // kids_economy_milestones
  `CREATE TABLE IF NOT EXISTS kids_economy_milestones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    milestone_type VARCHAR(50) NOT NULL,
    milestone_value INT NOT NULL,
    achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reward_type VARCHAR(50) NULL,
    reward_value VARCHAR(200) NULL,
    UNIQUE KEY uq_milestone_child_type (child_admission_no, milestone_type),
    KEY idx_milestone_child (child_admission_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function run() {
  if (DRY_RUN) {
    console.log('[DRY RUN] Would execute:');
    SQLS.forEach(s => console.log(s));
    return;
  }
  const { content } = dbm();
  for (const sql of SQLS) {
    await content.query(sql);
  }
  console.log('✓ kids_economy, kids_economy_transactions, kids_shop_purchases, kids_economy_milestones created');
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
