/**
 * Browser walk over the student dashboard (temporary — team-docs only).
 *
 * Drives headless Chromium over the raw DevTools Protocol (no extra deps:
 * node's global WebSocket + fetch), signs in by injecting a student session,
 * then clicks each of the five tabs and records:
 *   - which tab panels rendered (anchor ids unique to each tab),
 *   - whether another tab's panel leaked in (cross-tab duplication),
 *   - console errors, uncaught exceptions, failed requests, non-2xx API calls,
 *   - a screenshot per tab.
 *
 * Usage: node team-docs/browser-walk/walk.mjs <app-origin> <jwt>
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const APP = process.argv[2] || 'http://127.0.0.1:34777';
const JWT = process.argv[3] || '';
const CDP = 'http://127.0.0.1:9333';
const SHOTS = join('/var/www/html/elite/elite-kids/team-docs/browser-walk/shots');

/** Tab label -> the anchor/DOM signal its panel owns. */
const TABS = [
  { key: 'home', label: 'Home', marker: null },
  { key: 'play', label: 'Play', marker: ['id', 'games-grid-anchor'] },
  { key: 'path', label: 'Learn', marker: ['id', 'welcome-learning-path'] },
  { key: 'review', label: 'Review', marker: ['id', 'review-zone'] },
  { key: 'me', label: 'Me', marker: ['text', 'Trophy Board'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* chrome not up yet */ }
    await sleep(500);
  }
  throw new Error('no CDP page target');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
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
  /** Events since the last drain, filtered to the interesting ones. */
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
        const u = ev.params.response.url.replace(APP, '');
        out.badResponses.push(`${ev.params.response.status} ${u.slice(0, 140)}`);
      }
    }
    this.events = [];
    return out;
  }
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const target = await pageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 915, deviceScaleFactor: 2, mobile: true,
  });

  const nav = async (url) => {
    await cdp.send('Page.navigate', { url });
    await sleep(1500);
  };

  // Sign in: the app reads its session straight out of localStorage.
  await nav(`${APP}/login`);
  const injected = await cdp.eval(`
    (() => {
      try {
        localStorage.setItem('@@auth_token', ${JSON.stringify(JWT)});
        localStorage.setItem('school_id', 'SCH-ELITE');
        localStorage.setItem('elitekids-locale', JSON.stringify({ state: { locale: 'en-NG', ttsLocale: 'en-NG', dir: 'ltr' }, version: 0 }));
        return { ok: true, token: (localStorage.getItem('@@auth_token') || '').length };
      } catch (e) { return { ok: false, error: String(e) }; }
    })()
  `);

  await nav(`${APP}/student`);
  // Wait for the dashboard tabs to appear.
  let ready = false;
  for (let i = 0; i < 20; i++) {
    ready = await cdp.eval(`!!document.body.innerText.match(/\\bPlay\\b/) && document.querySelectorAll('button').length > 3`);
    if (ready) break;
    await sleep(1000);
  }

  // A first-time student gets the OnboardingTour over the dashboard. It is
  // expected behaviour, and it is only in the way of the screenshots here — the
  // tour itself is not "completed" (that would be a server write), the overlay
  // node is just hidden before each shot.
  const overlay = await cdp.eval(`
    (() => {
      // First-run layers (OnboardingTour, CompanionSelect) are full-screen
      // z-50 divs with no dialog role — hide every content-bearing overlay so
      // the screenshots show the tab, not the onboarding layer.
      const overlays = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], div.fixed.inset-0')]
        .filter(o => (o.innerText || '').trim().length > 0);
      overlays.forEach(o => { o.setAttribute('data-walk-hidden', '1'); o.style.display = 'none'; });
      return overlays.map(o => (o.innerText || '').replace(/\\n+/g, ' ').slice(0, 50));
    })()
  `);
  await sleep(500);

  const report = { app: APP, injected, dashboardReady: ready, overlayText: overlay, tabs: [], screenshots: {} };
  const clickTab = (label) => `
    (() => {
      const btns = [...document.querySelectorAll('main button')].filter(b => b.getAttribute('data-walk-hidden') !== '1');
      const hit = btns.find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}));
      if (!hit) return false;
      hit.scrollIntoView({ block: 'center' });
      hit.click();
      return true;
    })()
  `;

  for (const tab of TABS) {
    cdp.drain(); // clear noise from the previous step
    const clicked = await cdp.eval(clickTab(tab.label));
    await sleep(1600);

    const dom = await cdp.eval(`
      (() => {
        const has = (id) => !!document.getElementById(id);
        const main = document.querySelector('main') || document.body;
        const text = main.innerText || '';
        const tabBar = [...document.querySelectorAll('main > div button, main > div > div button')]
          .map(b => b.textContent.trim())
          .filter(t => ['Home','Play','Learn','Review','Me'].some(l => t.startsWith(l)));
        return {
          anchors: {
            play: has('games-grid-anchor'),
            path: has('welcome-learning-path'),
            review: has('review-zone'),
            me: has('welcome-goal-card') || text.includes('Trophy Board'),
            home: false,
          },
          tabBar: tabBar.slice(0, 8),
          heading: text.split('\\n').filter(Boolean).slice(0, 12).join(' | ').slice(0, 300),
          body: text.slice(0, 900),
          counts: {
            buttons: main.querySelectorAll('button').length,
            links: main.querySelectorAll('a').length,
            lists: main.querySelectorAll('ul li').length,
            sections: main.querySelectorAll('h2, h3').length,
            imgs: main.querySelectorAll('img, canvas').length,
          },
          signature: {
            gamesGrid: !!document.querySelector('#games-grid-anchor'),
            subjectChips: text.includes('Numbers') || text.includes('Letters') || /All\\s*\\d/.test(text),
            reviewZone: !!document.getElementById('review-zone'),
            revisionCard: text.includes('Review') && !!document.getElementById('review-zone'),
            learningPath: !!document.getElementById('welcome-learning-path'),
            trophy: text.includes('Trophy Board'),
            teams: text.includes('My Team') && text.includes('Class Quest'),
            perGame: text.includes('Your games'),
            garden: text.includes('Garden') || text.includes('garden'),
            streak: text.includes('Streak') || text.includes('streak'),
          },
        };
      })()
    `);

    const logs = cdp.drain();
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = join(SHOTS, `${tab.key}.png`);
    await writeFile(file, Buffer.from(shot.data, 'base64'));

    const panes = Object.entries(dom?.signature || {})
      .filter(([, v]) => v)
      .map(([k]) => k);

    report.tabs.push({
      key: tab.key,
      label: tab.label,
      clicked,
      anchors: dom?.anchors,
      tabBar: dom?.tabBar,
      panelsPresent: panes,
      heading: dom?.heading,
      body: dom?.body,
      counts: dom?.counts,
      logs,
      screenshotBytes: Buffer.from(shot.data, 'base64').length,
    });
    report.screenshots[tab.key] = file;
  }

  // Final pass: does exactly one tab panel render at a time?
  report.duplication = report.tabs.map((t) => ({
    key: t.key,
    panels: t.panelsPresent,
  }));

  // HOME CTA -> PLAY regression check (a first-time child must be able to reach
  // the games grid from a HOME tab that used to render nothing at all).
  await cdp.eval(clickTab('Home'));
  await sleep(1500);
  const cta = await cdp.eval(`
    (() => {
      const main = document.querySelector('main');
      const btn = [...main.querySelectorAll('button')].find(b => b.textContent.trim().includes('Pick my first game'));
      const info = {
        homeHasWelcome: main.innerText.includes('Welcome to EliteKids'),
        ctaFound: !!btn,
        homeText: main.innerText.replace(/\\n+/g, ' ~ ').slice(0, 300),
      };
      if (btn) { btn.click(); info.clicked = true; }
      return info;
    })()
  `);
  await sleep(1800);
  const afterCta = await cdp.eval(`
    (() => ({
      landedOnPlay: !!document.getElementById('games-grid-anchor'),
      cards: document.querySelectorAll('.game-card-hover').length,
    }))()
  `);
  report.homeCta = { ...cta, ...afterCta };

  // ME: no empty section heading (a section that promises content but has none).
  await cdp.eval(clickTab('Me'));
  await sleep(2500);
  report.meSections = await cdp.eval(`
    (() => {
      const main = document.querySelector('main');
      return {
        headings: [...main.querySelectorAll('h2, h3')].map(h => h.textContent.trim()),
        hasEmptyTeamsHeading: /My Team|Teams/i.test(main.innerText) && !/Class Quest|Team Challenge|Peer Teaching/i.test(main.innerText),
      };
    })()
  `);

  report.networkTotals = (() => {
    const codes = {};
    for (const t of report.tabs) {
      for (const b of t.logs.badResponses) {
        const c = b.split(' ')[0];
        codes[c] = (codes[c] || 0) + 1;
      }
    }
    return codes;
  })();

  console.log(JSON.stringify(report, null, 2));
  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('WALK FAILED:', err.message);
  process.exit(1);
});
