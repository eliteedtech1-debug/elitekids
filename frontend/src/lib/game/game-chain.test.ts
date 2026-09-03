import { describe, it, expect } from 'vitest';
import {
  CHAIN_ROUND_TEMPLATES,
  sanitizeRounds,
  isChainRoundTemplate,
  roundCountFor,
  chainTotalPossible,
} from './gameChain';

const rounds = [
  { id: 'r1', label: 'Sort the shapes', template: 'drag-sort', config: { items: [{ num: 1 }, { num: 2 }, { num: 3 }] } },
  { id: 'r2', label: 'Label the face', template: 'label-diagram', config: { hotspots: [{ id: 'a' }, { id: 'b' }] } },
  { id: 'r3', label: 'Tap the 3 o’clock', template: 'stage-sequence', config: { assessment: [{ id: 'q1' }, { id: 'q2' }] } },
];

describe('gameChain helpers', () => {
  it('exposes the 8 allowed chain-round templates (mirrors schema + backend)', () => {
    expect(CHAIN_ROUND_TEMPLATES).toEqual([
      'matching',
      'tap-recognition',
      'drag-sort',
      'quiz',
      'fill-in-blank',
      'memory-pairs',
      'label-diagram',
      'stage-sequence',
    ]);
    // No recursion / no puzzle-split (schema excludes both).
    expect(isChainRoundTemplate('game-chain')).toBe(false);
    expect(isChainRoundTemplate('puzzle-split')).toBe(false);
  });

  it('keeps round order untouched (simple → complex is the pedagogy — never shuffled)', () => {
    const out = sanitizeRounds(rounds);
    expect(out.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(out.map((r) => r.template)).toEqual(['drag-sort', 'label-diagram', 'stage-sequence']);
  });

  it('drops malformed rounds without throwing', () => {
    const mixed: unknown[] = [
      { id: 'ok', template: 'quiz', config: { questions: [] } },
      { id: 'no-config', template: 'quiz' },
      'string',
      null,
      { template: 'matching', config: {} }, // missing id
      { id: 'no-tpl', config: {} },
      { id: 'array-config', template: 'quiz', config: [] }, // config must be object
    ];
    const out = sanitizeRounds(mixed);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('ok');
  });

  it('counts scorable items per round by template', () => {
    expect(roundCountFor(rounds[0])).toBe(3); // drag-sort items
    expect(roundCountFor(rounds[1])).toBe(2); // label-diagram hotspots
    expect(roundCountFor(rounds[2])).toBe(2); // stage-sequence assessment
    expect(roundCountFor({ id: 'x', template: 'quiz', config: { options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } })).toBe(1);
    expect(roundCountFor({ id: 'y', template: 'memory-pairs', config: { items: [{}, {}, {}, {}] } })).toBe(2);
    expect(roundCountFor({ id: 'z', template: 'bogus', config: {} })).toBe(0);
  });

  it('sums round counts for the result % screen', () => {
    expect(chainTotalPossible(rounds)).toBe(7);
    expect(chainTotalPossible([])).toBe(0);
  });
});