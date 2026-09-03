'use strict';
/**
 * Adaptive Difficulty Engine v2 — BKT-based, SQL-backed.
 * Replaces kidsAdaptive.js rule-based v1.
 *
 * Endpoints:
 *   POST /kids/adaptive/v2/update        — record item response, update BKT state
 *   GET  /kids/adaptive/v2/profile       — get adaptive state for a skill
 *   GET  /kids/adaptive/v2/next-item     — get next optimal item recommendation
 *   GET  /kids/adaptive/v2/skills        — get all skills + mastery states
 */
const crypto = require('crypto');
const dbm = () => require('../models');
const {
  bktUpdate,
  eloUpdate,
  calculateDifficulty,
  detectStruggle,
  getMasteryState,
  scoreQuality,
  today,
} = require('../services/adaptiveEngine');
const { updateEconomyAfterGame } = require('./kidsEconomy');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`CREATE TABLE IF NOT EXISTS kids_adaptive_state_v2 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    skill_key VARCHAR(100) NOT NULL,
    mastery_probability DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    bkt_p_learning DECIMAL(5,4) NOT NULL DEFAULT 0.3000,
    bkt_p_guess DECIMAL(5,4) NOT NULL DEFAULT 0.2500,
    bkt_p_slip DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
    bkt_p_transit DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
    elo_rating INT NOT NULL DEFAULT 1000,
    current_difficulty TINYINT NOT NULL DEFAULT 3,
    total_attempts INT NOT NULL DEFAULT 0,
    correct_attempts INT NOT NULL DEFAULT 0,
    avg_response_time_ms INT NOT NULL DEFAULT 0,
    last_5_response_times JSON,
    consecutive_wrong INT NOT NULL DEFAULT 0,
    struggle_count_today INT NOT NULL DEFAULT 0,
    last_struggle_at DATETIME NULL,
    streak_days INT NOT NULL DEFAULT 0,
    last_practiced_at DATETIME NULL,
    zpd_lower DECIMAL(5,3) NOT NULL DEFAULT 0.300,
    zpd_upper DECIMAL(5,3) NOT NULL DEFAULT 0.700,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_adaptive_v2_child_skill (child_admission_no, skill_key),
    KEY idx_adaptive_v2_child (child_admission_no),
    KEY idx_adaptive_v2_mastery (mastery_probability),
    KEY idx_adaptive_v2_difficulty (current_difficulty)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

function getReplacementOrError(res, body) {
  const { skill_key, item_id, correct } = body || {};
  if (!skill_key || typeof skill_key !== 'string') {
    return { error: res.status(400).json({ success: false, code: 'ADE_INVALID_SKILL_KEY', message: 'skill_key is required and must be a string' }) };
  }
  if (!item_id || typeof item_id !== 'string') {
    return { error: res.status(400).json({ success: false, code: 'ADE_INVALID_ITEM_ID', message: 'item_id is required' }) };
  }
  if (typeof correct !== 'boolean') {
    return { error: res.status(400).json({ success: false, code: 'ADE_INVALID_CORRECT', message: 'correct must be a boolean' }) };
  }
  const q = body.quality;
  if (q != null && (typeof q !== 'number' || !Number.isInteger(q) || q < 0 || q > 5)) {
    return { error: res.status(400).json({ success: false, code: 'ADE_INVALID_QUALITY', message: 'quality must be an integer between 0 and 5' }) };
  }
  return {};
}

async function getState(content, adm, skillKey) {
  const [rows] = await content.query(
    `SELECT * FROM kids_adaptive_state_v2 WHERE child_admission_no = :adm AND skill_key = :sk LIMIT 1`,
    { replacements: { adm, sk: skillKey } }
  );
  return (Array.isArray(rows) ? rows : [])[0] || null;
}

async function getStateOrCreate(content, adm, schoolId, skillKey) {
  let state = await getState(content, adm, skillKey);
  if (!state) {
    await content.query(
      `INSERT INTO kids_adaptive_state_v2 (id, child_admission_no, school_id, skill_key)
       VALUES (:id, :adm, :sid, :sk)`,
      { replacements: { id: crypto.randomUUID(), adm, sid: schoolId, sk: skillKey } }
    );
    state = await getState(content, adm, skillKey);
  }
  return state;
}

// POST /kids/adaptive/v2/update
async function updateProfile(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, code: 'ADE_FORBIDDEN', message: 'Students only.' });
    }

    const check = getReplacementOrError(res, req.body);
    if (check.error) return;

    const { skill_key, item_id, correct, response_time_ms, mode, distractor_count, quality, hints_used, total_items } = req.body;
    const adm = String(u.admission_no || '');
    const schoolId = req.headers['x-school-id'] || u.school_id;

    await ensureSchema();
    const { content } = dbm();

    // Get or create adaptive state
    let state = await getStateOrCreate(content, adm, schoolId, skill_key);

    // Parse state fields
    const masteryBefore = Number(state.mastery_probability || 0);
    const currentDiff = Number(state.current_difficulty || 3);
    const bktState = {
      p_knows: masteryBefore,
      p_L: Number(state.bkt_p_learning || 0.3),
      p_G: Number(state.bkt_p_guess || 0.25),
      p_S: Number(state.bkt_p_slip || 0.10),
      p_T: Number(state.bkt_p_transit || 0.10),
    };

    // Quality — if not provided, derive from performance
    const effectiveQuality = quality != null ? quality : scoreQuality({
      score: correct ? 100 : 0,
      response_time_ms,
      hints_used,
      total_items,
    });

    // BKT update
    const masteryAfter2 = bktUpdate(bktState, correct);
    const masteryAfter = Math.round(masteryAfter2 * 10000) / 10000;

    // Elo update
    const eloAfter = eloUpdate(Number(state.elo_rating || 1000), 1000, correct);

    // Track attempts
    const totalAttempts = Number(state.total_attempts || 0) + 1;
    const correctAttempts = Number(state.correct_attempts || 0) + (correct ? 1 : 0);

    // Response time buffer (last 5)
    const prevTimes = state.last_5_response_times ? JSON.parse(state.last_5_response_times) : [];
    const times = [...prevTimes, response_time_ms || 0].slice(-5);
    const avgResponseMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length) || 0;

    // Consecutive wrong
    const consecutiveWrong = correct ? 0 : Number(state.consecutive_wrong || 0) + 1;

    // Struggle detection
    const struggle = detectStruggle(
      {
        consecutive_wrong: consecutiveWrong,
        last_5_response_times: times,
      },
      {
        hints_used: hints_used || 0,
        total_items,
        session_accuracy_start: req.body.session_accuracy_start,
        session_accuracy_current: req.body.session_accuracy_current,
      }
    );

    // Difficulty
    const difficultyAfter = calculateDifficulty(currentDiff, masteryAfter, avgResponseMs, struggle);

    // Streak tracking (reuse economy streak via last_practiced_at date)
    const streakDays = updateStreakFromState(state);
    const todayStr = today();

    // Struggle counter
    let struggleCountToday = Number(state.struggle_count_today || 0);
    let lastStruggleAt = state.last_struggle_at;
    if (struggle.struggling) {
      struggleCountToday += 1;
      lastStruggleAt = new Date();
    }

    // Persist
    await content.query(
      `UPDATE kids_adaptive_state_v2 SET
        mastery_probability = :mp,
        elo_rating = :elo,
        current_difficulty = :diff,
        total_attempts = :ta,
        correct_attempts = :ca,
        avg_response_time_ms = :avg,
        last_5_response_times = :times,
        consecutive_wrong = :cw,
        struggle_count_today = :sct,
        last_struggle_at = :lsa,
        last_practiced_at = NOW()
       WHERE child_admission_no = :adm AND skill_key = :sk`,
      {
        replacements: {
          mp: masteryAfter,
          elo: eloAfter,
          diff: difficultyAfter,
          ta: totalAttempts,
          ca: correctAttempts,
          avg: avgResponseMs,
          times: JSON.stringify(times),
          cw: consecutiveWrong,
          sct: struggleCountToday,
          lsa: lastStruggleAt,
          adm,
          sk: skill_key,
        },
      }
    );

    // Record item response (if client didn't already)
    try {
      await content.query(
        `INSERT INTO kids_game_item_responses (id, student_id, item_id, tier, distractor_count, response_time_ms, mode, correct, quality, skill_key, mastery_before, mastery_after, createdAt, updatedAt)
         VALUES (:id, :adm, :iid, :tier, :dc, :rt, :mode, :correct, :q, :sk, :mb, :ma, NOW(), NOW())`,
        {
          replacements: {
            id: crypto.randomUUID(),
            adm,
            iid: item_id,
            tier: 0,
            dc: distractor_count || 0,
            rt: response_time_ms || 0,
            mode: mode || 'learning',
            correct,
            q: effectiveQuality,
            sk: skill_key,
            mb: masteryBefore,
            ma: masteryAfter,
          },
        }
      );
    } catch (e) {
      // Table may not have new columns yet — non-fatal
    }

    // XP via economy (game-level, not per-item)
    let xpData = null;
    try {
      // (updateEconomyAfterGame imported at top)
      xpData = await updateEconomyAfterGame({
        child_admission_no: adm,
        school_id: schoolId,
        correct,
        score: correct ? 100 : 0,
      });
    } catch (e) {
      // Economy unavailable — non-fatal
    }

    return res.json({
      success: true,
      data: {
        mastery_probability: masteryAfter,
        difficulty: difficultyAfter,
        mastery_state: getMasteryState(masteryAfter),
        struggle_detected: struggle.struggling,
        struggle_severity: struggle.severity,
        elo_rating: eloAfter,
        xp_earned: xpData ? xpData.xp_earned : 0,
        streak_multiplier: xpData ? xpData.multiplier : 1,
      },
    });
  } catch (err) {
    console.error('ADE v2 update error:', err.message);
    return res.status(500).json({ success: false, code: 'ADE_SERVER_ERROR', message: 'Server error.' });
  }
}

function updateStreakFromState(state) {
  // Derive streak from last_practiced_at vs today
  if (!state.last_practiced_at) return 1;
  const lastDay = new Date(state.last_practiced_at).toISOString().slice(0, 10);
  const todayStr = today();
  if (lastDay === todayStr) return Number(state.streak_days || 1);
  const diff = Math.round((new Date(todayStr) - new Date(lastDay)) / 86400000);
  if (diff === 1) return Number(state.streak_days || 0) + 1;
  return 1;
}

// GET /kids/adaptive/v2/profile?skill_key=
async function getProfile(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, code: 'ADE_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const skillKey = String(req.query.skill_key || '');

    if (!skillKey) {
      return res.status(400).json({ success: false, code: 'ADE_INVALID_SKILL_KEY', message: 'skill_key is required' });
    }

    await ensureSchema();
    const { content } = dbm();
    const state = await getState(content, adm, skillKey);

    if (!state) {
      return res.json({
        success: true,
        data: {
          skill_key: skillKey,
          mastery_probability: 0.001,
          mastery_state: 'new',
          difficulty: 3,
          total_attempts: 0,
          correct_attempts: 0,
          avg_response_time_ms: 0,
          last_practiced_at: null,
          elo_rating: 1000,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        skill_key: state.skill_key,
        mastery_probability: Number(state.mastery_probability),
        mastery_state: getMasteryState(Number(state.mastery_probability)),
        difficulty: Number(state.current_difficulty),
        total_attempts: Number(state.total_attempts),
        correct_attempts: Number(state.correct_attempts),
        avg_response_time_ms: Number(state.avg_response_time_ms),
        last_practiced_at: state.last_practiced_at,
        streak_days: Number(state.streak_days),
        elo_rating: Number(state.elo_rating),
      },
    });
  } catch (err) {
    console.error('ADE v2 profile error:', err.message);
    return res.status(500).json({ success: false, code: 'ADE_SERVER_ERROR', message: 'Server error.' });
  }
}

// GET /kids/adaptive/v2/skills
async function getSkills(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, code: 'ADE_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    await ensureSchema();
    const { content } = dbm();

    const [rows] = await content.query(
      `SELECT skill_key, mastery_probability, current_difficulty, total_attempts, correct_attempts,
              avg_response_time_ms, last_practiced_at, streak_days, elo_rating
       FROM kids_adaptive_state_v2 WHERE child_admission_no = :adm ORDER BY mastery_probability ASC`,
      { replacements: { adm } }
    );
    const skills = (Array.isArray(rows) ? rows : []).map(r => ({
      skill_key: r.skill_key,
      mastery_probability: Number(r.mastery_probability),
      mastery_state: getMasteryState(Number(r.mastery_probability)),
      difficulty: Number(r.current_difficulty),
      total_attempts: Number(r.total_attempts),
      correct_attempts: Number(r.correct_attempts),
      avg_response_time_ms: Number(r.avg_response_time_ms),
      last_practiced_at: r.last_practiced_at,
      streak_days: Number(r.streak_days),
      elo_rating: Number(r.elo_rating),
    }));

    const summary = {
      total_skills: skills.length,
      mastered: skills.filter(s => s.mastery_state === 'mastered').length,
      nearly_there: skills.filter(s => s.mastery_state === 'nearly_there').length,
      practicing: skills.filter(s => s.mastery_state === 'practicing').length,
      learning: skills.filter(s => s.mastery_state === 'learning').length,
      new: skills.filter(s => s.mastery_state === 'new').length,
    };

    return res.json({ success: true, data: { skills, summary } });
  } catch (err) {
    console.error('ADE v2 skills error:', err.message);
    return res.status(500).json({ success: false, code: 'ADE_SERVER_ERROR', message: 'Server error.' });
  }
}

// GET /kids/adaptive/v2/next-item
async function getNextItems(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, code: 'ADE_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const subject = String(req.query.subject || '');
    const count = Math.min(Number(req.query.count) || 5, 20);

    await ensureSchema();
    const { content } = dbm();

    // Weakest skills (lowest mastery), optionally filtered by subject
    const subjectFilter = subject ? ` AND skill_key LIKE :suffix` : '';
    const [rows] = await content.query(
      `SELECT skill_key, mastery_probability, current_difficulty, last_practiced_at, consecutive_wrong
       FROM kids_adaptive_state_v2
       WHERE child_admission_no = :adm${subjectFilter}
       ORDER BY mastery_probability ASC
       LIMIT :cnt`,
      {
        replacements: {
          adm,
          suffix: subject ? `${subject}.%` : '',
          cnt: count,
        },
      }
    );
    const skills = (Array.isArray(rows) ? rows : []).map(r => ({
      skill_key: r.skill_key,
      mastery_probability: Number(r.mastery_probability),
      mastery_state: getMasteryState(Number(r.mastery_probability)),
      difficulty: Number(r.current_difficulty),
      last_practiced_at: r.last_practiced_at,
      consecutive_wrong: Number(r.consecutive_wrong || 0),
    }));

    // Recommend weakest skills first; if none, suggest default
    const items = skills.length > 0
      ? skills.map(s => ({
          skill_key: s.skill_key,
          difficulty: s.difficulty,
          reason: s.consecutive_wrong >= 3 ? 'needs_practice' : s.mastery_probability < 0.5 ? 'needs_practice' : 'strengthen',
          mastery_probability: s.mastery_probability,
        }))
      : [{ skill_key: `${subject ? subject + '.' : ''}general`, difficulty: 3, reason: 'new_skill', mastery_probability: 0 }];

    return res.json({
      success: true,
      data: {
        items,
        session_recommendation: {
          focus_skill: items[0] ? items[0].skill_key : null,
          cause: items[0] ? items[0].reason : 'explore',
        },
      },
    });
  } catch (err) {
    console.error('ADE v2 next-item error:', err.message);
    return res.status(500).json({ success: false, code: 'ADE_SERVER_ERROR', message: 'Server error.' });
  }
}

module.exports = {
  updateProfile,
  getProfile,
  getSkills,
  getNextItems,
  ensureSchema,
  _getState: getState,
  _getStateOrCreate: getStateOrCreate,
};
