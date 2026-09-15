'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAnimalsGenerator() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seed-animals-series.js'), 'utf8');
  const marker = 'async function seed() {';
  const cut = source.indexOf(marker);
  if (cut < 0) throw new Error('Animals seed structure changed: seed function not found');
  const runnable = `${source.slice(0, cut)}\nmodule.exports = { genConfig, templatesForAge, UNITS };`;
  const sandbox = {
    require: (name) => {
      if (name === 'uuid') return { v4: () => 'test-uuid' };
      if (name === '../src/models') return { sequelize: { config: { database: '' } } };
      if (name === '../lib/db-drop-guard') return { assertDestructiveTarget: () => {} };
      return require(name);
    },
    module: { exports: {} },
    exports: {},
    process,
    console,
  };
  vm.runInNewContext(runnable, sandbox, { filename: 'seed-animals-series.js' });
  return sandbox.module.exports;
}

const { CATALOG, buildCatalogConfig } = require('../src/seeders/globalCatalogSeed');

describe('Crèche Animals content contract', () => {
  test('non-tap Crèche rounds carry concrete context and playable choices', () => {
    const { genConfig, templatesForAge, UNITS } = loadAnimalsGenerator();
    for (const unit of UNITS.filter((candidate) => candidate.ageBands.includes('creche'))) {
      expect(templatesForAge(unit, 'creche')).not.toContain('fill-in-blank');
      for (const template of templatesForAge(unit, 'creche')) {
        const config = genConfig(unit, 'creche', template);
        expect(config.scenario).toEqual(expect.any(String));
        expect(config.scenario.length).toBeGreaterThan(20);
        expect(config.assessment).toBe('adult observation');
        if (template === 'matching') {
          expect(config.pairs.length).toBeGreaterThanOrEqual(3);
          expect(config.prompt).toBe('Match each animal picture to its name.');
          expect(config.pairs.every((pair) => typeof pair.a === 'string' && pair.a.startsWith('data:image/'))).toBe(true);
          expect(config.pairs.every((pair) => pair.b && !String(pair.b).includes('Moo') && !String(pair.b).includes('Roar'))).toBe(true);
        }
        if (template === 'drag-sort') expect(config.items.length).toBeGreaterThanOrEqual(3);
        if (template === 'quiz') {
          expect(config.options.length).toBeGreaterThanOrEqual(2);
          expect(config.correctId).toBe(config.options[0].id);
        }
      }
    }
  });
});

describe('global Crèche catalog content contract', () => {
  test('uses adult-observation tap metadata and visual answer choices', () => {
    const crecheEntries = CATALOG.filter((entry) => entry.game_age_level === 'Creche');
    expect(crecheEntries).toHaveLength(2);
    for (const entry of crecheEntries) {
      const config = buildCatalogConfig(entry);
      expect(config.assessment).toBe('adult observation');
      expect(config.inputMode).toBe('tap');
      expect(config.promptMode).toBe('context');
      expect(config.responseMode).toBe('image');
      expect(config.questions).toHaveLength(5);
      expect(config.questions.every((question) => question.scenario && question.options.every((option) => option.emoji))).toBe(true);
    }
  });
});
