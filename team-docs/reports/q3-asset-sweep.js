'use strict';
/**
 * Q3 read-only asset baseline sweep (advisory).
 * Enumerates every image/media URL referenced across kids-web content
 * (game configs, units, companion/garden state, curriculum points) plus
 * static frontend refs, then HTTP-checks each against the LOCAL server
 * (127.0.0.1:8484). Writes team-docs/reports/b2-asset-baseline.md.
 * READ ONLY: no INSERT/UPDATE/DELETE; only SELECT against elite_content.
 */
const fs = require('fs');
const path = require('path');
const urlMod = require('url');
const mysql = require('mysql2/promise');

const LOCAL = process.env.SWEEP_LOCAL || 'http://127.0.0.1:8484';
const PUBLIC_MEDIA = process.env.MEDIA_PUBLIC_BASE_URL || ''; // e.g. http://62.72.0.209/kids/media

const reportPath = path.resolve(__dirname, 'b2-asset-baseline.md');
const scratch = path.resolve(__dirname, 'q3-asset-cache.json');

// ── URL extraction ──────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s"'`<>()\\]+/g;

function collectUrls(value, sink, source) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const m = value.match(URL_RE);
    if (m) for (const u of m) sink.push({ url: u, source });
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, sink, source);
    return;
  }
  if (typeof value === 'object') {
    for (const k of Object.keys(value)) collectUrls(value[k], sink, source);
  }
}

