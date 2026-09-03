'use strict';
/**
 * Adaptive Difficulty Engine — BKT + Elo + Struggle Detection
 * Pure functions. No DB calls. No side effects.
 *
 * Usage:
 *   const { bktUpdate, eloUpdate, detectStruggle, calculateDifficulty, getMasteryState } = require('./adaptiveEngine');
 */

// ─── Bayesian Knowledge Tracing ────────────────────────────────

const BKT_DEFAULTS = {
  p_L: 0.30,   // P(learn on each attempt)
  p_G: 0.25,   // P(correct when not learned)
  p_S: 0.10,   // P(incorrect when learned)
  p_T: 0.10,   // P(learn on next attempt)
};

/**
 * Run one BKT update step.
 * @param {object} state - { p_knows, p_L, p_G, p_S, p_T }
 * @param {boolean} correct - was the response correct?
 * @returns {number} updated p_knows (clamped 0.001–0.999)
 */
function bktUpdate(state, correct) {
  const pK = state.p_knows;
  const pL = state.p_L ?? BKT_DEFAULTS.p_L;
  const pG = state.p_G ?? BKT_DEFAULTS.p_G;
  const pS = state.p_S ?? BKT_DEFAULTS.p_S;
  const pT = state.p_T ?? BKT_DEFAULTS.p_T;

  let pKNew;

  if (correct) {
    const pCorrectGivenKnows = 1 - pS;
    const pCorrectGivenNotKnows = pG;
    const pCorrect = pCorrectGivenKnows * pK + pCorrectGivenNotKnows * (1 - pK);

    if (pCorrect === 0) return clamp(pK, 0.001, 0.999);

    const pKnowsGivenCorrect = (pCorrectGivenKnows * pK) / pCorrect;
    pKNew = pKnowsGivenCorrect + (1 - pKnowsGivenCorrect) * pT;
  } else {
    const pIncorrectGivenKnows = pS;
    const pIncorrectGivenNotKnows = 1 - pG;
    const pIncorrect = pIncorrectGivenKnows * pK + pIncorrectGivenNotKnows * (1 - pK);

    if (pIncorrect === 0) return clamp(pK, 0.001, 0.999);

    const pKnowsGivenIncorrect = (pIncorrectGivenKnows * pK) / pIncorrect;
    pKNew = pKnowsGivenIncorrect;
  }

  return clamp(pKNew, 0.001, 0.999);
}

/**
 * Create initial BKT state for a new skill.
 */
function createBktState() {
  return {
    p_knows: 0.001,
    p_L: BKT_DEFAULTS.p_L,
    p_G: BKT_DEFAULTS.p_G,
    p_S: BKT_DEFAULTS.p_S,
    p_T: BKT_DEFAULTS.p_T,
  };
}

// ─── Elo Rating System ─────────────────────────────────────────

const ELO_K = 32;
const ELO_MIN = 100;
const ELO_MAX = 3000;
const ELO_INITIAL = 1000;

/**
 * Update Elo rating after a response.
 * @param {number} studentElo
 * @param {number} itemElo
 * @param {boolean} correct
 * @returns {number} new student Elo
 */
function eloUpdate(studentElo, itemElo, correct) {
  const expected = 1 / (1 + Math.pow(10, (itemElo - studentElo) / 400));
  const actual = correct ? 1 : 0;
  const newElo = studentElo + ELO_K * (actual - expected);
  return clamp(Math.round(newElo), ELO_MIN, ELO_MAX);
}

// ─── Struggle Detection ────────────────────────────────────────

/**
 * Detect if a child is struggling based on multiple signals.
 * @param {object} adaptiveState - current adaptive state
 * @param {object} currentResponse - current game response
 * @returns {{ struggling: boolean, signals: Array, severity: string }}
 */
function detectStruggle(adaptiveState, currentResponse = {}) {
  const signals = [];

  // Signal 1: Consecutive wrong answers
  const consecutiveWrong = adaptiveState.consecutive_wrong || 0;
  if (consecutiveWrong >= 3) {
    signals.push({ type: 'consecutive_wrong', count: consecutiveWrong });
  }

  // Signal 2: Response time increasing (slowing down)
  const last5 = adaptiveState.last_5_response_times || [];
  if (last5.length >= 3) {
    const avgRecent = last5.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, last5.length);
    const avgOverall = last5.reduce((a, b) => a + b, 0) / last5.length;
    if (avgOverall > 0 && avgRecent / avgOverall > 1.5) {
      signals.push({ type: 'slowing_down', ratio: Math.round((avgRecent / avgOverall) * 100) / 100 });
    }
  }

  // Signal 3: Hint abuse
  const hintsUsed = currentResponse.hints_used || 0;
  const totalItems = currentResponse.total_items || 0;
  if (totalItems > 0 && hintsUsed / totalItems > 0.6) {
    signals.push({ type: 'hint_abuse', rate: Math.round((hintsUsed / totalItems) * 100) });
  }

  // Signal 4: Accuracy drop within session
  const sessionStartAcc = currentResponse.session_accuracy_start;
  const sessionCurrentAcc = currentResponse.session_accuracy_current;
  if (sessionStartAcc != null && sessionCurrentAcc != null) {
    const drop = sessionStartAcc - sessionCurrentAcc;
    if (drop > 20) {
      signals.push({ type: 'accuracy_drop', drop: Math.round(drop) });
    }
  }

  const severity = signals.length >= 3 ? 'high' : signals.length >= 2 ? 'medium' : signals.length >= 1 ? 'low' : 'none';

  return {
    struggling: signals.length > 0,
    signals,
    severity,
  };
}

