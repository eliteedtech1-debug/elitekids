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

  beforeAll(async () => {
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
    const ada = res.body.data.children.find((child) => child.child_admission_no === 'NUR-001');
    expect(ada).toBeDefined();
    expect(ada.series).toHaveLength(365);
    expect(ada.totals.games).toBe(1);
    expect(ada.totals.xp).toBe(10);
    expect(ada.totals.active_days).toBe(1);
  });

  test('returns bulk results limited to the parent children', async () => {
    const res = await request(app)
      .get('/kids/parent/results?limit=50')
      .set('authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.children).toEqual(expect.arrayContaining(['NUR-001', 'NUR-002', 'NUR-005', 'NUR-006']));
    expect(res.body.data.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ child_admission_no: 'NUR-001', lesson_id: 'LESSON-1', score: 80 }),
    ]));
    expect(res.body.data.results.every((row) => parent.children.some((child) => child.admission_no === row.child_admission_no))).toBe(true);
  });

  test('returns per-child controls and mode-lock data for the owning parent', async () => {
    const res = await request(app)
      .get('/kids/parent/child/NUR-001/controls')
      .set('authorization', `Bearer ${parent.token}`);

    expect(res.status).toBe(200);
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
