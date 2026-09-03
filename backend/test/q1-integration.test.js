'use strict';

/**
 * Q1 2027 — NGEd-game integration/contract tests (A17).
 *
 * These are DB-free "contract" tests that verify the layers a full-stack
 * request touches stay aligned, preventing regressions like the earlier
 * `code` vs `error_code` mismatch and missing frontend localizations:
 *
 *   1. Every Q1 error_code the controllers emit is present in the frontend
 *      ERROR_MAP (mapApiError.ts) — so no Q1 error falls through to a raw
 *      message on the client.
 *   2. Every Q1 ERROR_MAP entry has a corresponding i18n key in en.ts.
 *
 * Run: cd backend && npx jest test/q1-integration.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CTL = ['kidsEconomy.js', 'kidsAdaptiveV2.js', 'kidsSpacedRepV2.js', 'kidsShop.js'];

// Extract every Q1 error code token (ADE_/SRE_/ECO_*) referenced in source text.
function extractCodes(source) {
  const set = new Set();
  const re = /(?:ADE|SRE|ECO)_[A-Z]+/g;
  let m;
  while ((m = re.exec(source)) !== null) set.add(m[0]);
  return set;
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

describe('Q1 error_code contract (backend → frontend)', () => {
  const controllerCodes = new Set();
  for (const f of CTL) {
    for (const c of extractCodes(read(`backend/src/controllers/${f}`))) controllerCodes.add(c);
  }

  const mapSrc = read('frontend/src/lib/api/mapApiError.ts');
  const mapCodes = extractCodes(mapSrc);

  const enSrc = read('frontend/src/lib/i18n/en.ts');

  it('every controller-emitted Q1 error_code is mapped in the frontend ERROR_MAP', () => {
    const missing = [...controllerCodes].filter((c) => !mapCodes.has(c));
    expect(missing).toEqual([]);
  });

  it('every frontend Q1 ERROR_MAP entry has an i18n key in en.ts', () => {
    const missing = [...mapCodes]
      // only codes that are actually mapped to an i18n key (have an 'error.*' value)
      .filter((c) => {
        const entry = mapSrc.match(new RegExp(`\\b${c}:\\s*'(error\\.[^']+)'`));
        return entry ? !enSrc.includes(`'${entry[1]}'`) : false;
      });
    expect(missing).toEqual([]);
  });
});
