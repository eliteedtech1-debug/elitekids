'use strict';

/**
 * kids_children CRUD + parent↔child linking integration tests.
 *
 * Run: cd elite-kids/backend && npm test -- test/children.test.js
 *
 * Covers:
 *   GET    /kids/children               list (parent → own; staff → school)
 *   GET    /kids/children/:admissionNo  one child + progress summary
 *   POST   /kids/children               create/link (staff, shared students lookup)
 *   POST   /kids/children/link          parent self-service linking (ownership-checked)
 *   PUT    /kids/children/:admissionNo  update (owner/staff)
 *   DELETE /kids/children/:admissionNo  soft delete (staff)
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');

async function cleanupFixtures() {
  // Leave the shared hermetic DB as found (q1/b3 house style): remove the
  // NUR-008 owned fixture + endpoint-created NUR-004/NUR-006 profiles and
  // restore NUR-005 (soft-deleted by the DELETE describe) to Active, so no
  // sibling suite ever sees this suite's residue regardless of ordering.
  await testQuery(`DELETE FROM kids_children WHERE admission_no IN ('NUR-008', 'NUR-004', 'NUR-006')`);
  await testQuery(`DELETE FROM kids_progress WHERE id = 'PROG-OWNED-1'`);
  await testQuery(`UPDATE kids_children SET status = 'Active' WHERE admission_no = 'NUR-005'`);
}

afterAll(async () => {
  await cleanupFixtures();
  await closeConnections();
});

async function loginAs(username, password) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token; // 'Bearer <jwt>'
}

async function adminToken() {
  return loginAs('admin@kids.test', 'Admin@123');
}
async function parentToken() {
  return loginAs('parent@kids.test', 'Parent@123');
}
async function otherParentToken() {
  return loginAs('other@kids.test', 'Other@123');
}

const SCHOOL_HEADER = { 'x-school-id': 'SCH-TEST' };

describe('GET /kids/children', () => {
  it('lists all children in the school for staff', async () => {
    const res = await request(app)
      .get('/kids/children')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(6);
    expect(res.body.data.map((c) => c.admission_no)).toEqual(expect.arrayContaining([
      'NUR-001', 'NUR-002', 'NUR-005', 'REVIEW-001', 'REVIEW-002', 'REVIEW-003',
    ]));
  });

  it('lists only linked children for a parent', async () => {
    const res = await request(app)
      .get('/kids/children')
      .set('authorization', await parentToken());

    expect(res.status).toBe(200);
    // U2 owns NUR-001 via a kids_children profile plus NUR-002/NUR-005/NUR-006
    // via the EliteSMS students.parent_id link (parents.parent_id = 'U2').
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.map((c) => c.admission_no)).toEqual(
      expect.arrayContaining(['NUR-001', 'NUR-002', 'NUR-005', 'NUR-006'])
    );
    expect(res.body.data[0].parent_user_id).toBe('U2');
  });
});

describe('GET /kids/children/:admissionNo', () => {
  // C-DEBT-05 (owned fixtures): NUR-008 is not referenced by any other test
  // suite, so its kids_progress rollup is deterministic regardless of
  // --runInBand ordering — immune to the cross-suite pollution that hits the
  // shared NUR-001 fixture. NUR-001's base PROG-1 row is likewise re-seeded
  // here (idempotent: delete-by-id then insert) because jest's default
  // size-ordered sequencer may run e6-boss-battles BEFORE this suite, which
  // deletes NUR-001/LESSON-1 progress — leaving the shared fixture at 0.
  beforeAll(async () => {
    await testQuery(
      `INSERT INTO kids_children (id, admission_no, school_id, branch_id, full_name, age_level, class_code, parent_user_id, status)
       VALUES ('CHILD-OWNED', 'NUR-008', 'SCH-TEST', 'BR-TEST', 'Owned Child', 'Nursery', 'NUR-A', 'U2', 'Active')`
    );
    await testQuery(
      `INSERT INTO kids_progress (id, school_id, branch_id, child_admission_no, lesson_id, score, stars_earned, xp, completed_at)
       VALUES ('PROG-OWNED-1', 'SCH-TEST', 'BR-TEST', 'NUR-008', 'LESSON-1', 80, 3, 10, NOW())`
    );
    // Re-seed NUR-001's base progress row (idempotent — row may still exist
    // from global seed, or may have been deleted by e6-boss-battles).
    await testQuery(`DELETE FROM kids_progress WHERE id = 'PROG-1'`);
    await testQuery(
      `INSERT INTO kids_progress (id, school_id, branch_id, child_admission_no, lesson_id, score, stars_earned, xp, completed_at)
       VALUES ('PROG-1', 'SCH-TEST', 'BR-TEST', 'NUR-001', 'LESSON-1', 80, 3, 10, NOW())`
    );
  });

  it('returns the child + progress summary for the owning parent', async () => {
    const res = await request(app)
      .get('/kids/children/NUR-001')
      .set('authorization', await parentToken());

    expect(res.status).toBe(200);
    expect(res.body.data.admission_no).toBe('NUR-001');
    // NUR-001 is a shared fixture; sibling suites legitimately record progress
    // rows for it during a full --runInBand gate. Use tolerance-based asserts
    // (precedent: kids-routes.test.js:214) so this is order-independent. Exact
    // rollup is asserted on the owned NUR-008 fixture below. (C-DEBT-05)
    expect(res.body.data.progress.total_xp).toBeGreaterThanOrEqual(10);
    expect(res.body.data.progress.total_stars).toBeGreaterThanOrEqual(3);
    expect(res.body.data.progress.games_completed).toBeGreaterThanOrEqual(1);
  });

  it('returns an exact, pollution-free progress rollup for an owned dedicated fixture (C-DEBT-05)', async () => {
    const res = await request(app)
      .get('/kids/children/NUR-008')
      .set('authorization', await parentToken());

    expect(res.status).toBe(200);
    expect(res.body.data.admission_no).toBe('NUR-008');
    // NUR-008 is exclusively seeded here, so these are exact assertions.
    expect(res.body.data.progress.total_xp).toBe(10);
    expect(res.body.data.progress.total_stars).toBe(3);
    expect(res.body.data.progress.games_completed).toBe(1);
  });

  it('lets staff read any child in their school', async () => {
    const res = await request(app)
      .get('/kids/children/NUR-002')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.admission_no).toBe('NUR-002');
  });

  it('forbids a parent from reading a child linked to another parent', async () => {
    const res = await request(app)
      .get('/kids/children/NUR-001')
      .set('authorization', await otherParentToken());

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not linked to your account/i);
  });

  it('returns 404 for an unknown admission number', async () => {
    const res = await request(app)
      .get('/kids/children/NOPE-777')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /kids/children (staff create/link)', () => {
  it('creates a child profile for a real student, optionally linked to a parent', async () => {
    const res = await request(app)
      .post('/kids/children')
      .set('authorization', await adminToken())
      .send({ admission_no: 'NUR-004', full_name: 'Dami Ayo', age_level: 'KG1', parent_user_id: 'U2' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.admission_no).toBe('NUR-004');
    expect(res.body.data.parent_user_id).toBe('U2');
  });

  it('rejects an admission number that does not exist in the shared students table', async () => {
    const res = await request(app)
      .post('/kids/children')
      .set('authorization', await adminToken())
      .send({ admission_no: 'NOPE-999', full_name: 'Ghost Kid' });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Student not found/i);
  });

  it('requires admission_no and full_name', async () => {
    const res = await request(app)
      .post('/kids/children')
      .set('authorization', await adminToken())
      .send({ admission_no: 'NUR-004' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /kids/children/:admissionNo', () => {
  it('lets the owning parent update the profile', async () => {
    const res = await request(app)
      .put('/kids/children/NUR-001')
      .set('authorization', await parentToken())
      .send({ age_level: 'KG2', avatar_url: 'https://cdn.kids/ada.png' });

    expect(res.status).toBe(200);
    expect(res.body.data.age_level).toBe('KG2');
    expect(res.body.data.avatar_url).toBe('https://cdn.kids/ada.png');
  });

  it('forbids a foreign parent from updating', async () => {
    const res = await request(app)
      .put('/kids/children/NUR-001')
      .set('authorization', await otherParentToken())
      .send({ age_level: 'Primary' });

    expect(res.status).toBe(403);
  });

  it('rejects an invalid age_level', async () => {
    const res = await request(app)
      .put('/kids/children/NUR-002')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER)
      .send({ age_level: 'University' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/age_level must be one of/i);
  });

  it('returns 404 for an unknown admission number', async () => {
    const res = await request(app)
      .put('/kids/children/NOPE-777')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER)
      .send({ age_level: 'KG1' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /kids/children/:admissionNo (soft delete, staff)', () => {
  it('soft-deletes the child (status → Inactive), keeping history', async () => {
    const del = await request(app)
      .delete('/kids/children/NUR-005')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER);

    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe('Inactive');

    const get = await request(app)
      .get('/kids/children/NUR-005')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER);
    expect(get.status).toBe(200);
    expect(get.body.data.status).toBe('Inactive');
  });

  it('forbids a parent from deleting', async () => {
    const res = await request(app)
      .delete('/kids/children/NUR-001')
      .set('authorization', await parentToken());

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only staff/i);
  });

  it('returns 404 for an unknown admission number', async () => {
    const res = await request(app)
      .delete('/kids/children/NOPE-777')
      .set('authorization', await adminToken())
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /kids/children/link (parent self-service)', () => {
  it('creates a profile when linking a child whose students row names the parent (parent_id match)', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await parentToken())
      .send({ admission_no: 'NUR-006' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.parent_user_id).toBe('U2');
    expect(res.body.data.full_name).toBe('Fatima Lawal');
  });

  it('re-linking the same child returns the existing profile (200, idempotent)', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await parentToken())
      .send({ admission_no: 'NUR-006' });

    expect(res.status).toBe(200);
    expect(res.body.data.parent_user_id).toBe('U2');
  });

  it('links a child whose students row already has a profile (relink path)', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await parentToken())
      .send({ admission_no: 'NUR-002' });

    expect(res.status).toBe(200);
    expect(res.body.data.parent_user_id).toBe('U2');
    expect(res.body.data.full_name).toBe('Bola Yusuf');
  });

  it('rejects a student owned by a different parent', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await parentToken())
      .send({ admission_no: 'NUR-003' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not linked to your account/i);
  });

  it('only parents can link children', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await adminToken())
      .send({ admission_no: 'NUR-004' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only parents/i);
  });

  it('returns 404 for an unknown admission number', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await parentToken())
      .send({ admission_no: 'NOPE-777' });

    expect(res.status).toBe(404);
  });

  it('requires admission_no', async () => {
    const res = await request(app)
      .post('/kids/children/link')
      .set('authorization', await parentToken())
      .send({});

    expect(res.status).toBe(400);
  });
});
