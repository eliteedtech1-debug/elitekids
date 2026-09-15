'use strict';

const { UNITS, buildConfig } = require('../src/seeders/jollyPhonicsSeriesSeed');

describe('Crèche Jolly Phonics contract', () => {
  test('builds one explicit ID-based round per sound', () => {
    const unit = UNITS.find((candidate) => candidate.unit_number === 1);
    const game = unit.games.find((candidate) => candidate.template === 'tap-recognition');
    const config = buildConfig(unit, game);

    expect(config.inputMode).toBe('tap');
    expect(config.rounds).toHaveLength(game.items.length);
    expect(config.rounds.every((round) => round.correctId && round.items.length === game.items.length)).toBe(true);
    expect(new Set(config.rounds.map((round) => round.correctId))).toEqual(new Set(game.items.map((item) => item.id)));
    expect(config.rounds.every((round) => round.question.includes('Which letter matches?'))).toBe(true);
  });
});
