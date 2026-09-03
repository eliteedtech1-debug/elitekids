'use strict';

/**
 * Q2 2027 — Learning Portfolio aggregation tests (roadmap §2.7).
 * Pure logic only (mirrors q2-speech.test.js convention — no DB required).
 */

const {
  buildSkillMap,
  summarizeSpeech,
  summarizeGames,
  recommend,
} = require('../src/controllers/kidsPortfolio');

describe('buildSkillMap', () => {
  test('empty rows → empty map + zero summary', () => {
    const out = buildSkillMap([]);
    expect(out.skills).toEqual([]);
    expect(out.summary.total).toBe(0);
  });

  test('maps mastery probability to pct + band + clamps out-of-range', () => {
    const out = buildSkillMap([
      { skill_key: 'phonics.a', mastery_probability: 0.9, current_difficulty: 4, total_attempts: 12 },
      { skill_key: 'math.counting', mastery_probability: 0.3, current_difficulty: 2, total_attempts: 5 },
      { skill_key: 'weird', mastery_probability: 2.5, current_difficulty: 3, total_attempts: 1 },
      { skill_key: 'legacy', mastery_probability: null, current_difficulty: null, total_attempts: 0 },
    ]);
    expect(out.skills).toHaveLength(4);
    expect(out.skills[0]).toMatchObject({ skill_key: 'phonics.a', mastery_pct: 90, mastery_state: 'mastered' });
    expect(out.skills[1]).toMatchObject({ mastery_pct: 30, total_attempts: 5 });
    expect(out.skills[2].mastery_pct).toBe(100); // clamped
    expect(out.skills[3].mastery_pct).toBe(0);
    expect(out.summary.mastered).toBe(2);
  });
});

describe('summarizeSpeech', () => {
  test('rolls up counts, pass rate, avg score and keeps recent N', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      expected_text: `word${i}`,
      transcript: `transcript${i}`,
      mode: 'word',
      overall_score: i < 6 ? 80 : 40,
      passed: i < 6,
      created_at: `2026-09-0${(i % 9) + 1} 10:00:00`,
    }));
    const out = summarizeSpeech(rows, 8);
    expect(out.attempts).toBe(12);
    expect(out.passed).toBe(6);
    expect(out.pass_rate_pct).toBe(50);
    expect(out.avg_score_pct).toBe(60);
    expect(out.recent).toHaveLength(8);
    expect(out.recent[0]).toHaveProperty('transcript');
  });

  test('empty rows → zeros, no crash', () => {
    const out = summarizeSpeech(null);
    expect(out).toMatchObject({ attempts: 0, passed: 0, pass_rate_pct: 0, avg_score_pct: 0, recent: [] });
  });
});

describe('summarizeGames', () => {
  test('rolls up sessions/stars/xp/avg and recent order stays as given', () => {
    const rows = [
      { lesson_id: 'l1', mode: 'test', score: 80, stars_earned: 3, xp: 120, completed_at: '2026-09-03 09:00:00' },
      { lesson_id: 'l2', mode: 'practice', score: 60, stars_earned: 2, xp: 60, completed_at: '2026-09-02 09:00:00' },
    ];
    const out = summarizeGames(rows);
    expect(out.sessions).toBe(2);
    expect(out.total_stars).toBe(5);
    expect(out.total_xp).toBe(180);
    expect(out.avg_score_pct).toBe(70);
    expect(out.recent[0].lesson_id).toBe('l1');
  });
});

describe('recommend', () => {
  test('flags struggling skills as support, near ones as focus, mastered as strengths', () => {
    const skills = [
      { skill_key: 'a', mastery_probability: 0.2, mastery_pct: 20, total_attempts: 6 },
      { skill_key: 'b', mastery_probability: 0.9, mastery_pct: 90, total_attempts: 10 },
      { skill_key: 'c', mastery_probability: 0.6, mastery_pct: 60, total_attempts: 4 },
      // no attempts yet — must NOT be flagged as struggling
      { skill_key: 'd', mastery_probability: 0.1, mastery_pct: 10, total_attempts: 0 },
    ];
    const recs = recommend(skills);
    expect(recs.filter((r) => r.type === 'support').map((r) => r.skill_key)).toContain('a');
    expect(recs.filter((r) => r.type === 'support').map((r) => r.skill_key)).not.toContain('d');
    expect(recs.filter((r) => r.type === 'strength').map((r) => r.skill_key)).toContain('b');
    expect(recs.some((r) => r.type === 'focus')).toBe(true);
  });

  test('empty skill map → single celebrate nudge', () => {
    const recs = recommend([]);
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe('celebrate');
  });
});
