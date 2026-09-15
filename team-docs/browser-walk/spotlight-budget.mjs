/**
 * Spotlight + API-budget probe (temporary, team-docs only).
 *
 * 1. Counts every API request a dashboard load makes (phase A: load, phase B:
 *    three idle minutes) so the class-load budget can be checked against the
 *    backend's 300 req/min per-IP limit.
 * 2. Drives the returning-student welcome spotlight WITHOUT touching the DB:
 *    CDP `Fetch` interception answers `/kids/onboarding/status/*` with
 *    completed=true and `/kids/progress/child/*` with a played game, which is
 *    exactly what makes the spotlight show. Then it clicks "Set my goal" and
 *    asserts the app lands on the ME tab with the weekly goal card.
 *
 * Usage: node team-docs/browser-walk/spotlight-budget.mjs <app-origin> <jwt> [idleSeconds]
 */
import { writeFile } from 'node:fs/promises';

const APP = process.argv[2] || 'http://127.0.0.1:34777';
const JWT = process.argv[3] || '';
const IDLE_S = Number(process.argv[4] || 185);
const CDP = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`${CDP}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});

let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method) events.push(m);
});
const send = (method, params = {}) => {
  const n = ++id;
  ws.send(JSON.stringify({ id: n, method, params }));
  return new Promise((resolve, reject) => pending.set(n, { resolve, reject }));
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description };
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });

// ── Intercept the two responses that gate the spotlight ──────────────────
await send('Fetch.enable', {
  patterns: [
    { urlPattern: '*onboarding/status*', requestStage: 'Request' },
    { urlPattern: '*progress/child*', requestStage: 'Request' },
  ],
});
const INTERCEPT = async () => {
  const paused = events.filter((e) => e.method === 'Fetch.requestPaused');
  for (const p of paused) {
    const { requestId, request } = p.params;
    const url = request.url;
    let body = null;
    if (url.includes('onboarding/status')) body = { success: true, data: { completed: true } };
    if (url.includes('progress/child')) {
      body = {
        success: true,
        data: {
          total_xp: 250,
          total_stars: 12,
          games_completed: 5,
          game_stats: {},
          games: [],
        },
      };
    }
    if (body) {
      await send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'application/json' },
          { name: 'access-control-allow-origin', value: '*' },
        ],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
    } else {
      await send('Fetch.continueRequest', { requestId });
    }
  }
  // drop handled events
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].method === 'Fetch.requestPaused') events.splice(i, 1);
  }
};

const apiRequests = () => {
  const urls = events
    .filter((e) => e.method === 'Network.requestWillBeSent')
    .map((e) => e.params.request.url)
    .filter((u) => /\/(kids|api|media)\//.test(u));
  return urls;
};
const drainRequests = () => {
  const urls = apiRequests();
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].method === 'Network.requestWillBeSent') events.splice(i, 1);
  }
  return urls;
};

const nav = async (url) => {
  await send('Page.navigate', { url });
  await sleep(1500);
};

await nav(`${APP}/login`);
const ADMISSION = 'EK-Q4-TEST-001';
await evaluate(`
  localStorage.setItem('@@auth_token', ${JSON.stringify(JWT)});
  localStorage.setItem('school_id','SCH-ELITE');
  // Both gates cache themselves — clear them so this run exercises the real flow.
  sessionStorage.clear();
  localStorage.removeItem('elitekids-onboarding-done:' + ${JSON.stringify(ADMISSION)});
  localStorage.removeItem('elitekids-offline-cursor:SCH-ELITE');
