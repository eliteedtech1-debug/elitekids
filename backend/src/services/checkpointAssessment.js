'use strict';

/**
 * Jump-ahead checkpoint assessment.
 *
 * A child blocked by the cumulative E3f unit chain can sit ONE assessment that
 * covers every unfinished unit the series still has up to their age-band
 * ceiling. This module is the whole integrity story, so it is deliberately
 * pure (no DB access, no Express) and fully unit-tested:
 *
 *   questionFromConfig()  derive one answerable question from a stored game
 *                         config, using only that game's own content
 *   sampleCheckpoint()    spread a bounded number of questions across the chain
 *                         so EVERY unit is probed at least once
 *   gradeCheckpoint()     score answers against the issued set (server-side)
 *   checkpointVerdict()   pass = threshold met AND no unit left unprobed
 *
 * Two rules matter and are not negotiable:
 *   1. No unit may be skipped without being probed. A child cannot jump a
 *      foundation the assessment never asked about — if a unit has no derivable
 *      question the exam is refused rather than issued with a gap.
 *   2. A question is only derived when the game itself states a single correct
 *      answer. Templates that cannot express one are skipped, never guessed at.
 *
 * Question count reuses the canonical per-game item bounds
 * (curriculum/00-framework/game-size-and-module-standard.md via
 * gameConfigRules) so the assessment is the same size as the content it
 * replaces: 10 items, 15 for Primary.
 */

const { PLAYABLE_ITEM_MAX, PLAYABLE_ITEM_MAX_PRIMARY } = require('./gameConfigRules');

/** A jump-ahead needs this share of the assessment right to be eligible. */
const CHECKPOINT_PASS_PCT = 80;

/**
 * Preferred floor. A chain that cannot supply this many usable questions is not
 * refused (a single thin unit is a legitimate case) — it is flagged `thin` so the
 * reviewing teacher sees exactly how little was asked before confirming.
 */
const CHECKPOINT_PREFERRED_MIN_QUESTIONS = 5;

/**
 * Re-attempt cool-down after a rejected attempt, mirroring the placement
 * exam's 12-hour window. The teacher-confirmed path has a human as its
 * throttle; the self-paced flagship exception does not, so the wait is
 * enforced in code before a fresh exam can be issued.
 */
const CHECKPOINT_RETRY_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function maxQuestionsForBand(band) {
  return String(band || '').trim().toLowerCase() === 'primary'
    ? PLAYABLE_ITEM_MAX_PRIMARY
    : PLAYABLE_ITEM_MAX;
}

// ── Option helpers ──────────────────────────────────────────────────────────

/** Stable, comparable id for an option value (ids may be labels or numbers). */
function optionId(value) {
  return String(value == null ? '' : value).trim();
}

function optionLabel(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  return optionId(item.label || item.text || item.name || item.title || item.emoji || item.image || '');
}

/** An option must be renderable without reading: a label, emoji or image. */
function asOption(item) {
  if (item == null) return null;
  if (typeof item === 'string') {
    const label = optionId(item);
    return label ? { id: label, label } : null;
  }
  const label = optionLabel(item);
  if (!label) return null;
  // Games that carry no item ids (drag-sort steps, word banks) are keyed by
  // their own label, which is what the answer key records and what a teacher
  // reading the audit trail can match back to the content.
  const id = optionId(item.id) || label;
  const option = { id, label };
  if (item.emoji) option.emoji = String(item.emoji);
  if (item.image && /^(https?:|\/|data:|media\/|blob:)/i.test(String(item.image))) option.image = String(item.image);
  if (item.color) option.color = String(item.color);
  if (item.audio && /^(https?:|\/|data:|media\/|blob:)/i.test(String(item.audio))) option.audio = String(item.audio);
  return option;
}

/** De-duplicate on the rendered id, keeping first occurrence order. */
function uniqueOptions(items) {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const option = asOption(item);
    if (!option) return;
    if (seen.has(option.id)) return;
    seen.add(option.id);
    out.push(option);
  });
  return out;
}

function firstReadable(...values) {
  for (const value of values) {
    const text = optionId(value);
    // A data: URL is a picture, not a sentence — never quote one at a child.
    if (text && !/^data:/i.test(text)) return text;
  }
  return '';
}

