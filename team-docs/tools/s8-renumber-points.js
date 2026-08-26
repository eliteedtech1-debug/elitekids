#!/usr/bin/env node
/**
 * S8-3: kids_curriculum_points — renumber + create for the 10-week JP ladder
 *
 * What this does:
 *   1. Finds any stale PA-U{N}-* entries (old E1 coding) → deletes or remaps
 *   2. Ensures U1-U10 all have curriculum_points matching the actual game configs
 *   3. Validates final state: every row has a valid cp-jp-u{N}-{key} id
 *
 * Units 1-5 (from jollyPhonicsSeriesSeed.js):
 *   U1: tap, match, sort
 *   U2: tap, match, sort
 *   U3: tap, quiz, sort
 *   U4: fib, quiz-aff, sort-chsh
 *   U5: quiz-riddle, fib, sort-patterns
 *
 * Units 6-10 (from s8-content-expand.js):
 *   U6: tap, match, sort
 *   U7: tap, match, sort
 *   U8: tap, quiz, fib
 *   U9: tap, match, sort
 *   U10: tap, quiz, fib, sort
 *
 * Usage:
 *   node s8-renumber-points.js              # dry-run (default)
 *   node s8-renumber-points.js --apply      # execute changes
 */

'use strict';

const path = require('path');
const APPLY = process.argv.includes('--apply');

const BACKEND_DIR = path.resolve(__dirname, '../../backend');

