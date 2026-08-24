'use strict';

/**
 * E3f — SUPERVISOR GATE (non-negotiable): a child cannot start unit N+1 without
 * completing unit N in BOTH practice AND test.
 *
 *   1. No progress            → U1 open/not-done, U2 LOCKED
 *   2. Practice only          → U1 not-done, U2 still LOCKED
 *   3. Test score < 50        → not counted as a pass
 *   4. Practice + test >= 50 on every lesson of U1 → U1 done, U2 unlocked
 *
 * Run: TEST_DB_USER/TEST_DB_PASSWORD injected from backend/.env (never printed).
 */

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/models');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

const SERIES_ID = 'ser-e3f-gate';
const L1A = 'lesson-e3f-u1a';
const L1B = 'lesson-e3f-u1b';

async function studentToken() {
  const res = await request(app)
    .post('/students/login')
    .send({ username: 'NUR-001', password: 'Nursery@123', school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function complete(token, lessonId, mode, score) {
  return request(app)
    .post('/kids/progress/game-complete')
    .set('Authorization', token)
    .send({
      child_admission_no: 'NUR-001',
      lesson_id: lessonId,
      score,
      stars_earned: score >= 20 ? 3 : 1,
      mode,
      idempotency_key: `e3f-${lessonId}-${mode}-${score}-${Math.random().toString(36).slice(2, 8)}`,
    });
}

async function getUnits(token) {
  const res = await request(app).get('/kids/curriculum').set('Authorization', token);
  expect(res.status).toBe(200);
  const subject = res.body.data.subjects.find((s) => s.subject_code === 'Eng-Phonics-Gate');
  const series = subject.series.find((s) => s.id === SERIES_ID);
  return series.units;
}

describe('E3f: practice+test unit gate on GET /kids/curriculum', () => {
  beforeAll(async () => {
    await db.KidGameSeries.create({
      id: SERIES_ID,
      name: 'Gate Test Series',
      category: 'Letters',
      subject_code: 'Eng-Phonics-Gate',
    });
    await db.KidGameUnit.create({
      id: 'unit-e3f-u1',
      series_id: SERIES_ID,
      unit_number: 1,
      prerequisite_unit_id: null,
      title: 'Unit One',
      content_items: [
        { item_id: 'i-a', lesson_id: L1A },
        { item_id: 'i-b', lesson_id: L1B },
      ],
    });
    await db.KidGameUnit.create({
      id: 'unit-e3f-u2',
      series_id: SERIES_ID,
      unit_number: 2,
      prerequisite_unit_id: 'unit-e3f-u1',
      title: 'Unit Two',
      content_items: [{ item_id: 'i-c', lesson_id: 'lesson-e3f-u2a' }],
    });
  });

  test('fresh child → U2 locked while U1 untouched', async () => {
    const token = await studentToken();
    const units = await getUnits(token);
    expect(units[0].done).toBe(false);
    expect(units[0].locked).toBe(false);
    expect(units[0].completed_lessons).toBe(0);
    expect(units[1].locked).toBe(true);
  });

  test('practice-only completions do NOT unlock U2', async () => {
    const token = await studentToken();
    await complete(token, L1A, 'practice', 90);
    await complete(token, L1B, 'practice', 90);
    const units = await getUnits(token);
    expect(units[0].completed_lessons).toBe(0);
    expect(units[0].done).toBe(false);
    expect(units[1].locked).toBe(true);
  });

  test('test score below 50 does NOT count as a pass', async () => {
    const token = await studentToken();
    await complete(token, L1A, 'test', 49);
    let units = await getUnits(token);
    expect(units[0].done).toBe(false);
    expect(units[1].locked).toBe(true);

    // 50 exactly = pass
    await complete(token, L1A, 'test', 50);
    units = await getUnits(token);
    expect(units[0].completed_lessons).toBe(1); // L1A now fully complete
    expect(units[0].done).toBe(false);           // L1B still missing its test
    expect(units[1].locked).toBe(true);
  });

  test('practice + passing test on EVERY lesson of U1 → U1 done, U2 unlocked', async () => {
    const token = await studentToken();
    await complete(token, L1B, 'test', 85);
    const units = await getUnits(token);
    expect(units[0].done).toBe(true);
    expect(units[0].locked).toBe(false);
    expect(units[1].locked).toBe(false);
  });
});
