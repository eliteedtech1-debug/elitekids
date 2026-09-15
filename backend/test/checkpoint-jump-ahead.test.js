'use strict';

/**
 * Jump-ahead checkpoints — "I already know this, let me start higher".
 *
 * Locks the whole contract of the feature:
 *
 *   1. Derivation (pure) — a question is only asked when the game itself states
 *      a single correct answer; templates that cannot are skipped, never guessed.
 *   2. Sampling (pure) — EVERY unit in the chain is probed at least once; a chain
 *      longer than one assessment can cover is refused, not silently trimmed.
 *   3. Verdict (pure) — the threshold AND per-unit demonstration are both
 *      required; acing four of five units is not a pass.
 *   4. The rule (HTTP) — a pass is a recommendation: nothing unlocks until a
 *      staff/admin confirms it, and an admin may not confirm a failed attempt.
 *   5. The exception (HTTP) — in a self-paced school the pass confirms itself,
 *      recorded as such (self_approved, decided_by='self:flagship-self-paced'),
 *      and a miss is closed as a decline so the cool-down applies.
 *   6. Mastery is never faked — the unlock writes mode='checkpoint' rows (0
 *      stars, 0 XP), which the done rule accepts and the mastery rule rejects.
 *   7. The answer key never leaves the server.
 *
 * Run: jest test/checkpoint-jump-ahead.test.js --runInBand --forceExit
 */

const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const {
  CHECKPOINT_PASS_PCT,
  questionFromConfig,
  sampleCheckpoint,
  gradeCheckpoint,
  checkpointVerdict,
} = require('../src/services/checkpointAssessment');
const { isSelfPacedSchool } = require('../src/services/selfPacedSchools');
const { SCOPE, resolvePolicy, policyRowId, autoDecisionLabels } = require('../src/services/checkpointPolicy');

// ─── 1–3. Pure assessment rules ───────────────────────────────────────────

describe('checkpoint: deriving a question from a game', () => {
  const unit = { unit_id: 'U-1', unit_number: 1 };

  test('tap-recognition uses its own items and explicit correctId', () => {
    const q = questionFromConfig({
      unit,
      lesson: { id: 'L-1', title: 'Tap' },
      config: {
        template: 'tap-recognition',
        prompt: 'Tap the red one.',
        items: [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }, { id: 'green', label: 'Green' }],
        correctId: 'red',
      },
    });
    expect(q).not.toBeNull();
    expect(q.question).toBe('Tap the red one.');
    expect(q.options).toHaveLength(3);
    expect(q.correctId).toBe('red');
    // The correct option is present, and rotation never drops one.
    expect(q.options.map((o) => o.id)).toEqual(expect.arrayContaining(['red', 'blue', 'green']));
  });

  test('quiz resolves correctIndex into an option id, and correctId wins over it', () => {
    const base = {
      template: 'quiz',
      question: 'Which is a circle?',
      options: [{ id: 'o1', label: 'Circle' }, { id: 'o2', label: 'Square' }],
    };
    expect(questionFromConfig({ unit, lesson: { id: 'L' }, config: { ...base, correctIndex: 1 } }).correctId).toBe('o2');
    expect(questionFromConfig({ unit, lesson: { id: 'L' }, config: { ...base, correctIndex: 1, correctId: 'o1' } }).correctId).toBe('o1');
  });

  test('matching anchors on readable text and never quotes a data: URL at a child', () => {
    const readable = questionFromConfig({
      unit,
      lesson: { id: 'L' },
      config: { template: 'matching', pairs: [{ a: 'Cow', b: '🐄' }, { a: 'Dog', b: '🐕' }] },
    });
    expect(readable.question).toBe('Which one goes with Cow?');
    expect(readable.correctId).toBe('🐄');

    const imageOnly = questionFromConfig({
      unit,
      lesson: { id: 'L' },
      config: { template: 'matching', pairs: [{ a: 'data:image/svg+xml,x', b: '🐄' }, { a: 'data:image/svg+xml,y', b: '🐕' }] },
    });
    expect(imageOnly.question).toBe('Which one belongs here?');
  });

  test('drag-sort asks for the first item in canonical order', () => {
    const q = questionFromConfig({
      unit,
      lesson: { id: 'L' },
      config: {
        template: 'drag-sort',
        context: 'Put the sounds in teaching order.',
        items: [{ num: 3, label: 't' }, { num: 1, label: 's' }, { num: 2, label: 'a' }],
      },
    });
    expect(q.question).toBe('Put the sounds in teaching order.');
    expect(q.correctId).toBe('s');
    expect(q.options.map((o) => o.id)).toEqual(['s', 'a', 't']);
  });

  test('fill-in-blank answers with the blank, from the word bank', () => {
    const q = questionFromConfig({
      unit,
      lesson: { id: 'L' },
      config: { template: 'fill-in-blank', sentence: 'The cow says ___.', blanks: [{ id: 0, answer: 'moo' }], wordBank: ['moo', 'woof'] },
    });
    expect(q.correctId).toBe('moo');
    expect(q.options.map((o) => o.id).sort()).toEqual(['moo', 'woof']);
  });

  test('returns null instead of inventing a question', () => {
    // composite / unimplemented templates
    expect(questionFromConfig({ unit, lesson: { id: 'L' }, config: { template: 'game-chain', rounds: [] } })).toBeNull();
    expect(questionFromConfig({ unit, lesson: { id: 'L' }, config: { template: 'label-diagram' } })).toBeNull();
    // a single option is not a question
    expect(questionFromConfig({ unit, lesson: { id: 'L' }, config: { template: 'quiz', options: [{ id: 'a', label: 'A' }], correctId: 'a' } })).toBeNull();
    // an answer that is not among the options cannot be graded
    expect(questionFromConfig({ unit, lesson: { id: 'L' }, config: { template: 'quiz', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctId: 'zzz' } })).toBeNull();
  });
});

