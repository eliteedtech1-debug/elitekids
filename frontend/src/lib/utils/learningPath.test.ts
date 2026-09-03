/**
 * L2-FE Phase 4 gates — learning-path dashboard + weekly goal.
 *
 *  - Age-band mapping + in-band ceiling (subject tabs never widen a band)
 *  - Path marker position (first unfinished unit; spill-over leads)
 *  - Locked units are never open/clickable
 *  - Default mode per lesson state (practice → test once practice done)
 *  - Goal math + band-start divider
 */
import { describe, it, expect } from 'vitest';
import {
  classToAgeLevel,
  filterInBand,
  flattenUnits,
  currentPositionIndex,
  unitStats,
  isUnitOpen,
  defaultModeFor,
  goalPercent,
  isBandStart,
  type LearningPathData,
  type PathUnit,
} from '@/lib/utils/learningPath';

const lesson = (lesson_id: string, state: 'none' | 'practice_done' | 'passed' = 'none') => ({
  lesson_id,
  title: lesson_id,
  age_level: 'KG1',
  state,
});

const unit = (over: Partial<PathUnit> & { unit_id: string }): PathUnit => ({
  unit_number: 1,
  title: 'Unit title',
  topic: 'One topic',
  relation: 'current',
  done: false,
  locked: false,
  locked_reason: null,
  lessons: [],
  ...over,
});

describe('classToAgeLevel', () => {
  it('maps common class spellings to bands', () => {
    expect(classToAgeLevel('Creche 1')).toBe('Creche');
    expect(classToAgeLevel('Pre-Nursery A')).toBe('Creche');
    expect(classToAgeLevel('Nursery 2')).toBe('Nursery');
    expect(classToAgeLevel('Year 3')).toBe('KG1');
    expect(classToAgeLevel('KG2 B')).toBe('KG2');
    expect(classToAgeLevel('Year 5')).toBe('Primary');
    expect(classToAgeLevel('Basic 2')).toBe('KG2');
  });

  it('returns null for unknown/empty classes (never widest)', () => {
    expect(classToAgeLevel('')).toBeNull();
    expect(classToAgeLevel(null)).toBeNull();
    expect(classToAgeLevel(undefined)).toBeNull();
  });
});

describe('filterInBand', () => {
  const lessons = [
    { id: 'a', age_level: 'Nursery' },
    { id: 'b', age_level: 'KG1' },
    { id: 'c', age_level: 'KG2' },
    { id: 'd', age_level: 'Primary' },
    { id: 'e' },
  ];

  it('KG1 child sees only Nursery + KG1 (never above-band)', () => {
    const out = filterInBand(lessons, 'KG1');
    expect(out.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('unknown band → empty (no fallback to all)', () => {
    expect(filterInBand(lessons, null)).toEqual([]);
  });
});

const makeData = (units: PathUnit[]): LearningPathData => ({
  student: { age_band: 'KG1', class_name: 'Year 3' },
  goal: { type: 'weekly', target: 1, done: 1, period_start: '2026-08-31', period_end: '2026-09-06', set_by: 'auto', status: 'done' },
  path: [{ series_id: 's1', name: 'Money & Time', category: 'Numeracy', units }],
});

describe('path marker position', () => {
  it('lands on the first unfinished unit (spill-over recovery leads)', () => {
    const data = makeData([
      unit({ unit_id: 'u-spill', relation: 'spillover', done: false, lessons: [lesson('l1', 'passed')] }),
      unit({ unit_id: 'u-band', relation: 'current', done: false, lessons: [lesson('l2')] }),
      unit({ unit_id: 'u-locked', relation: 'current', done: false, locked: true, locked_reason: 'Finish the previous level first.' }),
    ]);
    expect(currentPositionIndex(data)).toBe(0);
    expect(flattenUnits(data).map((f) => f.unit.unit_id)).toEqual(['u-spill', 'u-band', 'u-locked']);
  });

  it('moves to the current band once all below units are passed', () => {
    const data = makeData([
      unit({ unit_id: 'u-below', relation: 'passed_below', done: true, lessons: [lesson('l1', 'passed')] }),
      unit({ unit_id: 'u-band', relation: 'current', done: false, lessons: [lesson('l2')] }),
    ]);
    expect(currentPositionIndex(data)).toBe(1);
  });

  it('null when every unit is done', () => {
    const data = makeData([
      unit({ unit_id: 'u1', relation: 'current', done: true, lessons: [lesson('l1', 'passed')] }),
    ]);
    expect(currentPositionIndex(data)).toBeNull();
  });
});

describe('lock + click gating', () => {
  it('locked unit is never open even when it has lessons', () => {
    const u = unit({ unit_id: 'u', locked: true, lessons: [lesson('l1')] });
    expect(isUnitOpen(u)).toBe(false);
  });

  it('unlocked (spill-over / passed-below / current) units are open', () => {
    for (const relation of ['spillover', 'passed_below', 'current'] as const) {
      expect(isUnitOpen(unit({ unit_id: 'u', relation, done: relation === 'passed_below' }))).toBe(true);
    }
  });
});

describe('unit stats + modes', () => {
  it('counts passed lessons only', () => {
    const u = unit({
      unit_id: 'u',
      lessons: [lesson('l1', 'passed'), lesson('l2', 'practice_done'), lesson('l3', 'none')],
    });
    expect(unitStats(u)).toEqual({ done: 1, total: 3 });
  });

  it('default mode follows lesson state (E3f gate)', () => {
    expect(defaultModeFor('none')).toBe('practice');
    expect(defaultModeFor('practice_done')).toBe('test');
    expect(defaultModeFor('passed')).toBe('practice');
    expect(defaultModeFor(undefined)).toBe('practice');
  });
});

describe('goal + band divider', () => {
  it('clamps goal percent to 0–100', () => {
    expect(goalPercent({ target: 4, done: 1 } as any)).toBe(25);
    expect(goalPercent({ target: 1, done: 1 } as any)).toBe(100);
    expect(goalPercent({ target: 1, done: 7 } as any)).toBe(100);
    expect(goalPercent(null)).toBe(0);
  });

  it('flags the first current unit only when the series carries below units', () => {
    const data = makeData([
      unit({ unit_id: 'u-spill', relation: 'spillover', done: false }),
      unit({ unit_id: 'u-band', relation: 'current', done: false }),
      unit({ unit_id: 'u-next', relation: 'current', done: false, locked: true }),
    ]);
    expect(isBandStart(data, data.path[0].units[0])).toBe(false);
    expect(isBandStart(data, data.path[0].units[1])).toBe(true);
    expect(isBandStart(data, data.path[0].units[2])).toBe(false);
    expect(isBandStart(data, unit({ unit_id: 'x', relation: 'current' }))).toBe(false);
  });
});
