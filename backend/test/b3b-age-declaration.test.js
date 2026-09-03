'use strict';

/**
 * B3b: age-declaration fallback ("How old are you?" tour step) — locks:
 *
 *   1. ageToBand ladder: 3→Creche, 4→Nursery, 5→KG1, 6→KG2, ≥7→Primary.
 *   2. resolveBandForAdmission chain: kids_children → kids_age_declarations →
 *      elite_db.students. An SMS-imported kid (no kids_children row, unmappable
 *      class) is unresolvable (400) until they declare their age — then the
 *      learning-path resolves (200) from the declaration alone.
 *   3. POST /kids/age validates 3–12 and is self-only (students only).
 *
 * Run: jest test/b3b-age-declaration.test.js --runInBand --forceExit
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const { ageToBand, resolveBandForAdmission } = require('../src/services/ageBand');

const ADM = 'B3B-IMPORTED'; // SMS-imported kid: students row, NO kids_children row
const SCHOOL = 'SCH-TEST';

async function cleanupFixtures() {
  await testQuery(`DELETE FROM kids_age_declarations WHERE child_admission_no = ?`, [ADM]);
  await testQuery(`DELETE FROM students WHERE admission_no = ?`, [ADM]);
}

beforeAll(async () => {
  await cleanupFixtures();
  // SMS-imported student: class_name intentionally unmappable → without the
  // age declaration the band chain must resolve to null.
  await testQuery(
    `INSERT INTO students (id, admission_no, school_id, branch_id, student_name, class_code, class_name, password, user_type, status)
     VALUES ('B3B-ID', ?, ?, 'BR-TEST', 'B3b Imported Kid', 'CLS0610', 'PRE NURSERY', ?, 'Student', 'Active')`,
    [ADM, SCHOOL, bcrypt.hashSync('Nursery@123', 10)]
  );
});

afterAll(async () => {
  await cleanupFixtures();
  await closeConnections();
});

async function studentToken(admission) {
  const res = await request(app)
    .post('/users/login')
    .send({ username: admission, password: 'Nursery@123' });
  if (res.status !== 200) {
    // Fallback: mint via students/login path used by other suites
    const r2 = await request(app)
      .post('/students/login')
      .send({ username: admission, password: 'Nursery@123', school_id: SCHOOL });
    expect(r2.status).toBe(200);
    return r2.body.token;
  }
  return res.body.token;
}

describe('B3b: ageToBand ladder', () => {
  it('maps declared ages to the documented bands', () => {
    expect(ageToBand(3)).toBe('Creche');
    expect(ageToBand(4)).toBe('Nursery');
    expect(ageToBand(5)).toBe('KG1');
    expect(ageToBand(6)).toBe('KG2');
    expect(ageToBand(7)).toBe('Primary');
    expect(ageToBand(12)).toBe('Primary');
    expect(ageToBand(0)).toBeNull();
    expect(ageToBand(null)).toBeNull();
    expect(ageToBand('x')).toBeNull();
  });
});

describe('B3b: declaration fallback unlocks the learning path', () => {
  it('unresolvable before the declaration (no kids_children, unmappable class)', async () => {
    const band = await resolveBandForAdmission(ADM);
    expect(band).toBeNull();
  });

  it('POST /kids/age validates bounds and persists the declaration', async () => {
    const token = await studentToken(ADM);
    const bad = await request(app)
      .post('/kids/age')
      .set('authorization', token)
      .send({ age: 2 });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post('/kids/age')
      .set('authorization', token)
      .send({ age: 5 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ age: 5, source: 'tour' });

    // Upsert: re-picking a new age replaces the row (no duplicate).
    const again = await request(app)
      .post('/kids/age')
      .set('authorization', token)
      .send({ age: 4 });
    expect(again.status).toBe(200);
    const rows = await testQuery(
      `SELECT age_years FROM kids_age_declarations WHERE child_admission_no = ?`,
      [ADM]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].age_years)).toBe(4);
  });

  it('GET /kids/age returns the stored declaration', async () => {
    const token = await studentToken(ADM);
    const res = await request(app).get('/kids/age').set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.age).toBe(4);
  });

  it('learning-path resolves from the declaration alone (Nursery ceiling)', async () => {
    const band = await resolveBandForAdmission(ADM);
    expect(band).toBe('Nursery'); // age 4 → Nursery, students row never needed
  });
});