describe('checkpoint: sampling the chain', () => {
  const lesson = (id) => ({ id, title: id, config: { template: 'quiz', question: 'Pick', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctId: 'a' } });
  const chain = (units, perUnit = 3) =>
    units.map((unit_id, index) => ({
      unit_id,
      unit_number: index + 1,
      title: unit_id,
      lessons: Array.from({ length: perUnit }, (_, i) => lesson(`${unit_id}-L${i}`)),
    }));

  test('probes every unit at least once, then fills the budget round-robin', () => {
    const sample = sampleCheckpoint(chain(['U1', 'U2', 'U3']), { maxQuestions: 6 });
    expect(sample.ok).toBe(true);
    expect(sample.questions).toHaveLength(6);
    const perUnit = {};
    for (const q of sample.questions) perUnit[q.unit_id] = (perUnit[q.unit_id] || 0) + 1;
    expect(Object.keys(perUnit).sort()).toEqual(['U1', 'U2', 'U3']);
    expect(Object.values(perUnit).every((n) => n >= 1)).toBe(true);
  });

  test('caps at the budget and takes everything available when the chain is thin', () => {
    const capped = sampleCheckpoint(chain(['U1', 'U2'], 10), { maxQuestions: 5 });
    expect(capped.questions).toHaveLength(5);

    const thin = sampleCheckpoint(chain(['U1'], 2), { maxQuestions: 10 });
    expect(thin.questions).toHaveLength(2);
    expect(thin.thin).toBe(true); // flagged for the reviewing human, not refused
  });

  test('refuses a chain longer than the assessment can probe (never skips a foundation)', () => {
    const sample = sampleCheckpoint(chain(['U1', 'U2', 'U3'], 1), { maxQuestions: 2 });
    expect(sample.ok).toBe(false);
    expect(sample.reason).toBe('chain_too_long');
  });

  test('refuses when a unit has nothing answerable, naming the unit', () => {
    const units = chain(['U1', 'U2'], 1);
    units[1].lessons[0].config = { template: 'game-chain', rounds: [] };
    const sample = sampleCheckpoint(units, { maxQuestions: 10 });
    expect(sample.ok).toBe(false);
    expect(sample.reason).toBe('unit_not_assessable');
    expect(sample.units.map((u) => u.unit_id)).toEqual(['U2']);
  });
});

describe('checkpoint: verdict requires the threshold AND every unit demonstrated', () => {
  const questions = [
    { id: 'q1', unit_id: 'U1', correctId: 'a' },
    { id: 'q2', unit_id: 'U1', correctId: 'a' },
    { id: 'q3', unit_id: 'U2', correctId: 'a' },
    { id: 'q4', unit_id: 'U2', correctId: 'a' },
    { id: 'q5', unit_id: 'U2', correctId: 'a' },
  ];

  test('all correct passes', () => {
    const grade = gradeCheckpoint(questions, { q1: 'a', q2: 'a', q3: 'a', q4: 'a', q5: 'a' });
    expect(grade.score_pct).toBe(100);
    expect(checkpointVerdict(grade).eligible).toBe(true);
  });

  test(`below ${CHECKPOINT_PASS_PCT}% is declined`, () => {
    const grade = gradeCheckpoint(questions, { q1: 'a', q2: 'b', q3: 'a', q4: 'b', q5: 'b' }); // 2/5
    expect(grade.score_pct).toBe(40);
    const verdict = checkpointVerdict(grade);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('score_below_threshold');
  });

  test('a high score with one untouched unit is still declined', () => {
    // 80% overall (4/5) but U1 never answered correctly.
    const grade = gradeCheckpoint(questions, { q1: 'b', q2: 'b', q3: 'a', q4: 'a', q5: 'a' });
    expect(grade.score_pct).toBe(60);
    const lenient = gradeCheckpoint(
      [
        { id: 'q1', unit_id: 'U1', correctId: 'a' },
        { id: 'q2', unit_id: 'U2', correctId: 'a' },
        { id: 'q3', unit_id: 'U2', correctId: 'a' },
        { id: 'q4', unit_id: 'U2', correctId: 'a' },
        { id: 'q5', unit_id: 'U2', correctId: 'a' },
      ],
      { q1: 'b', q2: 'a', q3: 'a', q4: 'a', q5: 'a' }
    );
    expect(lenient.score_pct).toBe(80); // meets the threshold…
    expect(lenient.units_without_correct).toEqual(['U1']);
    const verdict = checkpointVerdict(lenient);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe('unit_not_demonstrated');
  });

  test('an unanswered question is wrong, never skipped', () => {
    const grade = gradeCheckpoint(questions, { q1: 'a' });
    expect(grade.correct).toBe(1);
    expect(grade.total).toBe(5);
  });

  test('the self-paced allow-list is explicit, not a role or a default', () => {
    expect(isSelfPacedSchool('SCH-ELITE')).toBe(true);
    expect(isSelfPacedSchool('SCH-TEST')).toBe(false);
    expect(isSelfPacedSchool('')).toBe(false);
  });
});

