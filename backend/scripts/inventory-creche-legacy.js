'use strict';

/**
 * Bounded, read-only inventory of persisted early-years game configs.
 *
 * This module deliberately has no UPDATE, INSERT, DELETE, sync, or seeder
 * path. The CLI requires both --read-only and --confirm-read-only before it
 * opens the Kids database. It writes only a classified report artifact under
 * team-docs/reports/.
 *
 * Usage:
 *   node scripts/inventory-creche-legacy.js --read-only --confirm-read-only
 *   node scripts/inventory-creche-legacy.js --read-only --confirm-read-only \
 *     --page-size=50 --max-rows=500 --output=team-docs/reports/example.json
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EARLY_YEARS = Object.freeze([
  'creche',
  'crèche',
  'playgroup',
  'nursery',
  'nursery 1',
  'nursery 2',
]);
const MAX_PAGE_SIZE = 100;
const MAX_ROWS = 1000;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_ROWS = 500;
const REPORT_ROOT = path.resolve(__dirname, '..', '..', 'team-docs', 'reports');

const SCOPE_PREDICATE = `(
  LOWER(TRIM(COALESCE(gc.age_level, ''))) IN (:earlyAges)
  OR LOWER(TRIM(COALESCE(l.age_level, ''))) IN (:earlyAges)
  OR LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(gc.config_json, '$.ageLevel')), ''))) IN (:earlyAges)
)`;

const AGGREGATE_SQL = `
  SELECT
    COALESCE(NULLIF(gc.age_level, ''), '(empty)') AS age_level,
    COALESCE(NULLIF(l.age_level, ''), '(no lesson age)') AS lesson_age_level,
    COALESCE(NULLIF(gc.template, ''), '(empty)') AS template,
    COALESCE(NULLIF(gc.category, ''), '(uncategorized)') AS category,
    COALESCE(NULLIF(gc.content_state, ''), '(empty)') AS content_state,
    COUNT(*) AS row_count
  FROM kids_game_configs gc
  LEFT JOIN kids_lessons l ON l.id = gc.lesson_id
  WHERE ${SCOPE_PREDICATE}
  GROUP BY gc.age_level, l.age_level, gc.template, gc.category, gc.content_state
  ORDER BY age_level, lesson_age_level, template, category, content_state
`;

function pagedSql(pageSize) {
  const safePageSize = clampInteger(pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  return `
    SELECT
      gc.id,
      gc.lesson_id,
      gc.template,
      gc.age_level,
      gc.item_id,
      gc.tier,
      gc.category,
      gc.config_json,
      gc.content_state,
      gc.createdAt,
      gc.updatedAt,
      l.id AS linked_lesson_id,
      l.age_level AS lesson_age_level,
      l.subject AS lesson_subject,
      l.title AS lesson_title
    FROM kids_game_configs gc
    LEFT JOIN kids_lessons l ON l.id = gc.lesson_id
    WHERE ${SCOPE_PREDICATE}
      AND gc.id > :afterId
    ORDER BY gc.id ASC
    LIMIT ${safePageSize}
  `;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeAge(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isEarlyYears(value) {
  return EARLY_YEARS.includes(normalizeAge(value));
}

function parseConfig(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { config: raw, error: null };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { config: null, error: 'config_json must contain a JSON object' };
      }
      return { config: parsed, error: null };
    } catch (error) {
      return { config: null, error: `config_json is not valid JSON: ${error.message}` };
    }
  }
  return { config: null, error: 'config_json is missing or not an object' };
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stableJson(value[key]);
    return out;
  }, {});
}

function hashConfig(configOrRaw) {
  const parsed = parseConfig(configOrRaw);
  const value = parsed.config ? stableJson(parsed.config) : String(configOrRaw || '');
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function hasAnyText(config, keys) {
  return keys.some((key) => typeof config[key] === 'string' && config[key].trim().length > 0);
}

function hasExplicitAnswer(config, template) {
  if (config.correctId !== undefined && config.correctId !== null && String(config.correctId).trim()) return true;
  if (template === 'quiz' && Array.isArray(config.questions)) {
    return config.questions.every((question) => Number.isInteger(question.correctIndex));
  }
  if (Array.isArray(config.rounds) && config.rounds.length > 0) {
    return config.rounds.every((round) => round && round.correctId);
  }
  return false;
}

function ownerForRow(row, config) {
  const idTokens = [row.id, row.lesson_id, config.gameId, config.lessonId, config.series_id]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const idText = idTokens.join(' ');
  const category = String(row.category || config.topic || '').toLowerCase();

  // Flagship annual pilot — the platform's OWN authored content. Every id it
  // generates begins with `fp-`: game/lesson ids are
  // `fp-<band>-<term>-w<NN>-<subject>`, plus `fp-series-`, `fp-unit-`, `fp-cp-`,
  // `fp-lib-` (flagshipAnnualPilotSeed.js).
  //
  // This rule has to come FIRST. The jolly-phonics rule below matches a
  // *category* substring (`Letters`), which was claiming 111 flagship rows that
  // it did not author, while the other 889 came back `unknown` — and because
  // Phase B refuses to auto-repair unknown ownership, the repair manifest could
  // not cover the content the platform actually owns.
  if (idTokens.some((token) => token.startsWith('fp-'))) return 'flagship';

  if (idText.includes('glesson-') || idText.includes('global-catalog')) return 'global-catalog';
  if (category.includes('animal') || idText.includes('animal')) return 'animals';
  if (category.includes('letter') || idText.includes('jolly') || idText.includes('gc-jp-')) return 'jolly-phonics';
  if (idText.includes('placement')) return 'placement';
  return 'unknown';
}

function classifyRow(row) {
  const parsed = parseConfig(row.config_json);
  const config = parsed.config || {};
  const earlyAge = [row.age_level, row.lesson_age_level, config.ageLevel, config.age_band]
    .some(isEarlyYears);
  const owner = ownerForRow(row, config);
  const issues = [];

  if (!earlyAge) {
    issues.push({ code: 'out-of-scope-age', severity: 'info' });
  }
  if (parsed.error) {
    issues.push({ code: 'malformed-config-json', severity: 'critical', detail: parsed.error });
  }
  if (!row.linked_lesson_id) {
    issues.push({ code: 'missing-lesson-linkage', severity: 'critical' });
  }
  if (earlyAge && config.assessment !== 'adult observation') {
    issues.push({ code: 'missing-adult-observation', severity: 'critical' });
  }
  if (earlyAge && !config.inputMode) {
    issues.push({ code: 'missing-explicit-input-mode', severity: 'warning' });
  }
  if (earlyAge && !config.promptMode) {
    issues.push({ code: 'missing-prompt-mode', severity: 'warning' });
  }
  if (earlyAge && !config.responseMode) {
    issues.push({ code: 'missing-response-mode', severity: 'warning' });
  }

  if (earlyAge && row.template === 'fill-in-blank') {
    issues.push({ code: 'incompatible-creche-fill-in-blank', severity: 'critical' });
  }

  if (earlyAge && row.template === 'tap-recognition') {
    const items = Array.isArray(config.items) ? config.items : [];
    const rounds = Array.isArray(config.rounds) ? config.rounds : [];
    if (items.length === 0 && rounds.length === 0) {
      issues.push({ code: 'missing-tap-options', severity: 'critical' });
    }
    if (!hasExplicitAnswer(config, row.template)) {
      issues.push({ code: 'missing-explicit-answer-key', severity: 'critical' });
    }
    if (!hasAnyText(config, ['story', 'scenario', 'context', 'question', 'prompt', 'speechText'])) {
      issues.push({ code: 'missing-context-question', severity: 'critical' });
    }
  }

  if (earlyAge && ['matching', 'drag-sort', 'quiz', 'stage-sequence'].includes(row.template)) {
    if (!hasAnyText(config, ['story', 'scenario', 'context', 'question', 'prompt', 'speechText'])) {
      issues.push({ code: 'missing-context-question', severity: 'critical' });
    }
  }

  if (earlyAge && ['quiz', 'stage-sequence'].includes(row.template)) {
    const rounds = row.template === 'quiz' ? config.questions : config.assessment;
    if (!Array.isArray(rounds) || rounds.length === 0) {
      issues.push({ code: 'missing-assessment-rounds', severity: 'critical' });
    }
  }

  const critical = issues.some((issue) => issue.severity === 'critical');
  let classification = 'valid-current-contract';
  if (critical) classification = 'unsupported-or-human-review';
  else if (issues.length > 0) classification = 'legacy-needs-repair';

  let repairAction = 'none';
  if (classification !== 'valid-current-contract') {
    if (owner === 'unknown') repairAction = 'human-review-unknown-owner';
    else if (row.content_state === 'published' || row.content_state === 'approved') repairAction = 'replacement-required-before-publication-change';
    else if (owner === 'flagship' || owner === 'animals' || owner === 'jolly-phonics' || owner === 'global-catalog') repairAction = 'owned-source-repair-candidate';
    else repairAction = 'human-review';
  }

  return {
    classification,
    owner,
    repairAction,
    issues,
    configHash: hashConfig(row.config_json),
    configSummary: {
      topLevelKeys: Object.keys(config).sort(),
      itemCount: arrayLength(config.items) || arrayLength(config.rounds),
      pairCount: arrayLength(config.pairs),
      questionCount: arrayLength(config.questions),
      sentenceCount: arrayLength(config.sentences),
      hasStory: hasAnyText(config, ['story', 'scenario', 'context']),
      hasQuestion: hasAnyText(config, ['question', 'prompt']),
      hasAudioStimulus: Boolean(config.audio || config.audioUrl || config.promptAudio || config.narrationAudio),
      hasExplicitAnswer: hasExplicitAnswer(config, row.template),
    },
  };
}

function summarizeRow(row) {
  const result = classifyRow(row);
  return {
    id: row.id,
    lessonId: row.lesson_id,
    linkedLessonId: row.linked_lesson_id || null,
    template: row.template,
    ageLevel: row.age_level,
    lessonAgeLevel: row.lesson_age_level || null,
    category: row.category || null,
    itemId: row.item_id || null,
    tier: row.tier ?? null,
    contentState: row.content_state || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    owner: result.owner,
    classification: result.classification,
    repairAction: result.repairAction,
    issues: result.issues,
    configHash: result.configHash,
    configSummary: result.configSummary,
  };
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || '(empty)';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function buildReport({ database, aggregate, rows, pageSize, maxRows, truncated, generatedAt = new Date().toISOString() }) {
  const summaries = rows.map(summarizeRow);
  return {
    reportType: 'creche-legacy-inventory',
    generatedAt,
    mode: 'read-only',
    database,
    scope: {
      table: 'kids_game_configs',
      joinedTable: 'kids_lessons',
      earlyYears: EARLY_YEARS,
      predicate: 'config, lesson, or relational age_level is an early-years value',
    },
    limits: { pageSize, maxRows, returnedRows: summaries.length, truncated },
    aggregate,
    counts: {
      byOwner: countBy(summaries, 'owner'),
      byClassification: countBy(summaries, 'classification'),
      byRepairAction: countBy(summaries, 'repairAction'),
      byTemplate: countBy(summaries, 'template'),
      byContentState: countBy(summaries, 'contentState'),
    },
    rows: summaries,
    safety: {
      databaseReads: 'SELECT only',
      databaseWrites: false,
      seederExecution: false,
      migrationExecution: false,
      configPayloadsStored: false,
      hashes: 'sha256 of canonical config JSON; hashes are for conflict detection only',
    },
  };
}

async function collectInventory({ query, database, pageSize = DEFAULT_PAGE_SIZE, maxRows = DEFAULT_MAX_ROWS, generatedAt }) {
  if (typeof query !== 'function') throw new Error('collectInventory requires a query function');
  const safePageSize = clampInteger(pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const safeMaxRows = clampInteger(maxRows, 1, MAX_ROWS, DEFAULT_MAX_ROWS);
  const replacements = { earlyAges: EARLY_YEARS };
  const [aggregate] = await query(AGGREGATE_SQL, replacements);
  const rows = [];
  let afterId = '';
  let truncated = false;

  while (rows.length < safeMaxRows) {
    const remaining = safeMaxRows - rows.length;
    const batchSize = Math.min(safePageSize, remaining);
    const [batch] = await query(pagedSql(batchSize), { ...replacements, afterId });
    if (!batch.length) break;
    const accepted = batch.slice(0, remaining);
    rows.push(...accepted);
    afterId = String(accepted[accepted.length - 1].id);
    if (batch.length > accepted.length) {
      truncated = true;
      break;
    }
    if (batch.length < batchSize) break;
    if (rows.length >= safeMaxRows) {
      truncated = true;
      break;
    }
  }

  return buildReport({
    database,
    aggregate,
    rows,
    pageSize: safePageSize,
    maxRows: safeMaxRows,
    truncated,
    generatedAt,
  });
}

function parseArgs(argv) {
  const options = {
    readOnly: argv.includes('--read-only'),
    confirmReadOnly: argv.includes('--confirm-read-only'),
    pageSize: DEFAULT_PAGE_SIZE,
    maxRows: DEFAULT_MAX_ROWS,
    output: null,
  };
  for (const arg of argv) {
    const page = arg.match(/^--page-size=(\d+)$/);
    const max = arg.match(/^--max-rows=(\d+)$/);
    const output = arg.match(/^--output=(.+)$/);
    if (page) options.pageSize = clampInteger(page[1], 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    if (max) options.maxRows = clampInteger(max[1], 1, MAX_ROWS, DEFAULT_MAX_ROWS);
    if (output) options.output = output[1];
  }
  return options;
}

function assertReportPath(outputPath) {
  const resolved = path.resolve(outputPath);
  if (resolved !== REPORT_ROOT && !resolved.startsWith(`${REPORT_ROOT}${path.sep}`)) {
    throw new Error(`Report output must remain under ${path.relative(process.cwd(), REPORT_ROOT)}/`);
  }
  return resolved;
}

function defaultReportPath() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(REPORT_ROOT, `creche-legacy-inventory-${day}.json`);
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.readOnly || !options.confirmReadOnly) {
    throw new Error('Refusing to run: pass both --read-only and --confirm-read-only. This tool has no write mode.');
  }

  // Require lazily so importing the pure classifier in tests never opens a DB
  // connection or loads deployment credentials.
  require('dotenv').config();
  const db = require('../src/models');
  const database = db.content.config.database;
  const outputPath = assertReportPath(options.output || defaultReportPath());
  const report = await collectInventory({
    query: (sql, replacements) => db.content.query(sql, { replacements }),
    database,
    pageSize: options.pageSize,
    maxRows: options.maxRows,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await db.content.close();
  console.log(JSON.stringify({
    mode: report.mode,
    database: report.database,
    returnedRows: report.limits.returnedRows,
    truncated: report.limits.truncated,
    output: path.relative(process.cwd(), outputPath),
    counts: report.counts,
  }, null, 2));
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(`Legacy inventory refused/failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  AGGREGATE_SQL,
  EARLY_YEARS,
  MAX_PAGE_SIZE,
  MAX_ROWS,
  SCOPE_PREDICATE,
  assertReportPath,
  buildReport,
  classifyRow,
  collectInventory,
  hashConfig,
  isEarlyYears,
  normalizeAge,
  pagedSql,
  parseArgs,
  parseConfig,
  summarizeRow,
};
