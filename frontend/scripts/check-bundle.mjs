#!/usr/bin/env node
/**
 * Pre-deploy bundle guard.
 *
 * Fails when:
 *  - built dist contains localhost / 127.0.0.1 URLs (dev leakage)
 *  - VITE_API_URL is not explicitly defined in build env files
 *    (empty string is allowed — nginx serves the SPA same-origin and
 *    proxies /kids,/media,... to the API on :8484)
 *
 * Usage: node scripts/check-bundle.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const ENV_FILES = ['.env', '.env.production', '.env.local'];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

let failed = false;

// 1) No dev-host URLs inside built assets
if (!existsSync(DIST)) {
  console.error('✗ dist/ not found — build first (npm run build)');
  process.exit(1);
}
const DEV_HOST_RE = /(https?:)?\/\/(localhost|127\.0\.0\.1)[:/\s'"`]/g;
// Vendored lib (workbox-style SW fallback): `location.href || "http://localhost"` is
// never used as a request URL in our SPA — allowlisted to avoid false positives.
const ALLOWLIST = [/(location\.href\s*\|\|\s*["'`]https?:\/\/(localhost|127\.0\.0\.1)["'`])/g];
for (const file of walk(DIST)) {
  if (!['.js', '.css', '.html'].includes(extname(file))) continue;
  let text = readFileSync(file, 'utf8');
  for (const re of ALLOWLIST) text = text.replace(re, '');
  const matches = text.match(DEV_HOST_RE);
  if (matches?.length) {
    failed = true;
    console.error(`✗ ${file.replace(DIST + '/', '')}: ${matches.length} dev-host URL(s):`, [...new Set(matches)]);
  }
}

// 2) VITE_API_URL must be explicitly defined somewhere
const foundIn = ENV_FILES.filter((f) => {
  if (!existsSync(f)) return false;
  return /^VITE_API_URL=/m.test(readFileSync(f, 'utf8'));
});
if (foundIn.length === 0) {
  failed = true;
  console.error('✗ VITE_API_URL not defined in any of:', ENV_FILES.join(', '));
} else {
  for (const f of foundIn) {
    const val = readFileSync(f, 'utf8').match(/^VITE_API_URL=(.*)$/m)?.[1]?.trim() ?? '';
    if (val === '') {
      console.log(`ℹ ${f}: VITE_API_URL is empty — OK only because nginx serves this SPA and proxies API routes same-origin.`);
    } else {
      console.log(`ℹ ${f}: VITE_API_URL=${val}`);
      if (/localhost|127\.0\.0\.1/.test(val)) {
        failed = true;
        console.error(`✗ ${f}: VITE_API_URL points at a dev host`);
      }
    }
  }
}

if (failed) {
  console.error('\n✗ bundle guard FAILED');
  process.exit(1);
}
console.log('\n✓ bundle guard passed');
