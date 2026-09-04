/**
 * ActivityGrid helpers tests — heat levels, week columns, month labels,
 * and XP trend path math.
 */
import { describe, it, expect } from 'vitest';
import {
  activityLevel,
  buildWeekColumns,
  monthLabels,
  xpTrendPath,
  type DayActivity,
} from './activityGrid';

const day = (date: string, games = 0, xp = 0, stars = 0): DayActivity => ({ date, games, xp, stars });

describe('activityLevel', () => {
  it('maps games to 0-4 heat levels', () => {
    expect(activityLevel(0)).toBe(0);
    expect(activityLevel(1)).toBe(1);
    expect(activityLevel(2)).toBe(2);
    expect(activityLevel(3)).toBe(3);
    expect(activityLevel(4)).toBe(3);
    expect(activityLevel(5)).toBe(4);
    expect(activityLevel(12)).toBe(4);
  });
});

describe('buildWeekColumns', () => {
  it('pads the leading partial week (Mon-first) and fills full weeks', () => {
    const lead = (new Date('2026-09-02T00:00:00').getDay() + 6) % 7; // Mon=0…Sun=6
    const cols = buildWeekColumns([day('2026-09-02', 1), day('2026-09-03', 2), day('2026-09-07', 1)]);
    expect(cols.length).toBe(2);
    expect(cols[0].length).toBe(lead + 3); // leading pad + Wednesday through Sunday
    expect(cols[0][cols[0].length - 1].date).toBe('2026-09-06');
    expect(cols[1].length).toBe(1); // next Monday
  });

  it('returns empty for empty series', () => {
    expect(buildWeekColumns([])).toEqual([]);
  });

  it('keeps chronological order inside columns', () => {
    const cols = buildWeekColumns([day('2026-09-02', 1), day('2026-09-03', 2)]);
    expect(cols[0][0].date < cols[0][1].date).toBe(true);
  });
});

describe('monthLabels', () => {
  it('labels each month once at its first column', () => {
    const series = [day('2026-08-30'), day('2026-09-01'), day('2026-09-15'), day('2026-09-28')];
    const labels = monthLabels(series);
    const names = labels.map((l) => l.label);
    expect(names).toContain('Aug');
    expect(names).toContain('Sep');
    expect(names.filter((n) => n === 'Sep').length).toBe(1);
  });
});

describe('xpTrendPath', () => {
  it('builds points and reports the max for scaling', () => {
    const series = [day('2026-09-01', 1, 10), day('2026-09-02', 2, 30), day('2026-09-03', 1, 20)];
    const { points, maxXp } = xpTrendPath(series, 300, 100);
    expect(maxXp).toBe(30);
    expect(points.split(' ').length).toBe(3);
  });

  it('trims leading zero-xp days for fresh kids', () => {
    const series = [day('2026-09-01'), day('2026-09-02'), day('2026-09-03', 1, 25)];
    const { points } = xpTrendPath(series, 300, 100);
    expect(points.split(' ').length).toBe(1); // only the active day remains
  });

  it('handles a single point safely', () => {
    const { points } = xpTrendPath([day('2026-09-03', 1, 25)], 300, 100);
    expect(points).toMatch(/^\d+(\.\d+)?,\d+(\.\d+)?$/);
  });
});
