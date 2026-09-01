'use strict';

/**
 * Unified parent login regression tests (Jest + Supertest).
 *
 * Suite rule (Google-style app switching, NO re-login): EliteKids parents
 * authenticate with the SAME credential as EliteSMS — the shared users/parents
 * tables + bcrypt password. The old PIN credential is deleted: a `pin` field
 * is never accepted, and the token issued is the ecosystem JWT (shared
 * JWT_SECRET_KEY) so app switches need no re-login.
 *
 * Regression guards (see commit "fix: unify parent login with EliteSMS
 * credentials, delete PIN auth and dead register tail"):
 *   1. `pin` must never authenticate — pin-only → 400, pin+wrong-password → 401
 *   2. phone / email / username each log in with the shared password
 *   3. wrong shared password → 401
 *   4. the token is the ecosystem JWT and is accepted by /verify-token
 *      (the cross-app, no-re-login proof)
 *   5. register links a child with the shared password only — never mints a
 *      PIN credential, returns no token
 *
 * Run: cd elite-kids/backend && npm test -- test/unified-login.test.js --runInBand
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

const PARENT = { phone: '08012345678', email: 'parent@kids.test', username: 'parent', password: 'Parent@123', school_id: 'SCH-TEST' };

describe('POST /kids/parent/login — unified EliteSMS credential (PIN deleted)', () => {
  it('rejects a PIN-only login (no shared password provided)', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ phone: PARENT.phone, pin: '1234', school_id: PARENT.school_id });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/password are required/i);
  });

  it('rejects pin + wrong password (the pin field never authenticates)', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ phone: PARENT.phone, pin: '1234', password: 'WrongPass', school_id: PARENT.school_id });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid phone\/email\/username or password/i);
  });

  it('logs in a parent with phone + the shared EliteSMS password', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ phone: PARENT.phone, password: PARENT.password, school_id: PARENT.school_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.parent_phone).toMatch(/2348012345678/);
  });

  it('logs in a parent with email + the shared EliteSMS password', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ email: PARENT.email, password: PARENT.password, school_id: PARENT.school_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('logs in a parent with username + the shared EliteSMS password', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ username: PARENT.username, password: PARENT.password, school_id: PARENT.school_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('rejects a wrong shared password with 401', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ phone: PARENT.phone, password: 'DefinitelyWrong', school_id: PARENT.school_id });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid phone\/email\/username or password/i);
  });

  it('issues the ecosystem JWT (shared JWT_SECRET_KEY, parent claims)', async () => {
    const res = await request(app)
      .post('/kids/parent/login')
      .send({ phone: PARENT.phone, password: PARENT.password, school_id: PARENT.school_id });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET_KEY);
    expect(decoded.id).toBe('U2');
    expect(decoded.user_type).toBe('parent');
    expect(decoded.school_id).toBe('SCH-TEST');
  });

  it('kids-issued token is accepted by /verify-token (no re-login on app switch)', async () => {
    const loginRes = await request(app)
      .post('/kids/parent/login')
      .send({ phone: PARENT.phone, password: PARENT.password, school_id: PARENT.school_id });

    expect(loginRes.status).toBe(200);
    const res = await request(app)
      .get('/verify-token')
      .set('authorization', `Bearer ${loginRes.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe('U2');
    expect(res.body.school.school_id).toBe('SCH-TEST');
  });
});

describe('POST /kids/parent/register — links child with shared password only', () => {
  it('rejects a PIN-only registration (shared password required)', async () => {
    const res = await request(app)
      .post('/kids/parent/register')
      .send({ phone: PARENT.phone, admission_no: 'NUR-003', school_id: PARENT.school_id, pin: '1234' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Password required/i);
  });

  it('links a child after proving the shared EliteSMS password, and returns no token', async () => {
    const res = await request(app)
      .post('/kids/parent/register')
      .send({ phone: PARENT.phone, admission_no: 'NUR-003', school_id: PARENT.school_id, password: PARENT.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Child linked/i);
    // No auto-login / no PIN credential minted — auth is the unified login.
    expect(res.body.data.token).toBeUndefined();
  });

  it('rejects registration with a wrong shared password', async () => {
    const res = await request(app)
      .post('/kids/parent/register')
      .send({ phone: PARENT.phone, admission_no: 'NUR-004', school_id: PARENT.school_id, password: 'WrongPass' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/No matching EliteSMS parent account or wrong password/i);
  });
});
