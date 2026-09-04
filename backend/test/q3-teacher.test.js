'use strict';

/**
 * Q3 Teacher AI Assistant — service helper tests.
 * Pure logic only (no DB required).
 */

const {
  aggregateClassInsights,
  detectContentGaps,
  autoAssignHeuristic,
  weeklyReport,
} = require('../src/services/teacherAssistant');

describe('aggregateClassInsights', () => {
  test('flags struggling students below mastery threshold', () => {
    const snapshots = [
      { child_admission_no: 'a', name: 'Ada', snapshot: { skills: [{ skill_key: 'math', mastery_probability: 0.3, total_attempts: 2 }] } },
      { child_admission_no: 'b', name: 'Bola', snapshot: { skills: [{ skill_key: 'math', mastery_probability: 0.9 }] } },
    ];
    const rows = aggregateClassInsights(snapshots);
    const struggling = rows.find((r) => r.insight_type === 'struggling');
    expect(struggling).toBeTruthy();
    expect(struggling.meta.students).toContain('a');
    expect(struggling.meta.students).not.toContain('b');
  });

  test('engagement rollup counts active students', () => {
    const snapshots = [
      { child_admission_no: 'a', snapshot: { skills: [], engaged: true } },
      { child_admission_no: 'b', snapshot: { skills: [], engaged: false } },
    ];
    const rows = aggregateClassInsights(snapshots);
    const eng = rows.find((r) => r.insight_type === 'engagement');
    expect(eng.meta.active).toBe(1);
    expect(eng.meta.total).toBe(2);
  });

  test('empty list → safe', () => {
    expect(Array.isArray(aggregateClassInsights([]))).toBe(true);
  });
});

describe('detectContentGaps', () => {
  test('flags strands below expected coverage with priority', () => {
    const gaps = detectContentGaps([
      { class_id: 'c', strand: 'Numbers', coverage: 2, expected: 10 },
      { class_id: 'c', strand: 'Letters', coverage: 9, expected: 10 },
    ]);
    const numbers = gaps.find((g) => g.strand === 'Numbers');
    expect(numbers.gap).toBe(8);
    expect(numbers.priority).toBe('high');
    const letters = gaps.find((g) => g.strand === 'Letters');
    expect(letters.gap).toBe(1);
    expect(letters.priority).toBe('low');
  });

  test('fully covered strands are excluded', () => {
    const gaps = detectContentGaps([{ class_id: 'c', strand: 'Colors', coverage: 12, expected: 10 }]);
    expect(gaps).toEqual([]);
  });
});

describe('autoAssignHeuristic', () => {
  test('maps assign vs review intents', () => {
    const intents = autoAssignHeuristic([
      { child_admission_no: 'a', skill_key: 'math', action: 'assign', lesson_id: 'l1' },
      { child_admission_no: 'b', skill_key: 'phonics', action: 'review', lesson_id: null },
    ]);
    expect(intents).toHaveLength(2);
    expect(intents[0].action).toBe('assign');
    expect(intents[0].lesson_id).toBe('l1');
    expect(intents[1].action).toBe('review');
  });

  test('drops entries without a child_admission_no', () => {
    expect(autoAssignHeuristic([{ skill_key: 'x', action: 'assign' }])).toEqual([]);
  });
});

describe('weeklyReport', () => {
  test('rolls up participation, XP and avg score', () => {
    const report = weeklyReport({
      class_id: 'c',
      week_start: '2026-09-06',
      students: [
        { child_admission_no: 'a', engaged: true, xp: 100, avg_score: 80 },
        { child_admission_no: 'b', engaged: true, xp: 50, avg_score: 60 },
        { child_admission_no: 'c', engaged: false, xp: 0, avg_score: 0 },
      ],
      insights: [{ id: 1 }],
      suggestions: [{ id: 1 }, { id: 2 }],
    });
    expect(report.students_total).toBe(3);
    expect(report.students_active).toBe(2);
    expect(report.participation_pct).toBe(67);
    expect(report.total_xp).toBe(150);
    expect(report.avg_score_pct).toBe(70);
    expect(report.insight_count).toBe(1);
    expect(report.suggestion_count).toBe(2);
    expect(report.report_type).toBe('weekly');
  });

  test('no students → safe zeros', () => {
    const report = weeklyReport({ class_id: 'c', week_start: '2026-09-06', students: [], insights: [], suggestions: [] });
    expect(report.students_total).toBe(0);
    expect(report.participation_pct).toBe(0);
    expect(report.avg_score_pct).toBe(0);
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

  test('GET /kids/teacher/insights requires staff auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/teacher/insights?class_id=test');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /kids/teacher/suggestions requires staff auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/teacher/suggestions?class_id=test');
    expect([401, 403]).toContain(res.status);
  });

  test('POST /kids/teacher/auto-assign requires staff auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app)
      .post('/kids/teacher/auto-assign')
      .send({});
    expect([401, 403]).toContain(res.status);
  });

  test('GET /kids/teacher/weekly-report requires staff auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/teacher/weekly-report?class_id=test');
    expect([401, 403]).toContain(res.status);
  });

  test('GET /kids/teacher/struggling requires staff auth', async () => {
    skipIfNoDb();
    const request = require('supertest');
    const app = require('../src/app');
    const res = await request(app).get('/kids/teacher/struggling?class_id=test');
    expect([401, 403]).toContain(res.status);
  });
});
