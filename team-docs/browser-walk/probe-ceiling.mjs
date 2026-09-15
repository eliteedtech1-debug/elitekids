/**
 * Live probe: does the server-side G6 age ceiling hold on production?
 *
 * Mints a short-lived student session with the backend's OWN generateLoginToken
 * (same payload /students/login issues) and issues READ-ONLY GETs against
 * https://elitekids.com.ng. No DB writes, no browser, no storage touched.
 *
 * Prints, per child: resolved band, the number of lessons served, and the
 * distinct age_levels actually returned — so an uncapped child is obvious
 * (6 bands / 1718) versus a capped one (at-or-below band only).
 *
 * Usage: node team-docs/browser-walk/probe-ceiling.mjs
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..', '..', 'backend');

require(join(BACKEND, 'node_modules', 'dotenv')).config({ path: join(BACKEND, '.env') });
const { generateLoginToken } = require(join(BACKEND, 'src', 'middleware', 'sessionAuth.js'));

const BASE = process.env.WALK_BASE || 'https://elitekids.com.ng';
const CHILDREN = [
  { adm: '004', school: 'SCH/28', label: 'Nursery 2 (real school)' },
  { adm: '109', school: 'SCH/11', label: 'Kindergarten (real school)' },
  { adm: 'Demo5', school: 'SCH/25', label: 'Nursery 1 (real school)' },
  { adm: 'EK-Q4-TEST-001', school: 'SCH-ELITE', label: 'test child (top band)' },
];

const EXPECTED = {
  'Crèche': 272, Playgroup: 270, 'Nursery 1': 272, 'Nursery 2': 271, Kindergarten: 271, Primary: 362,
};
const LADDER = ['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary'];
const ceilingFor = (band) => LADDER.slice(0, LADDER.indexOf(band) + 1).reduce((n, b) => n + EXPECTED[b], 0);

function token(adm, school) {
  return generateLoginToken(
    { id: adm, admission_no: adm, student_name: 'Ceiling Probe', user_type: 'student', email: null, school_id: school, branch_id: null },
    '1h',
  );
}

// Production (nginx) serves the API at the ROOT — `/api/...` falls through to
// the SPA shell (200 text/html), which is a silent way to "pass". And the
// header must be `Bearer <token>`: a raw token 401s here (supertest accepts it,
// so the tests never noticed).
async function get(path, tok) {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${tok}` } });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

let failures = 0;
for (const c of CHILDREN) {
  const tok = token(c.adm, c.school);
  const lessons = await get('/kids/lessons', tok);
  const path = await get(`/kids/learning-path?student_id=${encodeURIComponent(c.adm)}`, tok);

  const rows = Array.isArray(lessons.body?.data) ? lessons.body.data : [];
  const bands = [...new Set(rows.map((r) => r.age_level))].sort(
    (a, b) => LADDER.indexOf(a) - LADDER.indexOf(b),
  );
  const band = path.body?.data?.student?.age_band ?? null;
  const units = (path.body?.data?.path || []).reduce((n, s) => n + (s.units?.length || 0), 0);
  const expected = band ? ceilingFor(band) : null;

  const capped = band !== null && rows.length === expected;
  if (!capped) failures += 1;

  console.log(
    [
      c.adm.padEnd(15),
      `band=${String(band ?? 'NONE').padEnd(13)}`,
      `lessons=${String(rows.length).padEnd(5)}`,
      `expected=${String(expected ?? '—').padEnd(5)}`,
      `pathStatus=${lessons.status}/${path.status}`,
      `series=${units ? (path.body.data.path.length) : 0}`,
      `offer=${path.body?.data?.student?.age_band ? 'yes' : '-'}`,
      capped ? 'CEILING HOLDS' : '!! UNCAPPED / MISMATCH',
      `bands=[${bands.join(', ')}]`,
    ].join(' '),
  );
}

console.log(failures === 0 ? '\nALL CHILDREN CAPPED CORRECTLY' : `\n${failures} child(ren) NOT capped`);
