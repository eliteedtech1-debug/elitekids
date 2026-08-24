'use strict';

/**
 * Curriculum Mapping, Library & Teacher Customization tests — Phase 4.
 *
 * Run: cd elite-kids/backend && npm test -- test/curriculum.test.js
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

// ─── Curriculum Points ──────────────────────────────────────────────────────

// NOTE (E3): GET /kids/curriculum is now the subject → series → unit term ladder
// (supervisor spec: 1 unit per academic week, cumulative practice+test gate).
// The old points-listing contract moved to GET /kids/curriculum/:id per-point reads.
describe('GET /kids/curriculum (E3 ladder)', () => {
  it('returns the ladder envelope for the authed child', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/curriculum')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.child_admission_no).toBe('string');
    expect(Array.isArray(res.body.data.subjects)).toBe(true);
  });

  it('groups fixture series lacking subject_code under GENERAL with week-numbered units', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/curriculum')
      .set('authorization', token);

    expect(res.status).toBe(200);
    const general = res.body.data.subjects.find((s) => s.subject_code === 'GENERAL');
    expect(general).toBeDefined();
    const ids = general.series.map((s) => s.id);
    expect(ids).toContain('SERIES-1');
    const s1 = general.series.find((s) => s.id === 'SERIES-1');
    expect(s1.units).toHaveLength(2);
    expect(s1.units.map((u) => u.week_number)).toEqual([1, 2]);
    expect(s1.units[1].locked).toBe(true); // cumulative gate: U1 not completed by this child
  });

  it('serves the ladder regardless of legacy query params', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/curriculum?age_band=KG1&category=Letters')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.subjects)).toBe(true);
  });
});

describe('GET /kids/curriculum/:id', () => {
  it('returns a curriculum point with mapped games', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/curriculum/CP-1')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('CP-1');
    expect(res.body.data.games).toBeDefined();
    expect(res.body.data.library_games).toBeDefined();
  });

  it('returns 404 for unknown curriculum point', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/curriculum/NOPE')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});

// ─── Library Games ──────────────────────────────────────────────────────────

describe('GET /kids/library', () => {
  it('lists library games', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/library')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('filters validated only', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/library?validated=true')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((g) => g.ece_validated === true)).toBe(true);
  });
});

describe('GET /kids/library/:id', () => {
  it('returns a library game with tier ladder', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/library/LIB-1')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('LIB-1');
    expect(res.body.data.game_config).toBeDefined();
    expect(res.body.data.tier_ladder).toBeDefined();
    expect(Array.isArray(res.body.data.tier_ladder)).toBe(true);
    expect(res.body.data.curriculum_point).toBeTruthy();
  });

  it('returns 404 for unknown library game', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/library/NOPE')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});

// ─── Assignment ─────────────────────────────────────────────────────────────

describe('POST /kids/library/assign', () => {
  it('assigns a library game to a class', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/library/assign')
      .set('authorization', token)
      .send({ library_game_id: 'LIB-1', class_id: 'NUR-B' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.library_game_id).toBe('LIB-1');
    expect(res.body.data.class_id).toBe('NUR-B');
  });

  it('rejects non-staff users', async () => {
    const loginRes = await request(app)
      .post('/students/login')
      .send({ username: 'ada@kids.test', password: 'Nursery@123', school_id: 'SCH-TEST' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/kids/library/assign')
      .set('authorization', token)
      .send({ library_game_id: 'LIB-1', class_id: 'NUR-B' });

    expect(res.status).toBe(403);
  });

  it('rejects unknown library game', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/library/assign')
      .set('authorization', token)
      .send({ library_game_id: 'NOPE', class_id: 'NUR-B' });

    expect(res.status).toBe(404);
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/library/assign')
      .set('authorization', token)
      .send({ library_game_id: 'LIB-1' });

    expect(res.status).toBe(400);
  });
});

// ─── Teacher Customization ──────────────────────────────────────────────────

describe('POST /kids/library/customize', () => {
  it('creates a class-scoped customization', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/library/customize')
      .set('authorization', token)
      .send({
        library_game_id: 'LIB-1',
        class_id: 'NUR-A',
        customizations: { prompt: 'Tap the friendly cat!' },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customizations.prompt).toBe('Tap the friendly cat!');
  });

  it('rejects locked structural fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/library/customize')
      .set('authorization', token)
      .send({
        library_game_id: 'LIB-1',
        class_id: 'NUR-A',
        customizations: { tier: 5, item_id: 'hacked' },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/locked structural fields/);
  });

  it('rejects non-staff users', async () => {
    const loginRes = await request(app)
      .post('/students/login')
      .send({ username: 'ada@kids.test', password: 'Nursery@123', school_id: 'SCH-TEST' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/kids/library/customize')
      .set('authorization', token)
      .send({
        library_game_id: 'LIB-1',
        class_id: 'NUR-A',
        customizations: { prompt: 'Hello' },
      });

    expect(res.status).toBe(403);
  });
});

describe('GET /kids/variants', () => {
  it('lists customizations for a class', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/variants?class_id=NUR-A')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const variant = res.body.data.find((v) => v.id === 'VAR-1');
    expect(variant).toBeDefined();
    expect(variant.library_game).toBeTruthy();
    expect(variant.game_config).toBeTruthy();
  });

  it('requires class_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/variants')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});