// ─── 4–7. The rule, the exception, and what gets recorded (HTTP) ───────────

const SERIES = 'CP-SERIES';
const CHILD = 'NUR-001'; // seeded: class NUR-A + age_level 'Nursery' → band 'Nursery 1'
const CHILD_KG = 'NUR-002'; // seeded: age_level 'KG1' → band 'Nursery 2' (sees both units)
const PASSWORD = 'Nursery@123';

/** Two unfinished levels, each with one published, single-answer game. */
const FIXTURE_UNITS = [
  {
    num: 1,
    unitId: 'CP-U1',
    age: 'Playgroup',
    lessons: [
      // `global: true` — authored and owned by the FLAGSHIP school, shared with
      // everyone (kids_lessons.is_global). Same game, same rules; the school that
      // plays it decides only who may confirm the unlock.
      { id: 'CP-L1', global: true, template: 'tap-recognition', config: { template: 'tap-recognition', prompt: 'Tap the red one.', items: [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }, { id: 'green', label: 'Green' }], correctId: 'red' } },
      { id: 'CP-L1B', template: 'matching', config: { template: 'matching', pairs: [{ a: 'Cow', b: '🐄' }, { a: 'Dog', b: '🐕' }, { a: 'Cat', b: '🐈' }] } },
    ],
  },
  {
    num: 2,
    unitId: 'CP-U2',
    age: 'Nursery 1',
    lessons: [
      { id: 'CP-L2', template: 'quiz', config: { template: 'quiz', question: 'Which one is a circle?', options: [{ id: 'o1', label: 'Circle' }, { id: 'o2', label: 'Square' }, { id: 'o3', label: 'Triangle' }], correctId: 'o1' } },
    ],
  },
];

const ALL_LESSONS = FIXTURE_UNITS.flatMap((u) => u.lessons.map((l) => l.id));

async function cleanupFixtures() {
  await testQuery(`DELETE FROM kids_checkpoint_exams WHERE series_id = ?`, [SERIES]);
  await testQuery(`DELETE FROM kids_progress WHERE lesson_id IN (?)`, [ALL_LESSONS]);
  await testQuery(`DELETE FROM kids_progress WHERE idempotency_key LIKE 'cp:%' AND child_admission_no IN (?, ?)`, [CHILD, CHILD_KG]);
  await testQuery(`DELETE FROM kids_game_configs WHERE lesson_id IN (?)`, [ALL_LESSONS]);
  await testQuery(`DELETE FROM kids_game_units WHERE series_id = ?`, [SERIES]);
  await testQuery(`DELETE FROM kids_game_series WHERE id = ?`, [SERIES]);
  await testQuery(`DELETE FROM kids_lessons WHERE id IN (?)`, [ALL_LESSONS]);
}

