'use strict';

const {
  predictDropoutRisk,
  predictMastery,
  predictChild,
  aggregatePopulation,
  scoreContent,
} = require('../src/services/predictiveAnalytics');

describe('Q4 explainable predictive analytics', () => {
  test('bounds dropout risk and explains elevated signals', () => {
    const result = predictDropoutRisk({ daysInactive: 10, attempts: 1, avgScore: 35, mastery: 0.2 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.band).toBe('high');
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  test('returns bounded mastery probability and confidence', () => {
    const result = predictMastery({ mastery: 0.8, avgScore: 90, attempts: 8 });
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.band).toBe('mastered');
  });

  test('composes a child prediction with a human-review explanation', () => {
    const result = predictChild({ child_admission_no: 'A-1', attempts: 3, avgScore: 70, mastery: 0.5 });
    expect(result.child_admission_no).toBe('A-1');
    expect(result.dropout_risk).toHaveProperty('band');
    expect(result.mastery).toHaveProperty('confidence');
    expect(result.explanation).toMatch(/review/i);
  });

  test('aggregates population metrics without leaking child identities', () => {
    const result = aggregatePopulation([
      { score: 80, attempts: 4, daysInactive: 1, mastery: 0.8 },
      { score: 20, attempts: 0, daysInactive: 14, mastery: 0.1 },
    ]);
    expect(result.learners).toBe(2);
    expect(result.active_learners).toBe(1);
    expect(result).not.toHaveProperty('child_admission_no');
  });

  test('scores content with bounded completion and effectiveness', () => {
    const [result] = scoreContent([{ lesson_id: 'L-1', title: 'Counting', attempts: 4, average_score: 75, completion_rate: 0.5 }]);
    expect(result.lesson_id).toBe('L-1');
    expect(result.completion_rate_pct).toBe(50);
    expect(result.effectiveness).toBeGreaterThanOrEqual(0);
    expect(result.effectiveness).toBeLessThanOrEqual(1);
  });
});