`);

// Keep answering paused intercepted requests for the WHOLE run — a paused
// request the harness forgets to resume stalls the app (and corrupts counts).
const pump = setInterval(() => { void INTERCEPT(); }, 100);

// ── Phase A: dashboard load (+ the deferred offline sweep, 20-60s jitter) ─
const loadStart = Date.now();
await send('Page.navigate', { url: `${APP}/student` });
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (await evaluate(`!!document.querySelector('main button')`)) break;
}
const LOAD_WINDOW_MS = Number(process.env.WINDOW_MS || 75000);
while (Date.now() - loadStart < LOAD_WINDOW_MS) await sleep(500);
await INTERCEPT();
const phaseA = drainRequests();

// ── Phase B: idle (polling rate) ─────────────────────────────────────────
const idleStart = Date.now();
while (Date.now() - idleStart < IDLE_S * 1000) await sleep(500);
await INTERCEPT();
const phaseB = drainRequests();
clearInterval(pump);

// ── Diagnostics: did the intercepted state reach the app? ────────────────
const diagnostics = await evaluate(`
  (() => {
    const mainTextBefore = document.querySelector('main')?.innerText || '';
    const meBtn = [...document.querySelectorAll('main button')].find(b => b.textContent.trim().startsWith('Me'));
    meBtn && meBtn.click();
    return {
      onboardingCached: localStorage.getItem('elitekids-onboarding-done:EK-Q4-TEST-001'),
      spotlightSeen: sessionStorage.getItem('welcome-spotlight-seen'),
      bodyHasWelcomeBack: document.body.innerText.includes('Welcome back'),
      bodyHasSetGoal: document.body.innerText.includes('Set my goal'),
      homeText: mainTextBefore.replace(/\\n+/g, ' ~ ').slice(0, 160),
    };
  })()
`);
await sleep(2500);
const meStats = await evaluate(`
  (() => (document.querySelector('main')?.innerText || '').replace(/\\n+/g, ' ~ ').slice(0, 260))()
`);

// ── Spotlight flow ───────────────────────────────────────────────────────
const spotlight = await evaluate(`
  (() => {
    const text = document.body.innerText;
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('Set my goal'));
    return {
      visible: text.includes("Welcome back"),
      hasSetGoalButton: !!btn,
      mentionsMe: /\\bMe\\b/.test(text),
      mentionsLearningPath: text.includes('Learning path'),
      before: { onMe: !!document.getElementById('welcome-goal-card') },
    };
  })()
`);
if (spotlight?.hasSetGoalButton) {
  await evaluate(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('Set my goal'));
      btn && btn.click();
      return !!btn;
    })()
  `);
  await sleep(2500);
}
const afterGoal = await evaluate(`
  (() => {
    const tabBtn = [...document.querySelectorAll('main button')].find(b => b.textContent.trim().startsWith('Me'));
    const active = tabBtn ? /bg-gradient-to-r/.test(tabBtn.className) : null;
    return {
      goalCardPresent: !!document.getElementById('welcome-goal-card'),
      meTabActive: active,
      scrolledToGoal: (() => {
        const el = document.getElementById('welcome-goal-card');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top > -200 && r.top < window.innerHeight;
      })(),
      mainText: (document.querySelector('main')?.innerText || '').replace(/\\n+/g, ' ~ ').slice(0, 200),
    };
  })()
`);

const summarize = (urls) => {
  const map = {};
  for (const u of urls) {
    const key = u.replace(APP, '').replace(/\/[A-Za-z0-9._-]{6,}$/, '/<id>').split('?')[0];
    map[key] = (map[key] || 0) + 1;
  }
  return map;
};

const consoleLogs = events
  .filter((e) => e.method === 'Runtime.consoleAPICalled')
  .map((e) => e.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
  .filter((s) => /offline|prefetch|storage|assetcache|rate/i.test(s))
  .slice(0, 20);

const out = {
  consoleLogs,
  diagnostics,
  meStats,
  phaseASeconds: LOAD_WINDOW_MS / 1000,
  phaseA: { total: phaseA.length, byEndpoint: summarize(phaseA) },
  phaseB: { seconds: IDLE_S, total: phaseB.length, byEndpoint: summarize(phaseB) },
  spotlight,
  afterGoal,
};
await writeFile('/var/www/html/elite/elite-kids/team-docs/browser-walk/budget.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
