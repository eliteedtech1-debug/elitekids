#!/usr/bin/env node
/**
 * Sync en.json from en.ts — the single source of truth for English translations.
 * Run: node scripts/sync-i18n.js
 */
const fs = require('fs');
const path = require('path');

const enTsPath = path.join(__dirname, '../src/lib/i18n/en.ts');
const enJsonPath = path.join(__dirname, '../src/lib/i18n/locales/en.json');
const haJsonPath = path.join(__dirname, '../src/lib/i18n/locales/ha.json');

// Read en.ts
const tsContent = fs.readFileSync(enTsPath, 'utf-8');

// Extract key-value pairs using regex
const entries = {};
const regex = /^\s+'([^']+)':\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'),?\s*$/gm;
let match;
while ((match = regex.exec(tsContent)) !== null) {
  const key = match[1];
  const value = match[2] !== undefined ? match[2] : match[3];
  // Unescape
  entries[key] = value.replace(/\\'/g, "'").replace(/\\"/g, '"');
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
