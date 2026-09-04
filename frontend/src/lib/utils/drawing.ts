/**
 * Pure drawing geometry for the Q2 drawing FE leaf (Q26, Q2-G).
 *
 * NO TensorFlow.js, NO backend — everything here is deterministic canvas
 * geometry (stroke-on-path %, bounding-box IoU, resampling) so Q2-C can plug
 * a real recognition engine in later without touching the components.
 * All helpers are pure and exported for vitest.
 */

export interface Pt {
  x: number;
  y: number;
}

/** A stroke = an ordered list of points. Coordinates are NORMALIZED 0–1
 * (relative to the drawing surface), so geometry is size-independent. */
export type Stroke = Pt[];

// ── Distance / geometry primitives ─────────────────────────────────────────

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Closest distance from point p to segment a–b. */
export function pointSegmentDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Closest distance from point p to a polyline path. */
export function pointPathDist(p: Pt, path: Stroke): number {
  if (!path.length) return Infinity;
  if (path.length === 1) return dist(p, path[0]);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    best = Math.min(best, pointSegmentDist(p, path[i], path[i + 1]));
  }
  return best;
}

// ── Resampling ─────────────────────────────────────────────────────────────

/** Resample a stroke to exactly `n` evenly spaced points (rate-independent
 * comparison; a slow careful trace and a quick scribble map alike). */
export function resampleStroke(stroke: Stroke, n = 40): Stroke {
  if (!stroke.length) return [];
  if (stroke.length === 1) return Array.from({ length: n }, () => stroke[0]);

  const total = stroke.reduce((acc, p, i) => (i === 0 ? 0 : acc + dist(stroke[i - 1], p)), 0);
  if (total === 0) return Array.from({ length: n }, () => stroke[0]);

  const out: Pt[] = [stroke[0]];
  const targetGap = total / (n - 1);
  let nextDist = targetGap; // absolute distance along the stroke for the next sample
  let segStart = stroke[0];

  for (let i = 1; i < stroke.length && out.length < n; i++) {
    const segEnd = stroke[i];
    const segLen = dist(segStart, segEnd);
    // walk this segment until the next sample falls inside it or the segment ends
    while (nextDist <= segLen && out.length < n) {
      const t = nextDist / segLen;
      out.push({ x: segStart.x + (segEnd.x - segStart.x) * t, y: segStart.y + (segEnd.y - segStart.y) * t });
      nextDist += targetGap;
    }
    nextDist -= segLen; // carry the leftover distance into the next segment
    segStart = segEnd;
  }
  // pad if the stroke ran out of points early
  while (out.length < n) out.push(segStart);
  out[out.length - 1] = stroke[stroke.length - 1];
  return out;
}

// ── Coverage (stroke-on-path %) ────────────────────────────────────────────

/** Fraction (0–1) of the kid's resampled stroke points that fall within
 * `tolerance` (normalized units, default 0.06 ≈ 6% of the surface) of the
 * target path. This is the primary "did you stay on the line?" metric. */
export function strokeCoverage(kid: Stroke, target: Stroke, tolerance = 0.06): number {
  if (!kid.length || !target.length) return 0;
  const samples = resampleStroke(kid, 40);
  let hit = 0;
  for (const p of samples) {
    if (pointPathDist(p, target) <= tolerance) hit++;
  }
  return hit / samples.length;
}

// ── Bounding-box IoU ───────────────────────────────────────────────────────

