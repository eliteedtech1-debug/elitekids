'use strict';

/**
 * Garden & Companion tests — Phase 3.
 *
 * Run: cd elite-kids/backend && npm test -- test/garden-companion.test.js
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

// ─── Garden ─────────────────────────────────────────────────────────────────

describe('GET /kids/garden', () => {
  it('returns garden state for a student with existing data', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/garden?student_id=NUR-001')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.garden_elements).toBeDefined();
    expect(res.body.data.garden_elements.length).toBeGreaterThan(0);
  });

  it('auto-initializes garden for a student with no data', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/garden?student_id=NUR-006')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.garden_elements).toBeDefined();
    expect(res.body.data.garden_elements.length).toBeGreaterThan(0);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/garden')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('POST /kids/garden/initialize', () => {
  it('initializes a garden (idempotent)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/initialize')
      .set('authorization', token)
      .send({ student_id: 'NUR-005' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.garden_elements).toBeDefined();
  });

  it('is idempotent — returns existing on re-init', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/initialize')
      .set('authorization', token)
      .send({ student_id: 'NUR-005' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already initialized/i);
  });
});

describe('POST /kids/garden/grow', () => {
  it('adds a new garden element', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/grow')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'dog-01',
        category: 'Animals',
        tier: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const element = res.body.data.garden_elements.find((e) => e.item_id === 'dog-01');
    expect(element).toBeDefined();
    expect(element.type).toBe('flower');
    expect(element.stage).toBe('seed');
  });

  it('upgrades an existing element (never regresses)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/grow')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'dog-01',
        category: 'Animals',
        tier: 2,
      });

    expect(res.status).toBe(200);
    const element = res.body.data.garden_elements.find((e) => e.item_id === 'dog-01');
    expect(element.stage).toBe('bloom');
    expect(element.tier).toBe(2);
  });

  it('does not downgrade when tier is lower', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/grow')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'dog-01',
        category: 'Animals',
        tier: 1,
      });

    expect(res.status).toBe(200);
    const element = res.body.data.garden_elements.find((e) => e.item_id === 'dog-01');
    expect(element.stage).toBe('bloom'); // still at tier 2 stage, not downgraded
  });

  it('maps Letters category to tree type', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/grow')
      .set('authorization', token)
      .send({
        student_id: 'NUR-002',
        item_id: 'letter-a',
        category: 'Letters',
        tier: 0,
      });

    expect(res.status).toBe(200);
    const element = res.body.data.garden_elements.find((e) => e.item_id === 'letter-a');
    expect(element.type).toBe('tree');
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/garden/grow')
      .set('authorization', token)
      .send({ student_id: 'NUR-001' });

    expect(res.status).toBe(400);
  });
});

// ─── Companion ──────────────────────────────────────────────────────────────

describe('GET /kids/companion', () => {
  it('returns null for a student with no companion', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/companion?student_id=NUR-002')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/companion')
      .set('authorization', token);

    expect(res.status).toBe(400);
  });
});

describe('POST /kids/companion/choose', () => {
  it('chooses a companion for a student', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/choose')
      .set('authorization', token)
      .send({ student_id: 'NUR-002', companion_type: 'fox' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.companion_type).toBe('fox');
    expect(res.body.data.customization.expression).toBe('happy');
  });

  it('is idempotent — returns existing companion', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/choose')
      .set('authorization', token)
      .send({ student_id: 'NUR-002', companion_type: 'owl' });

    expect(res.status).toBe(200);
    expect(res.body.data.companion_type).toBe('fox'); // original choice preserved
    expect(res.body.message).toMatch(/already chosen/i);
  });

  it('rejects invalid companion type', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/choose')
      .set('authorization', token)
      .send({ student_id: 'NUR-005', companion_type: 'dragon' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/companion_type must be one of/);
  });

  it('rejects missing required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/choose')
      .set('authorization', token)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /kids/companion/customize', () => {
  it('updates companion customization', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/customize')
      .set('authorization', token)
      .send({ student_id: 'NUR-002', expression: 'excited', accessory: 'hat' });

    expect(res.status).toBe(200);
    expect(res.body.data.customization.expression).toBe('excited');
    expect(res.body.data.customization.accessory).toBe('hat');
  });

  it('returns 404 if no companion chosen', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/customize')
      .set('authorization', token)
      .send({ student_id: 'NUR-005', expression: 'sad' });

    expect(res.status).toBe(404);
  });

  it('requires student_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/companion/customize')
      .set('authorization', token)
      .send({ expression: 'happy' });

    expect(res.status).toBe(400);
  });
});
