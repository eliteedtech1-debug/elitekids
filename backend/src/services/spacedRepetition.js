'use strict';
/**
 * Spaced Repetition Engine — SM-2+ Algorithm
 * Pure functions. No DB calls. No side effects.
 *
 * Based on SuperMemo SM-2 with improvements:
 * - Better ease factor bounds (1.3–3.0)
 * - Quality-dependent ease adjustment
 * - Interval capping at 365 days
 * - Immediate retry on failure (interval=0)
 */

const SM2_MIN_EASE = 1.3;
const SM2_MAX_EASE = 3.0;
const SM2_INITIAL_EASE = 2.5;
const SM2_MAX_INTERVAL = 365;

/**
 * SM-2+ update function.
 * @param {object} card - { ease, interval_days, repetitions, last_quality }
 * @param {number} quality - 0-5 rating
 * @returns {object} updated card
 */
function sm2PlusUpdate(card, quality) {
  const q = clamp(Math.round(quality), 0, 5);
  const ease = card.ease ?? SM2_INITIAL_EASE;
  const intervalDays = card.interval_days ?? 1;
  const reps = card.repetitions ?? 0;

  if (reps === 0) {
    // First review
    if (q >= 3) {
      const newEase = calculateNewEase(ease, q);
      return {
        ease: clampEase(newEase),
        interval_days: 1,
        repetitions: 1,
        last_quality: q,
      };
    } else {
      // Failed first review — retry immediately (interval=0)
      return {
        ease: clampEase(ease),
        interval_days: 0,
        repetitions: 0,
        last_quality: q,
      };
    }
  }

  if (q >= 3) {
    // Correct response
    const newEase = calculateNewEase(ease, q);
    let newInterval;

    if (reps === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(intervalDays * clampEase(newEase));
    }

    newInterval = Math.min(SM2_MAX_INTERVAL, Math.max(1, newInterval));

    return {
      ease: clampEase(newEase),
      interval_days: newInterval,
      repetitions: reps + 1,
      last_quality: q,
    };
  } else {
    // Incorrect — reset to learning phase
    return {
      ease: clampEase(ease - 0.2),
      interval_days: 1,
      repetitions: 0,
      last_quality: q,
    };
  }
}

/**
 * Create initial SM-2+ card state.
 */
function createSm2Card() {
  return {
    ease: SM2_INITIAL_EASE,
    interval_days: 1,
    repetitions: 0,
    last_quality: null,
  };
}

/**
 * Calculate ease factor after a review.
 * SM-2 formula: EF' = EF + (0.1 - (0.08 + 0.02*q) * (5-q))
 * @param {number} ease - current ease factor
 * @param {number} quality - 0-5
 * @returns {number} new ease factor
 */
function calculateNewEase(ease, quality) {
  return ease + (0.1 - (0.08 + 0.02 * (5 - quality)) * (5 - quality));
}

/**
 * Check if a card is due for review.
 * @param {object} card - { next_review_at, repetitions }
 * @param {Date} [now] - current time
 * @returns {boolean}
 */
function isDue(card, now = new Date()) {
  if (!card.next_review_at) return true;
  const reviewAt = new Date(card.next_review_at);
  return reviewAt <= now;
}

/**
 * Calculate days overdue.
 * @param {object} card - { next_review_at }
 * @param {Date} [now]
 * @returns {number} 0 if not overdue
 */
function daysOverdue(card, now = new Date()) {
  if (!card.next_review_at) return 0;
  const reviewAt = new Date(card.next_review_at);
  const diffMs = now.getTime() - reviewAt.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 86400000);
}

/**
 * Get interval description for display.
 * @param {number} intervalDays
 * @returns {string}
 */
function describeInterval(intervalDays) {
  if (intervalDays === 0) return 'Now';
  if (intervalDays === 1) return 'Tomorrow';
  if (intervalDays < 7) return `${intervalDays} days`;
  if (intervalDays < 30) return `${Math.round(intervalDays / 7)} weeks`;
  if (intervalDays < 365) return `${Math.round(intervalDays / 30)} months`;
  return '1 year+';
}

/**
 * Build a review queue by interleaving due reviews with new content.
 * @param {Array} dueReviews - items past their review date
 * @param {Array} newContent - items never reviewed
 * @param {number} queueSize - target queue size
 * @returns {Array} mixed queue
 */
function buildReviewQueue(dueReviews = [], newContent = [], queueSize = 10) {
  const queue = [];

  // 30% of queue = due reviews
  const maxReviews = Math.min(dueReviews.length, Math.ceil(queueSize * 0.3));
  const shuffledDue = shuffle([...dueReviews]);
  queue.push(...shuffledDue.slice(0, maxReviews));

  // Fill remaining with new content
  const remaining = queueSize - queue.length;
  const shuffledNew = shuffle([...newContent]);
  queue.push(...shuffledNew.slice(0, remaining));

  // Sort by difficulty (easy first)
  queue.sort((a, b) => (a.difficulty || 3) - (b.difficulty || 3));

  return queue;
}

// ─── Helpers ───────────────────────────────────────────────────

function clampEase(ease) {
  return Math.max(SM2_MIN_EASE, Math.min(SM2_MAX_EASE, ease));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

module.exports = {
  sm2PlusUpdate,
  createSm2Card,
  calculateNewEase,
  isDue,
  daysOverdue,
  describeInterval,
  buildReviewQueue,
  SM2_MIN_EASE,
  SM2_MAX_EASE,
  SM2_INITIAL_EASE,
  SM2_MAX_INTERVAL,
  clampEase,
  addDays,
};
