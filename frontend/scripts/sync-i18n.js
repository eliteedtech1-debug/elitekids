#!/usr/bin/env node
/**
 * Sync en.json from en.ts — the single source of truth for English translations.
 * Run: node scripts/sync-i18n.js
 */
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const chunksDir = path.join(HERE, '../src/lib/i18n/chunks');
const enJsonPath = path.join(HERE, '../src/lib/i18n/locales/en.json');
const haJsonPath = path.join(HERE, '../src/lib/i18n/locales/ha.json');

// Read en.ts chunks (alphabetical per-letter-range files). en.ts itself is a
// barrel merging these — never edit entries directly in en.ts.
const chunkFiles = fs
  .readdirSync(chunksDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f) => path.join(chunksDir, f));

// Extract key-value pairs using regex (handles 'key': 'value' and
// 'key': "value" — values are single-line in chunk files).
const entries = {};
const regex = /^\s+'([^']+)':\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'),?\s*$/gm;
for (const file of chunkFiles) {
  const tsContent = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = regex.exec(tsContent)) !== null) {
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];
    // Unescape
    entries[key] = value.replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
}

console.log(`Extracted ${Object.keys(entries).length} keys from en.ts`);

// Write en.json (sorted)
const sortedEntries = Object.fromEntries(
  Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))
);
fs.writeFileSync(enJsonPath, JSON.stringify(sortedEntries, null, 2) + '\n');
console.log(`Written ${Object.keys(sortedEntries).length} keys to en.json`);

// Read existing ha.json
let haEntries = {};
try {
  haEntries = JSON.parse(fs.readFileSync(haJsonPath, 'utf-8'));
} catch {}

// Add any missing keys to ha.json (with English fallback placeholder)
const missingInHa = Object.keys(entries).filter(k => !(k in haEntries));
if (missingInHa.length > 0) {
  console.log(`\n${missingInHa.length} keys missing from ha.json (using English fallback):`);
  for (const k of missingInHa) {
    console.log(`  + ${k}`);
    haEntries[k] = entries[k]; // English fallback
  }
  // Write ha.json sorted
  const sortedHa = Object.fromEntries(
    Object.entries(haEntries).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(haJsonPath, JSON.stringify(sortedHa, null, 2) + '\n');
  console.log(`Written ${Object.keys(sortedHa).length} keys to ha.json`);
} else {
  console.log('ha.json is already in sync.');
}

// Verify
const verifyEn = JSON.parse(fs.readFileSync(enJsonPath, 'utf-8'));
console.log(`\nFinal en.json: ${Object.keys(verifyEn).length} keys`);
