'use strict';

/**
 * Q1 2027 — ADE (Adaptive Difficulty Engine) v2 algorithm tests.
 *
 * Tests the pure BKT / Elo / ZPD / struggle / difficulty logic in
 * backend/src/services/adaptiveEngine.js. No DB required.
 */

const {
  bktUpdate,
  createBktState,
  eloUpdate,
  calculateDifficulty,
  detectStruggle,
  getMasteryState,
  getMasteryMeta,
  buildSkillKey,
  scoreQuality,
  calculateZPD,
  BKT_DEFAULTS,
  ELO_INITIAL,
  MASTERY_THRESHOLDS,
} = require('../src/services/adaptiveEngine');

describe('BKT update', () => {
  test('a correct answer raises mastery probability', () => {
    const before = 0.5;
    const after = bktUpdate({ p_knows: before }, true);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(1);
  });

  test('a wrong answer lowers mastery probability', () => {
    const before = 0.7;
    const after = bktUpdate({ p_knows: before }, false);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  test('is bounded within [0,1] for extreme inputs', () => {
    expect(bktUpdate({ p_knows: 0 }, true)).toBeGreaterThanOrEqual(0);
    expect(bktUpdate({ p_knows: 1 }, true)).toBeLessThanOrEqual(1);
    expect(bktUpdate({ p_knows: 0.001 }, false)).toBeLessThanOrEqual(1);
  });

  test('createBktState returns sane defaults', () => {
    const s = createBktState();
    expect(s.p_knows).toBe(0.001);
    expect(s.p_L).toBe(BKT_DEFAULTS.p_L);
  });
});

describe('Elo rating', () => {
  test('correct answer increases rating', () => {
    const after = eloUpdate(1000, 1000, true);
    expect(after).toBeGreaterThan(1000);
  });

  test('wrong answer decreases rating', () => {
    const after = eloUpdate(1000, 1000, false);
    expect(after).toBeLessThan(1000);
  });

  test('initial rating is 1000', () => {
    expect(ELO_INITIAL).toBe(1000);
  });

  test('favored student gains less than underdog', () => {
    const fav = eloUpdate(1500, 500, true);
    const underdog = eloUpdate(500, 1500, true);
    expect(fav - 1500).toBeLessThan(underdog - 500);
  });

  test('rating clamps to the configured min/max bounds', () => {
    // Repeatedly reward an extreme mismatch; must stay within ELO_MIN..ELO_MAX
    let elo = 3000;
    for (let i = 0; i < 50; i++) elo = eloUpdate(elo, 100, true);
    expect(elo).toBeLessThanOrEqual(3000);
    elo = 100;
    for (let i = 0; i < 50; i++) elo = eloUpdate(elo, 3000, false);
    expect(elo).toBeGreaterThanOrEqual(100);
  });
});

describe('Difficulty calculation', () => {
  test('returns an integer on a bounded scale', () => {
    const d = calculateDifficulty(3, 0.5, 3000, { struggling: false });
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(5);
  });

  test('struggling drops difficulty', () => {
    const d = calculateDifficulty(4, 0.6, 3000, { struggling: true });
    expect(d).toBe(3);
  });

  test('mastered and fast raises difficulty', () => {
    const d = calculateDifficulty(3, 0.9, 2000, { struggling: false });
    expect(d).toBe(4);
  });
});

describe('Struggle detection', () => {
  test('consecutive wrong answers signal struggle', () => {
    const r = detectStruggle({ consecutive_wrong: 3, last_5_response_times: [] }, {});
    expect(r.struggling).toBe(true);
    expect(['low', 'medium', 'high']).toContain(r.severity);
  });

  test('many signals yield high severity', () => {
    const r = detectStruggle(
      { consecutive_wrong: 4, last_5_response_times: [1000, 1100, 1150, 1800, 2600] },
      {
        hints_used: 8,
        total_items: 10,
        session_accuracy_start: 90,
        session_accuracy_current: 40,
      }
    );
    expect(r.severity).toBe('high');
  });

  test('single signal yields low severity, two signals medium', () => {
    expect(detectStruggle({ consecutive_wrong: 3 }, {}).severity).toBe('low');
    // consecutive wrong (signal 1) + clear slowing-down (signal 2)
    expect(
      detectStruggle({ consecutive_wrong: 3, last_5_response_times: [100, 100, 2000, 2000, 2000] }, {}).severity
    ).toBe('medium');
  });

  test('healthy performance does not signal struggle', () => {
    const r = detectStruggle(
      { consecutive_wrong: 0, last_5_response_times: [1000, 900, 950, 1000, 1200] },
      { hints_used: 0, total_items: 10 }
    );
    expect(r.struggling).toBe(false);
  });
});

describe('Mastery state mapping', () => {
  test('maps probabilities to named thresholds', () => {
    expect(getMasteryState(0.05)).toBe('new');
    expect(getMasteryState(0.4)).toBe('learning');
    expect(getMasteryState(0.6)).toBe('practicing');
    expect(getMasteryState(0.75)).toBe('nearly_there');
    expect(getMasteryState(0.9)).toBe('mastered');
  });

  test('getMasteryMeta exposes threshold label', () => {
    const meta = getMasteryMeta(0.9);
    expect(meta.state).toBe('mastered');
    expect(meta.fillPercent).toBe(90);
    expect(MASTERY_THRESHOLDS.MASTERED).toBe(0.85);
  });

  test('getMasteryMeta fill stays within a sane display cap', () => {
    // Valid 0..1 probabilities never exceed 100% on the rendered bar
    expect(getMasteryMeta(0.999).fillPercent).toBeLessThanOrEqual(100);
    expect(getMasteryMeta(0).fillPercent).toBe(0);
  });
});

describe('Skill key + quality', () => {
  test('buildSkillKey joins subject/topic/skill deterministically', () => {
    expect(buildSkillKey('math', 'addition', 'within-10')).toBe('math.addition.within-10');
    expect(buildSkillKey('math', 'addition')).toBe('math.addition');
  });

  test('scoreQuality maps performance to 0..5', () => {
    expect(scoreQuality({ score: 100, correct: true })).toBe(5);
    expect(scoreQuality({ score: 0, correct: false })).toBe(0);
    expect(scoreQuality({ score: 80 })).toBe(4);
  });
});

describe('ZPD', () => {
  test('returns a bounded band anchored on mastery', () => {
    const z = calculateZPD(0.5);
    expect(z.lower).toBeGreaterThanOrEqual(0);
    expect(z.upper).toBeLessThanOrEqual(1);
    expect(z.lower).toBeLessThanOrEqual(z.upper);
  });

  test('bounds hold for extreme mastery values', () => {
    for (const p of [0, 0.05, 0.95, 1]) {
      const z = calculateZPD(p);
      expect(z.lower).toBeGreaterThanOrEqual(0);
      expect(z.upper).toBeLessThanOrEqual(1);
      expect(z.lower).toBeLessThanOrEqual(z.upper);
    }
  });
});