/**
 * Derive ONE question from a stored game config, or null when the template has
 * no single correct answer to ask about.
 *
 * `config` must already be in runtime shape (see toRuntimeGameConfig).
 */
function questionFromConfig({ unit, lesson, config, index = 0 }) {
  if (!config || typeof config !== 'object') return null;
  const template = String(config.template || '').trim();

  let prompt = '';
  let options = [];
  let target = '';

  switch (template) {
    case 'tap-recognition': {
      options = uniqueOptions(config.items);
      target = optionId(config.correctId) || (options[0] && options[0].id) || '';
      prompt = firstReadable(config.prompt, config.question, config.promptText) || 'Tap the right one.';
      break;
    }
    case 'quiz': {
      options = uniqueOptions(config.options || config.items);
      const byIndex = Number.isInteger(config.correctIndex) ? options[config.correctIndex] : null;
      target = optionId(config.correctId) || (byIndex && byIndex.id) || (options[0] && options[0].id) || '';
      prompt = firstReadable(config.question, config.prompt, config.context) || 'Which one is the answer?';
      break;
    }
    case 'matching': {
      const pairs = Array.isArray(config.pairs) ? config.pairs.filter(Boolean) : [];
      options = uniqueOptions(pairs.map((pair) => pair.b));
      target = options[0] ? options[0].id : '';
      // `a` is often an image (data: URL) in the crèche band — only anchor the
      // question on it when it is readable text.
      const anchor = firstReadable(pairs[0] && pairs[0].a);
      prompt = firstReadable(config.prompt, config.question)
        || (anchor ? `Which one goes with ${anchor}?` : 'Which one belongs here?');
      break;
    }
    case 'drag-sort': {
      const items = Array.isArray(config.items) ? config.items : [];
      const ordered = items.every((item) => item && Number.isFinite(Number(item.num)))
        ? [...items].sort((a, b) => Number(a.num) - Number(b.num))
        : items;
      options = uniqueOptions(ordered);
      target = options[0] ? options[0].id : '';
      prompt = firstReadable(config.context, config.prompt, config.question, config.story) || 'Which one comes first?';
      break;
    }
    case 'fill-in-blank': {
      const blanks = Array.isArray(config.blanks) ? config.blanks : [];
      const bank = Array.isArray(config.wordBank) ? config.wordBank : [];
      const answer = blanks[0] ? optionId(blanks[0].answer) : '';
      options = uniqueOptions([answer, ...bank]);
      target = answer;
      prompt = firstReadable(config.sentence, config.prompt, config.question) || 'Which word belongs in the blank?';
      break;
    }
    default:
      // label-diagram / stage-sequence / game-chain / memory-pairs: no single
      // answer can be derived safely — skip rather than invent one.
      return null;
  }

  if (options.length < 2) return null;
  if (!target || !options.some((option) => option.id === target)) return null;

  // Rotate by position so the correct option is not always first, while keeping
  // the issued set stable (it is stored, so grading never re-derives it).
  const rotateBy = options.length > 1 ? index % options.length : 0;
  const rotated = rotateBy ? [...options.slice(rotateBy), ...options.slice(0, rotateBy)] : options;

  return {
    id: `q-${lesson && lesson.id ? lesson.id : 'lesson'}-${index}`.slice(0, 50),
    unit_id: unit ? unit.unit_id : null,
    unit_number: unit ? unit.unit_number : null,
    lesson_id: lesson ? lesson.id : null,
    lesson_title: lesson ? lesson.title || null : null,
    template,
    question: prompt,
    speechText: firstReadable(config.speechText, config.scenario) || null,
    options: rotated,
    // Answer key — stripped from anything sent to a child.
    correctId: target,
  };
}

/**
 * Build the question set for a chain of units.
 *
 * `chain`        [{ unit_id, unit_number, title, lessons: [{ id, title, config }] }]
 *                in path order, each lesson carrying its runtime config (or null).
 * Returns { ok, reason, questions, perUnit, thin } — never throws for content
 * gaps, because the caller needs to explain the refusal to a teacher.
 */
