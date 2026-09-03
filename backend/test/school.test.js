'use strict';

/**
 * School route integration tests (Jest + Supertest) — port-verification for
 * the elite-cbt-api school/auth routes:
 *   GET  /schools/get-details       (short-name + flagship alias resolution)
 *   GET  /schools/check-shortname   (availability probe)
 *   POST /auth/select-school        (multi-school account selection)
 *
 * Run: cd elite-kids/backend && npm test -- test/school.test.js
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

describe('GET /schools/get-details', () => {
  it('resolves a school by short_name', async () => {
    const res = await request(app).get('/schools/get-details').query({
      query_type: 'select-by-short-name',
      short_name: 'testkids',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].school_id).toBe('SCH-TEST');
    expect(res.body.data[0].kids_stand_alone).toBe(1);
  });

  it('resolves the flagship kids school via its alias short_name', async () => {
    const res = await request(app).get('/schools/get-details').query({
      query_type: 'select-by-short-name',
      short_name: 'practice',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].school_id).toBe('SCH-ELITE');
  });

  it('is case-insensitive for short_name', async () => {
    const res = await request(app).get('/schools/get-details').query({
      query_type: 'select-by-short-name',
      short_name: 'TESTKIDS',
    });

    expect(res.body.success).toBe(true);
    expect(res.body.data[0].school_id).toBe('SCH-TEST');
  });

  it('returns an empty payload for an unknown short_name', async () => {
    const res = await request(app).get('/schools/get-details').query({
      query_type: 'select-by-short-name',
      short_name: 'no-such-school',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual([]);
  });

  it('resolves a school by school_id', async () => {
    const res = await request(app).get('/schools/get-details').query({ school_id: 'SCH-KIDS' });

    expect(res.body.success).toBe(true);
    expect(res.body.data[0].school_name).toBe('Elite Kids Academy');
  });

  it('returns an empty payload for an unknown school_id', async () => {
    const res = await request(app).get('/schools/get-details').query({ school_id: 'SCH-NOPE' });

    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /schools/check-shortname', () => {
  it('reports a taken short_name as unavailable', async () => {
    const res = await request(app).get('/schools/check-shortname').query({ short_name: 'kids' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.available).toBe(false);
  });

  it('is case-insensitive when checking availability', async () => {
    const res = await request(app).get('/schools/check-shortname').query({ short_name: 'TestKids' });

    expect(res.body.available).toBe(false);
  });

  it('reports a free short_name as available', async () => {
    const res = await request(app).get('/schools/check-shortname').query({ short_name: 'brightstars' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.available).toBe(true);
  });

  it('requires short_name (400)', async () => {
    const res = await request(app).get('/schools/check-shortname');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('short_name is required');
  });
});

describe('POST /auth/select-school', () => {
  async function loginForSelectionToken() {
    // No school scoping → both school accounts match, API returns a selection token.
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'multi@kids.test', password: 'Multi@123' });

    expect(res.status).toBe(200);
    expect(res.body.requires_school_selection).toBe(true);
    return res.body.selection_token;
  }

  it('completes multi-school selection with a valid selection token', async () => {
    const selectionToken = await loginForSelectionToken();
    const res = await request(app).post('/auth/select-school').send({
      selection_token: selectionToken,
      school_id: 'SCH-KIDS',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toMatch(/^Bearer /);
    expect(res.body.user.school_id).toBe('SCH-KIDS');
    expect(res.body.user.id).toBe('U5B');
    expect(res.body.sessionInfo.inactivityTimeout).toBe(15 * 60 * 1000);
  });

  it('rejects a school the account does not belong to', async () => {
    const selectionToken = await loginForSelectionToken();
    const res = await request(app).post('/auth/select-school').send({
      selection_token: selectionToken,
      school_id: 'SCH-INACTIVE',
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Account not found for this school');
  });

  it('requires selection_token and school_id (400)', async () => {
    const res = await request(app).post('/auth/select-school').send({ school_id: 'SCH-TEST' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/);
  });

  it('rejects a garbage selection token (401)', async () => {
    const res = await request(app).post('/auth/select-school').send({
      selection_token: 'not.a.jwt',
      school_id: 'SCH-TEST',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired selection token');
  });

  it('rejects a normal login token (wrong phase → 400)', async () => {
    // parent@kids.test is untouched by other test files' password resets.
    const login = await request(app)
      .post('/users/login')
      .send({ username: 'parent@kids.test', password: 'Parent@123', school_id: 'SCH-TEST' });
    expect(login.status).toBe(200);
    const normalToken = login.body.token.replace(/^Bearer /, '');

    const res = await request(app).post('/auth/select-school').send({
      selection_token: normalToken,
      school_id: 'SCH-TEST',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid selection token');
  });
});
