'use strict';
/**
 * Q1 Migration: Create kids_shop_items table + seed default items
 * Run: node backend/database/q1-seed-shop.js [--dry-run]
 */
const dbm = require('../src/models');
const { DEFAULT_ITEMS } = require('../src/services/shopService');

const DRY_RUN = process.argv.includes('--dry-run');

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS kids_shop_items (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  cost INT NOT NULL,
  item_type VARCHAR(50) NOT NULL,
  preview_url VARCHAR(500) NULL,
  metadata JSON,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_shop_category (category),
  KEY idx_shop_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

async function run() {
  const { content } = dbm();

  if (DRY_RUN) {
    console.log('[DRY RUN] Would create table and seed:');
    console.log(DEFAULT_ITEMS.map(i => `  - ${i.id} (${i.name}, ${i.cost} XP)`).join('\n'));
    return;
  }

  // Create table
  await content.query(CREATE_TABLE);
  console.log('✓ kids_shop_items created');

  // Check if already seeded
  const [count] = await content.query('SELECT COUNT(*) AS cnt FROM kids_shop_items');
  const row = (Array.isArray(count) ? count : [])[0] || { cnt: 0 };
  if (Number(row.cnt) > 0) {
    console.log(`✓ shop items already seeded (${row.cnt} items), skipping`);
    return;
  }

  // Seed items
  for (const item of DEFAULT_ITEMS) {
    await content.query(
      `INSERT INTO kids_shop_items (id, name, description, category, cost, item_type, preview_url)
       VALUES (:id, :name, :description, :category, :cost, :item_type, :preview_url)`,
      {
        replacements: {
          id: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          cost: item.cost,
          item_type: item.item_type,
          preview_url: item.preview_url,
        },
      }
    );
  }

  console.log(`✓ Seeded ${DEFAULT_ITEMS.length} shop items`);
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
