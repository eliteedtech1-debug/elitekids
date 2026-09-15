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
 * SECOND PASS — the cap still had two holes (measured 2026-09-15):
 *   - 647 of 6649 children (9.7%) resolved NO band and were therefore served
 *     every band. 640 of them are decorative class names ('Umar bin Khaddab',
 *     'TAMHEED B') whose only usable signal is the class row's `section`, which
 *     the resolver never passed to classToAgeLevel — so the documented
 *     decorative-name fallback could not fire.
 *   - the last 7 are age-word room names ('Just 2s').
 *   - and any identity left unresolvable widened to all six bands, which is the
 *     opposite of ageBand's own risk rule ("fall back to the NARROWEST known
 *     rank — never widen"). The listing now fails closed to the narrowest band.
 *
 * Why the first gap survived: `ageBand.test.js` exercises only the pure helpers,
 * and `b3b-age-declaration.test.js` calls `resolveBandForAdmission()` directly
 * with an intentionally unmappable class. Nothing asserted that a REAL school
 * child resolves a band, that a decorative name resolves at all, or that the
 * endpoint narrows. All of those are asserted here.
 *
 * Run: jest test/band-ceiling-sms-students.test.js --runInBand --forceExit
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const { resolveBandForAdmission, visibleLevels, classToAgeLevel } = require('../src/services/ageBand');

// Real-school shape: the class is only expressible via class_name; class_code
// is a synthetic CLS######## mirror key, exactly like production ('CLS0876').
const SCHOOL = 'SCH-TEST';
const PASSWORD = 'Nursery@123';

const N2 = 'CEIL-N2'; // class_name 'Nursery 2 A'  → at-or-below = 4 bands
const PR = 'CEIL-PR'; // class_name 'Primary 4 A'  → top band, nothing filtered
const CRE = 'CEIL-CRE'; // class_name 'Crèche'     → rank 0
const DECO = 'CEIL-DECO'; // 'Umar bin Khaddab' + class row section NURSERY → Nursery 1
const AGE_WORD = 'CEIL-2S'; // 'Just 2s'            → age-word room name
const UNKNOWN = 'CEIL-UNK'; // nothing knowable at all → must fail closed
const DECO_CODE = 'CLS0777';

const ADMISSIONS = [N2, PR, CRE, DECO, AGE_WORD, UNKNOWN];

// One global published lesson per band, including Crèche, so a
// narrowest-band ceiling has content of its own and does NOT trigger the
// never-empty widening (production's Crèche band carries 272 lessons).
const LESSONS = [
  ['CEIL-L-CRE', 'Crèche'],
  ['CEIL-L-N1', 'Nursery 1'],
  ['CEIL-L-N2', 'Nursery 2'],
  ['CEIL-L-KG', 'Kindergarten'],
  ['CEIL-L-PR', 'Primary'],
];

const STUDENTS = [
  ['CEIL-ID-N2', N2, 'CLS0876', 'Nursery 2 A'],
  ['CEIL-ID-PR', PR, 'CLS0900', 'Primary 4 A'],
  ['CEIL-ID-CRE', CRE, 'CLS0001', 'Crèche'],
  // Decorative name — unmappable on its own, resolvable through the class row.
  ['CEIL-ID-DECO', DECO, DECO_CODE, 'Umar bin Khaddab'],
  // Age-word room name.
  ['CEIL-ID-2S', AGE_WORD, null, 'Just 2s'],
  // Nothing to read: no class row, no kids_children, no declaration.
  ['CEIL-ID-UNK', UNKNOWN, null, 'Zqx Nonesuch'],
];

async function insertLesson(id, ageLevel) {
  await testQuery(
    `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, is_global, published_at)
     VALUES (?, 'SCH-KIDS', 'BR-KIDS', ?, 'Numeracy', ?, 'U1', 'published', 'game', 1, NOW())`,
    [id, `Ceiling Fixture ${ageLevel}`, ageLevel]
  );
}

async function cleanupFixtures() {
  await testQuery(`DELETE FROM kids_lessons WHERE id LIKE 'CEIL-L-%'`);
  await testQuery(`DELETE FROM classes WHERE class_code = ?`, [DECO_CODE]);
  await testQuery(`DELETE FROM students WHERE admission_no IN (?, ?, ?, ?, ?, ?)`, ADMISSIONS);
  await testQuery(`DELETE FROM kids_children WHERE admission_no IN (?, ?, ?, ?, ?, ?)`, ADMISSIONS);
  await testQuery(`DELETE FROM kids_age_declarations WHERE child_admission_no IN (?, ?, ?, ?, ?, ?)`, ADMISSIONS);
}

