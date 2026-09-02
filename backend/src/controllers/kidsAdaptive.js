'use strict';
/**
 * Adaptive Difficulty Engine — adjusts game difficulty per child per topic.
 * Rule-based v1 (no ML). Accuracy + response time → difficulty level 1-5.
 *
 * Difficulty levels:
 *   1 = Very Easy (simplified questions, more hints)
 *   2 = Easy (basic questions)
 *   3 = Medium (standard — default)
 *   4 = Hard (tricky questions, less time)
 *   5 = Expert (complex questions, timed)
 *
 * Adjustment: max ±1 per game complete (gradual, not jarring).
 */
const crypto = require('crypto');
const dbm = () => require('../models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_adaptive_profiles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    current_difficulty TINYINT NOT NULL DEFAULT 3,
    accuracy_7d FLOAT NOT NULL DEFAULT 0,
    avg_response_ms_7d INT NOT NULL DEFAULT 0,
    total_attempts INT NOT NULL DEFAULT 0,
    correct_attempts INT NOT NULL DEFAULT 0,
    streak_days INT NOT NULL DEFAULT 0,
    last_practiced_at DATETIME NULL,
    next_review_at DATETIME NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_adaptive_child_topic (child_admission_no, subject, topic),
    KEY idx_adaptive_child (child_admission_no),
    KEY idx_adaptive_review (next_review_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

/**
 * Update adaptive profile after a game complete.
 * Returns the new difficulty level for this subject+topic.
 */
async function updateProfile({ child_admission_no, school_id, subject, topic, score, response_time_ms, correct }) {
  try {
    await ensureSchema();
    const adm = String(child_admission_no);
    const s = String(school_id);
    const sub = String(subject || 'general');
    const t = String(topic || 'general');

    // Upsert profile
    const existing = await dbm().content.query(
      `SELECT * FROM kids_adaptive_profiles WHERE child_admission_no=:adm AND subject=:sub AND topic=:t LIMIT 1`,
      { replacements: { adm, sub, t } },
    );
    const rows = Array.isArray(existing[0]) ? existing[0] : (existing[0] || []);
    const profile = rows[0] || null;

    let totalAttempts = Math.max(0, Number(profile ? profile.total_attempts : 0) || 0) + 1;
    let correctAttempts = Math.max(0, Number(profile ? profile.correct_attempts : 0) || 0) + (correct ? 1 : 0);
    let accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : (correct ? 100 : 0);
    accuracy = Number.isFinite(accuracy) ? Math.round(accuracy * 100) / 100 : 0;
    let oldDifficulty = profile ? profile.current_difficulty : 3;

    // Compute rolling accuracy (weighted toward recent)
    // For simplicity: use overall accuracy for now. In v2, use last 10 attempts only.
    let newDifficulty = oldDifficulty;
    if (accuracy >= 90 && (response_time_ms || 0) < 5000) {
      newDifficulty = Math.min(oldDifficulty + 1, 5);
    } else if (accuracy < 50 || (response_time_ms || 0) > 10000) {
      newDifficulty = Math.max(oldDifficulty - 1, 1);
    }
    // else: stay in flow zone

    // Update avg_response_ms (rolling average)
    const oldAvg = profile ? profile.avg_response_ms_7d : 0;
    const newAvg = totalAttempts > 0
      ? Math.round((oldAvg * (totalAttempts - 1) + (response_time_ms || 0)) / totalAttempts)
      : (response_time_ms || 0);

    // Streak: consecutive days with at least one practice
    const today = new Date().toISOString().slice(0, 10);
    const lastPracticed = profile ? (profile.last_practiced_at || '').slice(0, 10) : '';
    let streak = profile ? profile.streak_days : 0;
    if (lastPracticed === today) {
      // Same day, no change
    } else if (lastPracticed === '') {
      streak = 1;
    } else {
      const lastDate = new Date(lastPracticed);
      const todayDate = new Date(today);
      const diffDays = Math.round((todayDate - lastDate) / 86400000);
      if (diffDays === 1) {
        streak += 1;
      } else if (diffDays > 1) {
        streak = 1; // streak broken
      }
    }

    // Next review (Ebbinghaus: based on quality)
    let intervalDays = 1;
    if (accuracy >= 80) intervalDays = Math.min(30, Math.pow(2, Math.floor(totalAttempts / 3)));
    else if (accuracy >= 50) intervalDays = Math.max(1, Math.floor(totalAttempts / 2));
    else intervalDays = 1; // review soon
    const nextReview = new Date(Date.now() + intervalDays * 86400000);

    if (profile) {
      await dbm().content.query(
        `UPDATE kids_adaptive_profiles SET
          current_difficulty=:diff, accuracy_7d=:acc, avg_response_ms_7d=:avg,
          total_attempts=:ta, correct_attempts=:ca, streak_days=:streak,
          last_practiced_at=NOW(), next_review_at=:nr
         WHERE child_admission_no=:adm AND subject=:sub AND topic=:t`,
        { replacements: { diff: newDifficulty, acc: accuracy, avg: newAvg, ta: totalAttempts, ca: correctAttempts, streak, nr: nextReview, adm, sub, t } },
      );
    } else {
      await dbm().content.query(
        `INSERT INTO kids_adaptive_profiles
          (id, child_admission_no, school_id, subject, topic, current_difficulty, accuracy_7d, avg_response_ms_7d, total_attempts, correct_attempts, streak_days, last_practiced_at, next_review_at)
         VALUES (:id, :adm, :s, :sub, :t, :diff, :acc, :avg, :ta, :ca, :streak, NOW(), :nr)`,
        { replacements: { id: crypto.randomUUID(), adm, s, sub, t, diff: newDifficulty, acc: accuracy, avg: newAvg, ta: totalAttempts, ca: correctAttempts, streak, nr: nextReview } },
      );
    }

    return { difficulty: newDifficulty, accuracy, avg_response_ms: newAvg, streak };
  } catch (err) {
    console.error('adaptive updateProfile error:', err.message);
    return { difficulty: 3, accuracy: 0, avg_response_ms: 0, streak: 0 }; // safe default
  }
}

// GET /kids/adaptive/profile?subject=&topic=
async function getProfile(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const sub = String(req.query.subject || 'general');
    const t = String(req.query.topic || 'general');
    const [rows] = await dbm().content.query(
      `SELECT current_difficulty AS difficulty, accuracy_7d, avg_response_ms_7d, streak_days, last_practiced_at, next_review_at
       FROM kids_adaptive_profiles WHERE child_admission_no=:adm AND subject=:sub AND topic=:t LIMIT 1`,
      { replacements: { adm, sub, t } },
    );
    const profile = (Array.isArray(rows) ? rows : [])[0] || { difficulty: 3, accuracy_7d: 0, avg_response_ms_7d: 0, streak_days: 0 };
    return res.json({ success: true, data: profile });
  } catch (err) {
    console.error('adaptive getProfile error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// POST /kids/adaptive/update { subject, topic, score, response_time_ms, correct }
async function updateProfileEndpoint(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const school_id = req.headers['x-school-id'] || u.school_id;
    const result = await updateProfile({
      child_admission_no: u.admission_no,
      school_id,
      subject: req.body.subject,
      topic: req.body.topic,
      score: req.body.score,
      response_time_ms: req.body.response_time_ms,
      correct: req.body.correct,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('adaptive update error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /kids/adaptive/due-reviews
async function getDueReviews(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const [rows] = await dbm().content.query(
      `SELECT subject, topic, current_difficulty AS difficulty, accuracy_7d, next_review_at
       FROM kids_adaptive_profiles
       WHERE child_admission_no=:adm AND next_review_at <= NOW() AND next_review_at IS NOT NULL
       ORDER BY next_review_at ASC LIMIT 20`,
      { replacements: { adm } },
    );
    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('adaptive getDueReviews error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /kids/adaptive/recommended — next game recommendation
async function getRecommended(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    // Find topics where child is weakest (lowest accuracy) and hasn't practiced recently
    const [rows] = await dbm().content.query(
      `SELECT subject, topic, current_difficulty AS difficulty, accuracy_7d, next_review_at
       FROM kids_adaptive_profiles
       WHERE child_admission_no=:adm
       ORDER BY accuracy_7d ASC, next_review_at ASC NULLS LAST
       LIMIT 5`,
      { replacements: { adm } },
    );
    const recommended = (rows || []).map((r) => ({
      subject: r.subject,
      topic: r.topic,
      difficulty: r.difficulty,
      reason: r.accuracy_7d < 50 ? 'needs_practice' : r.next_review_at ? 'review_due' : 'strengthen',
    }));
    return res.json({ success: true, data: recommended });
  } catch (err) {
    console.error('adaptive getRecommended error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { updateProfile, getProfile, updateProfileEndpoint, getDueReviews, getRecommended, ensureSchema };
