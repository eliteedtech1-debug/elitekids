#!/usr/bin/env node
'use strict';

/**
 * Q46 verifier — prove classToAgeLevel maps the REAL elite_db.classes universe.
 *
 * Reads credentials from backend/.env strictly via env resolution (values are
 * never printed), runs `SELECT DISTINCT class_name, section FROM classes`
 * (read-only) and maps every row through src/services/ageBand.classToAgeLevel.
 *
 * PASS = every row maps to a member of AGE_BANDS (section fallback included).
 * FAIL = prints every unmapped row and exits 1.
 *
 * Usage: node scripts/q46-verify-class-mapping.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { AGE_BANDS, classToAgeLevel } = require('../src/services/ageBand');

function envVal(names) {
  for (const n of names) {
    if (process.env[n]) return process.env[n];
    const line = fs
      .readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${n}=`));
    if (line) return line.slice(n.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

async function main() {
  const conn = await mysql.createConnection({
    host: envVal(['DB_HOST']) || '127.0.0.1',
    port: Number(envVal(['DB_PORT']) || 3306),
    user: envVal(['DB_USERNAME']),
    password: envVal(['DB_PASSWORD']),
    database: envVal(['DB_NAME']),
  });

  // Whole-table sweep — section IN ('Nursery','Primary') is the brief's focus,
  // but every section feeds kids (students mirror), so map them all.
  const [rows] = await conn.query(
    `SELECT DISTINCT class_name, section FROM classes
     ORDER BY FIELD(section,'Nursery','NURSERY','Primary','PRIMARY','JSS','JUNIOR SECONDARY','SS','SENIOR SECONDARY','Islamiyya','TAHFIZ'), class_name`
  );

  const unmapped = [];
  const invalid = [];
  const byBand = {};
  for (const { class_name, section } of rows) {
    const band = classToAgeLevel(class_name, section);
    byBand[band] = (byBand[band] || 0) + 1;
    if (band === null) unmapped.push({ class_name, section });
    else if (!AGE_BANDS.includes(band)) invalid.push({ class_name, section, band });
  }

  console.log(`elite_db.classes distinct (class_name, section) rows: ${rows.length}`);
  console.log('Mapping distribution:', byBand);

  if (unmapped.length || invalid.length) {
    for (const r of unmapped) console.error(`UNMAPPED  section=${r.section}  class_name=${JSON.stringify(r.class_name)}`);
    for (const r of invalid) console.error(`INVALID   section=${r.section}  class_name=${JSON.stringify(r.class_name)} → ${r.band}`);
    await conn.end();
    process.exit(1);
  }

  console.log(`✅ ALL ${rows.length} class names map to valid NERDC bands (Crèche/Playgroup/Nursery 1/Nursery 2/Kindergarten/Primary).`);
  await conn.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(2);
});
