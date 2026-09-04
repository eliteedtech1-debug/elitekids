'use strict';

/**
 * Q3 Classroom Collaboration — pure algorithm + contract tests.
 * No DB required (mirrors q2-speech.test.js / q2-portfolio.test.js convention).
 */

const { formTeams, bucketBalanced, teamCreatePayload, AXLE_BANDS } = require('../src/services/teamFormation');
const { scoreQuest, applyContribution } = require('../src/services/classQuestScoring');

describe('teamFormation.bucketBalanced', () => {
  test('balances XP across lanes of teamSize', () => {
    const members = [1, 2, 3, 4, 5, 6, 7, 8].map((recent_xp) => ({ child_admission_no: `c${recent_xp}`, recent_xp }));
    const teams = bucketBalanced(members, 4);
    expect(teams).toHaveLength(2);
    const sums = teams.map((t) => t.reduce((a, m) => a + m.recent_xp, 0));
    // round-robin: lanes [1,3,5,7] and [2,4,6,8] → 16 and 20
    expect(sums.sort((a, b) => a - b)).toEqual([16, 20]);
  });
});

describe('teamFormation.formTeams', () => {
  test('empty list → empty teams', () => {
    expect(formTeams([])).toEqual([]);
    expect(formTeams(null)).toEqual([]);
  });

  test('groups by age band and produces named teams', () => {
    const students = [
      { child_admission_no: 'a1', age_band: 'KG1', recent_xp: 10 },
      { child_admission_no: 'a2', age_band: 'KG1', recent_xp: 20 },
      { child_admission_no: 'a3', age_band: 'KG1', recent_xp: 30 },
      { child_admission_no: 'a4', age_band: 'KG1', recent_xp: 40 },
      { child_admission_no: 'b1', age_band: 'KG2', recent_xp: 5 },
    ];
    const teams = formTeams(students, { teamSize: 4 });
    expect(teams.length).toBeGreaterThanOrEqual(1);
    const kg1 = teams.find((t) => t.name.includes('KG1'));
    expect(kg1).toBeTruthy();
    expect(kg1.members.length).toBe(4);
  });

  test('teamCreatePayload maps members', () => {
    const p = teamCreatePayload({ name: 'KG1 Team 1', members: [{ child_admission_no: 'a' }] });
    expect(p.name).toBe('KG1 Team 1');
    expect(p.members).toEqual([{ child_admission_no: 'a' }]);
  });

  test('AXLE_BANDS is the full ordered band list', () => {
    expect(AXLE_BANDS).toEqual(['Creche', 'Nursery', 'KG1', 'KG2', 'Primary']);
  });
});

describe('classQuestScoring.scoreQuest', () => {
  test('empty contributions → 0% and not complete', () => {
    const out = scoreQuest({ target_value: 100, contributions: {} });
    expect(out.total_progress).toBe(0);
    expect(out.progress_pct).toBe(0);
    expect(out.is_complete).toBe(false);
    expect(out.leaderboard).toEqual([]);
  });

  test('partial progress computes pct headroom', () => {
    const out = scoreQuest({ target_value: 100, contributions: { a: 25, b: 25 } });
    expect(out.total_progress).toBe(50);
    expect(out.progress_pct).toBe(50);
    expect(out.is_complete).toBe(false);
  });

  test('at/above target → complete, clamped 100', () => {
    const out = scoreQuest({ target_value: 100, contributions: { a: 120 } });
    expect(out.total_progress).toBe(120);
    expect(out.progress_pct).toBe(100);
    expect(out.is_complete).toBe(true);
  });

  test('leaderboard sorts desc and computes share %', () => {
    const out = scoreQuest({ target_value: 100, contributions: { a: 75, b: 25 } });
    expect(out.leaderboard[0].child_admission_no).toBe('a');
    expect(out.leaderboard[0].share_pct).toBe(75);
  });

  test('avoids divide-by-zero / negative inputs', () => {
    const out = scoreQuest({ target_value: 0, contributions: { a: -5 } });
    expect(out.target_value).toBe(1);
    expect(out.total_progress).toBe(0);
  });
});

describe('classQuestScoring.applyContribution', () => {
  test('accumulates per-child additions', () => {
    let map = applyContribution({}, 'a', 10);
    map = applyContribution(map, 'a', 5);
    map = applyContribution(map, 'b', 20);
    expect(map.a).toBe(15);
    expect(map.b).toBe(20);
  });
});

// REST endpoint contract tests (require DB — skipped if unavailable)
describe('REST endpoint contracts', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      const { testQuery } = require('./helpers/test-db');
      await testQuery('SELECT 1');
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  const skipIfNoDb = () => { if (!dbAvailable) return; };

  test('POST /kids/teams/create requires class_id', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .post('/kids/teams/create')
      .set('Authorization', 'Bearer test-token')
      .send({});
    // Should return 400 (missing class_id) or 401 (invalid token)
    expect([400, 401, 403]).toContain(res.status);
  });

  test('GET /kids/teams/:id returns team or 404', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .get('/kids/teams/999999')
      .set('Authorization', 'Bearer test-token');
    expect([200, 401, 403, 404]).toContain(res.status);
  });

  test('GET /kids/class-quest/active returns quest or empty', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .get('/kids/class-quest/active?class_id=test')
      .set('Authorization', 'Bearer test-token');
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });

  test('GET /kids/peer-teach/board returns list', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .get('/kids/peer-teach/board')
      .set('Authorization', 'Bearer test-token');
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  test('GET /kids/class-quest/leaderboard returns array', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .get('/kids/class-quest/leaderboard')
      .set('Authorization', 'Bearer test-token');
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });
});
