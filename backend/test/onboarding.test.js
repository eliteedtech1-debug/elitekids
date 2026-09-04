'use strict';

/**
 * Interface Onboarding tests — Phase 2.
 *
 * Run: cd elite-kids/backend && npm test -- test/onboarding.test.js
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

describe('Interface onboarding privacy', () => {
  it('prevents a student from reading another student\'s onboarding status', async () => {
    const student = await request(app)
      .post('/students/login')
      .send({ username: 'NUR-001', password: 'Nursery@123', school_id: 'SCH-TEST' });
    expect(student.status).toBe(200);

    const res = await request(app)
      .get('/kids/onboarding/status?student_id=NUR-002')
      .set('authorization', student.body.token);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own data/i);
  });

  it('prevents a student from completing another student\'s onboarding', async () => {
    const student = await request(app)
      .post('/students/login')
      .send({ username: 'NUR-001', password: 'Nursery@123', school_id: 'SCH-TEST' });
    expect(student.status).toBe(200);

    const res = await request(app)
      .post('/kids/onboarding/complete')
      .set('authorization', student.body.token)
      .send({ student_id: 'NUR-002' });

    expect(res.status).toBe(403);
  });
});

describe('GET /kids/onboarding/status', () => {
  it('returns completed=true for NUR-001 (has fixture)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/onboarding/status?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.completed).toBe(true);
    expect(res.body.data.completed_at).toBeTruthy();
  });

  it('returns completed=false for NUR-002 (no fixture)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/onboarding/status?student_id=NUR-002')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(false);
    expect(res.body.data.completed_at).toBeNull();
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/onboarding/status')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('POST /kids/onboarding/complete', () => {
  it('marks onboarding as completed for a new student', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/onboarding/complete')
      .set('authorization', token)
      .send({ student_id: 'NUR-002' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.completed_at).toBeTruthy();
  });

  it('is idempotent — completing again returns existing record', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/onboarding/complete')
      .set('authorization', token)
      .send({ student_id: 'NUR-002' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Already completed/);
  });

  it('is idempotent for fixture data — NUR-001 already completed', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/onboarding/complete')
      .set('authorization', token)
      .send({ student_id: 'NUR-001' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Already completed/);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/onboarding/complete')
      .set('authorization', token)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/kids/onboarding/complete')
      .send({ student_id: 'NUR-002' });

    expect(res.status).toBe(401);
  });
});
