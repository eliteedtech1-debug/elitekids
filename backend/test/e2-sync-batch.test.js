'use strict';

/**
 * E2 — offline batch sync endpoint (team-docs/briefs/e2-offline-progress-fix.md)
 *
 *   1. Fresh batch        → all created, order preserved
 *   2. Replayed batch     → all duplicate, ids stable (uq_kids_progress_dedupe)
 *   3. Partial failure    → per-item error mid-batch, order preserved, failed count
 *   4. Cross-child safety → same idempotency key on another child never dedupes;
 *                           students can never post for a foreign child
 *
 * Run: TEST_DB_USER/TEST_DB_PASSWORD injected from backend/.env (never printed).
 */

const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

async function studentToken() {
  const res = await request(app)
    .post('/students/login')
    .send({ username: 'NUR-001', password: 'Nursery@123', school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

const KEY = (s) => `e2-sync-${s}`;

describe('E2: POST /kids/sync/batch', () => {
  test('rejects an empty items array', async () => {
    const token = await studentToken();
    const res = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('fresh batch → all created, order preserved', async () => {
    const token = await studentToken();
    const items = [
      { child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-a', score: 80, idempotency_key: KEY('f1') },
      { child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-b', score: 90, idempotency_key: KEY('f2') },
      { child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-c', score: 70, idempotency_key: KEY('f3') },
    ];
    const res = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results.map((r) => r.status)).toEqual(['created', 'created', 'created']);
    expect(res.body.data.failed).toBe(0);
    expect(res.body.data.results.every((r) => typeof r.id === 'string')).toBe(true);
  });

  test('replayed batch → all duplicate with stable ids', async () => {
    const token = await studentToken();
    const items = [
      { child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-r', score: 85, idempotency_key: KEY('r1') },
    ];
    const first = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items });
    expect(first.body.data.results[0].status).toBe('created');
    const createdId = first.body.data.results[0].id;

    const replay = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items });
    expect(replay.body.data.results[0].status).toBe('duplicate');
    expect(replay.body.data.results[0].id).toBe(createdId);
    expect(replay.body.data.failed).toBe(0);
  });

  test('partial failure mid-batch → order preserved, failed counted', async () => {
    const token = await studentToken();
    const items = [
      { child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-p1', score: 60, idempotency_key: KEY('p1') },
      { child_admission_no: 'NUR-001', lesson_id: '', score: 60, idempotency_key: KEY('p2') },
      { child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-p3', score: 60, idempotency_key: KEY('p3') },
    ];
    const res = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items });
    expect(res.status).toBe(200);
    expect(res.body.data.results.map((r) => r.status)).toEqual(['created', 'error', 'created']);
    expect(res.body.data.failed).toBe(1);
  });

  test('cross-child: same key on another child never dedupes; foreign post blocked', async () => {
    const { KidProgress } = require('../src/models');
    const token = await studentToken();

    // Own row with key K
    const mine = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items: [{ child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-x', score: 75, idempotency_key: KEY('x') }] });
    expect(mine.body.data.results[0].status).toBe('created');
    const myId = mine.body.data.results[0].id;

    // Another child's row with the SAME idempotency key (direct model write = staff-equivalent path)
    await KidProgress.create({
      id: `e2-xchild-${KEY('x')}`,
      school_id: 'SCH-TEST',
      branch_id: 'BR-TEST',
      child_admission_no: 'NUR-002',
      lesson_id: 'lesson-e2-x',
      score: 99,
      stars_earned: 0,
      xp: 0,
      completed_at: new Date(),
      idempotency_key: KEY('x'),
    });

    // Replay for SELF must dedupe against OWN row only
    const replay = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items: [{ child_admission_no: 'NUR-001', lesson_id: 'lesson-e2-x', score: 75, idempotency_key: KEY('x') }] });
    expect(replay.body.data.results[0].status).toBe('duplicate');
    expect(replay.body.data.results[0].id).toBe(myId);

    // Student attempting a foreign child → ownership error (never a silent create/dedupe)
    const foreign = await request(app)
      .post('/kids/sync/batch')
      .set('Authorization', token)
      .send({ items: [{ child_admission_no: 'NUR-002', lesson_id: 'lesson-e2-x', score: 10, idempotency_key: KEY('y') }] });
    expect(foreign.body.data.results[0].status).toBe('error');
    expect(foreign.body.data.failed).toBe(1);
  });
});
