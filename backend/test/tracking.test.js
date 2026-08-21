'use strict';

/**
 * Pattern Tracking tests — Phase 3.
 *
 * Run: cd elite-kids/backend && npm test -- test/tracking.test.js
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

async function loginAs(username, password) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('POST /kids/tracking/item-response', () => {
  it('records an item response', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/tracking/item-response')
      .set('authorization', token)
      .send({
        student_id: 'NUR-001',
        item_id: 'cat-01',
        tier: 0,
        distractor_count: 3,
        response_time_ms: 4500,
        mode: 'practice',
        correct: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student_id).toBe('NUR-001');
    expect(res.body.data.correct).toBe(true);
  });

  it('rejects invalid mode', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/tracking/item-response')
      .set('authorization', token)
      .send({
        student_id: 'NUR-001',
        item_id: 'cat-01',
        tier: 0,
        distractor_count: 3,
        response_time_ms: 4500,
        mode: 'invalid',
        correct: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mode must be/);
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/tracking/item-response')
      .set('authorization', token)
      .send({ student_id: 'NUR-001' });

    expect(res.status).toBe(400);
  });
});

describe('POST /kids/tracking/session-snapshot', () => {
  it('records an engagement snapshot', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/tracking/session-snapshot')
      .set('authorization', token)
      .send({
        session_id: 'SESS-NEW',
        student_id: 'NUR-001',
        start_time: new Date(Date.now() - 600000).toISOString(),
        end_time: new Date().toISOString(),
        drop_off_point: null,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session_id).toBe('SESS-NEW');
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/tracking/session-snapshot')
      .set('authorization', token)
      .send({ student_id: 'NUR-001' });

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/tracking/progress', () => {
  it('returns mastery progress for a student', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/tracking/progress?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by category', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/tracking/progress?student_id=NUR-001&category=Animals')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.every((p) => p.category === 'Animals')).toBe(true);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/tracking/progress')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/tracking/digest', () => {
  it('returns a plain-language digest for a student with data', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/tracking/digest?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.student_name).toBe('Ada Obi');
    expect(typeof res.body.data.summary).toBe('string');
    expect(res.body.data.summary.length).toBeGreaterThan(0);
    expect(res.body.data.per_category).toBeDefined();
  });

  it('returns empty digest for a student with no data', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/tracking/digest?student_id=NUR-006')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatch(/hasn't played/);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/tracking/digest')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});
