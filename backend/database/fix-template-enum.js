#!/usr/bin/env node
/**
 * Fix: Add missing template ENUM values to kids_game_configs
 * The ENUM was originally 'matching','tap-recognition','drag-sort','quiz'
 * but the app now has 6 templates. This ALTERs the column to include all 6.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function fix() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USERNAME || process.env.DB_USER || 'elite',
    password: process.env.DB_PASSWORD || process.env.DB_PASS,
    database: process.env.CONTENT_DB_NAME || 'elite_content',
  });

  const NEW_ENUM = "'matching','tap-recognition','drag-sort','quiz','fill-in-blank','puzzle-split'";

  // Check current column type
  const [cols] = await conn.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'kids_game_configs' AND COLUMN_NAME = 'template'`,
    [process.env.CONTENT_DB_NAME || 'elite_content']
  );

  if (cols.length === 0) {
    console.log('⚠️  kids_game_configs.template column not found — table may not exist yet');
    await conn.end();
    return;
  }

  const currentType = cols[0].COLUMN_TYPE;
  console.log(`Current template ENUM: ${currentType}`);

  if (currentType.includes('fill-in-blank')) {
    console.log('✅ Already includes fill-in-blank and puzzle-split — nothing to do');
    await conn.end();
    return;
  }

  console.log('🔧 ALTERing template ENUM to include all 6 values...');
  await conn.query(
    `ALTER TABLE kids_game_configs MODIFY COLUMN template ENUM(${NEW_ENUM}) NOT NULL`
  );
  console.log('✅ ALTER complete — template now accepts all 6 game types');

  await conn.end();
}

fix().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
