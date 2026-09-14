'use strict';

const {
  validateManualConfig,
  playableItemCount,
  playableItemErrors,
  CHAIN_ROUND_TEMPLATES,
} = require('../src/services/gameConfigRules');

function base(template, extra = {}) {
  return {
    gameId: `game-${template}`,
    template,
    lessonId: 'LESSON-CHAIN-1',
    ageLevel: 'KG2',
    category: 'Numeracy',
    tier: 1,
    item_id: `item-${template}`,
    rewards: { starsOnComplete: 3, xp: 50 },
    successThresholdPct: 70,
    ...extra,
  };
}

function matchingConfig() {
  const items = [];
  for (let i = 1; i <= 5; i += 1) {
    items.push({ id: `a${i}`, image: `a${i}.webp`, matches: `b${i}` });
    items.push({ id: `b${i}`, image: `b${i}.webp`, matches: `a${i}` });
  }
  return base('matching', { assets: { background: 'market', items } });
}

function puzzleConfig() {
  const pieces = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i + 1}`,
    row: Math.floor(i / 3),
    col: i % 3,
    imageUrl: `p${i + 1}.webp`,
  }));
  const level = (label) => ({
    pieces,
    grid: { rows: 2, cols: 3 },
    pieceSize: { width: 100, height: 100 },
    label,
    emoji: '⭐',
    minAge: 'KG2',
  });
  return base('puzzle-split', {
    originalImageUrl: 'market.webp',
    difficulties: {
      easy: level('Easy'),
      medium: level('Medium'),
      hard: level('Hard'),
      expert: level('Expert'),
    },
  });
}

describe('gameConfigRules playable-item contract', () => {
  test('counts matching logical pairs rather than visual cards', () => {
    const config = matchingConfig();
    expect(playableItemCount('matching', config)).toBe(5);
    expect(playableItemErrors('matching', config)).toEqual([]);
  });

  test('accepts puzzle-split as a complete 5–10 item component', () => {
    const config = puzzleConfig();
    expect(playableItemErrors('puzzle-split', config)).toEqual([]);
  });

  test('rejects an under-sized standalone component', () => {
    const config = matchingConfig();
    config.assets.items = config.assets.items.slice(0, 8);
    expect(playableItemErrors('matching', config)[0]).toMatch(/5-10 logical playable items/);
  });

  test('allows a chain to contain multiple complete components without summing them into one 5–10 cap', () => {
    const chain = base('game-chain', {
      rounds: [
        { id: 'match', template: 'matching', config: matchingConfig() },
        { id: 'puzzle', template: 'puzzle-split', config: puzzleConfig() },
      ],
    });
    const result = validateManualConfig('game-chain', chain);
    expect(result.valid).toBe(true);
    expect(CHAIN_ROUND_TEMPLATES).toContain('puzzle-split');
  });

  test('rejects a chain component that is too small', () => {
    const tooSmall = matchingConfig();
    tooSmall.assets.items = tooSmall.assets.items.slice(0, 8);
    const chain = base('game-chain', {
      rounds: [
        { id: 'match', template: 'matching', config: tooSmall },
        { id: 'puzzle', template: 'puzzle-split', config: puzzleConfig() },
      ],
    });
    const result = validateManualConfig('game-chain', chain);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/round\[0\].*5-10 logical playable items/);
  });

  test('rejects nested game-chain components', () => {
    const chain = base('game-chain', {
      rounds: [
        { id: 'nested', template: 'game-chain', config: base('game-chain', { rounds: [] }) },
        { id: 'match', template: 'matching', config: matchingConfig() },
      ],
    });
    const result = validateManualConfig('game-chain', chain);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/invalid sub-template "game-chain"/);
  });
});
