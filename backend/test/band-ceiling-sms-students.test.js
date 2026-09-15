'use strict';

/**
 * G6 server-side age ceiling — the SMS-school path (Q59).
 *
 * Live defect found 2026-09-15: admissions `004` @ SCH/28 (class_name
 * 'Nursery 2') and `109` @ SCH/11 (class_name 'Kindergarten') each received
 * the FULL 1718-lesson catalog from GET /kids/lessons instead of their
 * 1085 / 1356 at-or-below-band lessons, while a flagship child was capped
 * correctly. The client ceiling (learningPath.ts) was the only thing keeping
 * elder content out of a Nursery 2 child's Play tab.
 *
 * Cause was NOT dirty data and NOT the resolver algorithm:
 *   - `elite_db.students.class_name` really holds 'Nursery 2' (0 of 6649 rows
 *     are empty) — the data was always fine;
 *   - `models/Student.js` simply never DECLARED class_name, and Sequelize
 *     selects only declared attributes, so `student.class_name` was
 *     `undefined` inside ageBand.resolveBandForAdmission;
 *   - the next fallback, `class_code`, is a synthetic `CLS####` code that the
 *     normalizer deliberately strips → no band → `kids.js` skipped the cap
 *     entirely (`if (childBand)`) and served all six bands.
 *
 * Why the gap survived: `ageBand.test.js` exercises only the pure helpers, and
 * `b3b-age-declaration.test.js` calls `resolveBandForAdmission()` directly with
 * an intentionally unmappable class. Nothing asserted that a REAL school child
 * resolves a band, nor that the endpoint narrows. Both are asserted here.
 *
 * Run: jest test/band-ceiling-sms-students.test.js --runInBand --forceExit
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const { resolveBandForAdmission, visibleLevels } = require('../src/services/ageBand');

// Real-school shape: the class is only expressible via class_name; class_code
// is a synthetic CLS######## mirror key, exactly like production ('CLS0876').
const SCHOOL = 'SCH-TEST';
const N2 = 'CEIL-N2'; // class_name 'Nursery 2 A'  → at-or-below = 4 bands
const PR = 'CEIL-PR'; // class_name 'Primary 4 A'  → top band, nothing filtered
const CRE = 'CEIL-CRE'; // class_name 'Crèche'      → rank 0, no Crèche lesson exists
const PASSWORD = 'Nursery@123';

// One global published lesson per band (SCH-KIDS is a platform school id).
// Deliberately NO 'Crèche' lesson, so the rank-0 child exercises the
// never-empty widening rule below.
const LESSONS = [
  ['CEIL-L-N1', 'Nursery 1'],
  ['CEIL-L-N2', 'Nursery 2'],
  ['CEIL-L-KG', 'Kindergarten'],
  ['CEIL-L-PR', 'Primary'],
];

async function cleanupFixtures() {
  await testQuery(`DELETE FROM kids_lessons WHERE id LIKE 'CEIL-L-%'`);
  await testQuery(`DELETE FROM students WHERE admission_no IN (?, ?, ?)`, [N2, PR, CRE]);
  await testQuery(`DELETE FROM kids_children WHERE admission_no IN (?, ?, ?)`, [N2, PR, CRE]);
  await testQuery(`DELETE FROM kids_age_declarations WHERE child_admission_no IN (?, ?, ?)`, [N2, PR, CRE]);
}

beforeAll(async () => {
  await cleanupFixtures();

  await testQuery(
    `INSERT INTO students (id, admission_no, school_id, branch_id, student_name, class_code, class_name, password, user_type, status) VALUES
     ('CEIL-ID-N2',  ?, ?, 'BR-TEST', 'Ceil Nursery Two', 'CLS0876', 'Nursery 2 A',  ?, 'Student', 'Active'),
     ('CEIL-ID-PR',  ?, ?, 'BR-TEST', 'Ceil Primary Four', 'CLS0900', 'Primary 4 A',  ?, 'Student', 'Active'),
     ('CEIL-ID-CRE', ?, ?, 'BR-TEST', 'Ceil Creche Kid',   'CLS0001', 'Crèche',      ?, 'Student', 'Active')`,
    [N2, SCHOOL, bcrypt.hashSync(PASSWORD, 10), PR, SCHOOL, bcrypt.hashSync(PASSWORD, 10), CRE, SCHOOL, bcrypt.hashSync(PASSWORD, 10)]
  );

  // No kids_children row for any of them — SMS-imported children, the exact
  // population that used to fall through the whole chain to no band at all.
  for (const [id, ageLevel] of LESSONS) {
    await testQuery(
      `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, is_global, published_at)
       VALUES (?, 'SCH-KIDS', 'BR-KIDS', ?, 'Numeracy', ?, 'U1', 'published', 'game', 1, NOW())`,
      [id, `Ceiling Fixture ${ageLevel}`, ageLevel]
    );
  }
});

afterAll(async () => {
  await cleanupFixtures();
  await closeConnections();
});

async function studentToken(admission) {
  const res = await request(app)
    .post('/students/login')
    .send({ username: admission, password: PASSWORD, school_id: SCHOOL });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function lessonsFor(admission) {
  const token = await studentToken(admission);
  const res = await request(app).get('/kids/lessons').set('authorization', token);
  expect(res.status).toBe(200);
  return res.body.data.map((l) => l.id);
}

describe('G6 ceiling: an SMS-school child resolves a band from class_name', () => {
  it('resolveBandForAdmission reads students.class_name (the model must declare it)', async () => {
    // Fails before the fix: class_name undefined → class_code 'CLS0876' stripped
    // by the normalizer → null. This is the assertion that was missing.
    await expect(resolveBandForAdmission(N2)).resolves.toBe('Nursery 2');
    await expect(resolveBandForAdmission(PR)).resolves.toBe('Primary');
    await expect(resolveBandForAdmission(CRE)).resolves.toBe('Crèche');
  });

  it('strips the arm/stream suffix rather than failing on it', async () => {
    // 'Nursery 2 A' must map, not 400 — real school class names carry arms.
    expect(visibleLevels('Nursery 2')).toEqual(['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2']);
  });
});

describe('G6 ceiling: GET /kids/lessons actually narrows', () => {
  it('a Nursery 2 school child gets at-or-below-band lessons only', async () => {
    const ids = await lessonsFor(N2);

    expect(ids).toEqual(expect.arrayContaining(['CEIL-L-N1', 'CEIL-L-N2']));
    // The live leak: Kindergarten + Primary content reaching a Nursery 2 child.
    expect(ids).not.toContain('CEIL-L-KG');
    expect(ids).not.toContain('CEIL-L-PR');
  });

  it('a Primary child is not over-filtered (top band sees the whole catalog)', async () => {
    const ids = await lessonsFor(PR);

    expect(ids).toEqual(expect.arrayContaining(['CEIL-L-N1', 'CEIL-L-N2', 'CEIL-L-KG', 'CEIL-L-PR']));
  });

  it('keeps the never-empty widening door for a band with no content', async () => {
    // Crèche (rank 0) has no global lesson fixture. The product rule is "no
    // child logs in to a blank dashboard", so the ceiling is dropped rather
    // than returning nothing — documented here so it is a known trade-off and
    // not mistaken for the cap failing to hold.
    const ids = await lessonsFor(CRE);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining(['CEIL-L-N1', 'CEIL-L-KG', 'CEIL-L-PR']));
  });
});
