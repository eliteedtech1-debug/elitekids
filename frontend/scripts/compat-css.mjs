#!/usr/bin/env node
/**
 * Legacy CSS generator — makes the built Tailwind v4 stylesheet renderable on
 * old Android WebView / Chrome (47–110).
 *
 * Tailwind v4 emits modern-only CSS: everything is wrapped in `@layer`
 * (Chrome 99+), colors use `oklch()`/`oklab()` (Chrome 111+) and gradient
 * positions carry `in oklab` hints. Browsers without `@layer` support drop the
 * ENTIRE stylesheet → the unstyled "no CSS ever" login our low-end users saw.
 *
 * This pass produces `index-compat.css` alongside the modern build:
 *   1. unwraps every `@layer` wrapper (nested in @media/@supports too) — source
 *      order is preserved so utilities still override base/theme
 *   2. converts all `oklch()`/`oklab()` tokens to static rgb()/rgba()
 *   3. strips ` in <space>` interpolation hints from `--tw-gradient-position`
 *
 * color-mix() lines are intentionally left in place: Tailwind emits a valid
 * static rgb/rgba fallback on the line *before* each color-mix declaration, and
 * browsers that can't parse color-mix will simply keep the earlier fallback.
 *
 * Run automatically from vite.config.ts (closeBundle), wired to `npm run build`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

/* ── color math ─────────────────────────────────────────────────────────── */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const linR = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const linG = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const linB = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const g = (c) => {
    c = clamp01(c);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return [g(linR), g(linG), g(linB)];
}

