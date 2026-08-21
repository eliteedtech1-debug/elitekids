'use strict';

/**
 * Retry / Adaptive Difficulty tests — Phase 2.
 *
 * Run: cd elite-kids/backend && npm test -- test/retry.test.js
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

const SCHOOL_HEADER = { 'x-school-id': 'SCH-TEST' };

describe('POST /kids/retry/test-complete', () => {
  it('records a pass and returns mastered routing', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/retry/test-complete')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'dog-01',
        tier: 0,
        result: 'pass',
        distractor_count: 3,
        response_time_ms: 5000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.routing).toBe('retest');
    expect(res.body.data.attempt_number).toBe(1);
    expect(res.body.data.message).toMatch(/mastered/i);
  });

  it('records a fail and returns practice routing', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/retry/test-complete')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'lion-01',
        tier: 0,
        result: 'fail',
        distractor_count: 3,
        response_time_ms: 8000,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.routing).toBe('practice');
    expect(res.body.data.can_retake).toBe(true);
    expect(res.body.data.message).toMatch(/practice/i);
  });

  it('returns teacher_flag after 3 failures', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');

    // NUR-001 already has 3 failures on cat-01 in fixtures
    // Add one more to verify teacher_flag routing
    const res = await request(app)
      .post('/kids/retry/test-complete')
      .set('authorization', token)
      .send({
        student_id: 'NUR-001',
        item_id: 'cat-01',
        tier: 0,
        result: 'fail',
        distractor_count: 3,
        response_time_ms: 10000,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.routing).toBe('teacher_flag');
    expect(res.body.data.attempt_number).toBe(4);
    expect(res.body.data.message).toMatch(/teacher/i);
  });

  it('rejects invalid result value', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/retry/test-complete')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'dog-01',
        tier: 0,
        result: 'maybe',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pass.*fail/);
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/retry/test-complete')
      .set('authorization', token)
      .send({ student_id: 'NUR-002' });

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/retry/status', () => {
  it('returns status for a student+item combo', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/retry/status?student_id=NUR-001&item_id=cat-01')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.failures).toBeGreaterThanOrEqual(3);
    expect(res.body.data.teacher_flagged).toBe(true);
  });

  it('returns can_retake=false when teacher_flagged', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/retry/status?student_id=NUR-001&item_id=cat-01')
      .set('authorization', token);

    expect(res.body.data.can_retake).toBe(false);
  });

  it('requires student_id and item_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/retry/status?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/retry/teacher-flags', () => {
  it('lists students flagged for teacher review', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/retry/teacher-flags')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const flagged = res.body.data.find((f) => f.student_id === 'NUR-001');
    expect(flagged).toBeDefined();
    expect(flagged.fail_count).toBeGreaterThanOrEqual(3);
    expect(flagged.student).toBeTruthy();
    expect(flagged.student.full_name).toBe('Ada Obi');
  });

  it('returns empty for school with no flags', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/retry/teacher-flags')
      .set('authorization', token)
      .set({ 'x-school-id': 'SCH-KIDS' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
