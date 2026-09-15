'use strict';

/**
 * LESSON CLOSURE CONTRACT (QUEUE Q69 / Q72) — the gate reads the content's own
 * declaration instead of hard-coding it.
 *
 * `kids_game_configs.config_json.gamePlan.test` was written by the flagship
 * seeder into every config (JSON null for tier 0 = Crèche, an object for the
 * other 1,440) and was read by NOTHING. So the content declared "a Crèche unit
 * has no child-facing test" while the gate required a passing test from every
 * lesson — the declaration was dead metadata and the two disagreed.
 *
 * Now `services/closureContract.js` is the ONE rule, and this suite locks it:
 *
 *   1. an explicit `gamePlan.test: null`  → a completed PLAY closes the lesson;
 *   2. anything else (absent / malformed)  → the 2026-09-04 rule, a passing
 *      TEST (score >= 50) alone closes it — i.e. no other band changes;
 *   3. `requiredAfterPractice` is REPORTED, never enforced (restoring it would
 *      re-introduce the false-lock the 2026-09-04 decision removed);
 *   4. `mode: 'checkpoint'` is a jumped-over game, not a play;
 *   5. the progress endpoint serves the contract it read.
 *
 * Run: bash scripts/run-tests.sh test/lesson-closure-contract.test.js --forceExit
 */

const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const {
  REQUIRES_TEST,
  closureFor,
  closureByLesson,
  lessonStatesFromProgress,
  isLessonComplete,
  lessonStateFor,
} = require('../src/services/closureContract');

const SERIES_ID = 'CLOSURE-SERIES';
const U1 = 'CLOSURE-U1'; // Crèche unit — its lesson declares NO test
const U2 = 'CLOSURE-U2'; // Playgroup unit — its lesson declares a test
const L_TESTLESS = 'CLOSURE-L-CRE';
const L_DECLARED = 'CLOSURE-L-PG';
const L_NOCONFIG = 'CLOSURE-L-NOCFG'; // no config at all → must fail closed
const ADM = 'NUR-001'; // seeded student: posts its own progress
const SCHOOL_HEADER = { 'x-school-id': 'SCH-TEST' };

async function cleanupFixtures() {
  await testQuery(`DELETE FROM kids_progress WHERE lesson_id IN (?, ?, ?)`, [L_TESTLESS, L_DECLARED, L_NOCONFIG]);
  await testQuery(`DELETE FROM kids_game_configs WHERE lesson_id IN (?, ?)`, [L_TESTLESS, L_DECLARED]);
  await testQuery(`DELETE FROM kids_game_units WHERE series_id = ?`, [SERIES_ID]);
  await testQuery(`DELETE FROM kids_game_series WHERE id = ?`, [SERIES_ID]);
  await testQuery(`DELETE FROM kids_lessons WHERE id IN (?, ?, ?)`, [L_TESTLESS, L_DECLARED, L_NOCONFIG]);
}

afterAll(async () => {
  await cleanupFixtures(); // shared hermetic DB — leave it as found
  await closeConnections();
});