async function seedFixtures() {
  await testQuery(
    `INSERT INTO kids_game_series (id, name, category, description, created_by) VALUES (?, 'CP Test Series', 'Numeracy', 'owned by checkpoint-jump-ahead.test.js', 'U1')
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [SERIES]
  );
  for (const unit of FIXTURE_UNITS) {
    const items = [];
    for (const lesson of unit.lessons) {
      await testQuery(
        `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, is_global, published_at) VALUES (?, ?, ?, ?, 'Math', ?, 'U1', 'published', 'game', ?, NOW())
         ON DUPLICATE KEY UPDATE content_state = 'published', is_global = VALUES(is_global)`,
        [
          lesson.id,
          lesson.global ? 'SCH-ELITE' : 'SCH-TEST',
          lesson.global ? 'BR-MAIN' : 'BR-TEST',
          `${lesson.id} lesson`,
          unit.age,
          lesson.global ? 1 : 0,
        ]
      );
      await testQuery(
        `INSERT INTO kids_game_configs (id, lesson_id, template, age_level, config_json, content_state, created_by) VALUES (?, ?, ?, ?, ?, 'published', 'U1')
         ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), content_state = 'published'`,
        [`${lesson.id}-CFG`, lesson.id, lesson.template, unit.age, JSON.stringify(lesson.config)]
      );
      items.push({ item_id: `${lesson.id}-item`, tier: 0, lesson_id: lesson.id, title: `${lesson.id} game` });
    }
    await testQuery(
      `INSERT INTO kids_game_units (id, series_id, unit_number, prerequisite_unit_id, content_items, title) VALUES (?, ?, ?, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE content_items = VALUES(content_items)`,
      [unit.unitId, SERIES, unit.num, JSON.stringify(items), `${unit.unitId} title`]
    );
  }
}

async function staffToken() {
  const res = await request(app).post('/users/login').send({ username: 'admin@kids.test', password: 'Admin@123' });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function studentToken(admission = CHILD, password = PASSWORD) {
  const res = await request(app).post('/students/login').send({ username: admission, password, school_id: 'SCH-TEST' });
  if (res.status !== 200) {
    throw new Error(`student login failed for ${admission}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

/** mysql2 hands back JSON columns already parsed; guard for both shapes. */
function asJson(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function pathUnits(admission) {
  const token = await staffToken();
  const res = await request(app).get('/kids/learning-path').query({ student_id: admission }).set('authorization', token);
  expect(res.status).toBe(200);
  const series = res.body.data.path.find((p) => p.series_id === SERIES);
  expect(series).toBeDefined();
  return series.units.slice().sort((a, b) => a.unit_number - b.unit_number);
}

/** Answer every issued question correctly (the client only ever sees options). */
function correctAnswers(exam) {
  const answers = {};
  // The stripped payload has no key, so read it from the stored row.
  return testQuery(`SELECT questions FROM kids_checkpoint_exams WHERE id = ?`, [exam.id]).then((rows) => {
    for (const q of asJson(rows[0].questions)) answers[q.id] = q.correctId;
    return answers;
  });
}

/** The issued set as stored (answer key included) — for cross-school comparison. */
async function storedQuestions(examId) {
  const rows = await testQuery(`SELECT questions FROM kids_checkpoint_exams WHERE id = ?`, [examId]);
  return asJson(rows[0].questions);
}

describe('checkpoint: the rule — nothing unlocks until a human confirms', () => {
  let staff;
  let student;

  beforeAll(async () => {
    await cleanupFixtures();
    await seedFixtures();
    staff = await staffToken();
    student = await studentToken(CHILD);
  });

  afterAll(async () => {
    await cleanupFixtures(); // shared hermetic DB — leave it as found
    // NOTE: pools are closed once for the whole file (see the last afterAll).
  });

  test('all six routes are mounted and refuse an anonymous caller', async () => {
    const probes = [
      ['get', '/kids/checkpoint?student_id=NUR-001&series_id=CP-SERIES'],
      ['post', '/kids/checkpoint/CP-PROBE/submit'],
      ['get', '/kids/checkpoint/status?student_id=NUR-001'],
      ['get', '/kids/checkpoint/queue'],
      ['post', '/kids/checkpoint/CP-PROBE/approve'],
      ['post', '/kids/checkpoint/CP-PROBE/reject'],
    ];
    for (const [method, path] of probes) {
      const res = await request(app)[method](path);
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(401);
    }
  });

  test('the chain starts locked, and the assessment covers every unfinished level', async () => {
    const units = await pathUnits(CHILD);
    expect(units.map((u) => u.unit_id)).toEqual(['CP-U1', 'CP-U2']);
    expect(units[1].locked).toBe(true);

    const res = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD, series_id: SERIES })
      .set('authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('issued');
    expect(res.body.data.requires_confirmation).toBe(true); // SCH-TEST is not self-paced
    // One question per lesson, and every unit probed.
    expect(res.body.data.questions).toHaveLength(3);
    const unitsAsked = new Set(res.body.data.questions.map((q) => q.unit_id));
    expect([...unitsAsked].sort()).toEqual(['CP-U1', 'CP-U2']);
    expect(res.body.data.unit_ids.sort()).toEqual(['CP-U1', 'CP-U2']);
    // The answer key must never reach the client.
    expect(JSON.stringify(res.body)).not.toContain('correctId');
  });

  test('a shared is_global game is assessed the same — and stays the PLAYER\'s school privilege', async () => {
    // CP-U1 contains a global lesson authored by the flagship school. That
    // provenance must grant nothing: the child's own school decides the confirmer.
    const owned = await testQuery(`SELECT school_id, is_global FROM kids_lessons WHERE id = 'CP-L1'`);
    expect(String(owned[0].school_id)).toBe('SCH-ELITE');
    expect(Number(owned[0].is_global)).toBe(1);

    const exams = await testQuery(`SELECT id, school_id FROM kids_checkpoint_exams WHERE series_id = ? AND child_admission_no = ?`, [SERIES, CHILD]);
    expect(exams).toHaveLength(1);
    expect(String(exams[0].school_id)).toBe('SCH-TEST'); // the player's school, not the author's

    // The unit is still part of the chain (shared content is not skipped)…
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD, series_id: SERIES })
      .set('authorization', student);
    expect(issued.status).toBe(200);
    expect(issued.body.data.units.map((u) => u.unit_id)).toContain('CP-U1');
    // …and an ordinary school still needs a human to confirm it.
    expect(issued.body.data.requires_confirmation).toBe(true);
  });

  test('a second request resumes the open attempt instead of issuing another', async () => {
    const res = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD, series_id: SERIES })
      .set('authorization', student);
    expect(res.status).toBe(200);
    expect(res.body.data.resumed).toBe(true);
  });

  test('a perfect submission is still only a recommendation', async () => {
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD, series_id: SERIES })
      .set('authorization', student);
    const answers = await correctAnswers(issued.body.data);

    const res = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', student)
      .send({ answers });
    expect(res.status).toBe(200);
    expect(res.body.data.score_pct).toBe(100);
    expect(res.body.data.eligible).toBe(true);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.requires_confirmation).toBe(true);

    // …and nothing has moved yet.
    const units = await pathUnits(CHILD);
    expect(units[0].done).toBe(false);
    expect(units[1].locked).toBe(true);
  });

  test('staff can see it pending, and a teacher cannot confirm it', async () => {
    const queue = await request(app).get('/kids/checkpoint/queue').set('authorization', staff);
    expect(queue.status).toBe(200);
    const item = queue.body.data.items.find((row) => row.series_id === SERIES);
    expect(item).toBeDefined();
    expect(item.child_admission_no).toBe(CHILD);
    expect(item.eligible).toBe(true);
    expect(item.units.map((u) => u.unit_id).sort()).toEqual(['CP-U1', 'CP-U2']);

    // The learner may not sign off their own prerequisite.
    const studentApprove = await request(app)
      .post(`/kids/checkpoint/${item.id}/approve`)
      .set('authorization', await studentToken(CHILD))
      .send({});
    expect(studentApprove.status).toBe(403);
  });

  test('an admin confirmation unlocks the chain and records it as exempt, not mastery', async () => {
    const queue = await request(app).get('/kids/checkpoint/queue').set('authorization', staff);
    const item = queue.body.data.items.find((row) => row.series_id === SERIES);

    const res = await request(app)
      .post(`/kids/checkpoint/${item.id}/approve`)
      .set('authorization', staff)
      .send({ note: 'Watched her read Group 1 sounds unaided.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.self_approved).toBe(false);
    expect(res.body.data.exempt_units.sort()).toEqual(['CP-U1', 'CP-U2']);
    expect(res.body.data.lessons_exempted).toBe(3);
    expect(res.body.data.stars_awarded).toBe(0);
    expect(res.body.data.xp_awarded).toBe(0);

    // The chain is now open, and marked as tested out rather than passed.
    const units = await pathUnits(CHILD);
    expect(units[0].done).toBe(true);
    expect(units[0].exempt).toBe(true);
    expect(units[1].locked).toBe(false);
    const states = units[0].lessons.map((l) => l.state);
    expect(states).toEqual(['tested_out', 'tested_out']);
    expect(units.flatMap((u) => u.lessons).some((l) => l.state === 'passed')).toBe(false);

    // Recorded as an exemption: no stars, no XP, and no fake test pass.
    const rows = await testQuery(
      `SELECT lesson_id, mode, stars_earned, xp FROM kids_progress WHERE child_admission_no = ? AND lesson_id IN (?) ORDER BY lesson_id`,
      [CHILD, ALL_LESSONS]
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.mode === 'checkpoint')).toBe(true);
    expect(rows.every((r) => Number(r.stars_earned) === 0 && Number(r.xp) === 0)).toBe(true);
    const asTests = await testQuery(
      `SELECT COUNT(*) AS n FROM kids_progress WHERE child_admission_no = ? AND lesson_id IN (?) AND mode = 'test'`,
      [CHILD, ALL_LESSONS]
    );
    expect(Number(asTests[0].n)).toBe(0);

    // Nothing left to test out of.
    const again = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD, series_id: SERIES })
      .set('authorization', student);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('nothing_to_test_out');
  });

  test('a failed attempt cannot be confirmed, even by an admin', async () => {
    // NUR-002 is band 'Nursery 2', so both fixture units sit BELOW their level:
    // spill-over units are never 'locked' (that is the path's design) — what must
    // hold is that nothing became 'done'.

    const other = await studentToken(CHILD_KG);
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD_KG, series_id: SERIES })
      .set('authorization', other);
    expect(issued.status).toBe(200);

    const submitted = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', other)
      .send({ answers: {} }); // nothing answered
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.score_pct).toBe(0);
    expect(submitted.body.data.eligible).toBe(false);
    expect(submitted.body.data.requires_confirmation).toBe(true);

    const approved = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/approve`)
      .set('authorization', staff)
      .send({});
    expect(approved.status).toBe(409);
    expect(approved.body.code).toBe('not_eligible');

    // …and nothing was exempted.
    const units = await pathUnits(CHILD_KG);
    expect(units.map((u) => u.done)).toEqual([false, false]);
    expect(units.every((u) => u.exempt === false)).toBe(true);
    expect(units.flatMap((u) => u.lessons).every((l) => l.state === 'none')).toBe(true);

    // Declining starts the study window before another attempt.
    const rejected = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/reject`)
      .set('authorization', staff)
      .send({ note: 'Keep practising the red/blue sort.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('rejected');

    const cooldown = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD_KG, series_id: SERIES })
      .set('authorization', other);
    expect(cooldown.status).toBe(429);
    expect(cooldown.body.code).toBe('retry_cooldown');
    expect(cooldown.body.data.retry_after).toBeTruthy();
  });
});

