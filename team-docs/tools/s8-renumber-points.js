#!/usr/bin/env node
/**
 * S8-3: kids_curriculum_points — create entries for units 6-10
 *
 * Current state: 25 rows for U1-U5 (match, sort, tap, quiz, oral, print per unit)
 * Missing: U6-U10 need curriculum_points for the new 10-week JP ladder
 *
 * Units 6-10 per the ladder:
 *   U6: y x ch sh th th
 *   U7: qu ou oi ue er ar
 *   U8: Word Builders blend&read
 *   U9: Tricky Words I: the I he she was to we be
 *   U10: Big Review 42 sounds
 *
 * Usage: node s8-renumber-points.js [--dry-run]
 */

'use strict';

const path = require('path');
const dryRun = process.argv.includes('--dry-run');

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

async function main() {
  process.chdir(BACKEND_DIR);
  require(path.join(BACKEND_DIR, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND_DIR, '.env') });
  const mysql = require(path.join(BACKEND_DIR, 'node_modules', 'mysql2', 'promise'));

  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS,
    database: process.env.CONTENT_DB_NAME || 'elite_content',
    charset: 'utf8mb4',
  });
  console.log('Connected to elite_content');

  // 1. Current state
  const [existing] = await c.execute('SELECT id, nerdc_code, category FROM kids_curriculum_points ORDER BY id');
  console.log(`\nExisting curriculum_points: ${existing.length}`);
  const existingUnits = new Set();
  for (const r of existing) {
    const m = r.id.match(/cp-jp-u(\d+)/);
    if (m) existingUnits.add(parseInt(m[1]));
  }
  console.log(`Units with points: ${[...existingUnits].sort((a,b)=>a-b).join(', ')}`);

  // 2. Units that need points
  const missing = [];
  for (let u = 6; u <= 10; u++) {
    if (!existingUnits.has(u)) missing.push(u);
  }
  if (missing.length === 0) {
    console.log('\nAll units U1-U10 have curriculum_points. Nothing to do.');
    await c.end();
    return;
  }
  console.log(`Missing units: ${missing.join(', ')}`);

  // 3. Define what to create per unit
  //    Match the existing pattern: each unit has {match/quiz, sort, tap, oral, print}
  const UNIT_DEFS = {
    6: {
      nerdc_code: 'NERDC-ECC-LIT-PA-U6',
      desc: 'Phonics — y x ch sh th th',
      items: ['match', 'sort', 'tap', 'quiz', 'oral', 'print'],
    },
    7: {
      nerdc_code: 'NERDC-ECC-LIT-PA-U7',
      desc: 'Phonics — qu ou oi ue er ar',
      items: ['match', 'sort', 'tap', 'quiz', 'oral', 'print'],
    },
    8: {
      nerdc_code: 'NERDC-ECC-LIT-PA-U8',
      desc: 'Word Builders — blend & read',
      items: ['match', 'sort', 'tap', 'quiz', 'oral', 'print'],
    },
    9: {
      nerdc_code: 'NERDC-ECC-LIT-PA-U9',
      desc: 'Tricky Words I: the I he she was to we be',
      items: ['match', 'sort', 'tap', 'quiz', 'oral', 'print'],
    },
    10: {
      nerdc_code: 'NERDC-ECC-LIT-PA-U10',
      desc: 'Big Review — 42 sounds comprehensive',
      items: ['match', 'sort', 'tap', 'quiz', 'oral', 'print'],
    },
  };

  let created = 0;
  for (const u of missing) {
    const def = UNIT_DEFS[u];
    if (!def) continue;

    for (const item of def.items) {
      const id = `cp-jp-u${u}-${item}`;
      const isLanguage = (item === 'oral' || item === 'print');
      const nerdc = isLanguage ? 'NERDC-ECC-LIT-ORAL' : (item === 'print' ? 'NERDC-ECC-LIT-PRINT' : def.nerdc_code);
      const category = isLanguage ? 'Language' : 'Letters';
      const obj = `${def.desc} — ${item} activity for unit ${u}`;

      if (dryRun) {
        console.log(`  [DRY] ${id} | ${nerdc} | ${category} | ${obj}`);
      } else {
        try {
          await c.execute(
            `INSERT IGNORE INTO kids_curriculum_points
             (id, nerdc_code, category, age_band, learning_objective, mapped_item_ids, createdAt, updatedAt)
             VALUES (?, ?, ?, '3-6', ?, '[]', NOW(), NOW())`,
            [id, nerdc, category, obj]
          );
          console.log(`  CREATED: ${id}`);
          created++;
        } catch (err) {
          console.log(`  SKIP ${id}: ${err.code || err.message}`);
        }
      }
    }
  }

  // 4. Final audit
  const [final] = await c.execute('SELECT COUNT(*) AS n FROM kids_curriculum_points');
  console.log(`\nFinal count: ${final[0].n} (created ${created} new)`);
  
  const [dist] = await c.execute('SELECT nerdc_code, COUNT(*) AS n FROM kids_curriculum_points GROUP BY nerdc_code ORDER BY nerdc_code');
  console.log('Distribution:');
  for (const d of dist) console.log(`  ${d.nerdc_code || 'NULL'}: ${d.n}`);

  await c.end();
  console.log('\nDone.');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
