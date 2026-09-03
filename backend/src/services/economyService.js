'use strict';
/**
 * Engagement Economy — XP, Levels, Streaks, Multipliers
 * Pure functions. No DB calls. No side effects.
 */

// ─── XP Table ──────────────────────────────────────────────────

const XP_TABLE = {
  daily_login: 10,
  game_complete: 20,
  perfect_score: 50,
  review_complete: 15,
  boss_defeated: 100,
  festival_complete: 200,
  help_classmate: 25,
  first_game_of_day: 10,
};

const VALID_ACTIONS = Object.keys(XP_TABLE);

// ─── Level Definitions ─────────────────────────────────────────

const LEVELS = [
  { level: 1, xp_required: 0, cumulative_xp: 0, title: 'Beginner' },
  { level: 2, xp_required: 50, cumulative_xp: 50, title: 'Explorer' },
  { level: 3, xp_required: 150, cumulative_xp: 200, title: 'Adventurer' },
  { level: 4, xp_required: 350, cumulative_xp: 550, title: 'Seeker' },
  { level: 5, xp_required: 500, cumulative_xp: 1050, title: 'Scholar' },
  { level: 6, xp_required: 800, cumulative_xp: 1850, title: 'Sage' },
  { level: 7, xp_required: 1200, cumulative_xp: 3050, title: 'Expert' },
  { level: 8, xp_required: 1800, cumulative_xp: 4850, title: 'Adept' },
  { level: 9, xp_required: 2500, cumulative_xp: 7350, title: 'Virtuoso' },
  { level: 10, xp_required: 5000, cumulative_xp: 12350, title: 'Master' },
  { level: 15, xp_required: 15000, cumulative_xp: 47350, title: 'Champion' },
  { level: 20, xp_required: 35000, cumulative_xp: 122350, title: 'Legend' },
  { level: 25, xp_required: 65000, cumulative_xp: 247350, title: 'Hero' },
  { level: 30, xp_required: 100000, cumulative_xp: 447350, title: 'Grandmaster' },
];

// ─── Streak Multipliers ────────────────────────────────────────

const STREAK_MULTIPLIERS = [
  { min_days: 0, multiplier: 1.0 },
  { min_days: 3, multiplier: 1.2 },
  { min_days: 7, multiplier: 1.5 },
  { min_days: 14, multiplier: 2.0 },
  { min_days: 30, multiplier: 3.0 },
];

// ─── XP Calculation ────────────────────────────────────────────

/**
 * Calculate XP for an action.
 * @param {string} action - economy action type
 * @param {object} context - { streak_current, score, hints_used }
 * @returns {{ xp_earned, base_amount, streak_bonus, multiplier_applied }}
 */