// Canonical curriculum points for the 10-week JP ladder.
// Each entry: { id, nerdc_code, category, age_band, learning_objective }
const CANONICAL_POINTS = [
  // U1: s a t i p n (Creche)
  { unit: 1, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U1', cat: 'Letters', age: 'Creche', desc: 'Letter-sound tap recognition — Group 1' },
  { unit: 1, key: 'match', nerdc: 'NERDC-ECC-LIT-PA-U1', cat: 'Letters', age: 'Creche', desc: 'Sound-to-picture matching — Group 1' },
  { unit: 1, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U1', cat: 'Letters', age: 'Creche', desc: 'Letter ordering — Group 1' },
  // U2: c k e h r m d (Nursery)
  { unit: 2, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U2', cat: 'Letters', age: 'Nursery', desc: 'Listen & tap — Group 2' },
  { unit: 2, key: 'match', nerdc: 'NERDC-ECC-LIT-PA-U2', cat: 'Letters', age: 'Nursery', desc: 'Sound-to-picture matching — Group 2' },
  { unit: 2, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U2', cat: 'Letters', age: 'Nursery', desc: 'Letter ordering — Group 2' },
  // U3: g o u l f b + ai/oa (KG1)
  { unit: 3, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U3', cat: 'Letters', age: 'KG1', desc: 'Find the sound word — Group 3' },
  { unit: 3, key: 'quiz', nerdc: 'NERDC-ECC-LIT-PA-U3', cat: 'Letters', age: 'KG1', desc: 'First sound quiz — Group 3' },
  { unit: 3, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U3', cat: 'Letters', age: 'KG1', desc: 'Letter ordering — Group 3' },
  // U4: ch sh th ng oo (KG2)
  { unit: 4, key: 'fib', nerdc: 'NERDC-ECC-LIT-PA-U4', cat: 'Letters', age: 'KG2', desc: 'Fill-in-blank digraphs — Group 4' },
  { unit: 4, key: 'quiz-aff', nerdc: 'NERDC-ECC-LIT-PA-U4', cat: 'Affective', age: 'KG2', desc: 'Kindness quiz with sh/ch — Group 4' },
  { unit: 4, key: 'sort-chsh', nerdc: 'NERDC-ECC-LIT-PA-U4', cat: 'Letters', age: 'KG2', desc: 'Digraph ordering — Group 4' },
  // U5: qu ou oi ue er ar (Primary)
  { unit: 5, key: 'quiz-riddle', nerdc: 'NERDC-ECC-LIT-PA-U5', cat: 'Letters', age: 'Primary', desc: 'Phonics riddle challenge — Group 5' },
  { unit: 5, key: 'fib', nerdc: 'NERDC-ECC-LIT-PA-U5', cat: 'Letters', age: 'Primary', desc: 'Digraph detective fill-blank — Group 5' },
  { unit: 5, key: 'sort-patterns', nerdc: 'NERDC-ECC-LIT-PA-U5', cat: 'Letters', age: 'Primary', desc: 'Sound expert ordering — Group 5' },
  // U6: y x ch sh th th
  { unit: 6, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U6', cat: 'Letters', age: 'Primary', desc: 'Y-X digraph tap — Group 6' },
  { unit: 6, key: 'match', nerdc: 'NERDC-ECC-LIT-PA-U6', cat: 'Letters', age: 'Primary', desc: 'Y-X digraph matching — Group 6' },
  { unit: 6, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U6', cat: 'Letters', age: 'Primary', desc: 'Y-X digraph ordering — Group 6' },
  // U7: qu ou oi ue er ar
  { unit: 7, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U7', cat: 'Letters', age: 'Primary', desc: 'Complex vowel tap — Group 7' },
  { unit: 7, key: 'match', nerdc: 'NERDC-ECC-LIT-PA-U7', cat: 'Letters', age: 'Primary', desc: 'Complex vowel matching — Group 7' },
  { unit: 7, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U7', cat: 'Letters', age: 'Primary', desc: 'Complex vowel ordering — Group 7' },
  // U8: Word Builders blend & read
  { unit: 8, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U8', cat: 'Letters', age: 'Primary', desc: 'Word builder tap — blending' },
  { unit: 8, key: 'quiz', nerdc: 'NERDC-ECC-LIT-PA-U8', cat: 'Letters', age: 'Primary', desc: 'Word builder quiz — blending' },
  { unit: 8, key: 'fib', nerdc: 'NERDC-ECC-LIT-PA-U8', cat: 'Letters', age: 'Primary', desc: 'Word builder fill-blank — blending' },
  // U9: Tricky Words I: the I he she was to we be
  { unit: 9, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U9', cat: 'Letters', age: 'Primary', desc: 'Tricky words recognition — Group 9' },
  { unit: 9, key: 'match', nerdc: 'NERDC-ECC-LIT-PA-U9', cat: 'Letters', age: 'Primary', desc: 'Tricky words matching — Group 9' },
  { unit: 9, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U9', cat: 'Letters', age: 'Primary', desc: 'Tricky words ordering — Group 9' },
  // U10: Big Review 42 sounds comprehensive
  { unit: 10, key: 'tap', nerdc: 'NERDC-ECC-LIT-PA-U10', cat: 'Letters', age: 'Primary', desc: 'Big Review tap — 42 sounds' },
  { unit: 10, key: 'quiz', nerdc: 'NERDC-ECC-LIT-PA-U10', cat: 'Letters', age: 'Primary', desc: 'Big Review quiz — 42 sounds' },
  { unit: 10, key: 'fib', nerdc: 'NERDC-ECC-LIT-PA-U10', cat: 'Letters', age: 'Primary', desc: 'Big Review fill-blank — 42 sounds' },
  { unit: 10, key: 'sort', nerdc: 'NERDC-ECC-LIT-PA-U10', cat: 'Letters', age: 'Primary', desc: 'Big Review ordering — 42 sounds' },
];

function makeId(unit, key) {
  return `cp-jp-u${unit}-${key}`;
}

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

  // ── 1. Audit current state ────────────────────────────────────────────────
  const [existing] = await c.execute('SELECT id, nerdc_code, category, age_band FROM kids_curriculum_points ORDER BY id');
  console.log(`\nCurrent curriculum_points: ${existing.length}`);

  const validIds = new Set(CANONICAL_POINTS.map((p) => makeId(p.unit, p.key)));
  const stale = [];
  const valid = [];

  for (const r of existing) {
    if (validIds.has(r.id)) {
      valid.push(r);
    } else {
      stale.push(r);
    }
  }

  if (stale.length > 0) {
    console.log(`\n⚠️  Stale entries (${stale.length}):`);
    for (const s of stale) {
      console.log(`  ${s.id} | ${s.nerdc_code || 'NULL'} | ${s.category || 'NULL'}`);
    }
  } else {
    console.log('\n✅ No stale entries found.');
  }

  // ── 2. Find missing ──────────────────────────────────────────────────────
  const existingIds = new Set(existing.map((r) => r.id));
  const missing = CANONICAL_POINTS.filter((p) => !existingIds.has(makeId(p.unit, p.key)));

  if (missing.length === 0 && stale.length === 0) {
    console.log('\n✅ All curriculum_points are valid and complete. Nothing to do.');
    await c.end();
    return;
  }

  if (missing.length > 0) {
    console.log(`\nMissing entries (${missing.length}):`);
    for (const m of missing) {
      console.log(`  ${makeId(m.unit, m.key)} | ${m.nerdc} | ${m.cat} | ${m.desc}`);
    }
  }

  // ── 3. Apply ─────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('\n═══ DRY-RUN — no changes applied ═══');
    console.log('Run with --apply to execute.');
    await c.end();
    return;
  }

  let deleted = 0;
  let created = 0;
  let updated = 0;

  // 3a. Delete stale entries
  for (const s of stale) {
    try {
      await c.execute('DELETE FROM kids_curriculum_points WHERE id = ?', [s.id]);
      console.log(`  DELETED stale: ${s.id}`);
      deleted++;
    } catch (err) {
      console.log(`  FAILED delete ${s.id}: ${err.message}`);
    }
  }

  // 3b. Create missing entries
  for (const p of missing) {
    const id = makeId(p.unit, p.key);
    const obj = `${p.desc} — unit ${p.unit}, game ${p.key}`;
    try {
      await c.execute(
        `INSERT INTO kids_curriculum_points
         (id, nerdc_code, category, age_band, learning_objective, mapped_item_ids, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, '[]', NOW(), NOW())`,
        [id, p.nerdc, p.cat, p.age, obj]
      );
      console.log(`  CREATED: ${id}`);
      created++;
    } catch (err) {
      console.log(`  SKIP ${id}: ${err.code || err.message}`);
    }
  }

  // ── 4. Final audit ───────────────────────────────────────────────────────
  const [final] = await c.execute('SELECT id, nerdc_code, category FROM kids_curriculum_points ORDER BY id');
  console.log(`\n── Final State ──`);
  console.log(`Total rows: ${final.length} (deleted ${deleted}, created ${created})`);

  const finalValid = final.every((r) => validIds.has(r.id));
  if (finalValid) {
    console.log('✅ All rows have valid cp-jp-u{N}-{key} ids.');
  } else {
    console.log('⚠️  Some rows still have unexpected ids — check above.');
  }

  // Distribution by unit
  const byUnit = {};
  for (const r of final) {
    const m = r.id.match(/cp-jp-u(\d+)/);
    const u = m ? parseInt(m[1]) : 0;
    byUnit[u] = (byUnit[u] || 0) + 1;
  }
  console.log('\nDistribution by unit:');
  for (const u of Object.keys(byUnit).sort((a, b) => a - b)) {
    console.log(`  U${u}: ${byUnit[u]} curriculum points`);
  }

  await c.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
