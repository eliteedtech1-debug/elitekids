'use strict';

/**
 * Game-config round-count invariant (B1 gate 3, locked by b1-regression.test.js).
 *
 * Every published game config must carry AT LEAST `minRounds` rounds in the
 * collection keyed by its template:
 *   matching → pairs[]   tap-recognition → items[]   drag-sort → items[]
 *   quiz → questions[]   fill-in-blank → sentences[]
 *
 * puzzle-split is exempt: its difficulty ladder (difficulties[]) replaces
 * flat rounds in the runtime format consumed by GamePlay.tsx.
 */

const MIN_ROUNDS = 5;

const ROUNDS_KEY_BY_TEMPLATE = {
  matching: 'pairs',
  'tap-recognition': 'items',
  'drag-sort': 'items',
  quiz: 'questions',
  'fill-in-blank': 'sentences',
};

const EXEMPT_TEMPLATES = ['puzzle-split'];

/** Rows explicitly allowed to violate the invariant — legacy debt, ticketed
 * separately in team-docs/reports/c-preexisting-failures.md. Never add to
 * this list; new published configs must comply. */
const LEGACY_EXEMPT_IDS = ['GAME-1', 'GAME-1-T1', 'GAME-1-T2'];

function roundsKeyFor(template) {
  return ROUNDS_KEY_BY_TEMPLATE[template] || null;
}

/**
 * Evaluate the invariant over rows shaped like kids_game_configs records
 * (config_json may be a JSON string or an already-parsed object).
 * Returns a list of violations: [{ id, template, reason }].
 */
function findRoundCountViolations(rows, { minRounds = MIN_ROUNDS, exemptIds = LEGACY_EXEMPT_IDS } = {}) {
  const violations = [];
  for (const row of rows || []) {
    const { id, template } = row;
    if (exemptIds.includes(id)) continue;

    if (EXEMPT_TEMPLATES.includes(template)) continue;
    const key = roundsKeyFor(template);
    if (!key) {
      violations.push({ id, template, reason: `unmapped template has no rounds key` });
      continue;
    }

    let cfg = row.config_json;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch (e) {
        violations.push({ id, template, reason: `config_json is not valid JSON: ${e.message}` });
        continue;
      }
    }

    const rounds = cfg?.[key];
    if (!Array.isArray(rounds)) {
      violations.push({ id, template, reason: `missing rounds collection "${key}"` });
      continue;
    }
    if (rounds.length < minRounds) {
      violations.push({ id, template, reason: `${key}[] has ${rounds.length} rounds (< ${minRounds})` });
    }
  }
  return violations;
}

module.exports = { ROUNDS_KEY_BY_TEMPLATE, EXEMPT_TEMPLATES, LEGACY_EXEMPT_IDS, MIN_ROUNDS, roundsKeyFor, findRoundCountViolations };