beforeAll(async () => {
  await cleanupFixtures();

  for (const [id, admission, classCode, className] of STUDENTS) {
    await testQuery(
      `INSERT INTO students (id, admission_no, school_id, branch_id, student_name, class_code, current_class, class_name, password, user_type, status)
       VALUES (?, ?, ?, 'BR-TEST', ?, ?, ?, ?, ?, 'Student', 'Active')`,
      [id, admission, SCHOOL, `Ceil ${admission}`, classCode, classCode, className, bcrypt.hashSync(PASSWORD, 10)]
    );
  }

  // The class row the decorative name needs: `section` is the signal that makes
  // 'Umar bin Khaddab' a nursery room rather than an Islamiyya form.
  await testQuery(
    `INSERT INTO classes (class_name, class_code, section, school_id, branch_id, status, class_type)
     VALUES ('Umar bin Khaddab', ?, 'NURSERY', ?, 'BR-TEST', 'Active', 'Regular')`,
    [DECO_CODE, SCHOOL]
  );

  // No kids_children row for any of them — SMS-imported children, the exact
  // population that used to fall through the whole chain to no band at all.
  for (const [id, ageLevel] of LESSONS) await insertLesson(id, ageLevel);
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

describe('G6 ceiling: band resolution reads every signal it is given', () => {
  it('reads students.class_name (the model must declare it)', async () => {
    // Fails before the fix: class_name undefined → class_code 'CLS0876' stripped
    // by the normalizer → null. This is the assertion that was missing.
    await expect(resolveBandForAdmission(N2)).resolves.toBe('Nursery 2');
    await expect(resolveBandForAdmission(PR)).resolves.toBe('Primary');
    await expect(resolveBandForAdmission(CRE)).resolves.toBe('Crèche');
  });

  it('recovers a DECORATIVE class name through the class row section', async () => {
    // 'Umar bin Khaddab' carries no pedagogical signal; the section does.
    // Without the class-row lookup this child resolved null → every band.
    expect(classToAgeLevel('Umar bin Khaddab')).toBeNull();
    expect(classToAgeLevel('Umar bin Khaddab', 'NURSERY')).toBe('Nursery 1');
    await expect(resolveBandForAdmission(DECO)).resolves.toBe('Nursery 1');
  });

  it('maps AGE-WORD room names through the shared age ladder', async () => {
    expect(classToAgeLevel('Just 2s')).toBe('Crèche');
    expect(classToAgeLevel('3s room')).toBe('Playgroup');
    expect(classToAgeLevel('Just 5s')).toBe('Nursery 2');
    await expect(resolveBandForAdmission(AGE_WORD)).resolves.toBe('Crèche');
  });

  it('does not let an age-word rule hijack real vocabulary', () => {
    // Anchored to the whole name, so keyword vocabulary wins first.
    expect(classToAgeLevel('Nursery 2 A')).toBe('Nursery 2');
    expect(classToAgeLevel('Primary 3 B')).toBe('Primary');
    expect(classToAgeLevel('Kindergarten 2')).toBe('Nursery 2');
  });

  it('returns null only when NOTHING is knowable', async () => {
    // The one honest null: keep it, so the fail-closed policy below is what
    // these tests exercise rather than a resolver that always guesses.
    await expect(resolveBandForAdmission(UNKNOWN)).resolves.toBeNull();
  });

  it('strips the arm/stream suffix rather than failing on it', () => {
    expect(visibleLevels('Nursery 2')).toEqual(['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2']);
  });
});

describe('G6 ceiling: GET /kids/lessons actually narrows', () => {
  it('a Nursery 2 school child gets at-or-below-band lessons only', async () => {
    const ids = await lessonsFor(N2);

    expect(ids).toEqual(expect.arrayContaining(['CEIL-L-CRE', 'CEIL-L-N1', 'CEIL-L-N2']));
    // The live leak: Kindergarten + Primary content reaching a Nursery 2 child.
    expect(ids).not.toContain('CEIL-L-KG');
    expect(ids).not.toContain('CEIL-L-PR');
  });

  it('a child recovered from a decorative class name is narrowed, not widened', async () => {
    const ids = await lessonsFor(DECO);

    expect([...ids].sort()).toEqual(['CEIL-L-CRE', 'CEIL-L-N1']);
  });

  it('a Primary child is not over-filtered (top band sees the whole catalog)', async () => {
    const ids = await lessonsFor(PR);

    expect(ids).toEqual(expect.arrayContaining(LESSONS.map(([id]) => id)));
  });

  it('an unresolvable identity is capped to the narrowest band, NEVER served every band', async () => {
    // The whole point of "the cap holds": an unreadable identity must not widen.
    // Before this it received all five fixtures — including Primary content.
    const ids = await lessonsFor(UNKNOWN);

    expect(ids).toEqual(['CEIL-L-CRE']);
    expect(ids).not.toContain('CEIL-L-KG');
    expect(ids).not.toContain('CEIL-L-PR');
  });

  it('keeps the never-empty widening door when a ceiling admits nothing', async () => {
    // Only reachable when the ceiling's own content is missing — measured
    // unreachable in production (every ceiling admits >= 272 lessons), but kept
    // as a deliberate product rule, so it is exercised by removing the ceiling's
    // content rather than by hoping a band stays empty.
    await testQuery(`DELETE FROM kids_lessons WHERE id = 'CEIL-L-CRE'`);
    try {
      const ids = await lessonsFor(CRE);

      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toEqual(expect.arrayContaining(['CEIL-L-N1', 'CEIL-L-KG', 'CEIL-L-PR']));
    } finally {
      await insertLesson('CEIL-L-CRE', 'Crèche');
    }
  });
});
