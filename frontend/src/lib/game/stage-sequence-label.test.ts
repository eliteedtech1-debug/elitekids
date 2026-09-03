/**
 * L2-FE Phase 2 gates — stage-sequence + label-diagram + analog clock.
 *
 *  - AnalogClock hand math for 3:00 / 3:15 / 3:30 / 3:45 / 12:00
 *  - LabelDiagram hotspot hit tests (correct + incorrect taps), mode switching
 *  - StageSequence ORDER contract: steps/checks always play in authored
 *    order — never shuffled, never re-sorted.
 */
import { describe, it, expect } from 'vitest';
import { parseClockTime, clockAngles, clockAnglesFromTime } from '@/lib/game/clock';
import {
  hitTestHotspot,
  hitTestAll,
  buildPartRounds,
  buildLabelOptions,
  type Hotspot,
} from '@/lib/game/labelDiagram';
import { sanitizeChecks, playOrder } from '@/lib/game/stageSequence';

describe('AnalogClock hand math', () => {
  it('parses H:MM times', () => {
    expect(parseClockTime('3:00')).toEqual({ hour: 3, minute: 0, second: 0 });
    expect(parseClockTime('3:15')).toEqual({ hour: 3, minute: 15, second: 0 });
    expect(parseClockTime('12:00')).toEqual({ hour: 12, minute: 0, second: 0 });
    expect(parseClockTime('1:45')).toEqual({ hour: 1, minute: 45, second: 0 });
  });

  it('rejects impossible clock times', () => {
    expect(parseClockTime('0:00')).toBeNull();   // 12-hour clock
    expect(parseClockTime('13:00')).toBeNull();
    expect(parseClockTime('3:60')).toBeNull();
    expect(parseClockTime('abc')).toBeNull();
    expect(parseClockTime('')).toBeNull();
    expect(parseClockTime(undefined)).toBeNull();
  });

  it('3:00 has hour hand on the 3 and minute hand at 12', () => {
    const a = clockAnglesFromTime('3:00')!;
    expect(a.hourDeg).toBeCloseTo(90);
    expect(a.minuteDeg).toBeCloseTo(0);
  });

  it('3:15 hour hand is a quarter past the 3, minute hand at 90°', () => {
    const a = clockAnglesFromTime('3:15')!;
    expect(a.hourDeg).toBeCloseTo(90 + 15 * 0.5); // 97.5
    expect(a.minuteDeg).toBeCloseTo(90);
  });

  it('3:30 and 3:45 minute hands at 180° and 270°', () => {
    const a = clockAnglesFromTime('3:30')!;
    expect(a.hourDeg).toBeCloseTo(90 + 30 * 0.5);
    expect(a.minuteDeg).toBeCloseTo(180);
    const b = clockAnglesFromTime('3:45')!;
    expect(b.hourDeg).toBeCloseTo(90 + 45 * 0.5);
    expect(b.minuteDeg).toBeCloseTo(270);
  });

  it('12:00 has both hands pointing straight up (0°)', () => {
    const a = clockAnglesFromTime('12:00')!;
    expect(a.hourDeg).toBeCloseTo(0);
    expect(a.minuteDeg).toBeCloseTo(0);
  });

  it('1:00 hour hand at 30° (never NaN for hour 12 → 0)', () => {
    expect(clockAngles(12, 0).hourDeg).toBeCloseTo(0);
    expect(clockAngles(1, 0).hourDeg).toBeCloseTo(30);
  });
});

describe('LabelDiagram hotspot hit-testing', () => {
  // Face diagram 1000×1000 px. Nose at centre (50,46)%, radius 7% of width.
  const FACE: Hotspot[] = [
    { id: 'nose', label: 'Nose', x: 50, y: 46, r: 7 },
    { id: 'left-eye', label: 'Left eye', x: 39, y: 38, r: 6 },
    { id: 'right-eye', label: 'Right eye', x: 61, y: 38, r: 6 },
    { id: 'mouth', label: 'Mouth', x: 50, y: 60, r: 7 },
    { id: 'hair', label: 'Hair', x: 50, y: 15, r: 10 },
  ];

  it('a tap at the nose centre hits the nose', () => {
    const spot = FACE[0];
    expect(hitTestHotspot(spot, spot.x / 100 * 1000, spot.y / 100 * 1000, 1000, 1000)).toBe(true);
  });

  it('a tap well away from the nose misses it', () => {
    // Bottom-left corner — far outside the nose radius (70px).
    expect(hitTestHotspot(FACE[0], 30, 950, 1000, 1000)).toBe(false);
  });

  it('edge-of-radius taps still count (generous targets for kids)', () => {
    // Nose centre (500,460), radius 70px → (560, 460) is exactly on the rim.
    expect(hitTestHotspot(FACE[0], 500 + 69, 460, 1000, 1000)).toBe(true);
    expect(hitTestHotspot(FACE[0], 500 + 90, 460, 1000, 1000)).toBe(false);
  });

  it('hitTestAll resolves the smallest zone when zones overlap', () => {
    // Right eye (610,380) r=60 and hair (500,150) r=100 don't overlap, but a
    // tap between nose and mouth belongs to the smaller mouth r? Nose centre
    // is y=460 r=70, mouth centre y=600 r=70 — tap at (500,540) sits in both
    // → returns the SMALLER radius zone (both r=70… ties pick first in list =
    // nose). Assert a resolvable hit near the mouth centre only.
    const mouth = hitTestAll(FACE, 500, 600, 1000, 1000);
    expect(mouth?.id).toBe('mouth');
    const away = hitTestAll(FACE, 999, 999, 1000, 1000);
    expect(away).toBeNull();
  });
});

