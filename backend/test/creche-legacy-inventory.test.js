'use strict';

const {
  MAX_PAGE_SIZE,
  MAX_ROWS,
  classifyRow,
  collectInventory,
  hashConfig,
  parseArgs,
  parseConfig,
  summarizeRow,
} = require('../scripts/inventory-creche-legacy');

function row(overrides = {}) {
  return {
    id: 'legacy-1',
    lesson_id: 'lesson-1',
    template: 'tap-recognition',
    age_level: 'Creche',
    item_id: 'animal-1',
    tier: 0,
    category: 'Animals',
    content_state: 'published',
    linked_lesson_id: 'lesson-1',
    lesson_age_level: 'Creche',
    config_json: {
      gameId: 'animals-u1-tap-creche',
      ageLevel: 'Creche',
      assessment: 'adult observation',
      inputMode: 'tap',
      promptMode: 'context',
      responseMode: 'image',
      story: 'Mama looks at a cow with Tobi.',
      question: 'Which picture shows the cow?',
      items: [{ id: 'cow', label: 'Cow', emoji: '🐄' }],
      correctId: 'cow',
    },
    ...overrides,
  };
}

describe('persisted Crèche legacy inventory', () => {
  test('classifies a current owned row as valid without retaining its payload', () => {
    const result = classifyRow(row());
    expect(result).toMatchObject({
      owner: 'animals',
      classification: 'valid-current-contract',
      repairAction: 'none',
    });
    expect(result.issues).toEqual([]);

    const summary = summarizeRow(row());
    expect(summary.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(summary.configSummary).toMatchObject({
      hasStory: true,
      hasQuestion: true,
      hasExplicitAnswer: true,
    });
    expect(summary.config_json).toBeUndefined();
  });

  test('classifies legacy Animals rows as source-repair candidates', () => {
    const result = classifyRow(row({
      id: 'animals-old-1',
      config_json: JSON.stringify({
        gameId: 'animals-u1-tap-creche',
        ageLevel: 'Creche',
        prompt: 'Tap the Cow!',
        items: [{ label: 'Cow', emoji: '🐄' }],
      }),
      content_state: 'generated',
    }));
    expect(result.owner).toBe('animals');
    expect(result.classification).toBe('unsupported-or-human-review');
    expect(result.repairAction).toBe('owned-source-repair-candidate');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing-adult-observation',
      'missing-explicit-input-mode',
      'missing-explicit-answer-key',
    ]));
  });

  test('requires review for malformed or unknown published rows', () => {
    const malformed = classifyRow(row({
      id: 'unknown-1',
      category: 'Other',
      config_json: '{not-json',
      content_state: 'published',
    }));
    expect(malformed.owner).toBe('unknown');
    expect(malformed.classification).toBe('unsupported-or-human-review');
    expect(malformed.repairAction).toBe('human-review-unknown-owner');
    expect(malformed.issues.map((issue) => issue.code)).toContain('malformed-config-json');

    const missingLink = classifyRow(row({
      id: 'published-old',
      linked_lesson_id: null,
      config_json: JSON.stringify(row().config_json),
    }));
    expect(missingLink.issues.map((issue) => issue.code)).toContain('missing-lesson-linkage');
    expect(missingLink.repairAction).toBe('replacement-required-before-publication-change');
  });

  test('attributes the platform\'s own flagship rows instead of unknown', () => {
    const result = classifyRow(row({
      id: 'fp-nursery1-t1-w03-letters',
      lesson_id: 'fp-nursery1-t1-w03-letters',
      category: 'Letters',
      config_json: {
        gameId: 'fp-nursery1-t1-w03-letters',
        ageLevel: 'Nursery 1',
        prompt: 'Tap the letter A!',
        items: [{ label: 'A', emoji: '🅰️' }],
      },
      content_state: 'published',
    }));
    // The `Letters` category used to hand these to jolly-phonics, and rows whose
    // category did not match that rule fell through to `unknown` — which Phase B
    // refuses to repair, so the manifest covered none of the owned content.
    expect(result.owner).toBe('flagship');
    // `byOwner` in the report is what the manifest is built from; the action is
    // separate, and a *published* row is always replacement-gated regardless of
    // who owns it.
    expect(result.repairAction).toBe('replacement-required-before-publication-change');
  });

  test('routes unpublished flagship rows to owned-source repair', () => {
    const result = classifyRow(row({
      id: 'fp-creche-t1-w01-animals',
      lesson_id: 'fp-creche-t1-w01-animals',
      content_state: 'generated',
      config_json: { gameId: 'fp-creche-t1-w01-animals', ageLevel: 'Creche', prompt: 'Tap the cow!' },
    }));
    expect(result.owner).toBe('flagship');
    expect(result.repairAction).toBe('owned-source-repair-candidate');
  });

  test('recognizes flagship ownership from any of its generated id shapes', () => {
    expect(classifyRow(row({ id: 'fp-creche-t1-w01-animals' })).owner).toBe('flagship');
    expect(classifyRow(row({ id: 'row-1', lesson_id: 'fp-kg1-t2-w04-letters' })).owner).toBe('flagship');
    expect(classifyRow(row({ id: 'row-2', config_json: { ...row().config_json, series_id: 'fp-series-creche-letters' } })).owner)
      .toBe('flagship');
    expect(classifyRow(row({ id: 'row-3', config_json: { ...row().config_json, lessonId: 'fp-lib-creche-u1' } })).owner)
      .toBe('flagship');
  });

  test('does not claim non-flagship rows for the flagship owner', () => {
    expect(classifyRow(row({
      id: 'gc-jp-letters-1',
      lesson_id: 'gc-jp-letters-1',
      category: 'Letters',
      config_json: { gameId: 'gc-jp-letters-1', ageLevel: 'Creche', prompt: 'Tap the letter A!' },
    })).owner).toBe('jolly-phonics');
    expect(classifyRow(row({
      id: 'mystery-1',
      lesson_id: 'mystery-1',
      category: 'Other',
      config_json: { ...row().config_json, gameId: 'mystery-game-1' },
    })).owner).toBe('unknown');
  });

  test('flags Crèche fill-in-blank rows as incompatible', () => {
    const result = classifyRow(row({
      id: 'animals-fib-old',
      template: 'fill-in-blank',
      config_json: { ageLevel: 'Creche', sentence: 'The cow says ___.' },
      content_state: 'generated',
    }));
    expect(result.issues.map((issue) => issue.code)).toContain('incompatible-creche-fill-in-blank');
  });

  test('normalizes arguments and requires the read-only CLI flags', () => {
    expect(parseArgs(['--read-only', '--confirm-read-only', '--page-size=999', '--max-rows=9999'])).toMatchObject({
      readOnly: true,
      confirmReadOnly: true,
      pageSize: MAX_PAGE_SIZE,
      maxRows: MAX_ROWS,
    });
    expect(parseArgs([])).toMatchObject({ readOnly: false, confirmReadOnly: false });
    expect(parseConfig('{"ok":true}').error).toBeNull();
    expect(parseConfig('{bad}').config).toBeNull();
  });

  test('collects deterministic pages and stops at the hard cap', async () => {
    const calls = [];
    const sourceRows = Array.from({ length: 5 }, (_, index) => row({
      id: `legacy-${index + 1}`,
      config_json: row().config_json,
    }));
    const query = async (sql, replacements) => {
      calls.push({ sql, replacements });
      if (sql.includes('GROUP BY')) return [[{ age_level: 'Creche', row_count: 5 }]];
      const after = String(replacements.afterId || '');
      const start = after ? sourceRows.findIndex((item) => item.id === after) + 1 : 0;
      return [sourceRows.slice(start, start + 2)];
    };

    const report = await collectInventory({
      query,
      database: 'elite_kids_test',
      pageSize: 2,
      maxRows: 3,
      generatedAt: '2026-09-11T00:00:00.000Z',
    });
    expect(report.mode).toBe('read-only');
    expect(report.database).toBe('elite_kids_test');
    expect(report.limits).toMatchObject({ pageSize: 2, maxRows: 3, returnedRows: 3, truncated: true });
    expect(report.rows.map((item) => item.id)).toEqual(['legacy-1', 'legacy-2', 'legacy-3']);
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => !/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i.test(call.sql))).toBe(true);
    expect(JSON.stringify(report)).not.toContain('Mama looks at a cow');
  });

  test('hashes canonical JSON consistently regardless of object key order', () => {
    expect(hashConfig({ b: 2, a: { d: 4, c: 3 } })).toBe(hashConfig({ a: { c: 3, d: 4 }, b: 2 }));
  });
});
