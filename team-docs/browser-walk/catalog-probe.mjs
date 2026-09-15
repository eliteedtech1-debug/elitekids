/**
 * Read-only catalog probe (temporary — team-docs only).
 *
 * Reproduces exactly what a student's browser asks for on dashboard load:
 *   GET /kids/lessons?content_state=published
 * with a JWT minted in the same shape `/students/login` issues
 * (see backend/src/middleware/sessionAuth.js#generateLoginToken).
 *
 * GET only — this never writes to the database.
 *
 * Usage:
 *   JWT_SECRET_KEY=… node catalog-probe.mjs <admission_no> <school_id> [class_name] [base]
 */
const [, , admission_no, school_id, class_name = null, base = 'http://127.0.0.1:8484'] = process.argv;
if (!admission_no || !school_id) {
  console.error('usage: node catalog-probe.mjs <admission_no> <school_id> [class_name] [base]');
  process.exit(2);
}
const secret = process.env.JWT_SECRET_KEY;
if (!secret) { console.error('JWT_SECRET_KEY missing'); process.exit(2); }

// Minimal HS256 signer — avoids depending on the backend's node_modules.
import { createHmac } from 'node:crypto';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = new Date();
const payload = {
  id: admission_no,
  admission_no,
  user_type: 'Student',
  email: `${admission_no}@student.local`,
  school_id,
  branch_id: null,
  student_name: admission_no,
  class_name,
  current_class: null,
  class_code: null,
  lastActivity: now.toISOString(),
  iat: Math.floor(now.getTime() / 1000),
  sessionCreated: now.toISOString(),
  renewalCount: 0,
};
const head = b64({ alg: 'HS256', typ: 'JWT' });
const body = b64(payload);
const token = `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;

const url = `${base}/kids/lessons?content_state=published`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'x-school-id': school_id } });
const text = await res.text();
let json = null;
try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
const rows = json?.data;

const out = {
  request: { url, admission_no, school_id, class_name },
  status: res.status,
  ok: res.ok,
  count: Array.isArray(rows) ? rows.length : null,
  hasGames: Array.isArray(rows) ? rows.filter((l) => l.has_games).length : null,
  byAgeLevel: Array.isArray(rows)
    ? rows.reduce((a, l) => ({ ...a, [l.age_level || 'null']: (a[l.age_level || 'null'] || 0) + 1 }), {})
    : null,
  first: Array.isArray(rows) ? rows.slice(0, 2).map((l) => ({ id: l.id, title: l.title, age_level: l.age_level, subject: l.subject, has_games: l.has_games })) : null,
  bodyHead: Array.isArray(rows) ? undefined : text.slice(0, 400),
};
console.log(JSON.stringify(out, null, 2));
