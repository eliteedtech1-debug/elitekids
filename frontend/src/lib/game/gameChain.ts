/**
 * gameChain — pure helpers for the `game-chain` template (heterogeneous
 * ordered rounds: one lesson plays a sequence of whole sub-games, simple →
 * complex, NEVER shuffled). Unit-tested here so GamePlay's renderer stays
 * thin. Mirrors game-engine/schemas/game-chain.schema.json + the backend
 * gameConfigRules gameChainErrors contract.
 */
import type { GameMode } from '@/lib/utils/learningPath';

/** Sub-game templates allowed inside a game-chain round (schema enum). */
export const CHAIN_ROUND_TEMPLATES = [
  'matching',
  'tap-recognition',
  'drag-sort',
  'quiz',
  'fill-in-blank',
  'memory-pairs',
  'label-diagram',
  'stage-sequence',
] as const;

export type ChainRoundTemplate = (typeof CHAIN_ROUND_TEMPLATES)[number];

export interface GameChainRound {
  id: string;
  label?: string;
  template: string;
  config: Record<string, unknown>;
}

export interface GameChainConfigShape {
  gameId?: string;
  template: 'game-chain';
  lessonId?: string;
  ageLevel?: string;
  category?: string;
  tier?: number;
  item_id?: string;
  scenario?: string;
  speechText?: string;
  characters?: { name: string; image?: string | null; emoji?: string; personality?: string }[];
  rounds: GameChainRound[];
  rewards?: { starsOnComplete: number; xp: number };
  successThresholdPct?: number;
  [key: string]: unknown;
}

/** Rounds that are well-formed enough to play (id + template + object config). */
export function sanitizeRounds(rounds: unknown): GameChainRound[] {
  if (!Array.isArray(rounds)) return [];
  return rounds
    .filter(
      (r): r is GameChainRound =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as GameChainRound).id === 'string' &&
        typeof (r as GameChainRound).template === 'string' &&
        (r as GameChainRound).config &&
        typeof (r as GameChainRound).config === 'object' &&
        !Array.isArray((r as GameChainRound).config),
    )
    .map((r) => ({ ...r, template: r.template, config: r.config }));
}

/** True when a round's template has a dedicated renderer. */
export function isChainRoundTemplate(t: string): t is ChainRoundTemplate {
  return (CHAIN_ROUND_TEMPLATES as readonly string[]).includes(t);
}

/** Number of scorable items in a single round (mirrors GamePlay totalPossible). */
export function roundCountFor(round: GameChainRound): number {
  const c = (round.config || {}) as Record<string, unknown>;
  switch (round.template) {
    case 'matching':
      return Array.isArray(c.pairs) ? c.pairs.length : 0;
    case 'tap-recognition':
      return Array.isArray(c.items) ? c.items.length : 0;
    case 'drag-sort':
      return Array.isArray(c.items) ? c.items.length : 0;
    case 'quiz':
      return Array.isArray(c.questions) ? c.questions.length : Array.isArray(c.options) ? 1 : 0;
    case 'fill-in-blank':
      return Array.isArray(c.blanks) ? c.blanks.length : Array.isArray(c.sentences) ? c.sentences.length : 0;
    case 'memory-pairs':
      return Array.isArray(c.items) ? Math.floor(c.items.length / 2) : 0;
    case 'puzzle-split':
      return Array.isArray(c.pieces) ? c.pieces.length : 0;
    case 'label-diagram':
      return Array.isArray(c.hotspots) ? c.hotspots.length : 0;
    case 'stage-sequence':
      return Array.isArray(c.assessment) ? c.assessment.length : 1;
    default:
      return 0;
  }
}

/** Total scorable items across all rounds (drives the result % screen). */
export function chainTotalPossible(rounds: GameChainRound[]): number {
  return rounds.reduce((sum, r) => sum + roundCountFor(r), 0);
}

export type { GameMode };