function calculateXP(action, context = {}) {
  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid action: ${action}. Valid: ${VALID_ACTIONS.join(', ')}`);
  }

  const base = XP_TABLE[action];
  const streakCurrent = context.streak_current || 0;

  // Perfect score bonus (only for game_complete)
  const perfectBonus = (action === 'game_complete' && context.score === 100) ? 30 : 0;

  // Streak bonus
  const streakBonus = streakCurrent * 5;

  // Subtotal
  const subtotal = base + perfectBonus + streakBonus;

  // Apply multiplier
  const multiplier = getStreakMultiplier(streakCurrent);
  const total = Math.round(subtotal * multiplier);

  return {
    xp_earned: total,
    base_amount: base,
    perfect_bonus: perfectBonus,
    streak_bonus: streakBonus,
    multiplier_applied: multiplier,
  };
}

// ─── Streak Multiplier ─────────────────────────────────────────

/**
 * Get the XP multiplier for a given streak.
 * @param {number} streakDays
 * @returns {number}
 */
function getStreakMultiplier(streakDays) {
  let multiplier = 1.0;
  for (const tier of STREAK_MULTIPLIERS) {
    if (streakDays >= tier.min_days) {
      multiplier = tier.multiplier;
    }
  }
  return multiplier;
}

// ─── Streak Logic ──────────────────────────────────────────────

/**
 * Update streak based on play date.
 * @param {object} streakState - { streak_current, streak_longest, last_play_date, streak_freeze_count }
 * @param {string} todayDate - YYYY-MM-DD
 * @returns {{ streak, streak_increased, freeze_used, streak_broken }}
 */
function updateStreak(streakState, todayDate) {
  const lastPlay = streakState.last_play_date;
  const currentStreak = streakState.streak_current || 0;
  const longestStreak = streakState.streak_longest || 0;
  const freezeCount = streakState.streak_freeze_count || 0;

  if (!lastPlay) {
    // First ever play
    return {
      streak: 1,
      streak_increased: true,
      freeze_used: false,
      streak_broken: false,
      new_freeze_count: freezeCount,
    };
  }

  if (lastPlay === todayDate) {
    // Already played today
    return {
      streak: currentStreak,
      streak_increased: false,
      freeze_used: false,
      streak_broken: false,
      new_freeze_count: freezeCount,
    };
  }

  const diffDays = daysBetween(lastPlay, todayDate);

  if (diffDays === 1) {
    // Consecutive day — increment
    const newStreak = currentStreak + 1;
    // Award freeze every 7 days
    const newFreezeCount = (newStreak % 7 === 0) ? Math.min(3, freezeCount + 1) : freezeCount;
    return {
      streak: newStreak,
      streak_increased: true,
      freeze_used: false,
      streak_broken: false,
      new_freeze_count: newFreezeCount,
    };
  }

  if (diffDays === 2 && freezeCount > 0) {
    // Missed 1 day but have freeze — use it
    return {
      streak: currentStreak,
      streak_increased: false,
      freeze_used: true,
      streak_broken: false,
      new_freeze_count: freezeCount - 1,
    };
  }

  // Streak broken
  return {
    streak: 1,
    streak_increased: false,
    freeze_used: false,
    streak_broken: currentStreak > 0,
    new_freeze_count: freezeCount,
  };
}

// ─── Level Calculation ─────────────────────────────────────────

/**
 * Calculate level from total XP.
 * @param {number} xpTotal
 * @returns {{ level, level_name, xp_in_level, xp_to_next, progress_percent }}
 */
function calculateLevel(xpTotal) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xpTotal >= LEVELS[i].cumulative_xp) {
      const current = LEVELS[i];
      const next = LEVELS[i + 1];
      const xpInLevel = xpTotal - current.cumulative_xp;
      const xpToNext = next ? next.xp_required : 0;
      const progress = xpToNext > 0 ? Math.min(100, Math.round((xpInLevel / xpToNext) * 100)) : 100;

      return {
        level: current.level,
        level_name: current.title,
        xp_in_level: xpInLevel,
        xp_to_next: xpToNext,
        progress_percent: progress,
      };
    }
  }

  return {
    level: 1,
    level_name: 'Beginner',
    xp_in_level: 0,
    xp_to_next: 50,
    progress_percent: 0,
  };
}

/**
 * Check if earning XP causes a level up.
 * @param {number} xpBefore
 * @param {number} xpAfter
 * @returns {{ level_up: boolean, old_level: number, new_level: number }}
 */
function checkLevelUp(xpBefore, xpAfter) {
  const oldLevel = calculateLevel(xpBefore);
  const newLevel = calculateLevel(xpAfter);
  return {
    level_up: newLevel.level > oldLevel.level,
    old_level: oldLevel.level,
    new_level: newLevel.level,
    old_level_name: oldLevel.level_name,
    new_level_name: newLevel.level_name,
  };
}

// ─── Milestones ────────────────────────────────────────────────

const MILESTONES = [
  { type: 'streak_3', value: 3, reward_type: 'xp_bonus', reward_value: '25' },
  { type: 'streak_7', value: 7, reward_type: 'xp_bonus', reward_value: '50' },
  { type: 'streak_14', value: 14, reward_type: 'companion_color', reward_value: 'rainbow' },
  { type: 'streak_30', value: 30, reward_type: 'badge', reward_value: 'legend_streak' },
  { type: 'level_5', value: 5, reward_type: 'theme', reward_value: 'ocean' },
  { type: 'level_10', value: 10, reward_type: 'theme', reward_value: 'space' },
  { type: 'level_20', value: 20, reward_type: 'theme', reward_value: 'forest' },
  { type: 'perfect_10', value: 10, reward_type: 'badge', reward_value: 'perfect_10' },
  { type: 'perfect_50', value: 50, reward_type: 'badge', reward_value: 'perfect_50' },
  { type: 'games_100', value: 100, reward_type: 'badge', reward_value: 'centurion' },
];

/**
 * Check if any milestones were just reached.
 * @param {object} state - { streak, level, total_games, perfect_games }
 * @param {Array} existingMilestones - already achieved milestone types
 * @returns {Array} newly achieved milestones
 */
function checkMilestones(state, existingMilestones = []) {
  const achieved = [];
  const existing = new Set(existingMilestones);

  for (const milestone of MILESTONES) {
    if (existing.has(milestone.type)) continue;

    let met = false;
    if (milestone.type.startsWith('streak_') && (state.streak || 0) >= milestone.value) met = true;
    if (milestone.type.startsWith('level_') && (state.level || 0) >= milestone.value) met = true;
    if (milestone.type.startsWith('perfect_') && (state.perfect_games || 0) >= milestone.value) met = true;
    if (milestone.type.startsWith('games_') && (state.total_games || 0) >= milestone.value) met = true;

    if (met) {
      achieved.push(milestone);
    }
  }

  return achieved;
}

// ─── Helpers ───────────────────────────────────────────────────

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  XP_TABLE,
  VALID_ACTIONS,
  LEVELS,
  STREAK_MULTIPLIERS,
  MILESTONES,
  calculateXP,
  getStreakMultiplier,
  updateStreak,
  calculateLevel,
  checkLevelUp,
  checkMilestones,
  today,
  daysBetween,
};
