'use strict';

/**
 * Q3 Cross-track integration — end-to-end data consistency (no DB required).
 *
 * Threads ONE shared child-mastery dataset through:
 *   1. Class quest scoring (classQuestScoring)
 *   2. Parent weekly digest / insight generation (insightGenerator)
 *   3. Teacher class report rollup (teacherAssistant)
 *
 * and asserts all three reference the same underlying signals (same child,
 * same mastery, same week). This mirrors the live end-to-end path: class
 * quest → parent digest → teacher report all read the same kids_* rows.
 */

const { scoreQuest, applyContribution } = require('../src/services/classQuestScoring');
const { generateInsights } = require('../src/services/insightGenerator');
const { aggregateClassInsights, weeklyReport } = require('../src/services/teacherAssistant');

// Shared fixture: one child's mastery + the class quest contributions.
const WEEK = '2026-09-06';
const CLASS_ID = 'primary-3';
const CHILD = 'ADM-001';
const OTHER = 'ADM-002';

const sharedMastery = [
  { child_admission_no: CHILD, skill_key: 'math.counting', mastery_probability: 0.9 },
  { child_admission_no: CHILD, skill_key: 'phonics.sound', mastery_probability: 0.3, total_attempts: 2 },
  { child_admission_no: OTHER, skill_key: 'math.counting', mastery_probability: 0.7 },
];

describe('Q3 end-to-end: same data across all three tracks', () => {
  test('class quest contributions power the leaderboard', () => {
    let contributions = {};
    contributions = applyContribution(contributions, CHILD, 40);
    contributions = applyContribution(contributions, OTHER, 30);
    const scored = scoreQuest({ target_value: 100, contributions });
    expect(scored.total_progress).toBe(70);
    expect(scored.leaderboard[0].child_admission_no).toBe(CHILD);
    // The quest learner data is the SAME child that appears in parent/teacher tracks.
    expect(scored.leaderboard.map((l) => l.child_admission_no)).toContain(CHILD);
  });

  test('parent insight engine reads the child mastery and flags struggle + mastery', () => {
    const childMastery = sharedMastery.filter((m) => m.child_admission_no === CHILD);
    const insights = generateInsights({
      streak: { current: 4, lastPlayDate: new Date(Date.now() - 86400000), played_today: false },
      skills: childMastery.map((m) => ({
        skill_key: m.skill_key,
        mastery_probability: m.mastery_probability,
        total_attempts: m.total_attempts || 0,
      })),
      subjects: [],
      goal: { target: 5, done: 3 },
      reading: { delta_ms_week_over_week: 600000, percent_change: 15 },
      engagement: { frequency: 4, accuracy_pct: 75 },
    }, { week_start: WEEK });

    expect(insights.some((i) => i.rule_key === 'mastered' && i.meta.skill_key === 'math.counting')).toBe(true);
    expect(insights.some((i) => i.rule_key === 'struggling' && i.meta.skill_key === 'phonics.sound')).toBe(true);
    // Every insight is tagged to the same week the teacher report uses.
    expect(insights.every((i) => i.week_start === WEEK)).toBe(true);
  });

  test('teacher class rollup sees the same struggling mastery', () => {
    const snapshots = [
      {
        child_admission_no: CHILD,
        name: 'Ada',
        snapshot: { skills: sharedMastery.filter((m) => m.child_admission_no === CHILD) },
      },
      {
        child_admission_no: OTHER,
        name: 'Bola',
        snapshot: { skills: sharedMastery.filter((m) => m.child_admission_no === OTHER) },
      },
    ];
    const insights = aggregateClassInsights(snapshots);
    const struggling = insights.find((i) => i.insight_type === 'struggling');
    // Only CHILD is struggling (phonics 0.3); OTHER (0.7) is not.
    expect(struggling).toBeTruthy();
    expect(struggling.meta.students).toContain(CHILD);
    expect(struggling.meta.students).not.toContain(OTHER);
  });

  test('weekly report is consistent with the week + class', () => {
    const report = weeklyReport({
      class_id: CLASS_ID,
      week_start: WEEK,
      students: [
        { child_admission_no: CHILD, engaged: true, xp: 100, avg_score: 80 },
        { child_admission_no: OTHER, engaged: true, xp: 60, avg_score: 70 },
      ],
      insights: [{ id: 1 }, { id: 2 }],
      suggestions: [{ id: 1 }],
    });
    expect(report.class_id).toBe(CLASS_ID);
    expect(report.week_start).toBe(WEEK);
    expect(report.students_total).toBe(2);
    expect(report.total_xp).toBe(160);
    expect(report.avg_score_pct).toBe(75);
  });
});