function bbox(stroke: Stroke): { x: number; y: number; w: number; h: number } | null {
  if (!stroke.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of stroke) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function area(b: { x: number; y: number; w: number; h: number }): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function intersectArea(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

/** Bounding-box IoU (0–1) between two strokes — "did you draw in the right place". */
export function bboxIoU(a: Stroke, b: Stroke): number {
  const ba = bbox(a);
  const bb = bbox(b);
  if (!ba || !bb) return 0;
  const inter = intersectArea(ba, bb);
  const union = area(ba) + area(bb) - inter;
  return union <= 0 ? 0 : inter / union;
}

// ── Deterministic scoring ──────────────────────────────────────────────────

export interface DrawingScore {
  /** 0–100 composite. */
  overall: number;
  /** 0–1 stroke-on-path coverage (primary). */
  coverage: number;
  /** 0–1 bounding-box IoU (secondary). */
  iou: number;
  /** 1–3 stars (mirrors the band thresholds used elsewhere). */
  stars: 1 | 2 | 3;
  /** Child-safe feedback emoji. */
  emoji: string;
}

/** Score a kid's strokes vs a target path. Deterministic, no ML. */
export function scoreDrawing(kid: Stroke, target: Stroke): DrawingScore {
  if (!kid.length || !target.length) {
    return { overall: 0, coverage: 0, iou: 0, stars: 1, emoji: '🌱' };
  }
  const coverage = strokeCoverage(kid, target);
  const iou = bboxIoU(kid, target);
  // coverage dominates (staying on the line matters most); iou rewards placement
  const overall = Math.round(coverage * 100 * 0.8 + iou * 100 * 0.2);
  const clamped = Math.max(0, Math.min(100, overall));
  let stars: 1 | 2 | 3 = 1;
  let emoji = '🌱';
  if (clamped >= 85) { stars = 3; emoji = '🌟'; }
  else if (clamped >= 60) { stars = 2; emoji = '😊'; }
  else emoji = '💪';
  return { overall: clamped, coverage, iou, stars, emoji };
}

// ── Built-in trace paths (normalized 0–1) ──────────────────────────────────

/** Simple shapes + digits 0–9 as polylines kids trace over. */
export const TRACE_PATHS: Record<string, Stroke> = {
  circle: Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x: 0.5 + 0.35 * Math.cos(a), y: 0.5 + 0.35 * Math.sin(a) };
  }),
  square: [
    { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }, { x: 0.2, y: 0.2 },
  ],
  triangle: [
    { x: 0.5, y: 0.15 }, { x: 0.85, y: 0.85 }, { x: 0.15, y: 0.85 }, { x: 0.5, y: 0.15 },
  ],
  star: [
    { x: 0.5, y: 0.1 }, { x: 0.58, y: 0.38 }, { x: 0.88, y: 0.38 }, { x: 0.63, y: 0.55 },
    { x: 0.72, y: 0.85 }, { x: 0.5, y: 0.67 }, { x: 0.28, y: 0.85 }, { x: 0.37, y: 0.55 },
    { x: 0.12, y: 0.38 }, { x: 0.42, y: 0.38 }, { x: 0.5, y: 0.1 },
  ],
  heart: [
    { x: 0.5, y: 0.78 }, { x: 0.34, y: 0.6 }, { x: 0.22, y: 0.42 }, { x: 0.24, y: 0.26 },
    { x: 0.4, y: 0.2 }, { x: 0.5, y: 0.32 }, { x: 0.6, y: 0.2 }, { x: 0.76, y: 0.26 },
    { x: 0.78, y: 0.42 }, { x: 0.66, y: 0.6 }, { x: 0.5, y: 0.78 },
  ],
  '0': [
    { x: 0.5, y: 0.2 }, { x: 0.35, y: 0.25 }, { x: 0.3, y: 0.5 }, { x: 0.35, y: 0.78 },
    { x: 0.5, y: 0.85 }, { x: 0.65, y: 0.78 }, { x: 0.7, y: 0.5 }, { x: 0.65, y: 0.25 }, { x: 0.5, y: 0.2 },
  ],
  '1': [
    { x: 0.55, y: 0.85 }, { x: 0.55, y: 0.3 }, { x: 0.45, y: 0.38 }, { x: 0.55, y: 0.2 },
  ],
  '2': [
    { x: 0.3, y: 0.35 }, { x: 0.35, y: 0.25 }, { x: 0.65, y: 0.22 }, { x: 0.7, y: 0.4 },
    { x: 0.62, y: 0.55 }, { x: 0.3, y: 0.82 }, { x: 0.72, y: 0.82 },
  ],
  '3': [
    { x: 0.35, y: 0.25 }, { x: 0.65, y: 0.28 }, { x: 0.52, y: 0.5 }, { x: 0.66, y: 0.68 },
    { x: 0.6, y: 0.82 }, { x: 0.35, y: 0.8 },
  ],
  '4': [
    { x: 0.62, y: 0.85 }, { x: 0.62, y: 0.25 }, { x: 0.32, y: 0.68 }, { x: 0.75, y: 0.68 },
  ],
  '5': [
    { x: 0.68, y: 0.25 }, { x: 0.32, y: 0.25 }, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.55 },
    { x: 0.66, y: 0.68 }, { x: 0.58, y: 0.82 }, { x: 0.34, y: 0.8 },
  ],
  '6': [
    { x: 0.62, y: 0.22 }, { x: 0.38, y: 0.35 }, { x: 0.32, y: 0.6 }, { x: 0.42, y: 0.8 },
    { x: 0.58, y: 0.78 }, { x: 0.62, y: 0.6 }, { x: 0.5, y: 0.52 }, { x: 0.35, y: 0.55 },
  ],
  '7': [
    { x: 0.3, y: 0.25 }, { x: 0.68, y: 0.25 }, { x: 0.45, y: 0.55 }, { x: 0.45, y: 0.85 },
  ],
  '8': [
    { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.32 }, { x: 0.6, y: 0.3 }, { x: 0.62, y: 0.5 },
    { x: 0.4, y: 0.55 }, { x: 0.38, y: 0.72 }, { x: 0.58, y: 0.76 }, { x: 0.62, y: 0.55 },
  ],
  '9': [
    { x: 0.62, y: 0.82 }, { x: 0.62, y: 0.55 }, { x: 0.5, y: 0.5 }, { x: 0.38, y: 0.62 },
    { x: 0.4, y: 0.78 }, { x: 0.58, y: 0.8 },
  ],
};

/** Ordered demo list for the /student/drawing?mode=demo harness. */
export const DEMO_TRACES = ['circle', 'square', 'triangle', 'star', 'heart', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Normalize raw canvas points (px, from a w×h surface) to 0–1. */
export function normalizeStroke(raw: Array<{ x: number; y: number }>, w: number, h: number): Stroke {
  if (!w || !h) return [];
  return raw.map((p) => ({ x: Math.max(0, Math.min(1, p.x / w)), y: Math.max(0, Math.min(1, p.y / h)) }));
}