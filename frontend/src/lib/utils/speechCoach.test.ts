/**
 * Q25 speech FE leaf — pure helper tests (no DOM, no API).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCoachPack,
  bandForScore,
  minutesLabel,
  readingMinutes,
  todayRollup,
  readingStreak,
  type ProgressDay,
} from '@/lib/utils/speechCoach';

describe('buildCoachPack', () => {
  it('builds a deterministic letter pack', () => {
    const pack = buildCoachPack('letter', 3);
    expect(pack.map((p) => p.expected_text)).toEqual(['A', 'B', 'C']);
    expect(pack.every((p) => p.mode === 'letter')).toBe(true);
    expect(pack[0].id).toBe('letter-1');
  });

  it('clamps count to the pool size and never below 1', () => {
    expect(buildCoachPack('word', 99)).toHaveLength(10);
    expect(buildCoachPack('sentence', 0)).toHaveLength(1);
  });
});

describe('bandForScore', () => {
  it('maps scores to the same bands the backend uses', () => {
    expect(bandForScore(90)).toMatchObject({ band: 'amazing', stars: 3 });
    expect(bandForScore(85)).toMatchObject({ band: 'amazing' });
    expect(bandForScore(65)).toMatchObject({ band: 'good', stars: 2 });
    expect(bandForScore(40)).toMatchObject({ band: 'getting_there', stars: 1 });
    expect(bandForScore(10)).toMatchObject({ band: 'try_again', stars: 1 });
  });
});

describe('minutesLabel + readingMinutes', () => {
  it('labels minutes from ms (min 1, 0 when none)', () => {
    expect(minutesLabel(0)).toBe('0 min');
    expect(minutesLabel(30000)).toBe('1 min');
    expect(minutesLabel(120000)).toBe('2 min');
  });

  it('counts passing attempts only for reading minutes', () => {
    const attempts = [
      { passed: true, duration_ms: 90000 },
      { passed: false, duration_ms: 60000 },
      { passed: true, duration_ms: 15000 },
    ];
    expect(readingMinutes(attempts)).toBe(105000);
  });
});

describe('todayRollup', () => {
  const days: ProgressDay[] = [
    { day: '2026-09-01', attempts: 2, passed: 1, avg_score: 60 },
    { day: '2026-09-03', attempts: 5, passed: 4, avg_score: 80 },
  ];

  it('finds today by exact date', () => {
    expect(todayRollup(days, '2026-09-03')).toEqual({ attempts: 5, passed: 4 });
  });

  it('returns zeros when today has no row or list is empty', () => {
    expect(todayRollup(days, '2026-09-02')).toEqual({ attempts: 0, passed: 0 });
    expect(todayRollup(null)).toEqual({ attempts: 0, passed: 0 });
  });
});

describe('readingStreak', () => {
  const mk = (days: string[], attempts = 1): ProgressDay[] =>
    days.map((d, i) => ({ day: d, attempts, passed: attempts, avg_score: 80 }));

  it('counts consecutive days ending today (today read)', () => {
    expect(readingStreak(mk(['2026-09-01', '2026-09-02', '2026-09-03']), '2026-09-03')).toBe(3);
  });

  it('keeps the streak alive when today not yet read but yesterday was', () => {
    expect(readingStreak(mk(['2026-09-01', '2026-09-02']), '2026-09-03')).toBe(2);
  });

  it('breaks the streak on a gap and ignores zero-attempt days', () => {
    const days = [
      ...mk(['2026-09-01', '2026-09-02']),
      { day: '2026-09-03', attempts: 0, passed: 0, avg_score: 0 },
      ...mk(['2026-09-04']),
    ];
    // today (09-04) read; 09-03 had no attempts → gap breaks back to 1
    expect(readingStreak(days, '2026-09-04')).toBe(1);
  });

  it('returns 0 for empty input', () => {
    expect(readingStreak([])).toBe(0);
    expect(readingStreak(null)).toBe(0);
  });
});