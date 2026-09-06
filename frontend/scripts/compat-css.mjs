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

/* ── flat-color ground truth ────────────────────────────────────────────── */
const BRAND_FLAT = 'rgb(15,77,146)';

/**
 * Parse a CSS <color> into {r,g,b,a} (sRGB 0..255, a 0..1).
 * Supports #hex3/4/6/8, rgb()/rgba() (comma or space syntax), `transparent`.
 * var(--color-*) references are resolved against the @theme map. Returns null
 * when the token cannot be resolved statically (currentcolor, unknown vars…).
 */
function parseCssColor(str, themeMap) {
  let s = String(str).trim();
  if (s === '') return null;
  if (s.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.toLowerCase() === 'currentcolor') return null;

  const hex = s.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    let r = parseInt(h.slice(0, 2), 16);
    let g = parseInt(h.slice(2, 4), 16);
    let b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  if (/^var\(/.test(s)) {
    const name = s.match(/var\(\s*(--[a-zA-Z0-9_-]+)/);
    if (!name || !themeMap) return null;
    const raw = themeMap.get(name[1]);
    if (raw == null) return null;
    return parseCssColor(raw, null);
  }

  const fn = s.match(/^(rgba?|hsla?)\(\s*([^)]*)\s*\)$/i);
  if (!fn) return null;

  if (/^rgba?$/i.test(fn[1])) {
    const inner = fn[2];
    const bySlash = inner.split('/');
    const comps = (bySlash[0] || inner).split(/[,\s]+/).filter(Boolean);
    if (comps.length < 3) return null;
    const toNum = (v) => {
      if (/^[\d.]+%$/.test(v)) return (parseFloat(v) / 100) * 255;
      return parseFloat(v);
    };
    let r = toNum(comps[0]);
    let g = toNum(comps[1]);
    let b = toNum(comps[2]);
    let a = 1;
    const aTok = (bySlash[1] || comps[3]);
    if (aTok !== undefined) a = /^[\d.]+%$/.test(aTok) ? parseFloat(aTok) / 100 : parseFloat(aTok);
    if ([r, g, b, a].some((v) => !Number.isFinite(v))) return null;
    return { r, g, b, a };
  }
  return null;
}

function serializeColor({ r, g, b, a }) {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  const ca = Math.max(0, Math.min(1, a));
  if (ca < 0.999) return `rgba(${cr},${cg},${cb},${Math.round(ca * 1000) / 1000})`;
  return `rgb(${cr},${cg},${cb})`;
}

/** Split on top-level commas (respects parens + quotes). */
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (const ch of str) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** Index of the ')' matching the '(' at openIdx. */
function matchParen(css, openIdx) {
  let depth = 0;
  let q = null;
  for (let i = openIdx; i < css.length; i++) {
    const c = css[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Resolve a color-mix() body (text between the parens) into a static flat
 * color, or return null when unresolvable. Tailwind v4 true-usage este:
 *   color-mix(in oklab, var(--color-white) 70%, transparent)  → rgba(255,255,255,0.7)
 */
function resolveColorMix(inner, themeMap) {
  const parts = splitTopLevel(inner, ',');
  if (parts.length < 2) return null;
  const method = parts[0].trim().replace(/^in\s+/i, '');
  if (!/^(oklab|oklch|lab|lch|srgb|srgb-linear|hsl|hwb|xyz|xyz-d50|xyz-d65)$/i.test(method)) return null;

  const ops = parts.slice(1).map((p) => {
    const trimmed = p.trim();
    const m = trimmed.match(/^(.*?)\s+(\d+(?:\.\d+)?)%\s*$/s);
    if (m) return { token: m[1].trim(), pct: Math.max(0, Math.min(100, parseFloat(m[2]))) };
    return { token: trimmed, pct: null };
  });
  if (ops.length < 2) return null;

  const c1 = parseCssColor(ops[0].token, themeMap);
  const c2 = parseCssColor(ops[1].token, themeMap);
  if (!c1 || !c2) return null;

  let p1 = ops[0].pct;
  let p2 = ops[1].pct;
  if (p1 === null && p2 === null) {
    p1 = 50;
    p2 = 50;
  } else if (p1 === null) p1 = 100 - p2;
  else if (p2 === null) p2 = 100 - p1;

  // Tailwind's alpha idiom: color-mix(X p%, transparent) → X at p% opacity
  if (c2.r === 0 && c2.g === 0 && c2.b === 0 && c2.a === 0) {
    return serializeColor({ r: c1.r, g: c1.g, b: c1.b, a: c1.a * (p1 / 100) });
  }

  const w1 = p1 / 100;
  const w2 = p2 / 100;
  const a = c1.a * w1 + c2.a * w2;
  let r = a <= 1e-6 ? 0 : (c1.r * c1.a * w1 + c2.r * c2.a * w2) / a;
  let g = a <= 1e-6 ? 0 : (c1.g * c1.a * w1 + c2.g * c2.a * w2) / a;
  let b = a <= 1e-6 ? 0 : (c1.b * c1.a * w1 + c2.b * c2.a * w2) / a;
  return serializeColor({ r, g, b, a });
}

/** Map of --color-<name> → serialized css from the @theme :root block. */
function extractThemeColors(css) {
  const map = new Map();
  const block = css.match(/:root[^{]*\{([^{}]*)\}/);
  if (!block) return map;
  for (const m of block[1].matchAll(/--color-([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
    const parsed = parseCssColor(m[2], null);
    if (parsed) map.set(`--color-${m[1]}`, m[2].trim());
  }
  return map;
}

/**
 * Rewrite every color-mix() inside a declaration body to a static flat color.
 * @supports/@media preambles (before the first `{`) are left untouched, so the
 * legacy feature gates keep their meaning — their bodies now carry plain rgb()
 * values that even pre-color-mix browsers can consume.
 */
function rewriteColorMixBodies(css, themeMap) {
  let out = '';
  let i = 0;
  let depth = 0;
  let q = null;
  while (i < css.length) {
    const c = css[i];
    if (q) {
      out += c;
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      out += c;
      i++;
      continue;
    }
    if (c === '{') {
      depth++;
      out += c;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      out += c;
      i++;
      continue;
    }
    if (depth > 0 && /[cC]/.test(c) && css.startsWith('color-mix(', i)) {
      const openIdx = i + 'color-mix'.length;
      const closeIdx = matchParen(css, openIdx);
      if (closeIdx > 0) {
        const resolved = resolveColorMix(css.slice(openIdx + 1, closeIdx), themeMap);
        if (resolved !== null) {
          out += resolved;
          i = closeIdx + 1;
          continue;
        }
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Give every bg-gradient-to-* utility a flat brand-color fallback so the
 * element stays colorful (readable white text) even when gradients/custom
 * properties are unsupported; the gradient still paints on top where possible.
 */
function addGradientFlatFallback(css) {
  return css.replace(
    /\.bg-gradient-to-(t|r|b|l|tr|tl|br|bl)\{([^{}]*)\}/g,
    (m, dir, body) => {
      const pos = body.match(/--tw-gradient-position:(initial|[a-z ]+?)(?=;)/);
      if (!pos || pos[1].trim() === 'initial') return m;
      return `.bg-gradient-to-${dir}{background-color:${BRAND_FLAT};${body}}`;
    },
  );
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
  out = rewriteColorMixBodies(out, extractThemeColors(out));
  out = addGradientFlatFallback(out);

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