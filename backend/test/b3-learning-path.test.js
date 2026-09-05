'use strict';

/**
 * B3 learning-path + weekly-goals regression — locks the Phase 4 backend:
 *
 *   1. Age isolation (hard ceiling) — GET /kids/learning-path never returns a
 *      lesson/unit above the child's band; units with ANY published above-band
 *      lesson are omitted whole (their ids never reach the child).
 *   2. Spill-over + cumulative E3f chain — below-band unfinished units listed
 *      first, never locked; current-band units lock until the chain above is
 *      done (practice + passed test); finishing spill-over unlocks the band.
 *   3. Weekly goals (G7) — lazy auto-init 1/week, teacher-set rows, done =
 *      distinct lessons passed in the current Monday-start week, teacher goal
 *      can't be lowered by the child, other children inaccessible.
 *
 * Run: jest test/b3-learning-path.test.js --runInBand --forceExit
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const {
  AGE_BANDS,
  classToAgeLevel,
  visibleLevels,
  resolveChildBand,
} = require('../src/services/ageBand');
const { currentWeekBounds } = require('../src/controllers/kidsGoals');

async function cleanupFixtures() {
  await testQuery(`DELETE FROM kids_game_units WHERE series_id = ?`, [SERIES_ID]);
  await testQuery(`DELETE FROM kids_game_series WHERE id = ?`, [SERIES_ID]);
  await testQuery(`DELETE FROM kids_lessons WHERE id IN ('B3-L1','B3-L2','B3-L3')`);
  await testQuery(`DELETE FROM kids_children WHERE school_id = 'SCH-TEST' AND admission_no LIKE 'B3-%'`);
  await testQuery(`DELETE FROM kids_progress WHERE child_admission_no LIKE 'B3-%'`);
  await testQuery(`DELETE FROM kids_learning_goals WHERE child_admission_no LIKE 'B3-%'`);
  await testQuery(`DELETE FROM kids_garden_state WHERE student_id LIKE 'B3-%'`);
}

afterAll(async () => {
  await cleanupFixtures(); // shared hermetic DB — leave it as found
  await closeConnections();
});

async function staffToken() {
  const res = await request(app)
    .post('/users/login')
    .send({ username: 'admin@kids.test', password: 'Admin@123' });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function studentToken(admission, password = 'Nursery@123') {
  const res = await request(app)
    .post('/students/login')
    .send({ username: admission, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

// ─── 0. Pure unit: age-band mapping (server-side port) ─────────────────────

describe('B3: ageBand mapping + visible levels', () => {
  it('maps the documented class keywords exactly', () => {
    expect(AGE_BANDS).toEqual(['Creche', 'Nursery', 'KG1', 'KG2', 'Primary']);
    expect(classToAgeLevel('Creche')).toBe('Creche');
    expect(classToAgeLevel('Pre-Nursery')).toBe('Creche');
    expect(classToAgeLevel('Nursery 2')).toBe('KG2');
    expect(classToAgeLevel('Year 3')).toBe('Primary');
    expect(classToAgeLevel('Year 4')).toBe('Primary');
    expect(classToAgeLevel('Year 5')).toBe('Primary');
    expect(classToAgeLevel('Primary 2')).toBe('Primary'); // keyword beats bare-number fallback
    expect(classToAgeLevel('Basic 3')).toBe('Primary');
    expect(classToAgeLevel('KG2')).toBe('KG2');
    expect(classToAgeLevel('kindergarten 1')).toBe('KG1');
    expect(classToAgeLevel(null)).toBeNull();
    expect(classToAgeLevel('')).toBeNull();
  });

  it('visible levels = band + everything below (strict ceiling)', () => {
    expect(visibleLevels('Creche')).toEqual(['Creche']);
    expect(visibleLevels('Nursery')).toEqual(['Creche', 'Nursery', 'KG1']);
    expect(visibleLevels('KG2')).toEqual(['Creche', 'Nursery', 'KG1', 'KG2']);
    expect(visibleLevels('Bogus')).toBeNull();
  });

  it('resolves the NARROWEST known band when class_code and age_level disagree', () => {
    // class "Nursery A" maps to Nursery but the row says KG1 → Nursery (never wider).
    expect(resolveChildBand({ class_code: 'Nursery A', age_level: 'KG1' })).toBe('Nursery');
    expect(resolveChildBand({ class_code: 'NUR-A', age_level: 'KG1' })).toBe('KG1'); // NUR-A unmappable → age_level wins
    expect(resolveChildBand({ class_code: null, age_level: 'KG2' })).toBe('KG2');
    expect(resolveChildBand({ class_code: 'Primary 1', age_level: 'Primary' })).toBe('Primary');
    expect(resolveChildBand(null)).toBeNull();
  });
});

describe('B3: weekly goal period math (Monday start, UTC)', () => {
  it('brackets a mid-week date by its Monday and next Monday', () => {
    // 2026-09-03 is a Thursday → week starts Monday 2026-08-31.
    const b = currentWeekBounds(new Date('2026-09-03T12:00:00Z'));
    expect(b.start).toBe('2026-08-31');
    expect(b.end).toBe('2026-09-07');
  });

  it('treats Monday itself as the start of its own week', () => {
    const b = currentWeekBounds(new Date('2026-08-31T00:00:00Z'));
    expect(b.start).toBe('2026-08-31');
  });
});

// ─── 1. Learning-path isolation fixtures ───────────────────────────────────

const SERIES_ID = 'B3-SERIES';
const UNITS = [
  // unit_number, id, age, lesson id
  [1, 'B3-U1', 'Nursery', 'B3-L1'],
  [2, 'B3-U2', 'KG1', 'B3-L2'],
  [3, 'B3-U3', 'Primary', 'B3-L3'],
];

async function seedLearningPathFixtures() {
  await testQuery(
    `INSERT INTO kids_game_series (id, name, category, description, created_by) VALUES (?, 'B3 Isolation Series', 'Numeracy', 'owned by b3-learning-path.test.js', 'U1')
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [SERIES_ID]
  );
  for (const [num, unitId, age, lessonId] of UNITS) {
    await testQuery(
      `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, published_at) VALUES (?, 'SCH-TEST', 'BR-TEST', ?, 'Math', ?, 'U1', 'published', 'game', NOW())
       ON DUPLICATE KEY UPDATE content_state = 'published'`,
      [lessonId, `${unitId} lesson`, age]
    );
    await testQuery(
      `INSERT INTO kids_game_units (id, series_id, unit_number, prerequisite_unit_id, content_items, title) VALUES (?, ?, ?, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE series_id = VALUES(series_id)`,
      [
        unitId,
        SERIES_ID,
        num,
        JSON.stringify([{ item_id: `b3-item-${num}`, tier: 1, lesson_id: lessonId, title: `${unitId} game` }]),
        `${unitId} title`,
      ]
    );
  }
  await testQuery(
    `INSERT INTO kids_children (id, admission_no, school_id, branch_id, full_name, age_level, class_code, status) VALUES
     ('B3-CHILD-NUR', 'B3-NUR-ADM', 'SCH-TEST', 'BR-TEST', 'B3 Nursery Kid', 'Nursery', NULL, 'Active'),
     ('B3-CHILD-KG1', 'B3-KG1-ADM', 'SCH-TEST', 'BR-TEST', 'B3 KG1 Kid', 'KG1', NULL, 'Active'),
     ('B3-CHILD-KG2', 'B3-KG2-ADM', 'SCH-TEST', 'BR-TEST', 'B3 KG2 Kid', 'KG2', NULL, 'Active'),
     ('B3-CHILD-GOAL', 'B3-GOAL-ADM', 'SCH-TEST', 'BR-TEST', 'B3 Goal Kid', 'KG1', NULL, 'Active')
     ON DUPLICATE KEY UPDATE age_level = VALUES(age_level)`
  );
}

async function pathFor(admission) {
  const token = await staffToken();
  const res = await request(app)
    .get('/kids/learning-path')
    .query({ student_id: admission })
    .set('authorization', token);
  expect(res.status).toBe(200);
  return res.body.data.path.find((p) => p.series_id === SERIES_ID);
}

let progSeq = 0;
async function setLessonProgress(admission, lessonId, mode, score) {
  progSeq += 1;
  const id = `B3PRG${progSeq}-${Date.now() % 1000000}`;
  await testQuery(
    `INSERT INTO kids_progress (id, school_id, branch_id, child_admission_no, lesson_id, mode, score, stars_earned, xp, completed_at) VALUES (?, 'SCH-TEST', 'BR-TEST', ?, ?, ?, ?, 3, 10, NOW())`,
    [id, admission, lessonId, mode, score]
  );
}

// ─── 2. Hard ceiling: no lesson above the child's band ─────────────────────

describe('B3: learning-path age isolation (hard ceiling)', () => {
  beforeAll(async () => {
    await seedLearningPathFixtures();
  });

  it('a Nursery child sees only Nursery (and below) — Primary/KG1 units omitted whole', async () => {
    const p = await pathFor('B3-NUR-ADM');
    expect(p).toBeDefined();
    const unitNumbers = p.units.map((u) => u.unit_number).sort();
    expect(unitNumbers).toEqual([1]); // only U1 (Nursery) survives
    const ages = p.units.flatMap((u) => u.lessons.map((l) => l.age_level));
    expect(ages.every((a) => ['Creche', 'Nursery'].includes(a))).toBe(true);
    // zero leaks: no above-band lesson ids anywhere in the payload
    const serialized = JSON.stringify(p.units);
    expect(serialized).not.toContain('B3-L2');
    expect(serialized).not.toContain('B3-L3');
  });

  it('a KG1 child sees Nursery (spill-over) + KG1, but never Primary', async () => {
    const p = await pathFor('B3-KG1-ADM');
    expect(p).toBeDefined();
    const unitNumbers = p.units.map((u) => u.unit_number).sort();
    expect(unitNumbers).toEqual([1, 2]);
    const u1 = p.units.find((u) => u.unit_number === 1);
    const u2 = p.units.find((u) => u.unit_number === 2);
    // below-band unfinished → spill-over, listed, NOT locked
    expect(u1.relation).toBe('spillover');
    expect(u1.locked).toBe(false);
    expect(u1.locked_reason).toBeNull();
    // current band locked by the unfinished chain (cumulative E3f)
    expect(u2.relation).toBe('current');
    expect(u2.locked).toBe(true);
    expect(u2.locked_reason).toMatch(/Practice AND pass the Test/i);
    expect(JSON.stringify(p.units)).not.toContain('B3-L3');
  });

  it('finishing the spill-over unit (practice + passed test) unlocks the current band', async () => {
    await setLessonProgress('B3-KG1-ADM', 'B3-L1', 'practice', 80);
    await setLessonProgress('B3-KG1-ADM', 'B3-L1', 'test', 80);
    const p = await pathFor('B3-KG1-ADM');
    const u1 = p.units.find((u) => u.unit_number === 1);
    const u2 = p.units.find((u) => u.unit_number === 2);
    expect(u1.done).toBe(true);
    expect(u1.relation).toBe('passed_below');
    expect(u2.locked).toBe(false);
    // per-lesson state surfaced correctly
    const l1 = u1.lessons.find((l) => l.lesson_id === 'B3-L1');
    expect(l1.state).toBe('passed');
  });

  it('a KG2 child still cannot see the Primary unit', async () => {
    const p = await pathFor('B3-KG2-ADM');
    expect(p).toBeDefined();
    const unitNumbers = p.units.map((u) => u.unit_number).sort();
    expect(unitNumbers).toEqual([1, 2]); // U3 (Primary) stays hidden for KG2 too
    expect(JSON.stringify(p.units)).not.toContain('B3-L3');
  });

  it('rejects an unresolvable / foreign child', async () => {
    const token = await studentToken('NUR-001');
    const foreign = await request(app)
      .get('/kids/learning-path')
      .query({ student_id: 'B3-GOAL-ADM' })
      .set('authorization', token);
    expect(foreign.status).toBe(403); // NUR-001 cannot view another child's path
  });
});

// ─── 3. Weekly goals (G7) ──────────────────────────────────────────────────

describe('B3: weekly goals — lazy init, CRUD, done counting, guards', () => {
  const ADM = 'B3-GOAL-ADM';

  it('auto-inits a goal on first read (target 1, set_by auto) exactly once', async () => {
    const token = await staffToken();
    const r1 = await request(app).get(`/kids/goals/${ADM}`).set('authorization', token);
    expect(r1.status).toBe(200);
    expect(r1.body.success).toBe(true);
    expect(r1.body.data.target).toBe(1);
    expect(r1.body.data.done).toBe(0);
    expect(r1.body.data.set_by).toBe('auto');
    expect(r1.body.data.status).toBe('active');

    const rows = await testQuery(
      `SELECT COUNT(*) AS n FROM kids_learning_goals WHERE child_admission_no = ? AND goal_type = 'weekly'`,
      [ADM]
    );
    expect(rows[0].n).toBe(1);
  });

  it('a teacher can raise the weekly target; teacher-set goal survives reads', async () => {
    const token = await staffToken();
    const res = await request(app)
      .post(`/kids/goals/${ADM}`)
      .set('authorization', token)
      .send({ target_count: 2, set_by: 'teacher' });
    expect(res.status).toBe(200);
    expect(res.body.data.target).toBe(2);
    expect(res.body.data.set_by).toBe('teacher');

    const get = await request(app).get(`/kids/goals/${ADM}`).set('authorization', token);
    expect(get.body.data.target).toBe(2);
  });

  it('done counts distinct lessons passed in the CURRENT Monday-start week only', async () => {
    // Two in-week passed tests on distinct lessons…
    await setLessonProgress(ADM, 'B3-L1', 'test', 90);
    await setLessonProgress(ADM, 'B3-L2', 'test', 90);
    // …and one stale pass from ~30 days ago (previous period) — must NOT count.
    await testQuery(
      `INSERT INTO kids_progress (id, school_id, branch_id, child_admission_no, lesson_id, mode, score, stars_earned, xp, completed_at) VALUES ('B3-PRG-STALE', 'SCH-TEST', 'BR-TEST', ?, 'B3-L3', 'test', 90, 3, 10, DATE_SUB(NOW(), INTERVAL 30 DAY))`,
      [ADM]
    );

    const token = await staffToken();
    const get = await request(app).get(`/kids/goals/${ADM}`).set('authorization', token);
    expect(get.body.data.done).toBe(2); // stale B3-L3 excluded
    expect(get.body.data.status).toBe('done'); // 2 >= teacher target 2
  });

  it('a child cannot lower a teacher-set goal (403 ask-teacher guard)', async () => {
    const token = await staffToken();
    await request(app)
      .post(`/kids/goals/${ADM}`)
      .set('authorization', token)
      .send({ target_count: 5, set_by: 'teacher' });
    // the guard fires on set_by=child below the teacher target regardless of caller
    const res = await request(app)
      .post(`/kids/goals/${ADM}`)
      .set('authorization', token)
      .send({ target_count: 2, set_by: 'child' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/ask your teacher/i);
  });

  it('validates target bounds (1–20)', async () => {
    const token = await staffToken();
    const res = await request(app)
      .post(`/kids/goals/${ADM}`)
      .set('authorization', token)
      .send({ target_count: 0, set_by: 'teacher' });
    expect(res.status).toBe(400);
  });

  it('locks other children out of goals', async () => {
    const token = await studentToken('NUR-001');
    const res = await request(app).get('/kids/goals/NUR-002').set('authorization', token);
    expect(res.status).toBe(403); // NUR-001 (self goal only) may not read NUR-002
  });
});