async function loginAs(username, password) {
  const res = await request(app).post('/users/login').send({ username, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function studentToken(admission = ADM) {
  const res = await request(app)
    .post('/students/login')
    .send({ username: admission, password: 'Nursery@123', school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

let progressSeq = 0;
async function complete(token, lessonId, mode, score) {
  progressSeq += 1;
  return request(app)
    .post('/kids/progress/game-complete')
    .set('authorization', token)
    .set(SCHOOL_HEADER)
    .send({
      child_admission_no: ADM,
      lesson_id: lessonId,
      score,
      stars_earned: score >= 20 ? 3 : 0,
      mode,
      idempotency_key: `closure-${progressSeq}-${lessonId}-${mode}`,
    });
}

async function curriculumUnits(token) {
  const res = await request(app).get('/kids/curriculum').set('authorization', token);
  expect(res.status).toBe(200);
  const subject = res.body.data.subjects.find((s) => s.subject_code === 'Closure-Gate');
  expect(subject).toBeDefined();
  const series = subject.series.find((s) => s.id === SERIES_ID);
  expect(series).toBeDefined();
  return series.units;
}

async function pathSeries() {
  const token = await loginAs('admin@kids.test', 'Admin@123');
  const res = await request(app)
    .get('/kids/learning-path')
    .query({ student_id: ADM })
    .set('authorization', token);
  expect(res.status).toBe(200);
  return res.body.data.path.find((p) => p.series_id === SERIES_ID);
}

// ─── 1. The contract itself: what a config declares ────────────────────────

describe('closureContract: reading a config\'s declaration', () => {
  it('an explicit JSON null test means the unit owes NO child-facing test', () => {
    const c = closureFor({ template: 'tap-recognition', gamePlan: { test: null } });
    expect(c).toEqual({ declared: true, requires_test: false, required_after_practice: null });
  });

  it('a declared test keeps the 2026-09-04 rule and reports requiredAfterPractice', () => {
    const c = closureFor({
      template: 'quiz',
      gamePlan: { test: { template: 'quiz', tier: 1, choices: 4, requiredAfterPractice: true } },
    });
    expect(c.requires_test).toBe(true);
    expect(c.declared).toBe(true);
    // Reported, NOT enforced — see the next test.
    expect(c.required_after_practice).toBe(true);
  });

  it('fails CLOSED for anything that is not an explicit null', () => {
    const shapes = [
      undefined, null, {}, [],
      { gamePlan: null },
      { gamePlan: [] },
      { gamePlan: { learning: {}, practice: {} } },          // no `test` key at all
      { gamePlan: { test: undefined } },                      // declared but undefined
      { gamePlan: { test: 'none' } },                         // malformed
      { gamePlan: { test: { requiredAfterPractice: false } } }, // object without a template
    ];
    for (const configJson of shapes) {
      const c = closureFor(configJson);
      expect(c.requires_test).toBe(true); // a missing contract can never unlock a unit
      expect(c.required_after_practice === null || typeof c.required_after_practice === 'boolean').toBe(true);
    }
    expect(REQUIRES_TEST.requires_test).toBe(true);
    expect(REQUIRES_TEST.required_after_practice).toBeNull();
  });

  it('a lesson with several configs fails closed unless EVERY config is testless', () => {
    const testless = { lesson_id: 'L', config_json: { gamePlan: { test: null } } };
    const withTest = { lesson_id: 'L', config_json: { gamePlan: { test: { tier: 1 } } } };
    expect(closureByLesson([testless, testless]).get('L').requires_test).toBe(false);
    expect(closureByLesson([testless, withTest]).get('L').requires_test).toBe(true);
    expect(closureByLesson([withTest, testless]).get('L').requires_test).toBe(true);
    expect(closureByLesson([]).size).toBe(0);
  });
});

describe('closureContract: progress facts and the gate', () => {
  const rows = (...modes) => modes.map(([mode, score]) => ({ lesson_id: 'L', mode, score }));

  it('counts a play only in learning/practice/test — a jumped-over game is not a play', () => {
    const states = lessonStatesFromProgress(rows(['learning', 0], ['checkpoint', 100]));
    // A checkpoint row is not test mode, so it can never manufacture a pass.
    expect(states.get('L')).toEqual({ practice: false, testPass: false, played: true });
    const onlySkipped = lessonStatesFromProgress(rows(['checkpoint', 100]));
    expect(onlySkipped.get('L').played).toBe(false);
    expect(lessonStatesFromProgress([]).size).toBe(0);
  });

  it('a testless lesson closes on a completed play, whatever the score (tier 0 is unscored)', () => {
    const contract = closureFor({ gamePlan: { test: null } });
    const played = lessonStatesFromProgress(rows(['learning', 0])).get('L');
    expect(isLessonComplete(played, contract)).toBe(true);
    // …and a lesson with no rows at all is untouched by the contract.
    expect(isLessonComplete(undefined, contract)).toBe(false);
    expect(isLessonComplete({ played: false }, contract)).toBe(false);
  });

  it('a lesson that declares a test still needs score >= 50 in test mode', () => {
    const contract = closureFor({ gamePlan: { test: { tier: 2, requiredAfterPractice: true } } });
    expect(isLessonComplete(lessonStatesFromProgress(rows(['practice', 100])).get('L'), contract)).toBe(false);
    expect(isLessonComplete(lessonStatesFromProgress(rows(['test', 49])).get('L'), contract)).toBe(false);
    expect(isLessonComplete(lessonStatesFromProgress(rows(['test', 50])).get('L'), contract)).toBe(true);
    // requiredAfterPractice is never enforced: a passing test alone closes it.
    expect(isLessonComplete(lessonStatesFromProgress(rows(['test', 50])).get('L'), contract)).toBe(true);
  });

  it('defaults to the test rule when no contract is supplied at all', () => {
    expect(isLessonComplete({ played: true, testPass: false })).toBe(false);
    expect(isLessonComplete({ played: true, testPass: true })).toBe(true);
  });

  it('reports a closed testless lesson as closed, but an exemption is never a pass', () => {
    const testless = closureFor({ gamePlan: { test: null } });
    const declared = closureFor({ gamePlan: { test: { tier: 1 } } });
    expect(lessonStateFor({ played: true }, testless)).toBe('passed');
    expect(lessonStateFor({ played: true }, testless, { exempt: false })).toBe('passed');
    expect(lessonStateFor({}, testless)).toBe('none');
    expect(lessonStateFor({ practice: true }, declared)).toBe('practice_done');
    expect(lessonStateFor({ testPass: true }, declared)).toBe('passed');
    expect(lessonStateFor({ played: true, testPass: true }, testless, { exempt: true })).toBe('passed');
    expect(lessonStateFor({}, testless, { exempt: true })).toBe('tested_out');
  });
});

// ─── 2. The gate: GET /kids/curriculum honours the declaration ─────────────

describe('closure contract on the live gate', () => {
  beforeAll(async () => {
    await cleanupFixtures();
    await testQuery(
      `INSERT INTO kids_game_series (id, name, category, description, subject_code, created_by)
       VALUES (?, 'Closure Gate Series', 'Letters', 'owned by lesson-closure-contract.test.js', 'Closure-Gate', 'U1')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [SERIES_ID]
    );
    for (const [lessonId, age] of [[L_TESTLESS, 'Crèche'], [L_DECLARED, 'Playgroup'], [L_NOCONFIG, 'Playgroup']]) {
      await testQuery(
        `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, published_at)
         VALUES (?, 'SCH-TEST', 'BR-TEST', ?, 'Letters', ?, 'U1', 'published', 'game', NOW())
         ON DUPLICATE KEY UPDATE content_state = 'published'`,
        [lessonId, `${lessonId} title`, age]
      );
    }
    await testQuery(
      `INSERT INTO kids_game_units (id, series_id, unit_number, prerequisite_unit_id, content_items, title) VALUES
       (?, ?, 1, NULL, ?, 'Unit One'),
       (?, ?, 2, ?, ?, 'Unit Two')
       ON DUPLICATE KEY UPDATE series_id = VALUES(series_id)`,
      [
        U1, SERIES_ID, JSON.stringify([{ item_id: 'closure-i1', lesson_id: L_TESTLESS }]),
        U2, SERIES_ID, U1, JSON.stringify([
          { item_id: 'closure-i2', lesson_id: L_DECLARED },
          { item_id: 'closure-i3', lesson_id: L_NOCONFIG },
        ]),
      ]
    );
    // The Crèche config declares NO test (tier 0, exactly as the flagship seeder
    // writes it); the Playgroup config declares one with requiredAfterPractice.
    await testQuery(
      `INSERT INTO kids_game_configs (id, lesson_id, template, age_level, tier, config_json, content_state) VALUES
       ('CLOSURE-CFG-CRE', ?, 'tap-recognition', 'Creche', 0, ?, 'published'),
       ('CLOSURE-CFG-PG', ?, 'quiz', 'Playgroup', 1, ?, 'published')
       ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)`,
      [
        L_TESTLESS,
        JSON.stringify({
          template: 'tap-recognition',
          gamePlan: {
            learning: { template: 'tap-recognition', tier: 0, choices: 2 },
            practice: { template: 'tap-recognition', tier: 0, choices: 2 },
            test: null,
          },
          successThresholdPct: 0,
        }),
        L_DECLARED,
        JSON.stringify({
          template: 'quiz',
          gamePlan: {
            learning: { template: 'quiz', tier: 1, choices: 4 },
            practice: { template: 'quiz', tier: 1, choices: 4 },
            test: { template: 'quiz', tier: 1, choices: 4, requiredAfterPractice: true },
          },
          successThresholdPct: 60,
        }),
      ]
    );
  });

  it('a unit whose lesson declares no test stays closed until it is played', async () => {
    const token = await studentToken();
    let units = await curriculumUnits(token);
    expect(units.find((u) => u.id === U1).done).toBe(false);
    expect(units.find((u) => u.id === U2).locked).toBe(true); // cumulative chain
  });

  it('ONE learning-mode play closes the testless Crèche unit — no test exists to pass', async () => {
    const token = await studentToken();
    const posted = await complete(token, L_TESTLESS, 'learning', 0);
    expect(posted.status).toBe(201);
    // The endpoint read the lesson's contract and reported the verdict.
    expect(posted.body.data.closure.requires_test).toBe(false);
    expect(posted.body.data.closure.lesson_complete).toBe(true);
    expect(posted.body.data.closure.lesson_state).toBe('passed');
    expect(posted.body.data.closure.declared).toBe(true);

    const units = await curriculumUnits(token);
    expect(units.find((u) => u.id === U1).completed_lessons).toBe(1);
    expect(units.find((u) => u.id === U1).done).toBe(true);
    expect(units.find((u) => u.id === U2).locked).toBe(false); // unit 2 unlocked
  });

  it('the declared-test lesson is NOT closed by practice alone (rule unchanged)', async () => {
    const token = await studentToken();
    const posted = await complete(token, L_DECLARED, 'practice', 100);
    expect(posted.status).toBe(201);
    expect(posted.body.data.closure.requires_test).toBe(true);
    expect(posted.body.data.closure.required_after_practice).toBe(true);
    expect(posted.body.data.closure.lesson_complete).toBe(false);
    expect(posted.body.data.closure.lesson_state).toBe('practice_done');

    const units = await curriculumUnits(token);
    expect(units.find((u) => u.id === U2).done).toBe(false);
  });

  it('a configless lesson fails CLOSED — a passing test is still required', async () => {
    const token = await studentToken();
    const learning = await complete(token, L_NOCONFIG, 'learning', 0);
    expect(learning.body.data.closure.requires_test).toBe(true);
    expect(learning.body.data.closure.declared).toBe(false);
    expect(learning.body.data.closure.lesson_complete).toBe(false);

    await complete(token, L_NOCONFIG, 'test', 20); // below 50 — still not a pass
    let units = await curriculumUnits(token);
    expect(units.find((u) => u.id === U2).done).toBe(false);

    await complete(token, L_NOCONFIG, 'test', 80); // pass
    await complete(token, L_DECLARED, 'test', 80); // the unit's other lesson passes too
    units = await curriculumUnits(token);
    expect(units.find((u) => u.id === U2).done).toBe(true); // both lessons now complete
  });

  it('the learning path serves the same contract and the same closure verdict', async () => {
    const series = await pathSeries();
    expect(series).toBeDefined();
    // Both units are closed on the path as well — the same helper decides it.
    expect(series.units.find((u) => u.unit_id === U1).done).toBe(true);
    expect(series.units.find((u) => u.unit_id === U2).done).toBe(true);
    const lessons = series.units.flatMap((u) => u.lessons);
    const testless = lessons.find((l) => l.lesson_id === L_TESTLESS);
    const declared = lessons.find((l) => l.lesson_id === L_DECLARED);
    expect(testless.state).toBe('passed');
    expect(testless.closure).toEqual({ requires_test: false, required_after_practice: null });
    expect(declared.state).toBe('passed'); // its test was passed in the previous test
    expect(declared.closure).toEqual({ requires_test: true, required_after_practice: true });
  });
});
