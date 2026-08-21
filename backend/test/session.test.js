'use strict';

/**
 * Save / Resume tests — Phase 3.
 *
 * Run: cd elite-kids/backend && npm test -- test/session.test.js
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

describe('POST /kids/session/save', () => {
  it('saves a new session state', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/session/save')
      .set('authorization', token)
      .send({
        session_id: 'SESS-SAVE-1',
        student_id: 'NUR-001',
        current_item_id: 'cat-01',
        current_tier: 0,
        saved_state: { question_index: 2, selected_option: 1 },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session_id).toBe('SESS-SAVE-1');
    expect(res.body.data.saved_state.question_index).toBe(2);
  });

  it('upserts on duplicate student_id+session_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/session/save')
      .set('authorization', token)
      .send({
        session_id: 'SESS-SAVE-1',
        student_id: 'NUR-001',
        current_item_id: 'cat-01',
        current_tier: 1,
        saved_state: { question_index: 3, selected_option: 2 },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.current_tier).toBe(1);
    expect(res.body.data.saved_state.question_index).toBe(3);
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/session/save')
      .set('authorization', token)
      .send({ student_id: 'NUR-001' });

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/session/resume', () => {
  it('returns saved session for a student', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/session/resume?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.session_id).toBe('SESS-SAVE-1');
  });

  it('returns null for student with no saved session', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/session/resume?student_id=NUR-006')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/session/resume')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('DELETE /kids/session/:id', () => {
  it('deletes a session', async () => {
    // First save a session to delete
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const saveRes = await request(app)
      .post('/kids/session/save')
      .set('authorization', token)
      .send({
        session_id: 'SESS-TO-DELETE',
        student_id: 'NUR-002',
        current_item_id: 'dog-01',
        current_tier: 0,
        saved_state: {},
      });
    const sessionId = saveRes.body.data.id;

    const res = await request(app)
      .delete(`/kids/session/${sessionId}`)
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/);
  });

  it('returns 404 for unknown session', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .delete('/kids/session/99999')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});
