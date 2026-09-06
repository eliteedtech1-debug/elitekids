#!/usr/bin/env node
/**
 * check-compat-css.mjs — CI guard for the low-end compat stylesheet.
 *
 * scripts/compat-css.mjs downlevels the Tailwind v4 build output so old
 * Android WebViews (Chrome ~47–110) can render it. When someone introduces a
 * NEW modern-only feature the downleveler doesn't handle yet, this guard must
 * fail the build — otherwise the breakage only shows up as scattered UI on a
 * physical low-end device (rounds 2–6 of the backward-compat brief).
 *
 * Checks dist/assets/index-compat.css for:
 *   - cascade-layer and container-query rules
 *   :where-style selectors are checked too (see DENY list below — written as
 *   string fragments so Tailwind's content scanner never sees raw @tokens
 *   here and generates ghost utilities from this file)
 *   - :where() / :is() / :has() selectors
 *   - oklch()/oklab() color functions
 *   - color-mix() outside @supports blocks (anything inside an @supports
 *     block — condition or body — is an intended fallback: browsers without
 *     color-mix drop the whole declaration and keep the static rgb fallback
 *     Tailwind emits on the line before; counted as acceptable warnings)
 *   - logical properties (padding-inline, margin-block, inset-inline, …)
 *   - individual transform properties (translate: / rotate: / scale:)
 *   - math functions min()/max()/clamp() (minmax() is allowed)
 *   - dvh/svh/lvh viewport units, image-set()
 *
 * Known-acceptable (WARN only, documented degradations):
 *   - aspect-ratio (element falls back to auto height)
 *
 * Usage: node scripts/check-compat-css.mjs [distDir]   (exit 1 on violation)
 * Wired into `npm run build` after vite build — a regression fails the build.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distDir = process.argv[2] || join(process.cwd(), 'dist');
const cssPath = join(distDir, 'assets', 'index-compat.css');

if (!existsSync(cssPath)) {
  console.error(`✗ guard:compat-css — ${cssPath} not found. Run the build first.`);
  process.exit(1);
}

const css = readFileSync(cssPath, 'utf8');
const failures = [];
const warnings = [];

/* Strip string literals so URL/data-URI content can't trigger false hits. */
const bare = css.replace(/(["'])(?:\\.|(?!\1)[^\\])*?\1/g, '""');

/* ── 1. hard-deny tokens ─────────────────────────────────────────────── */
const DENY = [
  [new RegExp('[@]layer\\b'), 'cascade-layer rule (Chrome 99+)'],
  [new RegExp('[@]container\\b'), 'container query (Chrome 105+)'],
  [/::?where\(/, ':where() selector (Chrome 88+)'],
  [/::?is\(/, ':is() selector (Chrome 88+)'],
  [/::?has\(/, ':has() selector (Chrome 105+)'],
  [/\boklch\(/, 'oklch() color (Chrome 111+)'],
  [/\boklab\(/, 'oklab() color (Chrome 111+)'],
  [/\b(?:padding|margin|inset|border)-(?:inline|block)\b/, 'logical property (Chrome 87+)'],
  [/(?:^|[{;])(?:translate|rotate|scale):/, 'individual transform property (Chrome 104+)'],
  [/\bclamp\(/, 'clamp() math fn (Chrome 79+)'],
  [/\bmin\(/, 'min() math fn (Chrome 79+)'],
  [/\bmax\(/, 'max() math fn (Chrome 79+)'],
  [/\b(?:dvh|svh|lvh)\b/, 'new viewport unit (Chrome 108+)'],
  [/\bimage-set\(/, 'image-set() (Chrome 113+)'],
  [/\btext-wrap:\s*(?:balance|pretty)/, 'text-wrap balance/pretty (Chrome 114+)'],
];
for (const [re, label] of DENY) {
  const n = (bare.match(new RegExp(re.source, 'g')) || []).length;
  if (n > 0) failures.push(`${label} ×${n}`);
}

/* ── 2. color-mix() outside @supports blocks ────────────────────────── */
/* Any color-mix inside an @supports block (condition or body) is safe: old
 * browsers discard the declaration and keep the static fallback line. */
const gatedRanges = [];
{
  let i = 0;
  for (;;) {
    i = bare.indexOf('@supports', i);
    if (i === -1) break;
    const open = bare.indexOf('{', i);
    if (open === -1) break;
    let depth = 1;
    let j = open + 1;
    while (j < bare.length && depth > 0) {
      const c = bare[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    gatedRanges.push([i, j]);
    i = j;
  }
}
const isGated = (idx) => gatedRanges.some(([a, b]) => idx >= a && idx < b);
let ungatedMix = 0;
let gatedMix = 0;
for (const m of bare.matchAll(/color-mix\(/g)) {
  if (isGated(m.index)) gatedMix++;
  else ungatedMix++;
}
if (ungatedMix > 0) failures.push(`color-mix() outside @supports blocks ×${ungatedMix}`);

/* ── 3. structural sanity ───────────────────────────────────────────── */
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
if (open !== close) failures.push(`unbalanced braces (${open} vs ${close})`);
if (open === 0) failures.push('sheet has no rules — downleveler likely destroyed the CSS');

/* ── 4. known-acceptable warnings ───────────────────────────────────── */
const aspect = (bare.match(/aspect-ratio/g) || []).length;
if (aspect > 0) warnings.push(`aspect-ratio ×${aspect} (degrades to auto height — acceptable)`);
if (gatedMix > 0) warnings.push(`color-mix ×${gatedMix} inside @supports bodies (cosmetic fallback drop — acceptable)`);

/* ── verdict ────────────────────────────────────────────────────────── */
const kb = (css.length / 1024).toFixed(1);
for (const w of warnings) console.warn(`⚠ guard:compat-css — ${w}`);
if (failures.length > 0) {
  console.error(`✗ guard:compat-css FAILED (${kb}KB) — modern-only CSS reached the compat sheet:`);
  for (const f of failures) console.error(`   - ${f}`);
  console.error('   Extend scripts/compat-css.mjs with a downlevel pass for these,');
  console.error('   or remove the offending utility from the source.');
  process.exit(1);
}
console.log(`✓ guard:compat-css passed — ${kb}KB, 0 modern-only features, braces balanced`);