/** Tokenize oklch()/oklab() argument list: numbers, optional %, optional / alpha. */
function parseNums(str) {
  const toks = [];
  let pos = 0;
  const numRe = /([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)(\s*[%])?/y;
  while (pos < str.length) {
    while (pos < str.length && /\s/.test(str[pos])) pos++;
    if (str[pos] === '/') {
      toks.push('/');
      pos++;
      continue;
    }
    numRe.lastIndex = pos;
    const r = numRe.exec(str);
    if (!r || r[0] === '') {
      pos++;
      continue;
    }
    toks.push({ v: parseFloat(r[1]), pct: /%$/.test(r[0]) });
    pos = numRe.lastIndex;
    while (pos < str.length && /\s/.test(str[pos])) pos++;
    if (str[pos] === '/') {
      toks.push('/');
      pos++;
    }
  }
  return toks;
}

function colorToCss(fnName, argsStr) {
  const toks = parseNums(argsStr);
  const nums = [];
  let alpha = null;
  let seenSlash = false;
  for (const t of toks) {
    if (t === '/') {
      seenSlash = true;
      continue;
    }
    if (seenSlash) alpha = t;
    else nums.push(t);
  }
  let rgb;
  if (fnName === 'oklch') {
    const l = nums[0] && nums[0].pct ? nums[0].v / 100 : nums[0] ? nums[0].v : 0;
    const C = nums[1] ? nums[1].v : 0;
    const H = nums[2] ? nums[2].v : 0;
    const a = C * Math.cos((H * Math.PI) / 180);
    const b = C * Math.sin((H * Math.PI) / 180);
    rgb = oklabToRgb(l, a, b);
  } else {
    const l = nums[0] && nums[0].pct ? nums[0].v / 100 : nums[0] ? nums[0].v : 0;
    rgb = oklabToRgb(l, nums[1] ? nums[1].v : 0, nums[2] ? nums[2].v : 0);
  }
  const r = Math.round(clamp01(rgb[0]) * 255);
  const g = Math.round(clamp01(rgb[1]) * 255);
  const b = Math.round(clamp01(rgb[2]) * 255);
  let a = 1;
  if (alpha) {
    a = alpha.v;
    if (alpha.pct) a = a / 100;
  }
  if (a < 1) return `rgba(${r},${g},${b},${Math.round(a * 1000) / 1000})`;
  return `rgb(${r},${g},${b})`;
}

/** Convert every oklch()/oklab() token to a static rgb()/rgba(). */
function replaceColors(css) {
  return css.replace(/\bokl(?:ch|ab)\(([^()]*)\)/g, (match, inner) => {
    if (/\(/.test(inner)) return match;
    try {
      return colorToCss(/^oklch/.test(match) ? 'oklch' : 'oklab', inner);
    } catch {
      return match;
    }
  });
}

/* ── @layer unwrap ──────────────────────────────────────────────────────── */
function stripLayers(css) {
  let out = '';
  let i = 0;
  const n = css.length;

  function pushRaw(ch) {
    out += ch;
  }

  /** Parse balanced block; returns contents (layer wrappers inside already unwrapped). */
  function parseBlock() {
    let buf = '';
    let depth = 1;
    while (i < n) {
      const c = css[i];
      if (c === '"' || c === "'") {
        const q = c;
        buf += c;
        i++;
        while (i < n && css[i] !== q) {
          buf += css[i];
          i++;
        }
        if (i < n) {
          buf += q;
          i++;
        }
        continue;
      }
      if (c === '{') {
        depth++;
        buf += c;
        i++;
        continue;
      }
      if (c === '}') {
        depth--;
        i++;
        if (depth === 0) return buf;
        buf += c;
        continue;
      }
      if (c === '@' && depth === 1) {
        let name = '';
        let j = i + 1;
        while (j < n && /[a-zA-Z0-9_-]/.test(css[j])) {
          name += css[j];
          j++;
        }
        if (name === 'layer') {
          i = j;
          while (i < n && /\s/.test(css[i])) i++;
          if (css[i] === ';') {
            i++;
            continue;
          }
          if (css[i] === '{') {
            i++;
            buf += parseBlock();
            continue;
          }
          while (i < n && css[i] !== ';' && css[i] !== '{') i++;
          if (css[i] === '{') {
            i++;
            buf += parseBlock();
          } else i++;
          continue;
        }
        buf += '@' + name;
        i = j;
        while (i < n && /\s/.test(css[i])) {
          buf += css[i];
          i++;
        }
        while (i < n && css[i] !== ';' && css[i] !== '{') {
          buf += css[i];
          i++;
        }
        if (i < n && css[i] === ';') {
          buf += ';';
          i++;
          continue;
        }
        if (i < n && css[i] === '{') {
          buf += '{';
          i++;
          buf += parseBlock();
          buf += '}';
          continue;
        }
        continue;
      }
      buf += c;
      i++;
    }
    return buf;
  }

  while (i < n) {
    const c = css[i];
    if (c === '@') {
      let name = '';
      let j = i + 1;
      while (j < n && /[a-zA-Z0-9_-]/.test(css[j])) {
        name += css[j];
        j++;
      }
      if (name === 'layer') {
        i = j;
        while (i < n && /\s/.test(css[i])) i++;
        if (css[i] === ';') {
          i++;
          continue;
        }
        if (css[i] === '{') {
          i++;
          out += parseBlock();
          continue;
        }
        while (i < n && css[i] !== ';' && css[i] !== '{') i++;
        if (css[i] === '{') {
          i++;
          out += parseBlock();
        } else i++;
        continue;
      }
      out += '@' + name;
      i = j;
      while (i < n && /\s/.test(css[i])) {
        out += css[i];
        i++;
      }
      while (i < n && css[i] !== ';' && css[i] !== '{') {
        out += css[i];
        i++;
      }
      if (i < n && css[i] === ';') {
        out += ';';
        i++;
        continue;
      }
      if (i < n && css[i] === '{') {
        out += '{';
        i++;
        out += parseBlock();
        out += '}';
        continue;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Remove ` in oklch`-style interpolation hints from --tw-gradient-position values. */
function stripGradientHints(css) {
  return css.replace(
    /--tw-gradient-position:\s*([^;]*?)\s+in\s+(oklab|oklch|lab|lch|srgb)\s*(?=;)/g,
    '--tw-gradient-position:$1',
  );
}

/* ── entry ──────────────────────────────────────────────────────────────── */
const COMPAT_NAME = 'index-compat.css';

/** @param {string} distDir absolute path to the built dist/ folder */
export function buildCompatCss(distDir) {
  const htmlPath = join(distDir, 'index.html');
  const assetsDir = join(distDir, 'assets');
  if (!existsSync(htmlPath) || !existsSync(assetsDir)) return;
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.css)/);
  if (!m) return;
  const srcPath = join(assetsDir, m[1]);
  const css = readFileSync(srcPath, 'utf8');

  let out = stripLayers(css);
  out = replaceColors(out);
  out = stripGradientHints(out);

  writeFileSync(join(assetsDir, COMPAT_NAME), out);
  return join(assetsDir, COMPAT_NAME);
}

/* CLI-friendly when run directly: node scripts/compat-css.mjs <distDir> */
if (process.argv[1] && basename(process.argv[1]).startsWith('compat-css')) {
  const dist = process.argv[2] || join(process.cwd(), 'dist');
  const written = buildCompatCss(dist);
  if (written) console.log(`✓ legacy CSS written: ${written}`);
  else console.warn('⚠ legacy CSS not generated (dist/index.html main css not found)');
}