/**
 * The exception is a PRIVILEGE OF THE SCHOOL, not of the game.
 *
 * These two children play the SAME series, the same lessons and the same game
 * configs — there is one copy of the content, shared. The only difference the
 * test introduces is which school the attempt belongs to, and that must change
 * exactly one thing: who is allowed to confirm. The question set, the threshold,
 * the per-unit rule and the exemption record must come out identical.
 */
describe('checkpoint: the exception is the school\'s, the game rules stay the same', () => {
  const NORMAL_CHILD = 'NUR-005'; // school SCH-TEST — not self-paced by default
  const SELF_CHILD = 'REVIEW-001'; // same school in the fixture, different child
  const SELF_CHILD_PASSWORD = 'ReviewChild@123';
  let original;
  let normalQuestions = null;

  beforeAll(async () => {
    await cleanupFixtures();
    await seedFixtures();
    original = process.env.KIDS_SELF_PACED_SCHOOLS;
    // No override yet: SCH-TEST is an ordinary school.
    delete process.env.KIDS_SELF_PACED_SCHOOLS;
  });

  afterAll(async () => {
    if (original === undefined) delete process.env.KIDS_SELF_PACED_SCHOOLS;
    else process.env.KIDS_SELF_PACED_SCHOOLS = original;
    await cleanupFixtures();
  });

  test('a normal school gets the same assessment and a pass changes nothing on its own', async () => {
    const student = await studentToken(NORMAL_CHILD);
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: NORMAL_CHILD, series_id: SERIES })
      .set('authorization', student);
    expect(issued.status).toBe(200);
    expect(issued.body.data.requires_confirmation).toBe(true);
    expect(issued.body.data.school_id).toBe('SCH-TEST');

    // Keep the issued set to compare against the self-paced school below.
    normalQuestions = await storedQuestions(issued.body.data.id);
    expect(normalQuestions).toHaveLength(3);

    const res = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', student)
      .send({ answers: await correctAnswers(issued.body.data) });
    expect(res.status).toBe(200);
    expect(res.body.data.score_pct).toBe(100);
    expect(res.body.data.status).toBe('submitted'); // a recommendation, not an unlock

    const units = await pathUnits(NORMAL_CHILD);
    expect(units[0].done).toBe(false);
    expect(units[1].locked).toBe(true);
  });

  test('under the same content, naming the school self-paced confirms the identical pass', async () => {
    // The school's privilege — the only thing that changes.
    process.env.KIDS_SELF_PACED_SCHOOLS = 'SCH-TEST';

    const student = await studentToken(SELF_CHILD, SELF_CHILD_PASSWORD);
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: SELF_CHILD, series_id: SERIES })
      .set('authorization', student);
    expect(issued.status).toBe(200);
    expect(issued.body.data.requires_confirmation).toBe(false);

    // Same content ⇒ the same assessment, question for question.
    expect(await storedQuestions(issued.body.data.id)).toEqual(normalQuestions);

    const res = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', student)
      .send({ answers: await correctAnswers(issued.body.data) });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.self_approved).toBe(true);
    expect(res.body.data.score_pct).toBe(100);
    expect(res.body.data.exempt_units.sort()).toEqual(['CP-U1', 'CP-U2']);

    // The exception is recorded as an exception, not as a teacher approval.
    const examRows = await testQuery(
      `SELECT decided_by, self_approved, decision_note, school_id FROM kids_checkpoint_exams WHERE id = ?`,
      [issued.body.data.id]
    );
    expect(String(examRows[0].decided_by)).toBe('self:flagship-self-paced');
    expect(Number(examRows[0].self_approved)).toBe(1);
    expect(String(examRows[0].school_id)).toBe('SCH-TEST');
    expect(String(examRows[0].decision_note)).toMatch(/no active teacher by design/i);

    // Same exemption semantics as a human-confirmed unlock: exempt, never mastery.
    const units = await pathUnits(SELF_CHILD);
    expect(units[0].done).toBe(true);
    expect(units[0].exempt).toBe(true);
    expect(units[1].locked).toBe(false);
    expect(units[0].lessons.map((l) => l.state)).toEqual(['tested_out', 'tested_out']);

    const progress = await testQuery(
      `SELECT mode, stars_earned, xp FROM kids_progress WHERE child_admission_no = ? AND lesson_id IN (?)`,
      [SELF_CHILD, ALL_LESSONS]
    );
    expect(progress.every((r) => r.mode === 'checkpoint')).toBe(true);
    expect(progress.every((r) => Number(r.stars_earned) === 0 && Number(r.xp) === 0)).toBe(true);
  });

  test('a miss is closed as a decline so the cool-down applies (no human to throttle it)', async () => {
    const student = await studentToken(CHILD_KG);
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD_KG, series_id: SERIES })
      .set('authorization', student);
    expect(issued.status).toBe(200);

    const submitted = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', student)
      .send({ answers: {} });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('rejected');
    expect(submitted.body.data.eligible).toBe(false);
    expect(submitted.body.data.retry_after).toBeTruthy();

    const units = await pathUnits(CHILD_KG);
    expect(units.map((u) => u.done)).toEqual([false, false]);

    const cooldown = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: CHILD_KG, series_id: SERIES })
      .set('authorization', student);
    expect(cooldown.status).toBe(429);
  });
});

