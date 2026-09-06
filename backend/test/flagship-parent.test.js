'use strict';

/**
 * Flagship parent acceptance contract.
 *
 * Covers the parent journey without touching production data:
 * shared EliteSMS credential → linked children → 365-day activity/XP →
 * bulk results → per-child controls/mode-lock readout → privacy boundary.
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');

afterAll(async () => {
  await closeConnections();
});

async function parentLogin(phone, password) {
  const res = await request(app)
    .post('/kids/parent/login')
    .send({ phone, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);
  return res.body.data;
}

describe('Flagship parent dashboard acceptance', () => {
  let parent;

  // C-DEBT-05: seed an isolated owned child (NUR-009 — no other suite mutates
  // it) BEFORE login so the parent's children list + rollup for it are
  // deterministic regardless of --runInBand ordering on the shared NUR-001
  // fixture. Seeded into students + kids_children (parent U2) + progress +
  // parental_controls.
  beforeAll(async () => {
    await testQuery(
      `INSERT INTO students (admission_no, school_id, branch_id, student_name, surname, first_name, parent_id, status)
       VALUES ('NUR-009', 'SCH-TEST', 'BR-TEST', 'Owned Child', 'Owned', 'Owned', 'U2', 'Active')`
    );
    await testQuery(
      `INSERT INTO kids_children (id, admission_no, school_id, branch_id, full_name, age_level, class_code, parent_user_id, status)
       VALUES ('CHILD-FP', 'NUR-009', 'SCH-TEST', 'BR-TEST', 'Owned Child', 'Nursery', 'NUR-A', 'U2', 'Active')`
    );
    await testQuery(
      `INSERT INTO kids_progress (id, school_id, branch_id, child_admission_no, lesson_id, score, stars_earned, xp, completed_at)
       VALUES ('PROG-FP-1', 'SCH-TEST', 'BR-TEST', 'NUR-009', 'LESSON-1', 80, 3, 10, NOW())`
    );
    await testQuery(
      `INSERT INTO kids_parental_controls (student_id, daily_play_limit_minutes, allowed_time_start, allowed_time_end, set_by)
       VALUES ('NUR-009', 45, '08:00:00', '18:00:00', 'U2')`
    );
    parent = await parentLogin('08012345678', 'Parent@123');
  });

  test('shared EliteSMS login returns every linked child, including shared-only children', () => {
    expect(parent.token).toBeTruthy();
    expect(parent.children.map((child) => child.admission_no)).toEqual(expect.arrayContaining([
      'NUR-001', 'NUR-002', 'NUR-005', 'NUR-006',
    ]));
  });

  test('returns a dense 365-day activity grid and XP totals for each linked child', async () => {
    const res = await request(app)
      .get('/kids/parent/children/activity?days=365')
      .set('authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(365);
    // OWNED fixture (NUR-009): exact rollup, immune to cross-suite pollution on
    // the shared NUR-001 fixture. (C-DEBT-05)
    const owned = res.body.data.children.find((child) => child.child_admission_no === 'NUR-009');
    expect(owned).toBeDefined();
    expect(owned.series).toHaveLength(365);
    expect(owned.totals.games).toBe(1);
    expect(owned.totals.xp).toBe(10);
    expect(owned.totals.active_days).toBe(1);
  });

  test('returns bulk results limited to the parent children', async () => {
    const res = await request(app)
      .get('/kids/parent/results?limit=50')
      .set('authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.children).toEqual(expect.arrayContaining(['NUR-001', 'NUR-002', 'NUR-005', 'NUR-006', 'NUR-009']));
    // OWNED fixture (NUR-009): PROG-FP-1 is the only result row no other suite
    // mutates, so LESSON-1/score-80 is a deterministic presence check. (C-DEBT-05)
    expect(res.body.data.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ child_admission_no: 'NUR-009', lesson_id: 'LESSON-1', score: 80 }),
    ]));
    expect(res.body.data.results.every((row) => parent.children.some((child) => child.admission_no === row.child_admission_no))).toBe(true);
  });

  test('returns per-child controls and mode-lock data for the owning parent', async () => {
    const res = await request(app)
      .get('/kids/parent/child/NUR-009/controls')
      .set('authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    // OWNED fixture (NUR-009): controls seeded here, immune to cross-suite
    // overwrites of the shared NUR-001 parental_controls row. (C-DEBT-05)
    expect(res.body.data.controls.daily_play_limit_minutes).toBe(45);
    expect(res.body.data.controls.allowed_time_start).toBe('08:00:00');
    expect(res.body.data.controls.allowed_time_end).toBe('18:00:00');
    expect(Array.isArray(res.body.data.mode_locks)).toBe(true);
  });

  test('does not expose another parent\'s child data', async () => {
    const other = await parentLogin('08099999999', 'Other@123');
    const activity = await request(app)
      .get('/kids/parent/children/activity?days=365')
      .set('authorization', `Bearer ${other.token}`);
    const results = await request(app)
      .get('/kids/parent/results')
      .set('authorization', `Bearer ${other.token}`);
    const foreign = await request(app)
      .get('/kids/parent/child/NUR-001/controls')
      .set('authorization', `Bearer ${other.token}`);

    expect(activity.status).toBe(200);
    expect(activity.body.data.children).toEqual([]);
    expect(results.status).toBe(200);
    expect(results.body.data.results).toEqual([]);
    expect(foreign.status).toBe(403);
  });
});
