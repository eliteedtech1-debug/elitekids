/**
 * Stage-sequence types + pure helpers — no React/browser deps so vitest can
 * assert the ORDER contract directly (steps/checks iterate by index only;
 * nothing in the pipeline may shuffle, sort or randomise them).
 */

export interface SequenceStep {
  id: string;
  label: string;
  narration?: string;
  kind: 'image' | 'analog-clock' | 'emoji';
  image?: string;
  time?: string;
  emoji?: string;
  durationSec?: number;
}

export interface HotspotLike {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
  emoji?: string;
}

export interface SequenceCheck {
  id: string;
  prompt?: string;
  kind: 'text' | 'analog-clock' | 'image' | 'label-diagram';
  time?: string;
  image?: string;
  diagram?: { image?: string; alt?: string; background?: string };
  hotspots?: HotspotLike[];
  correctId?: string;
  options?: string[];
  correctIndex?: number;
  hint?: string;
  speechText?: string;
}

export interface StageSequenceConfigShape {
  template: string;
  lessonId?: string;
  topic?: string;
  steps?: SequenceStep[];
  assessment?: SequenceCheck[];
  scenario?: string;
  hint?: string;
  speechText?: string;
  characters?: { name: string; emoji?: string; image?: string }[];
  ageLevel?: string;
}

/** Step kinds accepted by the renderer. */
export function isStepKind(kind: unknown): kind is SequenceStep['kind'] {
  return kind === 'image' || kind === 'analog-clock' || kind === 'emoji';
}

/** Guard: strip any entry that is not a usable check (configs are validated
 * server-side at save time; this is a renderer-level backstop). Never changes
 * the ORDER of the surviving checks. */
export function sanitizeChecks(raw: SequenceCheck[] | undefined): SequenceCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === 'object' && (c as any).id);
}

/**
 * ORDER CONTRACT: the sequence of ids that will be PLAYED. If this ever
 * differs from the authored order, order is being lost. Used by tests to
 * assert steps/checks are never shuffled.
 */
export function playOrder(steps: SequenceStep[] | undefined, checks: SequenceCheck[] | undefined): string[] {
  const ids: string[] = [];
  for (const s of steps || []) if (s && s.id) ids.push(`step:${s.id}`);
  for (const c of checks || []) if (c && c.id) ids.push(`check:${c.id}`);
  return ids;
}
