'use strict';

/**
 * Q3 Classroom Collaboration — class quest scoring (PURE).
 *
 * Whole-class target vs individual contribution. Deterministic + DB-free.
 *
 * Given a quest with `target_value` (whole class target) and `contributions`
 * (map child_admission_no -> amount), compute:
 *   - totalProgress (sum of contributions)
 *   - progressPct   (0..100, clamped)
 *   - isComplete    (progressPct >= 100)
 *   - leaderboard   (sorted contributions with pct of total shares)
 */

function scoreQuest({ target_value, contributions = {} } = {}) {
  const target = Math.max(1, Number(target_value) || 1);
  const entries = Object.entries(contributions || {}).map(([child_admission_no, amount]) => ({
    child_admission_no,
    amount: Math.max(0, Number(amount) || 0),
  }));

  const totalProgress = entries.reduce((sum, e) => sum + e.amount, 0);
  const progressPct = Math.min(100, Math.round((totalProgress / target) * 100));
  const isComplete = totalProgress >= target;

  const leaderboard = entries
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((e) => ({
      child_admission_no: e.child_admission_no,
      amount: e.amount,
      share_pct: totalProgress > 0 ? Math.round((e.amount / totalProgress) * 100) : 0,
    }));

  return {
    target_value: target,
    total_progress: totalProgress,
    progress_pct: progressPct,
    is_complete: isComplete,
    leaderboard,
  };
}

/**
 * Merge a new contribution into an existing contributions map (deterministic).
 */
function applyContribution(contributions, child_admission_no, amount) {
  const map = { ...(contributions || {}) };
  map[child_admission_no] = Math.max(0, Number(map[child_admission_no]) || 0) + Math.max(0, Number(amount) || 0);
  return map;
}

module.exports = {
  scoreQuest,
  applyContribution,
};
