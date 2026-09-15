/**
 * Focused CDP probe (temporary, team-docs only): why is HOME empty, how many
 * game cards does PLAY actually mount, does ME include the teams section.
 *
 * Usage: node team-docs/browser-walk/probe.mjs <app-origin> <jwt>
 */
import { writeFile } from 'node:fs/promises';

const APP = process.argv[2] || 'http://127.0.0.1:34777';
const JWT = process.argv[3] || '';
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

const nav = async (url) => {
  await send('Page.navigate', { url });
  await sleep(1800);
};

await nav(`${APP}/login`);
await evaluate(`localStorage.setItem('@@auth_token', ${JSON.stringify(JWT)}); localStorage.setItem('school_id','SCH-ELITE');`);
await nav(`${APP}/student`);
await sleep(2500);

const out = {};

out.dialogs = await evaluate(`
  [...document.querySelectorAll('[role="dialog"]')].map(d => ({
    text: (d.innerText || '').slice(0, 60), display: getComputedStyle(d).display,
    cls: (d.className || '').toString().slice(0, 60), children: d.children.length,
  }))
`);

out.mainChildren = await evaluate(`
  [...(document.querySelector('main')?.children || [])].map(c => ({
    tag: c.tagName, id: c.id, cls: (c.className||'').toString().slice(0,70), text: (c.innerText||'').slice(0,60),
  }))
`);

// HOME tab
await evaluate(`
  (() => {
    const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim().startsWith('Home'));
    b && b.click(); return !!b;
  })()
`);
await sleep(2500);
out.home = await evaluate(`
  (() => {
    const main = document.querySelector('main');
    return {
      innerText: main.innerText,
      htmlLen: main.innerHTML.length,
      html: main.innerHTML.slice(0, 2600),
      activeTabButtons: [...document.querySelectorAll('button')].filter(b => /bg-gradient-to-r/.test(b.className) && ['Home','Play','Learn','Review','Me'].some(l=>b.textContent.trim().startsWith(l))).map(b=>b.textContent.trim()),
      loadingFallback: main.innerText.includes('Loading games'),
      windowErrors: (window.__walkErrors || []).length,
    };
  })()
`);

// PLAY tab: how many cards actually mount
await evaluate(`
  (() => {
    const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim().startsWith('Play'));
    b && b.click(); return !!b;
  })()
`);
await sleep(3000);
out.play = await evaluate(`
  (() => {
    const main = document.querySelector('main');
    const h3 = [...main.querySelectorAll('h3')];
    const titles = h3.map(h => h.textContent.trim()).filter(t => t.length > 12);
    return {
      cards: main.querySelectorAll('.game-card-hover').length,
      h3Count: h3.length,
      sampleTitles: titles.slice(0, 5),
      lastTitle: titles[titles.length - 1],
      uniqueTitles: new Set(titles).size,
      subjectChips: [...main.querySelectorAll('button')].slice(0, 9).map(b => b.textContent.trim()),
      links: main.querySelectorAll('a').length,
      innerTextLen: main.innerText.length,
    };
  })()
`);

// ME tab: does it include teams + trophy
await evaluate(`
  (() => {
    const b = [...document.querySelectorAll('main button')].find(x => x.textContent.trim().startsWith('Me'));
    b && b.click(); return !!b;
  })()
`);
await sleep(3000);
out.me = await evaluate(`
  (() => {
    const main = document.querySelector('main');
    return {
      text: main.innerText.replace(/\\n+/g, ' ~ ').slice(0, 1400),
      hasTrophyBoard: main.innerText.includes('TROPHY BOARD') || main.innerText.includes('Trophy Board'),
      hasClassQuest: main.innerText.includes('CLASS QUEST') || main.innerText.includes('Class Quest'),
      hasPeerTeaching: /PEER TEACH/i.test(main.innerText),
      hasTeamChallenge: /TEAM CHALLENGE/i.test(main.innerText),
      sections: [...main.querySelectorAll('h2,h3')].map(h => h.textContent.trim()).slice(0, 12),
    };
  })()
`);

out.consoleErrors = events
  .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map((e) => e.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 200))
  .slice(0, 20);
out.exceptions = events
  .filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => String(e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text).slice(0, 200))
  .slice(0, 10);

await writeFile('/var/www/html/elite/elite-kids/team-docs/browser-walk/probe.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