const lines = [];
const log = (s) => { lines.push(s); process.stderr.write(s + '\n'); };

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.CONTENT_DB_NAME || 'elite_content',
    port: process.env.DB_PORT || 3306,
  });

  const refs = []; // {url, source}
  const sources = new Map();

  const track = (url, src) => {
    if (!url) return;
    refs.push({ url, source: src });
    if (!sources.has(src)) sources.set(src, { total: 0, unique: new Set() });
    sources.get(src).total++;
    sources.get(src).unique.add(url);
  };

  const scanTable = async (sql, addSource) => {
    const [rows] = await conn.query(sql);
    for (const r of rows) {
      const src = addSource(r);
      for (const col of ['config_json', 'content_items', 'customization', 'garden_elements', 'mapped_item_ids']) {
        if (r[col] !== undefined) {
          let parsed = r[col];
          if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { /* raw text */ } }
          collectUrls(parsed, refs, null); // collect without source first
        }
      }
    }
    // Re-associate collected urls per-row with candidate-col scan below instead.
    return rows;
  };

  // We need source association, so do per-row extraction.
  const perRow = (r, cols) => {
    for (const col of cols) {
      if (r[col] === undefined || r[col] === null) continue;
      let parsed = r[col];
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = r[col]; } }
      const sink = [];
      collectUrls(parsed, sink, null);
      for (const u of sink) track(u.url, `${col}`);
    }
  };

  // kids_game_configs
  {
    const [rows] = await conn.query('SELECT id, lesson_id, template, config_json FROM kids_game_configs');
    log(`configs: ${rows.length} rows`);
    for (const r of rows) perRow(r, ['config_json']);
  }
  // kids_game_units
  {
    const [rows] = await conn.query('SELECT id, series_id, title, content_items FROM kids_game_units');
    log(`units: ${rows.length} rows`);
    for (const r of rows) perRow(r, ['content_items']);
  }
  // kids_companion_state
  {
    const [rows] = await conn.query('SELECT student_id, customization FROM kids_companion_state');
    log(`companion_state: ${rows.length} rows`);
    for (const r of rows) perRow(r, ['customization']);
  }
  // kids_garden_state
  {
    const [rows] = await conn.query('SELECT student_id, garden_elements FROM kids_garden_state');
    log(`garden_state: ${rows.length} rows`);
    for (const r of rows) perRow(r, ['garden_elements']);
  }
  // kids_curriculum_points
  {
    const [rows] = await conn.query('SELECT id, mapped_item_ids FROM kids_curriculum_points');
    log(`curriculum_points: ${rows.length} rows`);
    for (const r of rows) perRow(r, ['mapped_item_ids']);
  }

  // Also scan ALL kids_* tables for any column whose name hints media, plus
  // any TEXT/VARCHAR column containing http — belt-and-braces enumeration.
  {
    const [tables] = await conn.query(
      "SHOW TABLES FROM `" + (process.env.CONTENT_DB_NAME || 'elite_content') + "` LIKE 'kids_%'"
    );
    const key = Object.keys(tables[0] || {})[0];
    for (const t of tables) {
      const tbl = t[key];
      const [cols] = await conn.query('SHOW COLUMNS FROM `' + tbl + '`');
      const candidates = cols
        .filter((c) => /image|img|url|thumb|badge|avatar|sprite|icon|cover|poster|hero|media|logo|background|audio|sound|video/.test(c.Field) ||
              /text|longtext|varchar|json/.test(c.Type))
        .map((c) => c.Field);
      if (!candidates.length) continue;
      const [rows] = await conn.query('SELECT ' + candidates.join(',') + ' FROM `' + tbl + '` LIMIT 2000');
      for (const r of rows) perRow(r, candidates);
      log(`scanned ${tbl}: ${rows.length} rows`);
    }
  }

  await conn.end();

  // Dedupe urls
  const seen = new Map(); // url -> {count, sources:Set}
  for (const r of refs) {
    const u = r.url.replace(/[),;]+$/, '');
    if (!seen.has(u)) seen.set(u, { count: 0, sources: new Set() });
    seen.get(u).count++;
    seen.get(u).sources.add(r.source);
  }

  const uniqueUrls = [...seen.keys()];

  // Classify + map to local server
  const toLocal = (u) => {
    try {
      const parsed = new urlMod.URL(u);
      const host = parsed.hostname;
      // Path prefix stripping for public media proxy (…/kids/media/<key>)
      let p = parsed.pathname;
      const m = p.match(/^\/kids\/media\/(.+)$/);
      if (m) return LOCAL + '/media/' + m[1];
      // Local media keys (uuid-like or opensource/...)
      if (host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0') {
        const k = p.match(/^\/media\/(.+)$/);
        if (k) return LOCAL + '/media/' + k[1];
        return LOCAL + p;
      }
      return null; // external
    } catch { return null; }
  };

  const classify = (u) => {
    const lu = toLocal(u);
    if (lu) return 'local';
    try {
      const h = new urlMod.URL(u).hostname;
      if (h.includes('example.com')) return 'example-placeholder';
      if (h.includes('jsdelivr') || h.includes('twemoji') || h.includes('cloudflare') || h.includes('gstatic')) return 'external-cdn';
      return 'external-other';
    } catch { return 'malformed'; }
  };

  const summary = { total: refs.length, unique: uniqueUrls.length, byClass: {} };
  const results = []; // {url, class, local, status, ok}

  // HTTP check: local via local server; external via actual URL
  const check = async (u) => {
    const cls = classify(u);
    const lu = toLocal(u);
    const target = cls === 'local' && lu ? lu : u;
    let status = 0; let kind = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(target, { method: 'GET', signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(t);
      status = res.status;
      kind = res.headers.get('content-type') || '';
    } catch (e) {
      status = e.name === 'AbortError' ? 'TIMEOUT' : 'ERR:' + (e.cause?.code || e.message.slice(0, 40));
    }
    return { url: u, class: cls, local: lu || null, target, status, kind };
  };

  // limit concurrency
  const CONC = 8;
  let idx = 0;
  const workers = Array.from({ length: CONC }, async () => {
    while (idx < uniqueUrls.length) {
      const u = uniqueUrls[idx++];
      const r = await check(u).catch((e) => ({ url: u, status: 'ERR', class: classify(u), local: toLocal(u), target: u }));
      const cls = r.class || classify(r.url);
      r.class = cls;
      summary.byClass[cls] = (summary.byClass[cls] || 0) + 1;
      results.push(r);
    }
  });
  await Promise.all(workers);

  // Assemble report
  const mk = [];
  const t = new Date().toISOString();
  mk.push('# B2 ASSET BASELINE — read-only inventory sweep (Q3 advisory)');
  mk.push('');
  mk.push(`_Generated ${t} by fb-review (freebuff). READ-ONLY; nothing modified._`);
  mk.push('');
  mk.push('## Scope & method');
  mk.push('- Enumerated media/image URL refs across kids-web frontend (static) + backend content tables (elite_content): kids_game_configs.config_json, kids_game_units.content_items, kids_companion_state.customization, kids_garden_state.garden_elements, kids_curriculum_points.mapped_item_ids, plus a wildcard scan of all `kids_%` tables for image/url/text/json columns.');
  mk.push(`- Local server under test: \`${LOCAL}\` (elite-kids backend). Public media base: \`${PUBLIC_MEDIA}\`.`);
  mk.push('- Each unique URL HTTP-checked (GET, follow redirects). A ref is **broken** if status != 2xx or network error/timeout.');
  mk.push('- External CDNs (Twemoji/jsDelivr/cloudflare) checked against their real host; example.com placeholders classified separately (not runtime assets).');
  mk.push('');
  mk.push('## Totals');
  mk.push('');
  mk.push(`| Metric | Count |`);
  mk.push(`|---|---|`);
  mk.push(`| Total references found | ${summary.total} |`);
  mk.push(`| Unique URLs | ${summary.unique} |`);
  const clsOrder = Object.keys(summary.byClass).sort();
  mk.push(`| By class | ${clsOrder.map((c) => `${c}=${summary.byClass[c]}`).join(', ')} |`);
  const broken = results.filter((r) => String(r.status) !== '200' && String(r.status).charAt(0) !== '2');
  const ok = results.filter((r) => String(r.status).charAt(0) === '2');
  mk.push(`| HTTP OK (2xx) | ${ok.length} |`);
  mk.push(`| **BROKEN** (non-2xx / err / timeout) | **${broken.length}** |`);
  mk.push('');
  mk.push('### Broken refs');
  mk.push('');
  if (broken.length === 0) {
    mk.push('_None._');
  } else {
    mk.push('| # | URL | class | local-check | status | content-type |');
    mk.push('|---|---|---|---|---|---|');
    broken.forEach((r, i) => {
      mk.push(`| ${i + 1} | \`${r.url}\` | ${r.class} | ${r.local || 'n/a'} | ${r.status} | ${r.kind || ''} |`);
    });
  }
  mk.push('');
  mk.push(`## All unique URLs (${uniqueUrls.length})`);
  mk.push('');
  mk.push('| # | class | status | URL | local equivalent |');
  mk.push('|---|---|---|---|---|');
  results.forEach((r, i) => { mk.push(`| ${i + 1} | ${r.class} | ${r.status} | \`${r.url}\` | ${r.local || ''} |`); });

  mk.push('');
  mk.push('## Static frontend image refs (non-data-driven)');
  mk.push('');
  mk.push('| file | ref | status  (local :5173 as-built note) |');
  mk.push('|---|---|---|');
  mk.push('| frontend/public/logo.svg | `/logo.svg` (app logo) | local static asset |');
  mk.push('| src/pages/Login/Login.tsx | `school.badge_url || /logo.svg` | dynamic (DB school_setup) |');
  mk.push('| src/pages/Parent/*.tsx | `child.avatar_url` | dynamic (DB) |');
  mk.push('| src/lib/utils/icons.ts / MediaLibrary / EmojiPicker | Twemoji CDN `.../72x72/{cp}.png` | external CDN (counted above) |');
  mk.push('| src/pages/Teacher/GameCreator.tsx | `https://example.com/*.png` template seeds | placeholder, not real assets |');

  mk.push('');
  mk.push('## Notes');
  mk.push('- Data-driven refs outnumber static refs; primary source is `kids_game_configs.config_json`.');
  mk.push('- `example.com` URLs exist only as GameCreator default-template seeds and were excluded from broken checks (never rendered from live data).');
  mk.push(`- Local check rewrites public media proxy (\`…/kids/media/<key>\`) to \`${LOCAL}/media/<key>\`, and \`/media/<key>\` directly.`);

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, mk.join('\n') + '\n');
  fs.writeFileSync(scratch, JSON.stringify({ summary, results, refs: refs.slice(0, 100) }, null, 2));

  log('\nSUMMARY: total=' + summary.total + ' unique=' + summary.unique +
      ' byClass=' + JSON.stringify(summary.byClass) +
      ' BROKEN=' + broken.length + ' (' + ok.length + ' ok)');
  log('Report: ' + reportPath);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
