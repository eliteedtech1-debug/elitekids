'use strict';

/**
 * Game Series & Unit CRUD tests — Phase 2.
 *
 * Run: cd elite-kids/backend && npm test -- test/series-units.test.js
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

// ─── Series CRUD ────────────────────────────────────────────────────────────

describe('POST /kids/series (create series)', () => {
  it('creates a series for a valid admin', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ name: 'Shape Explorers', category: 'Shapes', description: 'Learn about shapes' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Shape Explorers');
    expect(res.body.data.category).toBe('Shapes');
  });

  it('rejects without required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ name: 'Missing Category' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid category', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ name: 'Bad', category: 'x'.repeat(101) }); // E3b: free-form, capped at 100 chars

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/category/i);
  });

  it('rejects non-staff users', async () => {
    const loginRes = await request(app)
      .post('/students/login')
      .send({ username: 'ada@kids.test', password: 'Nursery@123', school_id: 'SCH-TEST' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/kids/series')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ name: 'Nope', category: 'Animals' });

    expect(res.status).toBe(403);
  });
});

describe('GET /kids/series (list series)', () => {
  it('lists series with unit counts', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/series')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    const animalSeries = res.body.data.find((s) => s.id === 'SERIES-1');
    expect(animalSeries).toBeDefined();
    expect(animalSeries.unit_count).toBe(2);
  });

  it('filters by category', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/series?category=Letters')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.every((s) => s.category === 'Letters')).toBe(true);
  });
});

describe('GET /kids/series/:id (get series with units)', () => {
  it('returns the series with its units', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/series/SERIES-1')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('SERIES-1');
    expect(res.body.data.units).toHaveLength(2);
    expect(res.body.data.units[0].unit_number).toBe(1);
    expect(res.body.data.units[1].unit_number).toBe(2);
  });

  it('returns 404 for unknown series', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/series/NOPE')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});

// ─── Unit CRUD ──────────────────────────────────────────────────────────────

describe('POST /kids/series/:id/units (create unit)', () => {
  it('creates a unit in a series', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series/SERIES-2/units')
      .set('authorization', token)
      .send({
        unit_number: 2,
        title: 'Letter D-F',
        content_items: [{ item_id: 'letter-d', tier: 0 }],
        prerequisite_unit_id: 'UNIT-3',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.unit_number).toBe(2);
    expect(res.body.data.title).toBe('Letter D-F');
    expect(res.body.data.prerequisite_unit_id).toBe('UNIT-3');
  });

  it('rejects duplicate unit_number in same series', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series/SERIES-2/units')
      .set('authorization', token)
      .send({ unit_number: 1, content_items: [] });

    expect(res.status).toBe(409);
  });

  it('rejects prerequisite with higher unit_number', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series/SERIES-1/units')
      .set('authorization', token)
      .send({
        unit_number: 1,
        content_items: [],
        prerequisite_unit_id: 'UNIT-2', // unit 2 is higher than 1
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lower unit_number/);
  });

  it('rejects prerequisite from different series', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series/SERIES-2/units')
      .set('authorization', token)
      .send({
        unit_number: 1,
        content_items: [],
        prerequisite_unit_id: 'UNIT-1', // from SERIES-1
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same series/);
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series/SERIES-1/units')
      .set('authorization', token)
      .send({ title: 'No content_items' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown series', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/series/NOPE/units')
      .set('authorization', token)
      .send({ unit_number: 1, content_items: [] });

    expect(res.status).toBe(404);
  });
});

describe('PUT /kids/series/:id/units/:unitId (update unit)', () => {
  it('updates a unit title', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .put('/kids/series/SERIES-1/units/UNIT-1')
      .set('authorization', token)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });

  it('returns 404 for unknown unit', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .put('/kids/series/SERIES-1/units/NOPE')
      .set('authorization', token)
      .send({ title: 'Nope' });

    expect(res.status).toBe(404);
  });
});

// ─── Lock Status ────────────────────────────────────────────────────────────

describe('GET /kids/units/:id/lock-status', () => {
  it('returns unlocked for unit with no prerequisite', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/units/UNIT-1/lock-status?student_id=NUR-002')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.locked).toBe(false);
  });

  it('returns locked for unit with incomplete prerequisite', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/units/UNIT-2/lock-status?student_id=NUR-002')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.locked).toBe(true);
    expect(res.body.data.reason).toMatch(/Finish unit/);
  });

  it('unlocks once every prerequisite lesson has practice AND a passed test (E3f gate)', async () => {
    const db = require('../src/models');
    for (const lessonId of ['lesson-unit1-cat', 'lesson-unit1-dog']) {
      for (const [mode, score] of [['practice', 88], ['test', 72]]) {
        await db.KidProgress.create({
          id: `fix-e3f-${lessonId}-${mode}`,
          school_id: 'SCH-TEST',
          branch_id: 'BR-TEST',
          child_admission_no: 'NUR-002',
          lesson_id: lessonId,
          score,
          stars_earned: 2,
          xp: 5,
          completed_at: new Date(),
          mode,
        });
      }
    }
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/units/UNIT-2/lock-status?student_id=NUR-002')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.locked).toBe(false);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/units/UNIT-1/lock-status')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown unit', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/units/NOPE/lock-status?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});
