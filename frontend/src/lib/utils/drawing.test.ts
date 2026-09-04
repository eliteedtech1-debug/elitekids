/**
 * Q26 drawing FE leaf — pure geometry tests (no DOM, no ML, no backend).
 */
import { describe, it, expect } from 'vitest';
import {
  dist,
  pointSegmentDist,
  pointPathDist,
  resampleStroke,
  strokeCoverage,
  bboxIoU,
  scoreDrawing,
  normalizeStroke,
  TRACE_PATHS,
  DEMO_TRACES,
  type Stroke,
} from '@/lib/utils/drawing';

describe('geometry primitives', () => {
  it('dist is euclidean', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('pointSegmentDist handles ends + perpendicular', () => {
    // on-segment point → 0
    expect(pointSegmentDist({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 2 })).toBeCloseTo(0);
    // beyond the end → distance to endpoint
    expect(pointSegmentDist({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(5);
    // perpendicular above a horizontal segment
    expect(pointSegmentDist({ x: 0.5, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(1);
  });

  it('pointPathDist is min over segments', () => {
    const path: Stroke = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(pointPathDist({ x: 0.5, y: 0.5 }, path)).toBeCloseTo(0.5);
  });
});

describe('resampleStroke', () => {
  it('returns n evenly spaced samples with same endpoints', () => {
    const stroke: Stroke = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const out = resampleStroke(stroke, 20);
    expect(out).toHaveLength(20);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 0, y: 1 });
    // consecutive gaps roughly uniform
    let min = Infinity, max = -Infinity;
    for (let i = 1; i < out.length; i++) {
      const d = dist(out[i - 1], out[i]);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    expect(max - min).toBeLessThan(0.05);
  });

  it('handles empty and single-point strokes', () => {
    expect(resampleStroke([])).toEqual([]);
    expect(resampleStroke([{ x: 0.5, y: 0.5 }], 5)).toHaveLength(5);
  });
});

describe('strokeCoverage', () => {
  it('perfect trace ≈ full coverage', () => {
    const target = TRACE_PATHS.circle;
    const kid = resampleStroke(target, 40);
    expect(strokeCoverage(kid, target)).toBeGreaterThan(0.95);
  });

  it('far-away scribble ≈ zero coverage', () => {
    const target = TRACE_PATHS.circle;
    const kid: Stroke = [{ x: 0.05, y: 0.05 }, { x: 0.08, y: 0.08 }, { x: 0.1, y: 0.12 }];
    expect(strokeCoverage(kid, target, 0.06)).toBe(0);
  });

  it('empty inputs → 0', () => {
    expect(strokeCoverage([], TRACE_PATHS.square)).toBe(0);
    expect(strokeCoverage([{ x: 0.5, y: 0.5 }], [])).toBe(0);
  });
});

describe('bboxIoU', () => {
  it('identical boxes → 1', () => {
    const a: Stroke = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }];
    expect(bboxIoU(a, a)).toBeCloseTo(1);
  });

  it('disjoint boxes → 0', () => {
    const a: Stroke = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }];
    const b: Stroke = [{ x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }];
    expect(bboxIoU(a, b)).toBe(0);
  });

  it('empty → 0', () => {
    expect(bboxIoU([], [{ x: 0.5, y: 0.5 }])).toBe(0);
  });
});

describe('scoreDrawing', () => {
  it('great trace → 3 stars', () => {
    const target = TRACE_PATHS.triangle;
    const kid = resampleStroke(target, 40);
    const s = scoreDrawing(kid, target);
    expect(s.stars).toBe(3);
    expect(s.overall).toBeGreaterThanOrEqual(85);
  });

  it('scribble → 1 star + low overall', () => {
    const s = scoreDrawing([{ x: 0.05, y: 0.05 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.1 }], TRACE_PATHS.circle);
    expect(s.stars).toBe(1);
    expect(s.overall).toBeLessThan(60);
  });

  it('empty input → 1 star, 0 overall', () => {
    const s = scoreDrawing([], TRACE_PATHS.circle);
    expect(s).toMatchObject({ overall: 0, stars: 1 });
  });
});

describe('normalizeStroke', () => {
  it('maps px to 0–1 clamped', () => {
    expect(normalizeStroke([{ x: 0, y: 0 }, { x: 100, y: 50 }], 200, 100)).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it('empty surface → []', () => {
    expect(normalizeStroke([{ x: 1, y: 1 }], 0, 0)).toEqual([]);
  });
});

describe('trace path catalog', () => {
  it('every demo trace exists and has ≥ 3 points within 0–1', () => {
    for (const key of DEMO_TRACES) {
      const p = TRACE_PATHS[key];
      expect(p.length, key).toBeGreaterThanOrEqual(3);
      for (const pt of p) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
      }
    }
  });
});