function sampleCheckpoint(chain, { maxQuestions } = {}) {
  const units = Array.isArray(chain) ? chain.filter(Boolean) : [];
  if (!units.length) return { ok: false, reason: 'nothing_to_test_out' };

  const budget = Number.isInteger(maxQuestions) && maxQuestions > 0 ? maxQuestions : PLAYABLE_ITEM_MAX;
  if (units.length > budget) {
    // Every unit must be probed; more units than slots means we cannot honour
    // that, so refuse instead of skipping a foundation.
    return { ok: false, reason: 'chain_too_long' };
  }

  const perUnitQuestions = units.map((unit) => {
    const questions = [];
    (Array.isArray(unit.lessons) ? unit.lessons : []).forEach((lesson) => {
      if (!lesson || !lesson.config) return;
      const question = questionFromConfig({ unit, lesson, config: lesson.config, index: questions.length });
      if (question) questions.push(question);
    });
    return { unit, questions, taken: 0 };
  });

  const uncoverable = perUnitQuestions.filter((entry) => entry.questions.length === 0).map((entry) => entry.unit);
  if (uncoverable.length) {
    return {
      ok: false,
      reason: 'unit_not_assessable',
      units: uncoverable.map((unit) => ({ unit_id: unit.unit_id, unit_number: unit.unit_number, title: unit.title || null })),
    };
  }

  // One question per unit first (coverage), then round-robin the remaining
  // budget so units with more content carry more of the assessment.
  perUnitQuestions.forEach((entry) => { entry.taken = 1; });
  let used = perUnitQuestions.length;
  let progressed = true;
  while (used < budget && progressed) {
    progressed = false;
    for (const entry of perUnitQuestions) {
      if (used >= budget) break;
      if (entry.taken >= entry.questions.length) continue;
      entry.taken += 1;
      used += 1;
      progressed = true;
    }
  }

  const questions = [];
  for (const entry of perUnitQuestions) {
    questions.push(...entry.questions.slice(0, entry.taken));
  }

  const perUnit = {};
  for (const question of questions) {
    perUnit[question.unit_id] = (perUnit[question.unit_id] || 0) + 1;
  }

  return {
    ok: true,
    reason: null,
    questions,
    perUnit,
    asked_count: questions.length,
    thin: questions.length < CHECKPOINT_PREFERRED_MIN_QUESTIONS,
    max_questions: budget,
  };
}

/** Score the child's answers against the issued set. Never uses client-side data. */
function gradeCheckpoint(questions, answers) {
  const list = Array.isArray(questions) ? questions : [];
  const given = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  const perUnit = {};
  let correct = 0;

  for (const question of list) {
    const answer = given[question.id];
    const isCorrect = answer !== undefined && answer !== null && optionId(answer) === optionId(question.correctId);
    if (isCorrect) correct += 1;
    const key = question.unit_id;
    if (!perUnit[key]) perUnit[key] = { asked: 0, correct: 0 };
    perUnit[key].asked += 1;
    if (isCorrect) perUnit[key].correct += 1;
  }

  const total = list.length;
  const scorePct = total ? Math.round((correct / total) * 100) : 0;
  const unitsWithoutCorrect = Object.entries(perUnit)
    .filter(([, value]) => value.correct === 0)
    .map(([unitId]) => unitId);

  return { correct, total, score_pct: scorePct, per_unit: perUnit, units_without_correct: unitsWithoutCorrect };
}

/**
 * Eligibility for an unlock. Both conditions are required: the score threshold
 * AND at least one correct answer per unit — a child who aced four of five units
 * and blanked the fifth has not demonstrated the missing foundation.
 */
function checkpointVerdict(grade) {
  if (!grade || !grade.total) return { eligible: false, reason: 'no_questions' };
  if (grade.score_pct < CHECKPOINT_PASS_PCT) return { eligible: false, reason: 'score_below_threshold' };
  if (grade.units_without_correct.length) return { eligible: false, reason: 'unit_not_demonstrated' };
  return { eligible: true, reason: null, threshold_pct: CHECKPOINT_PASS_PCT };
}

module.exports = {
  CHECKPOINT_PASS_PCT,
  CHECKPOINT_PREFERRED_MIN_QUESTIONS,
  CHECKPOINT_RETRY_COOLDOWN_MS,
  maxQuestionsForBand,
  questionFromConfig,
  sampleCheckpoint,
  gradeCheckpoint,
  checkpointVerdict,
};
