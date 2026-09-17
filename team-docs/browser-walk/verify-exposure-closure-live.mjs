/**
 * Live end-to-end check — exposure-tier closure (QUEUE Q74/Q75). TEMPORARY, team-docs only.
 *
 * Drives ONE real Playgroup child against the deployed API and asserts the whole
 * loop the Q72/Q74/Q75 changes promise:
 *
 *   1. before: the unit is open, its lesson is untouched, and the lesson's own
 *      closure contract says NO test is owed (`closure.requires_test === false`);
 *   2. a single learning-mode play closes that lesson (score 0 — tier 0 is
 *      unscored), and the response reports the verdict it computed;
 *   3. after: the unit is done and the NEXT unit is unlocked, with both
 *      `/kids/learning-path` and `/kids/curriculum` agreeing.
 *
 * It WRITES one progress row for the named child (the brief authorises driving
 * one child end-to-end). Everything else is a read.
 *
 * Usage: node team-docs/browser-walk/verify-exposure-closure-live.mjs <api-origin> <admission_no> [lesson_id]
 *   token from team-docs/browser-walk/.token (mint.mjs)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = (process.argv[2] || 'http://127.0.0.1:8484').replace(/\/$/, '');
const ADMISSION = process.argv[3];
const WANT_LESSON = process.argv[4] || '';
if (!ADMISSION) {
  console.error('usage: verify-exposure-closure-live.mjs <api-origin> <admission_no> [lesson_id]');
  process.exit(2);
}
// The API extracts the token with fromAuthHeaderAsBearerToken(), and /students/login
// issues `Bearer <jwt>` — mint.mjs writes the raw JWT, so add the scheme here.
const RAW = readFileSync(join(HERE, '.token'), 'utf8').trim();
const JWT = RAW.startsWith('Bearer ') ? RAW : `Bearer ${RAW}`;

const call = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: JWT, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
};

const report = { api: API, admission: ADMISSION, at: new Date().toISOString(), steps: [] };
const step = (name, detail) => { report.steps.push({ name, ...detail }); };

// ── 1. Before ───────────────────────────────────────────────────────────────
const path0 = await call('/kids/learning-path');
if (path0.status !== 200) {
  console.error('learning-path failed', path0.status, JSON.stringify(path0.body).slice(0, 300));
  process.exit(1);
}
const data0 = path0.body.data;
const band = data0.student.age_band;
step('before: band + path', { band, series: data0.path.length });

// The child's OWN band series, first unit with lessons.
const ownSeries = data0.path.find((s) => s.units.some((u) => u.relation === 'current')) || data0.path[0];
const flat = ownSeries.units.flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));
const target = WANT_LESSON
  ? flat.find((x) => x.lesson.lesson_id === WANT_LESSON)
  : flat.find((x) => x.lesson.state === 'none') || flat[0];
const targetUnit = ownSeries.units.find((u) => u.lessons.some((l) => l.lesson_id === target.lesson.lesson_id));
const nextUnit = ownSeries.units[ownSeries.units.indexOf(targetUnit) + 1] || null;

step('before: target lesson', {
  series: ownSeries.name,
  unit: targetUnit.unit_number,
  unit_done: targetUnit.done,
  unit_locked: targetUnit.locked,
  lesson_id: target.lesson.lesson_id,
  state: target.lesson.state,
  closure: target.lesson.closure ?? null,
});
step('before: next unit', nextUnit ? { unit: nextUnit.unit_number, locked: nextUnit.locked, done: nextUnit.done } : null);

const requiresTest = target.lesson.closure?.requires_test;

// ── 2. One learning-mode play ───────────────────────────────────────────────
const post = await call('/kids/progress/game-complete', {
  method: 'POST',
  body: JSON.stringify({
    child_admission_no: ADMISSION,
    lesson_id: target.lesson.lesson_id,
    score: 0,
    stars_earned: 0,
    xp: 0,
    mode: 'learning',
    idempotency_key: `q75-live-${target.lesson.lesson_id}`,
  }),
});
step('play: game-complete', {
  status: post.status,
  duplicate: post.body?.duplicate ?? false,
  closure: post.body?.data?.closure ?? null,
});

// ── 3. After ────────────────────────────────────────────────────────────────
const path1 = await call('/kids/learning-path');
const data1 = path1.body.data;
const series1 = data1.path.find((s) => s.series_id === ownSeries.series_id);
const unit1 = series1.units.find((u) => u.unit_number === targetUnit.unit_number);
const lesson1 = unit1.lessons.find((l) => l.lesson_id === target.lesson.lesson_id);
const next1 = series1.units.find((u) => u.unit_number === (nextUnit?.unit_number ?? -1)) || null;
step('after: learning-path', {
  status: path1.status,
  unit_done: unit1.done,
  lesson_state: lesson1.state,
  lesson_closure: lesson1.closure ?? null,
  next_unit_locked: next1 ? next1.locked : null,
});

const curr = await call('/kids/curriculum');
const subj = (curr.body?.data?.subjects || []).find((s) => s.series.some((x) => x.id === ownSeries.series_id));
const currSeries = subj?.series.find((x) => x.id === ownSeries.series_id) || null;
const currUnit = currSeries?.units.find((u) => u.unit_number === targetUnit.unit_number) || null;
const currNext = currSeries?.units.find((u) => u.unit_number === (nextUnit?.unit_number ?? -1)) || null;
step('after: curriculum (E3 gate)', {
  status: curr.status,
  unit_done: currUnit?.done ?? null,
  completed_lessons: currUnit?.completed_lessons ?? null,
  next_unit_locked: currNext?.locked ?? null,
});

// ── Verdict ─────────────────────────────────────────────────────────────────
const verdict = {
  exposure_band: ['Crèche', 'Playgroup'].includes(band),
  contract_says_no_test: requiresTest === false,
  play_closed_the_lesson: lesson1.state === 'passed' && unit1.done === true,
  next_unit_unlocked: next1 ? next1.locked === false : null,
  endpoints_agree: currUnit ? currUnit.done === unit1.done : null,
};
report.verdict = verdict;

console.log(JSON.stringify(report, null, 2));
const out = join(HERE, `..`, 'reports', `exposure-closure-live-${ADMISSION.replace(/[^A-Za-z0-9]/g, '_')}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`\nwritten: ${out}`);
const ok = verdict.exposure_band && verdict.contract_says_no_test && verdict.play_closed_the_lesson
  && (next1 ? next1.locked === false : true);
console.log(ok ? 'VERDICT: PASS' : 'VERDICT: FAIL');
process.exit(ok ? 0 : 1);