// ─── Difficulty Calculation ────────────────────────────────────

/**
 * Calculate new difficulty level based on mastery probability and response time.
 * @param {number} currentDifficulty - 1-5
 * @param {number} masteryProbability - 0.0-1.0
 * @param {number} avgResponseTimeMs - average response time
 * @param {object} struggleInfo - output from detectStruggle
 * @returns {number} new difficulty 1-5
 */
function calculateDifficulty(currentDifficulty, masteryProbability, avgResponseTimeMs = 0, struggleInfo = {}) {
  let newDifficulty = currentDifficulty;

  if (struggleInfo.struggling) {
    // Struggling: drop difficulty
    newDifficulty = Math.max(currentDifficulty - 1, 1);
  } else if (masteryProbability >= 0.85 && avgResponseTimeMs < 5000) {
    // Mastered and fast: increase difficulty
    newDifficulty = Math.min(currentDifficulty + 1, 5);
  } else if (masteryProbability >= 0.70 && avgResponseTimeMs < 3000) {
    // Nearly there and fast: increase difficulty
    newDifficulty = Math.min(currentDifficulty + 1, 5);
  } else if (masteryProbability < 0.40) {
    // Low mastery: decrease difficulty
    newDifficulty = Math.max(currentDifficulty - 1, 1);
  }

  return newDifficulty;
}

// ─── Mastery State ─────────────────────────────────────────────

const MASTERY_THRESHOLDS = {
  NEW: 0,
  LEARNING: 0.30,
  PRACTICING: 0.50,
  NEARLY_THERE: 0.70,
  MASTERED: 0.85,
};

/**
 * Map mastery probability to human-readable state.
 * @param {number} probability - 0.0-1.0
 * @returns {'new'|'learning'|'practicing'|'nearly_there'|'mastered'}
 */
function getMasteryState(probability) {
  if (probability >= MASTERY_THRESHOLDS.MASTERED) return 'mastered';
  if (probability >= MASTERY_THRESHOLDS.NEARLY_THERE) return 'nearly_there';
  if (probability >= MASTERY_THRESHOLDS.PRACTICING) return 'practicing';
  if (probability >= MASTERY_THRESHOLDS.LEARNING) return 'learning';
  return 'new';
}

/**
 * Get mastery state metadata for rendering.
 */
function getMasteryMeta(probability) {
  const state = getMasteryState(probability);
  const fillPercent = Math.round(probability * 100);
  const labels = {
    new: 'New',
    learning: 'Learning',
    practicing: 'Practicing',
    nearly_there: 'Almost!',
    mastered: 'Mastered!',
  };
  return { state, fillPercent, label: labels[state] };
}

// ─── ZPD (Zone of Proximal Development) ────────────────────────

/**
 * Calculate ZPD bounds based on mastery.
 * Lower bound = what the child can do independently
 * Upper bound = what the child can do with guidance
 * @param {number} masteryProbability
 * @returns {{ lower: number, upper: number }}
 */
function calculateZPD(masteryProbability) {
  // Narrow ZPD when mastery is very low or very high
  // Wide ZPD when in the learning zone
  const center = masteryProbability;
  const width = 0.2 + 0.1 * Math.sin(masteryProbability * Math.PI);
  return {
    lower: Math.max(0.1, center - width),
    upper: Math.min(0.95, center + width),
  };
}

// ─── Skill Key Builder ─────────────────────────────────────────

/**
 * Build a skill key from lesson data.
 * @param {string} subject
 * @param {string} topic
 * @param {string} [itemId]
 * @returns {string}
 */
function buildSkillKey(subject, topic, itemId) {
  const base = `${subject || 'general'}.${topic || 'general'}`;
  return itemId ? `${base}.${itemId}` : base;
}

// ─── Response Quality Scorer ───────────────────────────────────

/**
 * Map game performance to SM-2 quality rating (0-5).
 * @param {object} performance - { score, correct, response_time_ms, hints_used, total_items }
 * @returns {number} quality 0-5
 */
function scoreQuality(performance) {
  const { score = 0, correct = false, response_time_ms = 5000, hints_used = 0, total_items = 1 } = performance;

  // Base quality from score percentage
  let q;
  if (score >= 90) q = 5;
  else if (score >= 70) q = 4;
  else if (score >= 50) q = 3;
  else if (score >= 30) q = 2;
  else if (score >= 10) q = 1;
  else q = 0;

  // Adjust for response time (fast = better quality)
  if (response_time_ms < 2000 && q < 5) q = Math.min(5, q + 1);
  if (response_time_ms > 10000 && q > 0) q = Math.max(0, q - 1);

  // Adjust for hint abuse
  if (total_items > 0 && hints_used / total_items > 0.5 && q > 1) {
    q = Math.max(1, q - 1);
  }

  return q;
}

// ─── Helpers ───────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  // BKT
  bktUpdate,
  createBktState,
  BKT_DEFAULTS,

  // Elo
  eloUpdate,
  ELO_K,
  ELO_MIN,
  ELO_MAX,
  ELO_INITIAL,

  // Struggle
  detectStruggle,

  // Difficulty
  calculateDifficulty,

  // Mastery
  getMasteryState,
  getMasteryMeta,
  MASTERY_THRESHOLDS,

  // ZPD
  calculateZPD,

  // Helpers
  buildSkillKey,
  scoreQuality,
  clamp,
  addDays,
  today,
};
