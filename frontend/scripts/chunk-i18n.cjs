#!/usr/bin/env node
/**
 * chunk-i18n.js — split en.ts into alphabetically-sorted per-letter-range
 * chunk files (chunks/en-a-c.ts … chunks/en-w-z.ts) and rewrite en.ts as a
 * barrel that merges them. Re-runnable: idempotent over the current en.ts
 * (or its barrel), keeps values byte-identical.
 *
 * Run: node scripts/chunk-i18n.js
 */
const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '../src/lib/i18n');
const EN_TS = path.join(I18N_DIR, 'en.ts');
const CHUNKS_DIR = path.join(I18N_DIR, 'chunks');

// ── Parse entries from a TS dictionary file ───────────────────────────────
// Handles: 'key': 'value', | 'key': "value", | 'key':\n  'value', and
// escaped quotes inside values (\' / \") and trailing // comments.
function parseEntries(tsContent) {
  const lines = tsContent.split('\n');
  const entries = new Map(); // key -> raw value (escapes preserved)
  let i = 0;

  const isComment = (s) => s.startsWith('//') || s.startsWith('/*') || s.startsWith('*');

  while (i < lines.length) {
    let line = lines[i].trim();
    // skip blank + comment lines
    if (!line || isComment(line) || line === '};' || line.startsWith('export')) {
      i++;
      continue;
    }
    let seg = line;
    let lineIdx = i;

    // A line may hold several entries ('k1': 'v1', 'k2': 'v2', …) — loop
    // until the remainder of the current line/block is consumed.
    while (true) {
      const m = seg.match(/^'([^']+)':(.*)$/);
      if (!m) break;
      const key = m[1];
      let rest = m[2].trim();

      // value may be on the next line
      if (!rest) {
        lineIdx++;
        while (lineIdx < lines.length && (!lines[lineIdx].trim() || isComment(lines[lineIdx].trim()))) lineIdx++;
        if (lineIdx >= lines.length) throw new Error(`EOF while reading value for ${key}`);
        seg = lines[lineIdx].trim();
        rest = seg;
      }

      // detect quote char
      const q = rest[0];
      if (q !== "'" && q !== '"') {
        throw new Error(`Unexpected value start for ${key}: ${rest.slice(0, 30)}`);
      }

      // scan the value text (same-line `rest`, or continuation lines) for the
      // closing unescaped quote. `seg` here is the VALUE portion only.
      let seg2 = rest;
      let value = '';
      let closed = false;
      let col = 1; // skip opening quote
      while (true) {
        while (col < seg2.length) {
          const ch = seg2[col];
          if (ch === '\\') { value += ch + (seg2[col + 1] || ''); col += 2; continue; }
          if (ch === q) { closed = true; break; }
          value += ch;
          col++;
        }
        if (closed) break;
        // value continues on the next line
        lineIdx++;
        if (lineIdx >= lines.length) throw new Error(`Unterminated value for ${key}`);
        value += '\\n';
        seg2 = lines[lineIdx].trim();
        col = 0;
      }

      if (entries.has(key)) throw new Error(`Duplicate key ${key}`);
      entries.set(key, value);

      // remainder after this entry's closing quote
      seg = seg2.slice(col + 1).trim();
      // allow a comma between entries
      seg = seg.replace(/^,/, '').trim();
      if (seg.startsWith('//')) { seg = ''; }
      if (!seg) break;
      if (!seg.startsWith("'")) {
        // leftover that isn't a new entry — tolerate trailing noise but don't loop forever
        throw new Error(`Unexpected tail after ${key}: ${seg.slice(0, 30)}`);
      }
    }
    i = lineIdx + 1;
  }
  return entries;
}

// ── Chunk ranges ──────────────────────────────────────────────────────────
const RANGES = [
  { file: 'en-a-c', name: 'enAC', min: 'a', max: 'c' },
  { file: 'en-d-f', name: 'enDF', min: 'd', max: 'f' },
  { file: 'en-g-i', name: 'enGI', min: 'g', max: 'i' },
  { file: 'en-j-l', name: 'enJL', min: 'j', max: 'l' },
  { file: 'en-m-o', name: 'enMO', min: 'm', max: 'o' },
  { file: 'en-p-r', name: 'enPR', min: 'p', max: 'r' },
  { file: 'en-s',   name: 'enS',  min: 's', max: 's' },
  { file: 'en-t-v', name: 'enTV', min: 't', max: 'v' },
  { file: 'en-w-z', name: 'enWZ', min: 'w', max: 'z' },
];

function rangeOf(key) {
  const c = key[0].toLowerCase();
  return RANGES.find((r) => c >= r.min && c <= r.max) || RANGES[RANGES.length - 1];
}

// ── Serialize a chunk file (alphabetically sorted, 2-space indent) ────────
// Pick the quote char per value: single quotes unless the value contains an
// apostrophe (then double quotes, escaping inner double quotes). Values keep
// their source escapes (\u2019, \\', …) byte-identical.
function tsLiteral(v) {
  if (v.includes("'")) return `"${v.replace(/"/g, '\\"')}"`;
  return `'${v}'`;
}

function serializeChunk(entries) {
  const lines = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  '${k}': ${tsLiteral(v)},`);
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────
const src = fs.readFileSync(EN_TS, 'utf8');
const entries = parseEntries(src);
console.log(`Parsed ${entries.size} keys from en.ts`);

// group by range
const buckets = new Map(RANGES.map((r) => [r.name, {}]));
for (const [k, v] of entries) buckets.get(rangeOf(k).name)[k] = v;

fs.mkdirSync(CHUNKS_DIR, { recursive: true });
const importLines = [];
for (const r of RANGES) {
  const body = serializeChunk(buckets.get(r.name));
  const filePath = path.join(CHUNKS_DIR, `${r.file}.ts`);
  const header = `/**\n * English keys ${r.min.toUpperCase()}–${r.max.toUpperCase()} — alphabetically sorted.\n * Keep this file sorted: insert new keys in their alphabetical position.\n */\n\nexport const ${r.name}: Record<string, string> = {\n${body}\n};\n`;
  fs.writeFileSync(filePath, header);
  console.log(`Wrote ${path.relative(I18N_DIR, filePath)} (${Object.keys(buckets.get(r.name)).length} keys)`);
  importLines.push(`import { ${r.name} } from './chunks/${r.file}';`);
}

const barrel = `/**
 * English dictionary — consolidated from alphabetically sorted chunk files
 * (chunks/en-*.ts). Keys resolve identically to a single flat object.
 *
 * ADDING A KEY: find the chunk matching the key's first letter and insert it
 * in alphabetical position. Do NOT add entries directly to this file.
 */
${importLines.join('\n')}

export const en: Record<string, string> = {
  ${RANGES.map((r) => `...${r.name}`).join(', ')}
};
`;
fs.writeFileSync(EN_TS, barrel);
console.log(`Rewrote en.ts as barrel (${RANGES.length} chunks)`);