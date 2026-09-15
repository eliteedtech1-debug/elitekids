'use strict';

/**
 * A play day is earned by PLAYING, not by opening the app (Q58).
 *
 * Found by the 2026-09-15 live PLAY walk: opening the student dashboard issued
 * `POST /kids/economy/streak/record` on every mount, and that endpoint writes
 * (`streak_current`, `streak_longest`, `streak_freeze_count`, `last_play_date`,
 * `current_multiplier`, plus possible `kids_economy_milestones` inserts). So a
 * child who never played a single game still advanced their streak every day
 * they logged in — and two real children's walks had already advanced theirs.
 *
 * The fix moves the trigger to where play actually happens:
 *   - the client no longer POSTs on mount (StudentHome);
 *   - the server records the play day itself when a game is COMPLETED
 *     (`/kids/progress/game-complete`), so it cannot be forged by a page load
 *     and cannot be lost to a flaky client.
 *
 * What this suite pins:
 *   1. the dashboard's reads (balance / lessons / learning-path) write NO play day;
 *   2. completing a game records exactly one;
 *   3. a second game the same day does not advance it again (idempotent per day);
 *   4. the explicit endpoint still works for an explicit play day.
 *
 * Run: jest test/streak-play-day.test.js --runInBand --forceExit
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');
const { today } = require('../src/services/economyService');

const SCHOOL = 'SCH-TEST';
const CHILD = 'STREAK-CHILD';
const LESSON = 'STREAK-L-1';
const PASSWORD = 'Nursery@123';

async function cleanupFixtures() {
  // The economy tables are created on first use by the controller's
  // ensureSchema(), so they may not exist yet on the first cleanup.
  for (const sql of [
    `DELETE FROM kids_economy WHERE child_admission_no = ?`,
    `DELETE FROM kids_economy_transactions WHERE child_admission_no = ?`,
    `DELETE FROM kids_economy_milestones WHERE child_admission_no = ?`,
    `DELETE FROM kids_progress WHERE child_admission_no = ?`,
  ]) await testQuery(sql, [CHILD]).catch(() => {});
  await testQuery(`DELETE FROM kids_lessons WHERE id = ?`, [LESSON]);
  await testQuery(`DELETE FROM students WHERE admission_no = ?`, [CHILD]);
}

beforeAll(async () => {
  await cleanupFixtures();

  await testQuery(
    `INSERT INTO students (id, admission_no, school_id, branch_id, student_name, class_code, current_class, class_name, password, user_type, status)
     VALUES ('STREAK-ID', ?, ?, 'BR-TEST', 'Streak Child', 'CLS0876', 'CLS0876', 'Nursery 2 A', ?, 'Student', 'Active')`,
    [CHILD, SCHOOL, bcrypt.hashSync(PASSWORD, 10)]
  );

  await testQuery(
    `INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, created_by, content_state, lesson_type, is_global, published_at)
     VALUES (?, 'SCH-KIDS', 'BR-KIDS', 'Streak Fixture Game', 'Numeracy', 'Nursery 2', 'U1', 'published', 'game', 1, NOW())`,
    [LESSON]
  );
});

afterAll(async () => {
  await cleanupFixtures();
  await closeConnections();
});

async function studentToken() {
  const res = await request(app)
    .post('/students/login')
    .send({ username: CHILD, password: PASSWORD, school_id: SCHOOL });
  expect(res.status).toBe(200);
  return res.body.token;
}

/** mysql2 maps a DATE column to a JS Date; compare on the UTC calendar day. */
function asDay(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function economyRow() {
  const rows = await testQuery(
    `SELECT streak_current, streak_longest, last_play_date FROM kids_economy WHERE child_admission_no = ?`,
    [CHILD]
  ).catch(() => []);
  return rows[0] || null;
}

/** The play day is recorded fire-and-forget, so give it a moment to land. */
async function waitForPlayDay(timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await economyRow();
    if (row && asDay(row.last_play_date) === today()) return row;
    if (Date.now() > deadline) return row;
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('a play day is earned by playing, not by opening the app (Q58)', () => {
  it("the dashboard's reads do NOT record a play day", async () => {
    const token = await studentToken();
    const auth = { authorization: token };

    // Exactly what StudentHome does on mount: balance, catalog, path.
    expect((await request(app).get('/kids/economy/balance').set(auth)).status).toBe(200);
    expect((await request(app).get('/kids/lessons').set(auth)).status).toBe(200);
    expect((await request(app).get(`/kids/learning-path?student_id=${CHILD}`).set(auth)).status).toBe(200);

    const row = await economyRow();
    // The balance read may create the (empty) economy row — that is not a play
    // day. What must stay untouched is the streak itself.
    expect(Number(row?.streak_current || 0)).toBe(0);
    expect(row?.last_play_date ?? null).toBeNull();
  });

  it('completing a game DOES record exactly one play day', async () => {
    const token = await studentToken();
    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set({ authorization: token })
      .send({ child_admission_no: CHILD, lesson_id: LESSON, game_config_id: null, score: 80, stars_earned: 3, xp: 80, mode: 'practice' });
    expect(res.status).toBe(201);

    const row = await waitForPlayDay();
    expect(asDay(row?.last_play_date)).toBe(today());
    expect(Number(row?.streak_current)).toBe(1);
    expect(Number(row?.streak_longest)).toBe(1);
  });

  it('a second game the same day does not advance the streak again', async () => {
    const token = await studentToken();
    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set({ authorization: token })
      .send({ child_admission_no: CHILD, lesson_id: LESSON, game_config_id: null, score: 90, stars_earned: 3, xp: 90, mode: 'practice' });
    expect(res.status).toBe(201);

    // Same calendar day → updateStreak returns the streak unchanged.
    await new Promise((r) => setTimeout(r, 500));
    const row = await economyRow();
    expect(Number(row?.streak_current)).toBe(1);
    expect(Number(row?.streak_longest)).toBe(1);
  });

  it('the explicit streak endpoint still records an explicit play day', async () => {
    const token = await studentToken();
    const res = await request(app).post('/kids/economy/streak/record').set({ authorization: token }).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.streak).toBe(1);
    // Already played today, so nothing increments — the same idempotence the
    // game-complete path relies on.
    expect(res.body.data.streak_increased).toBe(false);
  });
});
