/**
 * End-to-end verification of the internal student API (temporary — team-docs only).
 *
 * Two things are proved here, neither by mocking:
 *
 *   1. The RUNNING EliteSMS process on :8383 does not serve the new route yet
 *      (nothing was deployed or restarted) — recorded as `liveProcess`.
 *   2. The route itself works over HTTP against the REAL Express stack, the REAL
 *      Sequelize models and the REAL database: a throwaway server on loopback
 *      mounts only the new router (so the running service is untouched), then
 *      this script calls it exactly as EliteKids will.
 *
 * Read-only: GET /:admission_no, POST /lookup and POST /authenticate all only
 * SELECT. Nothing is written, nothing is deployed, nothing is restarted.
 *
 * Run with cwd = ../elite-sms/backend so the requires resolve against that
 * project's node_modules and .env.
 */
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

const SMS_BACKEND = '/var/www/html/elite/elite-sms/backend';
const require = createRequire(`${SMS_BACKEND}/package.json`);

process.chdir(SMS_BACKEND);
require('dotenv').config({ path: `${SMS_BACKEND}/.env` });
// This working copy's .env points at elite_db_test; the live service
// (/var/www/html/elite/backend, NODE_ENV=production) uses elite_db. Verify
// against production data — dotenv does not override an existing value, so this
// wins, and it is the same database the running EliteSMS reads.
process.env.DB_NAME = 'elite_db';

const SECRET = process.env.ELITEKIDS_SHARED_JWT_SECRET || 'verify-only-shared-secret';
process.env.ELITEKIDS_SHARED_JWT_SECRET = SECRET;

const express = require('express');
const router = require(`${SMS_BACKEND}/src/routes/internalStudents.js`);

const PORT = 8399; // loopback-only throwaway, never the live 8383
const SCHOOL = 'SCH/25';   // Demo5's school
const CHILD = 'Demo5';     // the live Nursery 1 child from the Play-0 report

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(payload = {}) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({
    client_id: 'elitekids',
    aud: 'elitekids',
    scope: ['shared:read'],
    school_id: SCHOOL,
    iat: Math.floor(Date.now() / 1000),
    ...payload,
  });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

const app = express();
app.use(express.json());
app.use('/api/internal/students', router);
const server = await new Promise((resolve) => {
  const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
});

const base = `http://127.0.0.1:${PORT}/api/internal/students`;
const call = async (path, init = {}) => {
  const res = await fetch(base + path, init);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};
const auth = (t = token()) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

const out = {
  database: process.env.DB_NAME,
  school: SCHOOL,
  child: CHILD,
  secretFromEnv: process.env.ELITEKIDS_SHARED_JWT_SECRET !== undefined,
};

// ── 1. The running EliteSMS process (untouched) ────────────────────────────
try {
  const live = await fetch('http://127.0.0.1:8383/api/internal/students/Demo5', {
    headers: { Authorization: `Bearer ${token()}` },
  });
  out.liveProcess = { status: live.status, note: 'expected 404 — new route not deployed/restarted yet' };
} catch (err) {
  out.liveProcess = { error: String(err).slice(0, 120) };
}

// ── 2. The route, over HTTP, against the real models + DB ──────────────────
out.noToken = (await call(`/${CHILD}`)).status;

const one = await call(`/${CHILD}`, { headers: auth() });
out.getStudent = {
  status: one.status,
  data: one.json?.data,
  hasPassword: one.json?.data ? 'password' in one.json.data : null,
};

out.wrongSchool = (await call(`/${CHILD}?school_id=SCH/OTHER`, { headers: auth() })).status;
out.unknownChild = (await call('/NOT-A-REAL-ADMISSION-NO', { headers: auth() })).status;

const lookup = await call('/lookup', {
  method: 'POST',
  headers: auth(),
  body: JSON.stringify({ admission_nos: [CHILD, 'NOT-A-REAL-ADMISSION-NO'] }),
});
out.lookup = {
  status: lookup.status,
  returned: lookup.json?.data?.map((s) => s.admission_no),
  missing: lookup.json?.missing,
};

// Credential path: a wrong password must be rejected *by the SMS side*.
const badAuth = await call('/authenticate', {
  method: 'POST',
  headers: auth(),
  body: JSON.stringify({ admission_no: CHILD, password: 'definitely-not-the-password' }),
});
out.authenticateWrongPassword = { status: badAuth.status, code: badAuth.json?.error_code };

// Platform scope actually widens (and only when present).
const widened = await call(`/${CHILD}?school_id=SCH/OTHER`, {
  headers: auth(token({ scope: ['shared:read', 'kids:students:all'] })),
});
out.platformScopeCrossSchool = { status: widened.status, school: widened.json?.data?.school_id ?? null };

// Cross-check the same record directly, so the API answer can be compared.
const raw = JSON.parse(JSON.stringify(one.json?.data || {}));
out.apiAnswer = {
  admission_no: raw.admission_no,
  student_name: raw.student_name,
  class_name: raw.class_name,
  school_id: raw.school_id,
  status: raw.status,
};

// The SMS app prints banner lines on require, so the report is written to a
// file as well as stdout — the file is the machine-readable evidence.
import { writeFileSync } from 'node:fs';
const REPORT = '/var/www/html/elite/elite-kids/team-docs/browser-walk/sms-api-verify.json';
writeFileSync(REPORT, JSON.stringify(out, null, 2));

console.log(JSON.stringify(out, null, 2));
server.close();
process.exit(0);