/**
 * The policy is staff-steerable over HTTP: a school can grant auto-jump to a
 * selected child and keep everyone else under review, which is the point — a
 * fast learner skips ahead while a child who needs close monitoring does not.
 */
describe('checkpoint: staff steer auto-jump over HTTP', () => {
  const GRANTED = 'NUR-005'; // gets an auto-jump grant
  const SUPERVISED = 'REVIEW-002'; // left under human confirmation
  const TEACHER = { email: 'bridge.teacher@kids.test', password: 'BridgeTeacher@123' };
  let admin;
  let original;

  async function clearPolicies() {
    await testQuery(`DELETE FROM kids_checkpoint_policies WHERE scope_id IN (?, ?, ?)`, [GRANTED, SUPERVISED, 'SCH-TEST']);
  }

  beforeAll(async () => {
    await cleanupFixtures();
    await seedFixtures();
    original = process.env.KIDS_SELF_PACED_SCHOOLS;
    delete process.env.KIDS_SELF_PACED_SCHOOLS; // SCH-TEST is supervised by default
    await clearPolicies();
    admin = await staffToken();
  });

  afterAll(async () => {
    await clearPolicies();
    if (original === undefined) delete process.env.KIDS_SELF_PACED_SCHOOLS;
    else process.env.KIDS_SELF_PACED_SCHOOLS = original;
  });

  test('staff can read the effective rule and why it resolved that way', async () => {
    const res = await request(app).get('/kids/checkpoint/policy').query({ student_id: GRANTED }).set('authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.effective.auto_approve).toBe(false);
    expect(res.body.data.effective.source).toBe('platform_default');
    expect(res.body.data.overrides).toEqual({});

    // Not a learner-facing surface.
    const asChild = await request(app)
      .get('/kids/checkpoint/policy')
      .query({ student_id: GRANTED })
      .set('authorization', await studentToken(GRANTED));
    expect(asChild.status).toBe(403);
  });

  test('handing out an unattended unlock is admin-only', async () => {
    const asTeacher = await request(app)
      .post('/users/login')
      .send({ username: TEACHER.email, password: TEACHER.password, school_id: 'SCH-TEST' });
    if (asTeacher.status === 200) {
      const refused = await request(app)
        .put('/kids/checkpoint/policy')
        .set('authorization', asTeacher.body.token)
        .send({ scope: 'child', scope_id: GRANTED, auto_approve: true });
      expect(refused.status).toBe(403);
    }

    const asChild = await request(app)
      .put('/kids/checkpoint/policy')
      .set('authorization', await studentToken(GRANTED))
      .send({ scope: 'child', scope_id: GRANTED, auto_approve: true });
    expect(asChild.status).toBe(403);
  });

  test('a grant to one child unlocks their pass with no human, audited as a policy', async () => {
    const put = await request(app)
      .put('/kids/checkpoint/policy')
      .set('authorization', admin)
      .send({ scope: 'child', scope_id: GRANTED, auto_approve: true, note: 'Reads a full year above her class.' });
    expect(put.status).toBe(200);
    expect(put.body.data.auto_approve).toBe(true);

    const policy = await request(app).get('/kids/checkpoint/policy').query({ student_id: GRANTED }).set('authorization', admin);
    expect(policy.body.data.effective.source).toBe('child');
    expect(policy.body.data.effective.auto_approve).toBe(true);

    const student = await studentToken(GRANTED);
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: GRANTED, series_id: SERIES })
      .set('authorization', student);
    expect(issued.status).toBe(200);
    expect(issued.body.data.requires_confirmation).toBe(false);
    expect(issued.body.data.policy.source).toBe('child');

    const res = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', student)
      .send({ answers: await correctAnswers(issued.body.data) });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.self_approved).toBe(true);

    // The record says a policy did this — not a teacher, and not the flagship.
    const rows = await testQuery(`SELECT decided_by, decision_note FROM kids_checkpoint_exams WHERE id = ?`, [issued.body.data.id]);
    expect(String(rows[0].decided_by)).toBe('auto:policy:child');
    expect(String(rows[0].decision_note)).toMatch(/jump-ahead policy/);

    const units = await pathUnits(GRANTED);
    expect(units[0].exempt).toBe(true);
    expect(units[1].locked).toBe(false);
  });

  test('a child left under review still needs a human — the grant does not leak', async () => {
    const student = await studentToken(SUPERVISED, 'ReviewChild@123');
    const issued = await request(app)
      .get('/kids/checkpoint')
      .query({ student_id: SUPERVISED, series_id: SERIES })
      .set('authorization', student);
    expect(issued.status).toBe(200);
    expect(issued.body.data.requires_confirmation).toBe(true);
    expect(issued.body.data.policy.source).toBe('platform_default');

    const res = await request(app)
      .post(`/kids/checkpoint/${issued.body.data.id}/submit`)
      .set('authorization', student)
      .send({ answers: await correctAnswers(issued.body.data) });
    expect(res.status).toBe(200);
    expect(res.body.data.score_pct).toBe(100);
    expect(res.body.data.status).toBe('submitted'); // still waiting on a person

    const units = await pathUnits(SUPERVISED);
    expect(units.map((u) => u.done)).toEqual([false, false]);
  });

  test('clearing the grant reverts the child to the default', async () => {
    const del = await request(app)
      .delete('/kids/checkpoint/policy')
      .query({ scope: 'child', scope_id: GRANTED })
      .set('authorization', admin);
    expect(del.status).toBe(200);
    expect(del.body.data.removed).toBe(true);

    const policy = await request(app).get('/kids/checkpoint/policy').query({ student_id: GRANTED }).set('authorization', admin);
    expect(policy.body.data.effective.source).toBe('platform_default');
    expect(policy.body.data.effective.auto_approve).toBe(false);
  });
});

