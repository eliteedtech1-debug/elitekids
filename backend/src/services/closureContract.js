'use strict';

const { Op } = require('sequelize');

/**
 * Lesson CLOSURE CONTRACT — what it takes to close a lesson (QUEUE Q69/Q72).
 *
 * The flagship seeder writes a closure contract into every game config:
 *
 *   gamePlan: { learning, practice, test: band.tier === 0 ? null : { … } }
 *
 * …and until now **nothing read it**. The content said one thing ("Crèche has
 * no child-facing test") while the gate did another (every lesson closes only
 * on a passing test, score >= 50), so a Crèche unit was closed by a test its
 * own content declares does not exist — and would have become UNCLOSABLE the
 * day test mode were blocked for tier 0. The contract is read here, at the one
 * place that decides closure, so the gate and the authored content agree.
 *
 * Two rules, in priority order:
 *
 *  1. **The lesson's own declaration wins.** `gamePlan.test === null` (exactly
 *     what the seeder writes for tier 0 / Crèche, 270 of 1,710 configs) means
 *     the unit has no child-facing test, so a COMPLETED PLAY closes it.
 *  2. **Everything else keeps the 2026-09-04 rule**: a passing TEST (score >=
 *     50) alone completes a lesson. This is the fail-closed default — an
 *     absent, malformed or not-yet-authored declaration can never quietly
 *     widen what closes a unit.
 *
 * `requiredAfterPractice` is **reported, never enforced**. The gate deliberately
 * ignores it per the same 2026-09-04 decision (restoring practice-first
 * false-locked children who had already reached a passing test). It is carried
 * through so the client can display the authored intent without the server
 * acting on it.
 *
 * Pure helpers (unit-testable, no DB) + one batched loader. Used by
 * `kidsSeries#getCurriculum`, `kidsSeries#computeLearningPath` and
 * `kids#recordGameComplete` — one implementation, so the curriculum, the
 * learning path and the progress endpoint can never disagree.
 */

/** Modes that prove the game was actually played. `checkpoint` is deliberately
 *  excluded: a jumped-over game has not been played (kidsCheckpoints writes
 *  `mode: 'checkpoint'` with 0 stars/XP for exactly that reason). */
const PLAY_MODES = Object.freeze(['learning', 'practice', 'test']);

/** Fail-closed default: no declaration ⇒ the 2026-09-04 test rule. */
const REQUIRES_TEST = Object.freeze({ declared: false, requires_test: true, required_after_practice: null });

/** Is this a plain object (not null, not an array)? */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The closure a single game config declares.
 * @param {object|null} configJson  `kids_game_configs.config_json`
 * @returns {{declared: boolean, requires_test: boolean, required_after_practice: boolean|null}}
 */
function closureFor(configJson) {
  const plan = isPlainObject(configJson) ? configJson.gamePlan : null;
  const declared = isPlainObject(plan) && Object.prototype.hasOwnProperty.call(plan, 'test');
  const test = declared ? plan.test : undefined;
  // Only an explicit JSON null declares "no child-facing test"; anything else
  // (missing, a string, a half-written object) keeps the test requirement.
  const testless = declared && test === null;
  return {
    declared,
    requires_test: !testless,
    required_after_practice: isPlainObject(test) ? test.requiredAfterPractice === true : null,
  };
}

/**
 * Collapse a lesson's configs (a lesson may carry more than one) into one
 * contract. Disagreement fails CLOSED: if ANY config requires a test, the
 * lesson requires a test.
 */
function closureByLesson(configRows) {
  const byLesson = new Map();
  for (const row of Array.isArray(configRows) ? configRows : []) {
    const lessonId = String((row && row.lesson_id) || '');
    if (!lessonId) continue;
    const contract = closureFor(row.config_json);
    const prev = byLesson.get(lessonId);
    byLesson.set(lessonId, prev
      ? {
        declared: prev.declared && contract.declared,
        requires_test: prev.requires_test || contract.requires_test,
        required_after_practice: contract.required_after_practice === null
          ? prev.required_after_practice
          : contract.required_after_practice,
      }
      : contract);
  }
  return byLesson;
}

/** Batched loader (one query, no N+1). Lessons with no config are absent from
 *  the map — callers treat that as REQUIRES_TEST. */
async function loadClosureByLesson(db, lessonIds) {
  const ids = [...new Set((Array.isArray(lessonIds) ? lessonIds : []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await db.KidGameConfig.findAll({
    where: { lesson_id: { [Op.in]: ids } },
    attributes: ['lesson_id', 'config_json'],
  });
  return closureByLesson(rows);
}

/**
 * lesson_id → the raw facts the gate needs, from the child's progress rows.
 * @returns {Map<string, {practice: boolean, testPass: boolean, played: boolean}>}
 */
function lessonStatesFromProgress(rows) {
  const states = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const lessonId = String((row && row.lesson_id) || '');
    if (!lessonId) continue;
    const st = states.get(lessonId) || { practice: false, testPass: false, played: false };
    if (row.mode === 'practice') st.practice = true;
    if (row.mode === 'test' && Number(row.score) >= 50) st.testPass = true;
    if (PLAY_MODES.includes(row.mode)) st.played = true;
    states.set(lessonId, st);
  }
  return states;
}

/**
 * THE GATE. A lesson is complete when the child did what its own closure
 * contract asks for: a passing test, or — for a lesson that declares no test —
 * a completed play.
 */
function isLessonComplete(state, closure) {
  if (!state) return false;
  const contract = closure || REQUIRES_TEST;
  return contract.requires_test ? state.testPass === true : state.played === true;
}

/**
 * The state a lesson reports to the child. The vocabulary is the existing
 * client contract ('none' | 'practice_done' | 'passed' | 'tested_out'), and a
 * testless lesson that has been played reports 'passed' — PLAY renders that as
 * the closed card and the path advances past it. What actually closed it stays
 * legible in the `closure` block carried alongside (`requires_test: false`),
 * so a UI can say "Played" without the server pretending a test happened.
 * An approved jump-ahead exemption is still NEVER reported as a pass.
 */
function lessonStateFor(state, closure, { exempt = false } = {}) {
  const st = state || {};
  const contract = closure || REQUIRES_TEST;
  if (st.testPass === true) return 'passed';
  if (exempt) return 'tested_out';
  if (!contract.requires_test && st.played === true) return 'passed';
  return st.practice ? 'practice_done' : 'none';
}

module.exports = {
  PLAY_MODES,
  REQUIRES_TEST,
  closureFor,
  closureByLesson,
  loadClosureByLesson,
  lessonStatesFromProgress,
  isLessonComplete,
  lessonStateFor,
};
