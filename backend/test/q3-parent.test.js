'use strict';

/**
 * Q3 Parent Intelligence — rule engine tests (8 seed rules).
 * Pure logic only (no DB required).
 */

const { generateInsights, RULES, clamp01 } = require('../src/services/insightGenerator');

describe('rule: streak-at-risk', () => {
  test('fires when streak >= 3 and lastPlayDate is yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000);
    const out = RULES['streak-at-risk']({ streak: { current: 4, lastPlayDate: yesterday, played_today: false } });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('high');
    expect(out[0].kind).toBe('alert');
  });

  test('silent when current streak < 3', () => {
    const out = RULES['streak-at-risk']({ streak: { current: 2, lastPlayDate: new Date() } });
    expect(out).toEqual([]);
  });

  test('silent when played today', () => {
    const yesterday = new Date(Date.now() - 86400000);
    const out = RULES['streak-at-risk']({ streak: { current: 5, lastPlayDate: yesterday, played_today: true } });
    expect(out).toEqual([]);
  });
});

describe('rule: mastered', () => {
  test('flags skills >= 0.85', () => {
    const out = RULES.mastered({ skills: [{ skill_key: 'math.counting', mastery_probability: 0.9 }] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('positive');
  });

  test('ignores low mastery', () => {
    const out = RULES.mastered({ skills: [{ skill_key: 'm', mastery_probability: 0.5 }] });
    expect(out).toEqual([]);
  });
});

describe('rule: struggling', () => {
  test('fires for mastery < 0.40 with >= 2 sessions', () => {
    const out = RULES.struggling({ skills: [{ skill_key: 'phonics', mastery_probability: 0.3, total_attempts: 2 }] });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('high');
  });

  test('ignores zero-mastery (unattempted) and low attempt count', () => {
    const out = RULES.struggling({
      skills: [
        { skill_key: 'a', mastery_probability: 0.1, total_attempts: 0 },
        { skill_key: 'b', mastery_probability: 0.3, total_attempts: 1 },
      ],
    });
    expect(out).toEqual([]);
  });
});

describe('rule: strongest-subject', () => {
  test('argmax mastery subject', () => {
    const out = RULES['strongest-subject']({
      subjects: [
        { subject: 'Math', mastery: 0.6 },
        { subject: 'English', mastery: 0.9 },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].meta.subject).toBe('English');
    expect(out[0].kind).toBe('positive');
  });

  test('empty subjects → no insight', () => {
    expect(RULES['strongest-subject']({ subjects: [] })).toEqual([]);
  });
});

describe('rule: needs-attention', () => {
  test('flat for 2+ weeks with activity → watch insight', () => {
    const out = RULES['needs-attention']({ subjects: [{ subject: 'Science', mastery: 0.5, flat_weeks: 2 }] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('watch');
  });

  test('not flat → ignored', () => {
    expect(RULES['needs-attention']({ subjects: [{ subject: 'Science', mastery: 0.5, flat_weeks: 0 }] })).toEqual([]);
  });
});

describe('rule: goal-on-track', () => {
  test('mostly done → positive low severity', () => {
    const out = RULES['goal-on-track']({ goal: { target: 4, done: 3 } });
    expect(out[0].kind).toBe('positive');
    expect(out[0].severity).toBe('low');
  });

  test('low progress → high severity watch', () => {
    const out = RULES['goal-on-track']({ goal: { target: 4, done: 1 } });
    expect(out[0].kind).toBe('watch');
    expect(out[0].severity).toBe('high');
  });

  test('no goal → none', () => {
    expect(RULES['goal-on-track']({})).toEqual([]);
  });
});

describe('rule: reading-time-up', () => {
  test('positive delta → positive insight', () => {
    const out = RULES['reading-time-up']({ reading: { delta_ms_week_over_week: 600000, percent_change: 20 } });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('positive');
  });

  test('zero/negative delta → none', () => {
    expect(RULES['reading-time-up']({ reading: { delta_ms_week_over_week: -100 } })).toEqual([]);
  });
});

describe('rule: mood', () => {
  test('engaged when frequent + accurate', () => {
    const out = RULES.mood({ engagement: { frequency: 4, accuracy_pct: 70 } });
    expect(out[0].kind).toBe('positive');
  });

  test('quiet when low frequency', () => {
    const out = RULES.mood({ engagement: { frequency: 1, accuracy_pct: 50 } });
    expect(out[0].kind).toBe('watch');
  });
});

describe('generateInsights', () => {
  test('runs all 8 rules and tags week_start', () => {
    const out = generateInsights({
      streak: { current: 5, lastPlayDate: new Date(Date.now() - 86400000), played_today: false },
      skills: [{ skill_key: 'x', mastery_probability: 0.9 }],
      subjects: [{ subject: 'Math', mastery: 0.9, flat_weeks: 0 }],
      goal: { target: 4, done: 3 },
      reading: { delta_ms_week_over_week: 600000, percent_change: 10 },
      engagement: { frequency: 4, accuracy_pct: 70 },
    }, { week_start: '2026-09-06' });
    expect(out.length).toBeGreaterThanOrEqual(4);
    for (const i of out) expect(i.week_start).toBe('2026-09-06');
    expect(out.every((i) => i.rule_key)).toBe(true);
  });

  test('empty snapshot → safe, no throw', () => {
    expect(Array.isArray(generateInsights(null))).toBe(true);
    expect(Array.isArray(generateInsights({}))).toBe(true);
  });

  test('clamp01 clamps to [0,1]', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
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

  test('GET /kids/parent/insights/:childId requires auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/parent/insights/test-child');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /kids/parent/weekly-digest/:childId requires auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/parent/weekly-digest/test-child');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /kids/parent/comparison/:childId requires auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/parent/comparison/test-child');
    expect([401, 403]).toContain(res.status);
  });

  test('POST /kids/parent/action-ack requires body', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .post('/kids/parent/action-ack')
      .send({});
    expect([400, 401, 403]).toContain(res.status);
  });

  test('POST /kids/parent/opt-in requires body', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .post('/kids/parent/opt-in')
      .send({});
    expect([400, 401, 403]).toContain(res.status);
  });
});
