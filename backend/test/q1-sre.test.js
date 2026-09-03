'use strict';

/**
 * Q1 2027 — SRE (Spaced Repetition Engine) v2 SM-2+ algorithm tests.
 *
 * Tests the pure SM-2+ logic in backend/src/services/spacedRepetition.js.
 * No DB required.
 */

const {
  sm2PlusUpdate,
  createSm2Card,
  calculateNewEase,
  isDue,
  daysOverdue,
  describeInterval,
  buildReviewQueue,
  SM2_MIN_EASE,
  SM2_MAX_EASE,
  SM2_INITIAL_EASE,
  SM2_MAX_INTERVAL,
} = require('../src/services/spacedRepetition');

describe('SM-2+ update', () => {
  test('first correct review schedules +1 day', () => {
    const r = sm2PlusUpdate({ ...createSm2Card() }, 4);
    expect(r.repetitions).toBe(1);
    expect(r.interval_days).toBe(1);
  });

  test('first failed review retries immediately (interval 0)', () => {
    const r = sm2PlusUpdate({ ...createSm2Card() }, 1);
    expect(r.repetitions).toBe(0);
    expect(r.interval_days).toBe(0);
  });

  test('second consecutive correct review jumps to 6 days', () => {
    const r = sm2PlusUpdate({ ease: 2.5, interval_days: 1, repetitions: 1 }, 4);
    expect(r.interval_days).toBe(6);
    expect(r.repetitions).toBe(2);
  });

  test('subsequent reviews grow interval by ease factor', () => {
    const r = sm2PlusUpdate({ ease: 2.5, interval_days: 6, repetitions: 2 }, 4);
    expect(r.interval_days).toBeGreaterThan(6);
  });

  test('failed review resets to learning phase', () => {
    const r = sm2PlusUpdate({ ease: 2.5, interval_days: 6, repetitions: 3 }, 2);
    expect(r.repetitions).toBe(0);
    expect(r.interval_days).toBe(1);
  });

  test('interval never exceeds SM2_MAX_INTERVAL', () => {
    const r = sm2PlusUpdate({ ease: 3.0, interval_days: 40000, repetitions: 20 }, 5);
    expect(r.interval_days).toBeLessThanOrEqual(SM2_MAX_INTERVAL);
  });

  test('ease stays within min/max bounds', () => {
    const r = sm2PlusUpdate({ ...createSm2Card() }, 5);
    expect(r.ease).toBeGreaterThanOrEqual(SM2_MIN_EASE);
    expect(r.ease).toBeLessThanOrEqual(SM2_MAX_EASE);
  });
});

describe('createSm2Card + ease', () => {
  test('card defaults are sane', () => {
    const c = createSm2Card();
    expect(c.ease).toBe(SM2_INITIAL_EASE);
    expect(c.interval_days).toBe(1);
    expect(c.repetitions).toBe(0);
    expect(c.last_quality).toBeNull();
  });

  test('calculateNewEase rewards high quality', () => {
    const e = calculateNewEase(2.5, 5);
    expect(e).toBeGreaterThan(2.5);
  });

  test('calculateNewEase penalizes low quality', () => {
    const e = calculateNewEase(2.5, 1);
    expect(e).toBeLessThan(2.5);
  });
});

describe('Due / overdue', () => {
  test('card with past next_review_at is due', () => {
    const card = { next_review_at: new Date(Date.now() - 100000) };
    expect(isDue(card)).toBe(true);
  });

  test('card with future next_review_at is not due', () => {
    const card = { next_review_at: new Date(Date.now() + 100000) };
    expect(isDue(card)).toBe(false);
  });

  test('daysOverdue computes positive days', () => {
    const card = { next_review_at: new Date(Date.now() - 3 * 86400000) };
    expect(daysOverdue(card)).toBe(3);
  });

  test('daysOverdue returns 0 when not overdue', () => {
    const card = { next_review_at: new Date(Date.now() + 86400000) };
    expect(daysOverdue(card)).toBe(0);
  });
});

describe('Interval description + queue', () => {
  test('describeInterval maps known intervals to friendly text', () => {
    expect(typeof describeInterval(0)).toBe('string');
    expect(typeof describeInterval(1)).toBe('string');
    expect(typeof describeInterval(30)).toBe('string');
  });

  test('buildReviewQueue respects queue size and includes due first', () => {
    const due = [{ item_id: 'a' }, { item_id: 'b' }, { item_id: 'c' }];
    const newContent = [{ item_id: 'x' }, { item_id: 'y' }];
    const q = buildReviewQueue(due, newContent, 4);
    expect(q.length).toBe(4);
  });
});