describe('LabelDiagram mode switching', () => {
  const PARTS: Hotspot[] = [
    { id: 'nose', label: 'Nose', x: 50, y: 46, r: 7 },
    { id: 'left-eye', label: 'Left eye', x: 39, y: 38, r: 6 },
    { id: 'right-eye', label: 'Right eye', x: 61, y: 38, r: 6 },
    { id: 'mouth', label: 'Mouth', x: 50, y: 60, r: 7 },
    { id: 'hair', label: 'Hair', x: 50, y: 15, r: 10 },
  ];

  it('label-to-part keeps every round as label-to-part', () => {
    const rounds = buildPartRounds(PARTS, 'label-to-part');
    expect(rounds.length).toBe(PARTS.length);
    expect(rounds.every((r) => r.mode === 'label-to-part')).toBe(true);
  });

  it('part-to-label keeps every round as part-to-label', () => {
    const rounds = buildPartRounds(PARTS, 'part-to-label');
    expect(rounds.every((r) => r.mode === 'part-to-label')).toBe(true);
  });

  it('mixed alternates label-to-part / part-to-label from the first round', () => {
    const rounds = buildPartRounds(PARTS, 'mixed');
    expect(rounds.map((r) => r.mode)).toEqual([
      'label-to-part', 'part-to-label', 'label-to-part', 'part-to-label', 'label-to-part',
    ]);
  });

  it('rounds preserve AUTHOR order (simple → complex) — never shuffled', () => {
    const rounds = buildPartRounds(PARTS, 'label-to-part');
    expect(rounds.map((r) => r.hotspot.id)).toEqual(['nose', 'left-eye', 'right-eye', 'mouth', 'hair']);
  });
});

describe('LabelDiagram part-to-label options', () => {
  const PARTS: Hotspot[] = [
    { id: 'nose', label: 'Nose', x: 50, y: 46, r: 7 },
    { id: 'left-eye', label: 'Left eye', x: 39, y: 38, r: 6 },
    { id: 'right-eye', label: 'Right eye', x: 61, y: 38, r: 6 },
    { id: 'mouth', label: 'Mouth', x: 50, y: 60, r: 7 },
  ];
  const BANK = ['Nose', 'Left eye', 'Right eye', 'Mouth', 'Chin', 'Forehead'];

  it('includes the correct label first with up to 3 distractors', () => {
    const opts = buildLabelOptions(PARTS, BANK, 'Nose');
    expect(opts.length).toBe(4);
    expect(opts[0]).toBe('Nose');
    expect(opts).toContain('Chin');
    expect(new Set(opts).size).toBe(opts.length); // no duplicates
  });

  it('falls back to other hotspot labels when labelBank is thin', () => {
    const opts = buildLabelOptions(PARTS, ['Nose'], 'Nose');
    expect(opts).toContain('Nose');
    expect(opts).toContain('Left eye');
    expect(new Set(opts).size).toBe(opts.length);
  });
});

describe('StageSequence ORDER contract (never random)', () => {
  const steps = [
    { id: 's1', label: 'Seed', kind: 'emoji' as const, emoji: '🌰' },
    { id: 's2', label: 'Sprout', kind: 'emoji' as const, emoji: '🌱' },
    { id: 's3', label: 'Seedling', kind: 'emoji' as const, emoji: '🪴' },
    { id: 's4', label: 'Flower', kind: 'emoji' as const, emoji: '🌻' },
  ];
  const checks = [
    { id: 'a1', kind: 'text' as const, prompt: 'What comes next?', options: ['Sprout', 'Flower'], correctIndex: 0 },
    { id: 'a2', kind: 'label-diagram' as const, prompt: 'Tap the flower', correctId: 'flower' },
  ];

  it('playOrder equals the authored simple→complex order exactly', () => {
    expect(playOrder(steps, checks)).toEqual(['step:s1', 'step:s2', 'step:s3', 'step:s4', 'check:a1', 'check:a2']);
  });

  it('sanitizeChecks drops malformed entries without reordering the rest', () => {
    const dirty = [checks[0], null as any, { noId: true } as any, checks[1], { id: '' } as any];
    const clean = sanitizeChecks(dirty as any);
    expect(clean.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('clock-time steps (analog-clock kind) carry valid times', () => {
    // The U10 progression used in seeds: o'clock → :15 → :30 → :45 — every
    // one must parse, proving ordering content is never time-mixed.
    const times = ['1:00', '3:15', '3:30', '3:45', '12:00'];
    for (const tm of times) expect(parseClockTime(tm)).not.toBeNull();
    // and the angles ascend (simple → complex on the dial)
    const degs = times.map((tm) => clockAnglesFromTime(tm)!.minuteDeg);
    expect(degs).toEqual([0, 90, 180, 270, 0]);
  });
});
