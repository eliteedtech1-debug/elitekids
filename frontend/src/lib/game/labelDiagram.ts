/**
 * Label-diagram round logic — pure functions, no React/browser deps.
 * Shared by the LabelDiagram component (game + embedded TapPartCheck) and the
 * vitest suite (hotspot hit tests, mode switching, option building).
 */

export interface Hotspot {
  id: string;
  label: string;
  /** Part centre X as percent of diagram width. */
  x: number;
  /** Part centre Y as percent of diagram height. */
  y: number;
  /** Hit-zone radius as percent of diagram width (generous for nursery). */
  r: number;
  emoji?: string;
}

export type DiagramMode = 'label-to-part' | 'part-to-label' | 'mixed';

export type RoundMode = 'label-to-part' | 'part-to-label';

export interface PartRound {
  hotspot: Hotspot;
  mode: RoundMode;
}

/**
 * True when a tap at (px, py) px within a boxW×boxH px diagram hits the
 * hotspot. x/y are percents of the box; r is a percent of the WIDTH.
 */
export function hitTestHotspot(spot: Hotspot, px: number, py: number, boxW: number, boxH: number): boolean {
  if (!boxW || !boxH) return false;
  const cx = (spot.x / 100) * boxW;
  const cy = (spot.y / 100) * boxH;
  const radius = Math.max(1, (spot.r / 100) * boxW);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Which hotspot (if any) a px tap landed on. */
export function hitTestAll(
  hotspots: Hotspot[],
  px: number,
  py: number,
  boxW: number,
  boxH: number,
): Hotspot | null {
  // Prefer the smallest hit zone when zones overlap (precision beats size).
  let best: Hotspot | null = null;
  let bestR = Infinity;
  for (const spot of hotspots) {
    if (hitTestHotspot(spot, px, py, boxW, boxH) && spot.r < bestR) {
      best = spot;
      bestR = spot.r;
    }
  }
  return best;
}

/**
 * Build the round list: every hotspot in AUTHOR order (simple → complex,
 * never shuffled) with label-to-part/part-to-label derived from config.mode.
 * `mixed` alternates the interaction every round starting with label-to-part.
 */
export function buildPartRounds(hotspots: Hotspot[], mode: DiagramMode = 'mixed', limit?: number): PartRound[] {
  const pool = hotspots || [];
  const list = pool.map((hotspot, i) => {
    let roundMode: RoundMode = 'label-to-part';
    if (mode === 'part-to-label') roundMode = 'part-to-label';
    else if (mode === 'mixed') roundMode = i % 2 === 0 ? 'label-to-part' : 'part-to-label';
    return { hotspot, mode: roundMode };
  });
  if (typeof limit === 'number' && limit >= 1) return list.slice(0, limit);
  return list;
}

/**
 * Part-to-label option chips: correct label + up to `max-1` distractors.
 * Distractors that are NOT other visible diagram parts are preferred — a part
 * not on the picture can never be eliminated by process of elimination.
 */
export function buildLabelOptions(hotspots: Hotspot[], labelBank: string[], correctLabel: string, max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (label: string) => {
    const norm = String(label || '').trim();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };
  const hotspotLabels = new Set((hotspots || []).map((h) => String(h.label || '').trim()).filter(Boolean));
  const isDiagramPart = (label: string) => hotspotLabels.has(String(label || '').trim());
  push(correctLabel);
  const pool = (labelBank || []).filter((b) => String(b || '').trim() !== String(correctLabel || '').trim());
  // 1) outside distractors first, 2) other visible parts, 3) anything left.
  for (const entry of pool) {
    if (isDiagramPart(entry)) continue;
    push(entry);
    if (out.length >= max) return out;
  }
  for (const entry of pool) {
    if (!isDiagramPart(entry)) continue;
    push(entry);
    if (out.length >= max) return out;
  }
  // Fallback: other hotspot labels when labelBank is thin.
  for (const h of hotspots || []) {
    push(h.label);
    if (out.length >= max) return out;
  }
  return out;
}
