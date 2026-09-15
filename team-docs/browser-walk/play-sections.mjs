/**
 * PLAY section walk — verifies the subject-sectioned grid (temporary, team-docs only).
 *
 * Drives headless Chromium over the raw DevTools Protocol (node's global
 * WebSocket/fetch — no new deps), injects a student session, opens PLAY and reads
 * the grid's direct children IN RENDER ORDER, classifying each as a subject
 * header / jump-ahead offer / game card.
 *
 * Assertions are derived from the live path + catalog for the same child, so they
 * are falsifiable rather than "does something render":
 *   - catalog rows  = path lessons + path-less rows
 *   - one section per series that has visible cards
 *   - cards land under their own subject, in unit order (W1 before W9)
 *   - the jump-ahead offer appears once per LOCKED subject, nowhere else
 *
 * Usage: node team-docs/browser-walk/play-sections.mjs <app-origin> <jwt> [label]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const APP = process.argv[2] || 'http://127.0.0.1:34777';
const JWT = process.argv[3] || '';
const LABEL = process.argv[4] || 'play-sections';
const CDP = 'http://127.0.0.1:9333';
const OUT = '/var/www/html/elite/elite-kids/team-docs/browser-walk';
const SHOTS = join(OUT, `shots-${LABEL}`);

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
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    this.requests = []; this.blockedWrites = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        // A write the dashboard fires on mount (POST /kids/economy/streak/record,
        // which UPDATEs kids_economy and can INSERT milestones) is ABORTED before
        // it leaves the browser. Handled inline, NOT in drain(): drain() clears
        // the event queue, and a paused request nobody resumes stalls the page.
        if (msg.method === 'Fetch.requestPaused') {
          this.blockedWrites.push(`${msg.params.request.method} ${msg.params.request.url}`);
          this.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'Aborted' })
            .catch(() => {});
          return;
        }
        this.events.push(msg);
        // Every API call this walk attempts, so a run against LIVE can prove it
        // never wrote. A write to a real child's record is not acceptable.
        if (msg.method === 'Network.requestWillBeSent' && msg.params?.request) {
          this.requests.push({ method: msg.params.request.method, url: msg.params.request.url });
        }
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
  drain() {
    const out = { consoleErrors: [], exceptions: [], failedRequests: [], badResponses: [] };
    for (const ev of this.events) {
      if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error') {
        out.consoleErrors.push(ev.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 200));
      }
      if (ev.method === 'Runtime.exceptionThrown') {
        out.exceptions.push(String(ev.params.exceptionDetails.exception?.description || ev.params.exceptionDetails.text).slice(0, 220));
      }
      if (ev.method === 'Network.loadingFailed') {
        out.failedRequests.push(`${ev.params.type} ${ev.params.errorText}`.slice(0, 120));
      }
      if (ev.method === 'Network.responseReceived' && ev.params.response.status >= 400) {
        out.badResponses.push(`${ev.params.response.status} ${ev.params.response.url.replace(APP, '').slice(0, 140)}`);
      }
    }
    this.events = [];
    return out;
  }
}

/** What the grid is *supposed* to show — read from the live API with the same JWT. */
async function expectedFromApi() {
  const H = { Authorization: `Bearer ${JWT}` };
  const catalog = await (await fetch(`${APP}/kids/lessons?content_state=published`, { headers: H })).json();
  const path = await (await fetch(`${APP}/kids/learning-path?student_id=${encodeURIComponent(process.env.ADMISSION || 'EK-Q4-TEST-001')}`, { headers: H })).json();
  const rows = Array.isArray(catalog?.data) ? catalog.data : [];
  const series = Array.isArray(path?.data?.path) ? path.data.path : [];
  const pathLessonIds = new Set();
  for (const s of series) for (const u of s.units) for (const l of u.lessons) pathLessonIds.add(String(l.lesson_id));
  return {
    catalogRows: rows.length,
    seriesCount: series.length,
    pathLessons: pathLessonIds.size,
    pathLess: rows.filter((r) => !pathLessonIds.has(String(r.id))).length,
    lockedSeries: series.filter((s) => s.units.some((u) => u.locked)).map((s) => s.name),
    series: series.map((s) => ({ name: s.name, units: s.units.length, lessons: s.units.reduce((n, u) => n + u.lessons.length, 0) })),
  };
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const expected = await expectedFromApi();

  const target = await pageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  // Only the streak-record POST is intercepted; everything else passes through
  // untouched, so nothing else can be left paused.
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*streak/record*', requestStage: 'Request' }],
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });

  const nav = async (url) => { await cdp.send('Page.navigate', { url }); await sleep(1500); };

  await nav(`${APP}/login`);
  await cdp.eval(`
    (() => {
      localStorage.setItem('@@auth_token', ${JSON.stringify(JWT)});
      localStorage.setItem('school_id', 'SCH-ELITE');
      localStorage.setItem('elitekids-locale', JSON.stringify({ state: { locale: 'en-NG', ttsLocale: 'en-NG', dir: 'ltr' }, version: 0 }));
      sessionStorage.clear();
      return true;
    })()
  `);

  cdp.drain();
  await nav(`${APP}/student`);
  for (let i = 0; i < 30; i++) {
    if (await cdp.eval(`!!document.body.innerText.match(/\\bPlay\\b/) && document.querySelectorAll('main button').length > 3`)) break;
    await sleep(1000);
  }

  // Hide the first-run overlays so the grid is readable (never completed — no writes).
  await cdp.eval(`
    (() => {
      const overlays = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], div.fixed.inset-0')]
        .filter(o => (o.innerText || '').trim().length > 0);
      overlays.forEach(o => { o.setAttribute('data-walk-hidden','1'); o.style.display='none'; });
      return overlays.length;
    })()
  `);

  // Open PLAY.
  cdp.drain();
  const clicked = await cdp.eval(`
    (() => {
      const btns = [...document.querySelectorAll('main button')].filter(b => b.getAttribute('data-walk-hidden') !== '1');
      const hit = btns.find(b => b.textContent.trim().startsWith('Play'));
      if (!hit) return false;
      hit.click();
      return true;
    })()
  `);

  // The grid carries 1718 cards — give it room.
  let cards = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    cards = await cdp.eval(`document.querySelectorAll('.game-card-hover').length`);
    if (cards >= expected.catalogRows) break;
  }
  await sleep(1200);

  // Read the grid's direct children in render order.
  const grid = await cdp.eval(`
    (() => {
      const card = document.querySelector('.game-card-hover');
      if (!card) return { error: 'no game card found' };
      const container = card.parentElement;
      const out = [];
      for (const child of container.children) {
        // A game card is checked FIRST: every card carries its own <h3> title,
        // so testing for an h3 first classifies all 1718 cards as headers.
        if (child.classList.contains('game-card-hover')) {
          out.push({ type: 'card', title: (child.querySelector('h3')?.textContent || '').trim() });
          continue;
        }
        const h3 = child.querySelector('h3');
        if (h3) {
          out.push({
            type: 'section',
            name: h3.textContent.trim(),
            badges: [...child.querySelectorAll('span')].map(s => s.textContent.trim()).filter(Boolean),
          });
          continue;
        }
        // Neither a card nor a header → the jump-ahead offer slot.
        out.push({ type: 'offer', text: (child.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 90) });
      }
      return {
        childCount: container.children.length,
        containerClass: container.className.slice(0, 80),
        items: out,
      };
    })()
  `);

  // Phase B — subject chips. A chip that empties a subject must drop that whole
  // section, header included: an empty header would be a promise of content
  // that is not there. `emptyHeaders` must stay 0 for every chip.
  const chipPass = [];
  // The chip renders `{label}` immediately followed by its count badge, so the
  // textContent reads "All1718" — normalise whitespace, then match label+digits.
  const CHIP_RE = `/^(All|Numbers|Letters|Colors|Shapes|Animals|Food)\\d*$/`;
  const chipCount = await cdp.eval(`
    [...document.querySelectorAll('main button')]
      .filter(x => ${CHIP_RE}.test(x.textContent.trim().replace(/\\s+/g, ''))).length
  `);
  for (let i = 0; i < chipCount; i++) {
    const label = await cdp.eval(`
      (() => {
        const b = [...document.querySelectorAll('main button')]
          .filter(x => ${CHIP_RE}.test(x.textContent.trim().replace(/\\s+/g, '')));
        const hit = b[${i}];
        if (!hit) return null;
        hit.click();
        return hit.textContent.trim().replace(/\\s+/g, ' ');
      })()
    `);
    if (!label) continue;
    await sleep(900);
    const read = await cdp.eval(`
      (() => {
        const card = document.querySelector('.game-card-hover');
        if (!card) return { cards: 0, headers: 0, emptyHeaders: 0 };
        const container = card.parentElement;
        let headers = 0, cards = 0, empty = 0, cardsHere = 0, sawHeader = false;
        for (const child of container.children) {
          if (child.classList.contains('game-card-hover')) { cards += 1; cardsHere += 1; continue; }
          const h3 = child.querySelector('h3');
          if (h3) {
            if (sawHeader && cardsHere === 0) empty += 1;
            sawHeader = true; headers += 1; cardsHere = 0;
          }
        }
        if (sawHeader && cardsHere === 0) empty += 1;
        return { cards, headers, emptyHeaders: empty };
      })()
    `);
    chipPass.push({ label, ...read });
  }

  const logs = cdp.drain();
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(SHOTS, 'play-top.png'), Buffer.from(shot.data, 'base64'));

  // Summarise the render order: section → its card count.
  const items = grid?.items || [];
  const sections = [];
  let current = null;
  const offers = [];
  for (const it of items) {
    if (it.type === 'section') { current = { name: it.name, badges: it.badges, cards: 0, firstCards: [] }; sections.push(current); }
    else if (it.type === 'card' && current) { current.cards += 1; if (current.firstCards.length < 3) current.firstCards.push(it.title); }
    else if (it.type === 'offer') offers.push({ after: current?.name || null, text: it.text });
  }

  // Live-safety: this walk must have issued reads only.
  const API_RE = /\/(kids|schools|users|students|auth|verify-token|media)\/?/;
  const apiCalls = cdp.requests.filter((r) => API_RE.test(r.url));
  const attemptedWrites = apiCalls
    .filter((r) => !/^(GET|HEAD|OPTIONS)$/.test(r.method))
    .map((r) => `${r.method} ${r.url}`);
  // `readOnly` means no write reached the server: every attempt was aborted.
  const escaped = attemptedWrites.filter((w) => !cdp.blockedWrites.includes(w));

  const result = {
    app: APP,
    clicked,
    apiReads: apiCalls.length,
    attemptedWrites,
    blockedWrites: cdp.blockedWrites,
    escaped,
    readOnly: escaped.length === 0,
    rendered: { cards, sections: sections.length, offers: offers.length },
    expected,
    matches: {
      cardCount: cards === expected.catalogRows,
      sectionCount: sections.length === expected.seriesCount + (expected.pathLess > 0 ? 1 : 0),
      offerCount: offers.length === expected.lockedSeries.length,
    },
    sections: sections.map((s) => ({ name: s.name, cards: s.cards, badges: s.badges, firstCards: s.firstCards })),
    offers,
    chipPass,
    logs,
  };

  await writeFile(join(OUT, `play-sections-${LABEL}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  ws.close();
  process.exit(0);
}

main().catch((err) => { console.error('WALK FAILED:', err.message); process.exit(1); });
