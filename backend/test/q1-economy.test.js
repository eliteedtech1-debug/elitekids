'use strict';

/**
 * Q1 2027 — Engagement Economy (XP / level / streak / milestones) tests.
 *
 * Tests the pure logic in backend/src/services/economyService.js.
 * No DB required.
 */

const {
  XP_TABLE,
  calculateXP,
  getStreakMultiplier,
  updateStreak,
  calculateLevel,
  checkLevelUp,
  checkMilestones,
} = require('../src/services/economyService');

describe('XP calculation', () => {
  test('base game_complete earns at least the table amount', () => {
    const r = calculateXP('game_complete', { streak_current: 0 });
    expect(r.xp_earned).toBeGreaterThanOrEqual(XP_TABLE.game_complete);
    expect(r.base_amount).toBe(XP_TABLE.game_complete);
  });

  test('perfect score adds a bonus for game_complete', () => {
    const normal = calculateXP('game_complete', { streak_current: 0 });
    const perfect = calculateXP('game_complete', { streak_current: 0, score: 100 });
    expect(perfect.xp_earned).toBeGreaterThan(normal.xp_earned);
    expect(perfect.perfect_bonus).toBeGreaterThan(0);
  });

  test('streak adds bonus XP', () => {
    const noStreak = calculateXP('game_complete', { streak_current: 0 });
    const withStreak = calculateXP('game_complete', { streak_current: 5 });
    expect(withStreak.streak_bonus).toBe(25);
    expect(withStreak.xp_earned).toBeGreaterThan(noStreak.xp_earned);
  });

  test('invalid action throws', () => {
    expect(() => calculateXP('not_a_real_action', {})).toThrow();
  });
});

describe('Streak multiplier', () => {
  test('returns 1 for no streak', () => {
    expect(getStreakMultiplier(0)).toBe(1);
  });

  test('applies tiers for longer streaks', () => {
    expect(getStreakMultiplier(3)).toBe(1.2);
    expect(getStreakMultiplier(7)).toBe(1.5);
    expect(getStreakMultiplier(14)).toBe(2);
    expect(getStreakMultiplier(30)).toBe(3);
  });
});

describe('Streak update', () => {
  test('first-ever play starts a streak of 1', () => {
    const r = updateStreak({ streak_current: 0, streak_longest: 0, last_play_date: null, streak_freeze_count: 0 }, '2026-09-03');
    expect(r.streak).toBe(1);
    expect(r.streak_increased).toBe(true);
  });

  test('consecutive day increments streak', () => {
    const r = updateStreak(
      { streak_current: 5, streak_longest: 5, last_play_date: '2026-09-02', streak_freeze_count: 0 },
      '2026-09-03'
    );
    expect(r.streak).toBe(6);
    expect(r.streak_increased).toBe(true);
  });

  test('missed day with freeze uses it', () => {
    const r = updateStreak(
      { streak_current: 5, streak_longest: 5, last_play_date: '2026-09-01', streak_freeze_count: 1 },
      '2026-09-03'
    );
    expect(r.freeze_used).toBe(true);
    expect(r.streak_broken).toBe(false);
    expect(r.new_freeze_count).toBe(0);
  });

  test('missed days without freeze breaks streak', () => {
    const r = updateStreak(
      { streak_current: 5, streak_longest: 5, last_play_date: '2026-09-01', streak_freeze_count: 0 },
      '2026-09-03'
    );
    expect(r.streak_broken).toBe(true);
    expect(r.streak).toBe(1);
  });
});

describe('Level calculation', () => {
  test('zero XP is level 1', () => {
    const l = calculateLevel(0);
    expect(l.level).toBe(1);
  });

  test('higher XP reaches higher level', () => {
    const l = calculateLevel(500);
    expect(l.level).toBeGreaterThan(1);
  });

  test('extra XP within a level reports progress', () => {
    const l = calculateLevel(30);
    expect(l.xp_to_next).toBeGreaterThan(0);
  });
});

describe('Level up + milestones', () => {
  test('checkLevelUp flags transition', () => {
    const low = calculateLevel(0).level;
    const high = calculateLevel(5000).level;
    expect(high).toBeGreaterThan(low);
    const up = checkLevelUp(0, 5000);
    expect(up.level_up).toBe(true);
    expect(up.new_level).toBeGreaterThan(up.old_level);
  });

  test('no level up within same level', () => {
    const up = checkLevelUp(10, 40);
    expect(up.level_up).toBe(false);
  });

  test('streak milestone is reported once', () => {
    const m = checkMilestones({ streak: 7, level: 1, perfect_games: 0, total_games: 0 }, []);
    const types = m.map((x) => x.type);
    expect(types).toContain('streak_3');
    expect(types).toContain('streak_7');
  });

  test('existing milestones are not re-reported', () => {
    const m = checkMilestones({ streak: 7, level: 1, perfect_games: 0, total_games: 0 }, ['streak_3', 'streak_7']);
    expect(m.map((x) => x.type)).not.toContain('streak_3');
  });
});
