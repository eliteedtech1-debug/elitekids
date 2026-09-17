/**
 * Live DOM probe — a testless lesson must not offer a Test (QUEUE Q75). TEMPORARY, team-docs only.
 *
 * Opens PLAY on the deployed build as a real child and checks the rule PER CARD,
 * against the same closure contract the server serves:
 *
 *   card lesson requires_test === false  →  the card must carry NO `?mode=test` link
 *   card lesson requires_test === true   →  the card must carry one
 *
 * The expectation is derived from the live `GET /kids/learning-path` payload for
 * the SAME child, so the assertion is falsifiable rather than "something
 * rendered": it fails if the UI ignores the contract, and it fails if the UI
 * over-hides (a lesson that owes a Test losing it).
 *
 * READ ONLY: the walk never completes a game. The streak write route is aborted
 * in-browser, as in play-sections.mjs.
 *
 * Usage: node team-docs/browser-walk/probe-testless-ui.mjs <app-origin> <admission> <school_id> <label>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = (process.argv[2] || 'http://127.0.0.1:34777').replace(/\/$/, '');
const ADMISSION = process.argv[3] || 'EK-Q4-TEST-001';
const SCHOOL = process.argv[4] || 'SCH-ELITE';
const LABEL = process.argv[5] || 'testless';
const CDP = 'http://127.0.0.1:9333';
const RAW = readFileSync(join(HERE, '.token'), 'utf8').trim();
const JWT = RAW.startsWith('Bearer ') ? RAW : `Bearer ${RAW}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('no CDP page target');
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.blockedWrites = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === 'Fetch.requestPaused') {
        this.blockedWrites.push(`${msg.params.request.method} ${msg.params.request.url}`);
        this.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'Aborted' }).catch(() => {});
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout: ${method}`)); }
      }, 30000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
    return r.result?.value;
  }
}

// ── The contract, straight from the deployed API ───────────────────────────
const pathRes = await fetch(`${APP}/kids/learning-path?student_id=${encodeURIComponent(ADMISSION)}`, {
  headers: { authorization: JWT },
});
const pathBody = await pathRes.json();
const band = pathBody?.data?.student?.age_band ?? null;
const requiresById = new Map();
for (const s of pathBody?.data?.path ?? []) {
  for (const u of s.units ?? []) {
    for (const l of u.lessons ?? []) {
      requiresById.set(String(l.lesson_id), l.closure ? l.closure.requires_test !== false : true);
    }
  }
}

// ── The DOM ────────────────────────────────────────────────────────────────
const target = await pageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new Cdp(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Network.enable');
await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*streak/record*', requestStage: 'Request' }] });
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });

const nav = async (url) => { await cdp.send('Page.navigate', { url }); await sleep(1500); };
await nav(`${APP}/login`);
await cdp.eval(`
  (() => {
    localStorage.setItem('@@auth_token', ${JSON.stringify(JWT)});
    localStorage.setItem('school_id', ${JSON.stringify(SCHOOL)});
    localStorage.setItem('elitekids-locale', JSON.stringify({ state: { locale: 'en-NG', ttsLocale: 'en-NG', dir: 'ltr' }, version: 0 }));
    sessionStorage.clear();
    return true;
  })()
`);
await nav(`${APP}/student`);
const debug = { after_nav: {}, after_click: {} };
for (let i = 0; i < 30; i++) {
  const ready = await cdp.eval(`!!document.body.innerText.match(/\\bPlay\\b/) && document.querySelectorAll('main button').length > 3`);
  if (ready) break;
  await sleep(1000);
}
debug.after_nav = await cdp.eval(`({
  url: location.href,
  main_buttons: document.querySelectorAll('main button').length,
  cards: document.querySelectorAll('.game-card-hover').length,
  text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200),
})`);
await cdp.eval(`
  (() => {
    [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], div.fixed.inset-0')]
      .filter((o) => (o.innerText || '').trim().length > 0)
      .forEach((o) => { o.setAttribute('data-walk-hidden', '1'); o.style.display = 'none'; });
    return true;
  })()
`);
await cdp.eval(`
  (() => {
    const hit = [...document.querySelectorAll('main button')]
      .filter((b) => b.getAttribute('data-walk-hidden') !== '1')
      .find((b) => b.textContent.trim().startsWith('Play'));
    if (hit) hit.click();
    return !!hit;
  })()
`);
let cards = 0;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  cards = await cdp.eval(`document.querySelectorAll('.game-card-hover').length`);
  if (cards > 5) break;
}
await sleep(1500);
debug.after_click = await cdp.eval(`({
  url: location.href,
  cards: document.querySelectorAll('.game-card-hover').length,
  links: document.querySelectorAll('a[href*="/student/game/"]').length,
  text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200),
})`);

const rows = await cdp.eval(`
  (() => {
    return [...document.querySelectorAll('.game-card-hover')].map((card) => {
      const hrefs = [...card.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
      const game = hrefs.find((h) => h && h.includes('/student/game/')) || '';
      const id = game ? decodeURIComponent(game.split('/student/game/')[1].split('?')[0]) : null;
      return {
        id,
        title: (card.querySelector('h3')?.textContent || '').trim(),
        badge: [...card.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => t === 'Passed' || t === 'Play Now' || t === 'Next Up' || t === 'Locked') || null,
        test: hrefs.some((h) => h && h.includes('mode=test')),
        learn: hrefs.some((h) => h && h.includes('mode=learning')),
        practice: hrefs.some((h) => h && h.includes('mode=practice')),
        playable: hrefs.some((h) => h && h.includes('/student/game/')),
      };
    });
  })()
`);

const playable = rows.filter((r) => r.playable && r.id);
const mismatches = playable.filter((r) => {
  const owesTest = requiresById.has(r.id) ? requiresById.get(r.id) : true; // unknown ⇒ owes one
  return owesTest ? !r.test : r.test;
});
const testless = playable.filter((r) => requiresById.get(r.id) === false);
const tested = playable.filter((r) => requiresById.get(r.id) !== false);

const report = {
  app: APP, admission: ADMISSION, school: SCHOOL, band, at: new Date().toISOString(),
  cards_rendered: rows.length,
  playable_cards: playable.length,
  testless_cards: testless.length,
  test_owing_cards: tested.length,
  cards_offering_test: playable.filter((r) => r.test).length,
  mismatches: mismatches.slice(0, 10),
  mismatch_count: mismatches.length,
  blocked_writes: cdp.blockedWrites.slice(0, 5),
  debug,
  sample_testless: testless.slice(0, 3).map((r) => ({ id: r.id, title: r.title, test: r.test, learn: r.learn, practice: r.practice })),
  sample_owing: tested.slice(0, 3).map((r) => ({ id: r.id, title: r.title, test: r.test })),
};
report.verdict = {
  rendered_a_grid: playable.length > 0,
  every_card_matches_its_contract: mismatches.length === 0,
};

console.log(JSON.stringify(report, null, 2));
const out = join(HERE, `testless-ui-${LABEL}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nwritten: ${out}`);
ws.close();
process.exit(report.verdict.rendered_a_grid && report.verdict.every_card_matches_its_contract ? 0 : 1);
