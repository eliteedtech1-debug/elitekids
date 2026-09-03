'use strict';
/**
 * Engagement Economy — XP, Levels, Streaks
 * Endpoints:
 *   GET  /kids/economy/balance       — current XP, level, streak
 *   POST /kids/economy/earn          — award XP for an action
 *   POST /kids/economy/streak/record — record daily play for streak
 */
const crypto = require('crypto');
const dbm = () => require('../models');
const {
  calculateXP,
  updateStreak,
  calculateLevel,
  checkLevelUp,
  checkMilestones,
  getStreakMultiplier,
  today,
} = require('../services/economyService');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`CREATE TABLE IF NOT EXISTS kids_economy (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    xp_total INT NOT NULL DEFAULT 0,
    xp_session_today INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1,
    streak_current INT NOT NULL DEFAULT 0,
    streak_longest INT NOT NULL DEFAULT 0,
    streak_freeze_count TINYINT NOT NULL DEFAULT 0,
    last_play_date DATE NULL,
    current_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    title VARCHAR(100) NULL,
    total_games INT NOT NULL DEFAULT 0,
    perfect_games INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_economy_child (child_admission_no),
    KEY idx_economy_level (level),
    KEY idx_economy_xp (xp_total)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await content.query(`CREATE TABLE IF NOT EXISTS kids_economy_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    action VARCHAR(50) NOT NULL,
    amount INT NOT NULL,
    base_amount INT NOT NULL,
    perfect_bonus INT NOT NULL DEFAULT 0,
    streak_bonus INT NOT NULL DEFAULT 0,
    multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    context JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_econ_tx_child (child_admission_no),
    KEY idx_econ_tx_action (action)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await content.query(`CREATE TABLE IF NOT EXISTS kids_economy_milestones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    milestone_type VARCHAR(50) NOT NULL,
    milestone_value INT NOT NULL,
    achieved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reward_type VARCHAR(50) NULL,
    reward_value VARCHAR(200) NULL,
    UNIQUE KEY uq_milestone_child_type (child_admission_no, milestone_type),
    KEY idx_milestone_child (child_admission_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

function isStudentUser(u) {
  return String(u.user_type || '').toLowerCase() === 'student';
}

function getAdmission(u) {
  return String(u.admission_no || '');
}

async function getEconomy(content, adm, schoolId) {
  const [rows] = await content.query(
    `SELECT * FROM kids_economy WHERE child_admission_no = :adm LIMIT 1`,
    { replacements: { adm } }
  );
  let econ = (Array.isArray(rows) ? rows : [])[0] || null;

  if (!econ) {
    await content.query(
      `INSERT INTO kids_economy (child_admission_no, school_id) VALUES (:adm, :sid)`,
      { replacements: { adm, sid: schoolId || 'general' } }
    );
    const [rows2] = await content.query(
      `SELECT * FROM kids_economy WHERE child_admission_no = :adm LIMIT 1`,
      { replacements: { adm } }
    );
    econ = (Array.isArray(rows2) ? rows2 : [])[0];
  }

  return econ;
}

// GET /kids/economy/balance
async function getBalance(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'ECO_FORBIDDEN', message: 'Students only.' });
    }
    const adm = getAdmission(u);
    const schoolId = req.headers['x-school-id'] || u.school_id;

    await ensureSchema();
    const { content } = dbm();
    const econ = await getEconomy(content, adm, schoolId);

    const lvl = calculateLevel(Number(econ.xp_total || 0));
    const badges = await getBadges(content, adm);

    return res.json({
      success: true,
      data: {
        xp_total: Number(econ.xp_total || 0),
        xp_current_level: lvl.xp_in_level,
        xp_next_level: lvl.xp_to_next,
        level: lvl.level,
        level_name: lvl.level_name,
        streak: {
          current: Number(econ.streak_current || 0),
          longest: Number(econ.streak_longest || 0),
          freeze_count: Number(econ.streak_freeze_count || 0),
          last_play_date: econ.last_play_date,
        },
        multiplier: Number(econ.current_multiplier || 1),
        title: econ.title,
        badges,
      },
    });
  } catch (err) {
    console.error('economy balance error:', err.message);
    return res.status(500).json({ success: false, error_code: 'ECO_SERVER_ERROR', message: 'Server error.' });
  }
}

// POST /kids/economy/earn
async function earnXP(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'ECO_FORBIDDEN', message: 'Students only.' });
    }
    const adm = getAdmission(u);
    const schoolId = req.headers['x-school-id'] || u.school_id;
    const { action, context } = req.body || {};

    await ensureSchema();
    const { content } = dbm();
    const econ = await getEconomy(content, adm, schoolId);

    // Compute XP
    const xpData = calculateXP(action, {
      ...(context || {}),
      streak_current: Number(econ.streak_current || 0),
    });

    const xpBefore = Number(econ.xp_total || 0);
    const xpAfter = xpBefore + xpData.xp_earned;

    // Level up check
    const lvlInfo = checkLevelUp(xpBefore, xpAfter);

    // Persist economy
    await content.query(
      `UPDATE kids_economy SET
        xp_total = :xpa,
        level = :lvl,
        title = :title,
        total_games = total_games + :tg,
        perfect_games = perfect_games + :pg
       WHERE child_admission_no = :adm`,
      {
        replacements: {
          xpa: xpAfter,
          lvl: lvlInfo.new_level,
          title: lvlInfo.new_level_name === 'Beginner' ? null : lvlInfo.new_level_name,
          tg: action === 'game_complete' ? 1 : 0,
          pg: action === 'game_complete' && context && context.score === 100 ? 1 : 0,
          adm,
        },
      }
    );

    // Record transaction
    await content.query(
      `INSERT INTO kids_economy_transactions (child_admission_no, action, amount, base_amount, perfect_bonus, streak_bonus, multiplier, context)
       VALUES (:adm, :action, :amount, :base, :pb, :sb, :mult, :ctx)`,
      {
        replacements: {
          adm,
          action,
          amount: xpData.xp_earned,
          base: xpData.base_amount,
          pb: xpData.perfect_bonus,
          sb: xpData.streak_bonus,
          mult: xpData.multiplier_applied,
          ctx: JSON.stringify(context || {}),
        },
      }
    );

    // Check milestones
    const existingMilestones = await getMilestoneTypes(content, adm);
    const milestoneState = {
      streak: Number(econ.streak_current || 0),
      level: lvlInfo.new_level,
      perfect_games: Number(econ.perfect_games || 0) + (action === 'game_complete' && context && context.score === 100 ? 1 : 0),
      total_games: Number(econ.total_games || 0) + (action === 'game_complete' ? 1 : 0),
    };
    const newMilestones = checkMilestones(milestoneState, existingMilestones);
    for (const m of newMilestones) {
      await content.query(
        `INSERT INTO kids_economy_milestones (child_admission_no, milestone_type, milestone_value, reward_type, reward_value)
         VALUES (:adm, :type, :value, :rt, :rv)`,
        {
          replacements: {
            adm,
            type: m.type,
            value: m.value,
            rt: m.reward_type,
            rv: m.reward_value,
          },
        }
      ).catch(() => {});
    }

    return res.json({
      success: true,
      data: {
        xp_earned: xpData.xp_earned,
        base_amount: xpData.base_amount,
        perfect_bonus: xpData.perfect_bonus,
        streak_bonus: xpData.streak_bonus,
        multiplier_applied: xpData.multiplier_applied,
        new_total: xpAfter,
        level_up: lvlInfo.level_up,
        new_level: lvlInfo.new_level,
        new_level_name: lvlInfo.new_level_name,
        xp_to_next_level: calculateLevel(xpAfter).xp_to_next,
        milestones_reached: newMilestones.map(m => m.type),
      },
    });
  } catch (err) {
    console.error('economy earn error:', err.message);
    return res.status(500).json({ success: false, error_code: 'ECO_SERVER_ERROR', message: 'Server error.' });
  }
}

// POST /kids/economy/streak/record
async function recordStreak(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'ECO_FORBIDDEN', message: 'Students only.' });
    }
    const adm = getAdmission(u);
    const schoolId = req.headers['x-school-id'] || u.school_id;

    await ensureSchema();
    const { content } = dbm();
    const econ = await getEconomy(content, adm, schoolId);

    const todayStr = today();
    const result = updateStreak({
      streak_current: Number(econ.streak_current || 0),
      streak_longest: Number(econ.streak_longest || 0),
      streak_freeze_count: Number(econ.streak_freeze_count || 0),
      last_play_date: econ.last_play_date,
    }, todayStr);

    // Persist
    await content.query(
      `UPDATE kids_economy SET
        streak_current = :sc,
        streak_longest = GREATEST(streak_longest, :sc),
        streak_freeze_count = :sfc,
        last_play_date = :lpd,
        current_multiplier = :mult
       WHERE child_admission_no = :adm`,
      {
        replacements: {
          sc: result.streak,
          sfc: result.new_freeze_count,
          lpd: todayStr,
          mult: getStreakMultiplier(result.streak),
          adm,
        },
      }
    );

    // Check for streak milestones
    const existingMilestones = await getMilestoneTypes(content, adm);
    const newMilestones = checkMilestones(
      { streak: result.streak, level: Number(econ.level || 1), perfect_games: 0, total_games: 0 },
      existingMilestones
    );
    for (const m of newMilestones) {
      await content.query(
        `INSERT INTO kids_economy_milestones (child_admission_no, milestone_type, milestone_value, reward_type, reward_value)
         VALUES (:adm, :type, :value, :rt, :rv)`,
        {
          replacements: { adm, type: m.type, value: m.value, rt: m.reward_type, rv: m.reward_value },
        }
      ).catch(() => {});
    }

    return res.json({
      success: true,
      data: {
        streak: result.streak,
        streak_increased: result.streak_increased,
        freeze_used: result.freeze_used,
        streak_broken: result.streak_broken,
        multiplier: getStreakMultiplier(result.streak),
        milestone_reached: newMilestones.length > 0 ? newMilestones[0].type : null,
        congrats_message: buildCongratsMessage(result, getStreakMultiplier(result.streak)),
      },
    });
  } catch (err) {
    console.error('economy streak error:', err.message);
    return res.status(500).json({ success: false, error_code: 'ECO_SERVER_ERROR', message: 'Server error.' });
  }
}

// Internal: award XP for a review completion (called from SRE v2)
async function updateReviewXP(child_admission_no, school_id) {
  await ensureSchema();
  const { content } = dbm();
  const econ = await getEconomy(content, child_admission_no, school_id);

  const xpData = calculateXP('review_complete', {
    streak_current: Number(econ.streak_current || 0),
  });
  const xpAfter = Number(econ.xp_total || 0) + xpData.xp_earned;
  const lvlInfo = checkLevelUp(Number(econ.xp_total || 0), xpAfter);

  await content.query(
    `UPDATE kids_economy SET
      xp_total = :xpa,
      level = :lvl,
      title = :title
     WHERE child_admission_no = :adm`,
    {
      replacements: {
        xpa: xpAfter,
        lvl: lvlInfo.new_level,
        title: lvlInfo.new_level_name === 'Beginner' ? null : lvlInfo.new_level_name,
        adm: child_admission_no,
      },
    }
  );

  await content.query(
    `INSERT INTO kids_economy_transactions (child_admission_no, action, amount, base_amount, perfect_bonus, streak_bonus, multiplier)
     VALUES (:adm, 'review_complete', :amount, :base, 0, :sb, :mult)`,
    {
      replacements: {
        adm: child_admission_no,
        amount: xpData.xp_earned,
        base: xpData.base_amount,
        sb: xpData.streak_bonus,
        mult: xpData.multiplier_applied,
      },
    }
  ).catch(() => {});

  return xpData.xp_earned;
}

// Internal: update economy after game complete (called from ADE + game-complete)
async function updateEconomyAfterGame({ child_admission_no, school_id, correct, score }) {
  await ensureSchema();
  const { content } = dbm();
  const econ = await getEconomy(content, child_admission_no, school_id);

  // Streak update (user played today)
  const todayStr = today();
  const streakResult = updateStreak({
    streak_current: Number(econ.streak_current || 0),
    streak_longest: Number(econ.streak_longest || 0),
    streak_freeze_count: Number(econ.streak_freeze_count || 0),
    last_play_date: econ.last_play_date,
  }, todayStr);

  // Streak bonus recorded via updateStreak + current streak
  const xpData = calculateXP('game_complete', {
    score,
    streak_current: streakResult.streak,
  });

  const xpAfter = Number(econ.xp_total || 0) + xpData.xp_earned;
  const lvlInfo = checkLevelUp(Number(econ.xp_total || 0), xpAfter);

  await content.query(
    `UPDATE kids_economy SET
      xp_total = :xpa,
      level = :lvl,
      title = :title,
      streak_current = :sc,
      streak_longest = GREATEST(streak_longest, :sc),
      streak_freeze_count = :sfc,
      last_play_date = :lpd,
      current_multiplier = :mult,
      total_games = total_games + 1,
      perfect_games = perfect_games + :pg
     WHERE child_admission_no = :adm`,
    {
      replacements: {
        xpa: xpAfter,
        lvl: lvlInfo.new_level,
        title: lvlInfo.new_level_name === 'Beginner' ? null : lvlInfo.new_level_name,
        sc: streakResult.streak,
        sfc: streakResult.new_freeze_count,
        lpd: todayStr,
        mult: getStreakMultiplier(streakResult.streak),
        pg: score === 100 ? 1 : 0,
        adm: child_admission_no,
      },
    }
  );

  // Transaction
  await content.query(
    `INSERT INTO kids_economy_transactions (child_admission_no, action, amount, base_amount, perfect_bonus, streak_bonus, multiplier, context)
     VALUES (:adm, 'game_complete', :amount, :base, :pb, :sb, :mult, :ctx)`,
    {
      replacements: {
        adm: child_admission_no,
        amount: xpData.xp_earned,
        base: xpData.base_amount,
        pb: xpData.perfect_bonus,
        sb: xpData.streak_bonus,
        mult: xpData.multiplier_applied,
        ctx: JSON.stringify({ score, correct }),
      },
    }
  ).catch(() => {});

  return {
    xp_earned: xpData.xp_earned,
    multiplier: xpData.multiplier_applied,
    streak: streakResult.streak,
    level_up: lvlInfo.level_up,
    new_level: lvlInfo.new_level,
  };
}

async function getBadges(content, adm) {
  const [rows] = await content.query(
    `SELECT milestone_type FROM kids_economy_milestones WHERE child_admission_no = :adm`,
    { replacements: { adm } }
  );
  return (Array.isArray(rows) ? rows : []).map(r => r.milestone_type);
}

async function getMilestoneTypes(content, adm) {
  const [rows] = await content.query(
    `SELECT milestone_type FROM kids_economy_milestones WHERE child_admission_no = :adm`,
    { replacements: { adm } }
  );
  return (Array.isArray(rows) ? rows : []).map(r => r.milestone_type);
}

function buildCongratsMessage(result, multiplier) {
  if (result.streak === 3) return '3 days in a row! Keep going!';
  if (result.streak === 7) return '7 days! You are on fire!';
  if (result.streak === 14) return '2 weeks strong! Amazing!';
  if (result.streak === 30) return '30 days! You are a legend!';
  if (result.streak_increased) return `${result.streak} days in a row! Keep going!`;
  if (result.freeze_used) return 'Streak protected with freeze!';
  return 'Keep playing!';
}

module.exports = {
  getBalance,
  earnXP,
  recordStreak,
  updateEconomyAfterGame,
  updateReviewXP,
  _getEconomy: getEconomy,
  _ensureSchema: ensureSchema,
};