/**
 * Auto-jump is a POLICY a school steers, not a fixed property of the content:
 * child → class → school → platform default, most specific wins, and a stored
 * scope beats the default in BOTH directions (a normal school can hand one child
 * an unattended unlock; a self-paced flagship can hold one child back under
 * review).
 */
describe('checkpoint: auto-jump policy precedence', () => {
  const env = {}; // no env override: SCH-TEST is an ordinary school here

  test('with no policy an ordinary school needs a human', () => {
    const policy = resolvePolicy({ schoolId: 'SCH-TEST', classCode: 'NUR-A', admissionNo: 'NUR-001', rows: [], env });
    expect(policy.auto_approve).toBe(false);
    expect(policy.source).toBe('platform_default');
  });

  test('the platform self-paced default applies where nothing is set', () => {
    const policy = resolvePolicy({ schoolId: 'SCH-ELITE', classCode: 'NUR-A', admissionNo: 'NUR-001', rows: [], env });
    expect(policy.auto_approve).toBe(true);
    expect(policy.source).toBe('platform_self_paced');
  });

  test('the most specific scope wins: child > class > school', () => {
    const school = { scope: SCOPE.SCHOOL, scope_id: 'SCH-TEST', auto_approve: true };
    const klass = { scope: SCOPE.CLASS, scope_id: 'NUR-A', auto_approve: false };
    const child = { scope: SCOPE.CHILD, scope_id: 'NUR-001', auto_approve: true };

    const schoolOnly = resolvePolicy({ schoolId: 'SCH-TEST', classCode: 'NUR-A', admissionNo: 'NUR-001', rows: [school], env });
    expect([schoolOnly.source, schoolOnly.auto_approve]).toEqual([SCOPE.SCHOOL, true]);

    const classWins = resolvePolicy({ schoolId: 'SCH-TEST', classCode: 'NUR-A', admissionNo: 'NUR-002', rows: [school, klass], env });
    expect([classWins.source, classWins.auto_approve]).toEqual([SCOPE.CLASS, false]);

    const childWins = resolvePolicy({ schoolId: 'SCH-TEST', classCode: 'NUR-A', admissionNo: 'NUR-001', rows: [school, klass, child], env });
    expect([childWins.source, childWins.auto_approve]).toEqual([SCOPE.CHILD, true]);
  });

  test('a stored scope beats the platform default in both directions', () => {
    // A self-paced flagship holds ONE child back under close monitoring…
    const held = resolvePolicy({
      schoolId: 'SCH-ELITE',
      classCode: 'NUR-A',
      admissionNo: 'NUR-001',
      rows: [{ scope: SCOPE.CHILD, scope_id: 'NUR-001', auto_approve: false }],
      env,
    });
    expect(held.auto_approve).toBe(false);
    expect(held.source).toBe(SCOPE.CHILD);

    // …while another child there keeps the self-paced default.
    const sibling = resolvePolicy({ schoolId: 'SCH-ELITE', classCode: 'NUR-A', admissionNo: 'NUR-002', rows: [], env });
    expect(sibling.auto_approve).toBe(true);
  });

  test('a class or child scope never leaks across schools or classes', () => {
    const rows = [{ scope: SCOPE.CLASS, scope_id: 'NUR-A', auto_approve: true }];
    const other = resolvePolicy({ schoolId: 'SCH-TEST', classCode: 'NUR-B', admissionNo: 'NUR-003', rows, env });
    expect(other.source).toBe('platform_default'); // NUR-B was never granted
  });

  test('the audit trail distinguishes a platform default from a staff policy', () => {
    expect(autoDecisionLabels({ source: 'platform_self_paced' }).decided_by).toBe('self:flagship-self-paced');
    const granted = autoDecisionLabels({ source: SCOPE.CHILD, set_by: 'U1' });
    expect(granted.decided_by).toBe('auto:policy:child');
    expect(granted.note).toMatch(/set by U1/);
    expect(policyRowId(SCOPE.CHILD, 'NUR-001')).toBe('child:NUR-001');
  });
});

/**
 * One teardown for the whole file: every describe here talks to the same app
 * and the same pools, so closing connections inside a describe would break the
 * ones that run after it (a login then fails with 'Could not resolve school.'
 * because the query silently returns nothing).
 */
afterAll(async () => {
  await cleanupFixtures();
  await closeConnections();
});
