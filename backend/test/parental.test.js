'use strict';

/**
 * Parental Controls tests — Phase 5.
 *
 * Run: cd elite-kids/backend && npm test -- test/parental.test.js
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

describe('GET /kids/parental-controls', () => {
  it('returns controls for a student with existing data', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/parental-controls?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.daily_play_limit_minutes).toBe(45);
    expect(res.body.data.allowed_time_start).toBe('08:00:00');
    expect(res.body.data.allowed_time_end).toBe('18:00:00');
  });

  it('returns defaults for a student with no controls', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/parental-controls?student_id=NUR-002')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.daily_play_limit_minutes).toBe(30);
    expect(res.body.data.allowed_time_start).toBeNull();
    expect(res.body.message).toMatch(/defaults/);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/parental-controls')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('POST /kids/parental-controls (set)', () => {
  it('creates controls for a student', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/parental-controls')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        daily_play_limit_minutes: 60,
        allowed_time_start: '07:00:00',
        allowed_time_end: '20:00:00',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.daily_play_limit_minutes).toBe(60);
    expect(res.body.data.allowed_time_start).toBe('07:00:00');
  });

  it('updates existing controls (idempotent)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/parental-controls')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        daily_play_limit_minutes: 30,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.daily_play_limit_minutes).toBe(30);
  });

  it('rejects out-of-range limit', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/parental-controls')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        daily_play_limit_minutes: 999,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/0-480/);
  });

  it('parents can set controls', async () => {
    const token = await loginAs('parent@kids.test', 'Parent@123');
    const res = await request(app)
      .post('/kids/parental-controls')
      .set('authorization', token)
      .send({
        student_id: 'NUR-001',
        daily_play_limit_minutes: 20,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.daily_play_limit_minutes).toBe(20);
  });

  it('rejects missing student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/parental-controls')
      .set('authorization', token)
      .send({ daily_play_limit_minutes: 30 });

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/parental-controls/check', () => {
  it('allows play when within time window and under limit', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const setRes = await request(app)
      .post('/kids/parental-controls')
      .set('authorization', token)
      .send({ student_id: 'NUR-005', daily_play_limit_minutes: 60 });
    expect(setRes.status).toBe(201);

    const res = await request(app)
      .get('/kids/parental-controls/check?student_id=NUR-005')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // NUR-005 has limit 60 but no time window and no today's snapshots, so should be allowed
    expect(res.body.data.allowed).toBe(true);
  });

  it('returns default allowed for student with no controls', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/parental-controls/check?student_id=NUR-006')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(true);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/parental-controls/check')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});
