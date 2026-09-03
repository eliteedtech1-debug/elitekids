'use strict';
/**
 * Spaced Repetition v2 — SM-2+ algorithm
 * Endpoints:
 *   GET  /kids/reviews/v2/today     — today's review queue
 *   POST /kids/reviews/v2/complete  — mark review complete, schedule next
 *   GET  /kids/reviews/v2/stats     — review statistics
 */
const crypto = require('crypto');
const dbm = () => require('../models');
const {
  sm2PlusUpdate,
  createSm2Card,
  isDue,
  daysOverdue,
} = require('../services/spacedRepetition');
const { getMasteryState } = require('../services/adaptiveEngine');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`CREATE TABLE IF NOT EXISTS kids_review_schedule_v2 (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    skill_key VARCHAR(100) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    ease DECIMAL(5,3) NOT NULL DEFAULT 2.500,
    interval_days INT NOT NULL DEFAULT 1,
    repetitions INT NOT NULL DEFAULT 0,
    last_quality TINYINT NULL,
    next_review_at DATETIME NOT NULL,
    last_reviewed_at DATETIME NULL,
    status ENUM('active', 'completed', 'suspended') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_review_v2_child_item (child_admission_no, skill_key, item_id),
    KEY idx_review_v2_child (child_admission_no),
    KEY idx_review_v2_next (next_review_at),
    KEY idx_review_v2_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

function isStudentUser(u) {
  return String(u.user_type || '').toLowerCase() === 'student';
}

// GET /kids/reviews/v2/today
async function getTodayReviews(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'SRE_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');

    await ensureSchema();
    const { content } = dbm();

    // Due reviews (next_review_at <= NOW)
    const [rows] = await content.query(
      `SELECT r.id AS review_id, r.skill_key, r.item_id, r.interval_days, r.repetitions,
              r.last_quality, r.next_review_at, r.ease
       FROM kids_review_schedule_v2 r
       WHERE r.child_admission_no = :adm
         AND r.status = 'active'
         AND r.next_review_at <= NOW()
       ORDER BY r.next_review_at ASC
       LIMIT 50`,
      { replacements: { adm } }
    );

    // Get lesson titles for each item
    const reviews = [];
    for (const r of (Array.isArray(rows) ? rows : [])) {
      let lessonTitle = null;
      let lessonId = null;
      try {
        const [lRows] = await content.query(
          `SELECT id, title FROM kids_lessons WHERE id = :iid OR game_config_id = :iid LIMIT 1`,
          { replacements: { iid: r.item_id } }
        );
        const lesson = (Array.isArray(lRows) ? lRows : [])[0];
        if (lesson) {
          lessonTitle = lesson.title;
          lessonId = lesson.id;
        }
      } catch (e) { /* non-fatal */ }

      // Mastery for skill
      let mastery = 0;
      try {
        const [mRows] = await content.query(
          `SELECT mastery_probability FROM kids_adaptive_state_v2 WHERE child_admission_no = :adm AND skill_key = :sk LIMIT 1`,
          { replacements: { adm, sk: r.skill_key } }
        );
        const m = (Array.isArray(mRows) ? mRows : [])[0];
        if (m) mastery = Number(m.mastery_probability || 0);
      } catch (e) { /* non-fatal */ }

      reviews.push({
        review_id: String(r.review_id),
        skill_key: r.skill_key,
        item_id: r.item_id,
        lesson_id: lessonId,
        lesson_title: lessonTitle,
        next_review_at: r.next_review_at,
        days_overdue: daysOverdue({ next_review_at: r.next_review_at }),
        current_interval_days: Number(r.interval_days || 1),
        mastery_probability: mastery,
        quality_last: r.last_quality,
      });
    }

    // Stats about streak — reuse economy
    let streakObj = { current: 0, longest: 0, freeze_available: 0 };
    try {
      const [eRows] = await content.query(
        `SELECT streak_current, streak_longest, streak_freeze_count FROM kids_economy WHERE child_admission_no = :adm LIMIT 1`,
        { replacements: { adm } }
      );
      const e = (Array.isArray(eRows) ? eRows : [])[0];
      if (e) {
        streakObj = {
          current: Number(e.streak_current || 0),
          longest: Number(e.streak_longest || 0),
          freeze_available: Number(e.streak_freeze_count || 0),
        };
      }
    } catch (e) { /* non-fatal */ }

    const dueCount = reviews.length;
    const overdueCount = reviews.filter(r => r.days_overdue > 0).length;

    return res.json({
      success: true,
      data: {
        due_count: dueCount,
        overdue_count: overdueCount,
        reviews,
        streak: streakObj,
      },
    });
  } catch (err) {
    console.error('SRE today error:', err.message);
    return res.status(500).json({ success: false, error_code: 'SRE_SERVER_ERROR', message: 'Server error.' });
  }
}

// POST /kids/reviews/v2/complete
async function completeReview(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'SRE_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const { skill_key, item_id, quality, review_id } = req.body || {};

    if (!item_id) {
      return res.status(400).json({ success: false, error_code: 'SRE_ITEM_REQUIRED', message: 'item_id is required' });
    }
    const q = Number(quality);
    if (!Number.isInteger(q) || q < 0 || q > 5) {
      return res.status(400).json({ success: false, error_code: 'SRE_INVALID_QUALITY', message: 'quality must be an integer between 0 and 5' });
    }

    await ensureSchema();
    const { content } = dbm();

    // Find existing card
    let card = null;
    if (review_id) {
      const [rows] = await content.query(
        `SELECT * FROM kids_review_schedule_v2 WHERE id = :rid AND child_admission_no = :adm LIMIT 1`,
        { replacements: { rid: review_id, adm } }
      );
      card = (Array.isArray(rows) ? rows : [])[0] || null;
    }
    if (!card && skill_key) {
      const [rows] = await content.query(
        `SELECT * FROM kids_review_schedule_v2 WHERE child_admission_no = :adm AND item_id = :iid AND (skill_key = :sk OR :sk = '') LIMIT 1`,
        { replacements: { adm, iid: item_id, sk: skill_key || '' } }
      );
      card = (Array.isArray(rows) ? rows : [])[0] || null;
    }

    // Create card if not exists. The id column is BIGINT AUTO_INCREMENT —
    // never pass a UUID here; Sequelize returns the insertId as `results`.
    let cardId = null;
    if (!card) {
      const init = { ...createSm2Card(), next_review_at: new Date() };
      const [insResult] = await content.query(
        `INSERT INTO kids_review_schedule_v2 (child_admission_no, skill_key, item_id, ease, interval_days, repetitions, last_quality, next_review_at)
         VALUES (:adm, :sk, :iid, :ease, :intv, :rep, :q, :nr)`,
        {
          replacements: {
            adm,
            sk: skill_key || 'general.general',
            iid: item_id,
            ease: init.ease,
            intv: init.interval_days,
            rep: init.repetitions,
            q: null,
            nr: init.next_review_at,
          },
        }
      );
      cardId = insResult;
      card = { ease: init.ease, interval_days: init.interval_days, repetitions: init.repetitions };
    } else {
      cardId = card.id;
    }

    // SM-2+ update
    const result = sm2PlusUpdate({
      ease: Number(card.ease || 2.5),
      interval_days: Number(card.interval_days || 1),
      repetitions: Number(card.repetitions || 0),
    }, q);

    // Compute next review date (interval 0 = immediate retry)
    const nextReview = intervalToDate(result.interval_days);

    // Persist
    await content.query(
      `UPDATE kids_review_schedule_v2 SET
        ease = :ease,
        interval_days = :intv,
        repetitions = :rep,
        last_quality = :q,
        next_review_at = :nr,
        last_reviewed_at = NOW()
       WHERE id = :rid`,
      {
        replacements: {
          ease: result.ease,
          intv: result.interval_days,
          rep: result.repetitions,
          q,
          nr: nextReview,
          rid: cardId,
        },
      }
    );

    // Update mastery via BKT (correct = quality >= 3)
    let masteryAfter = null;
    try {
      const masteryMod = require('./kidsAdaptiveV2');
      if (skill_key) {
        const state = await masteryMod._getStateOrCreate(content, adm, req.headers['x-school-id'] || 'general', skill_key);
        const { bktUpdate } = require('../services/adaptiveEngine');
        const correct = q >= 3;
        const m = bktUpdate({ p_knows: Number(state.mastery_probability || 0) }, correct);
        const rounded = Math.round(m * 10000) / 10000;
        await content.query(
          `UPDATE kids_adaptive_state_v2 SET mastery_probability = :m WHERE id = :id`,
          { replacements: { m: rounded, id: state.id } }
        );
        masteryAfter = rounded;
      }
    } catch (e) { /* non-fatal */ }

    // Award XP for review complete
    let xpEarned = 0;
    try {
      const econMod = require('./kidsEconomy');
      const xp = await econMod.updateReviewXP(adm, req.headers['x-school-id'] || 'general');
      xpEarned = xp;
    } catch (e) { /* non-fatal */ }

    // Remaining reviews count
    let remaining = 0;
    try {
      const [cRows] = await content.query(
        `SELECT COUNT(*) AS cnt FROM kids_review_schedule_v2
         WHERE child_admission_no = :adm AND status = 'active' AND next_review_at <= NOW()`,
        { replacements: { adm } }
      );
      const c = (Array.isArray(cRows) ? cRows : [])[0];
      remaining = c ? Number(c.cnt || 0) : 0;
    } catch (e) { /* non-fatal */ }

    return res.json({
      success: true,
      data: {
        next_review_at: nextReview,
        interval_days: result.interval_days,
        mastery_probability: masteryAfter,
        mastery_state: masteryAfter != null ? getMasteryState(masteryAfter) : null,
        xp_earned: xpEarned,
        reviews_remaining: remaining,
      },
    });
  } catch (err) {
    console.error('SRE complete error:', err.message);
    return res.status(500).json({ success: false, error_code: 'SRE_SERVER_ERROR', message: 'Server error.' });
  }
}

// GET /kids/reviews/v2/stats
async function getStats(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'SRE_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');

    await ensureSchema();
    const { content } = dbm();

    const [total] = await content.query(
      `SELECT
        COUNT(*) AS total_items,
        SUM(CASE WHEN next_review_at <= NOW() THEN 1 ELSE 0 END) AS due_today,
        SUM(CASE WHEN TIMESTAMPDIFF(DAY, next_review_at, NOW()) > 0 THEN 1 ELSE 0 END) AS overdue,
        AVG(interval_days) AS avg_interval_days
       FROM kids_review_schedule_v2 WHERE child_admission_no = :adm AND status = 'active'`,
      { replacements: { adm } }
    );
    const t = (Array.isArray(total) ? total : [])[0] || {};

    // Mastered count (from adaptive state)
    let mastered = 0;
    try {
      const [mRows] = await content.query(
        `SELECT COUNT(*) AS cnt FROM kids_adaptive_state_v2 WHERE child_admission_no = :adm AND mastery_probability >= 0.85`,
        { replacements: { adm } }
      );
      const m = (Array.isArray(mRows) ? mRows : [])[0];
      mastered = m ? Number(m.cnt || 0) : 0;
    } catch (e) { /* non-fatal */ }

    // Reviews this week + accuracy
    let reviewsThisWeek = 0;
    let avgAccuracy = 0;
    try {
      const [wRows] = await content.query(
        `SELECT COUNT(*) AS cnt FROM kids_review_schedule_v2
         WHERE child_admission_no = :adm AND last_reviewed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        { replacements: { adm } }
      );
      const w = (Array.isArray(wRows) ? wRows : [])[0];
      reviewsThisWeek = w ? Number(w.cnt || 0) : 0;

      const [aRows] = await content.query(
        `SELECT AVG(last_quality) AS avgq FROM kids_review_schedule_v2
         WHERE child_admission_no = :adm AND last_quality IS NOT NULL`,
        { replacements: { adm } }
      );
      const a = (Array.isArray(aRows) ? aRows : [])[0];
      avgAccuracy = a && a.avgq != null ? Math.round(Number(a.avgq) * 20) : 0;
    } catch (e) { /* non-fatal */ }

    // Streak from economy
    let streakDays = 0;
    let bestStreak = 0;
    try {
      const [eRows] = await content.query(
        `SELECT streak_current, streak_longest FROM kids_economy WHERE child_admission_no = :adm LIMIT 1`,
        { replacements: { adm } }
      );
      const e = (Array.isArray(eRows) ? eRows : [])[0];
      if (e) {
        streakDays = Number(e.streak_current || 0);
        bestStreak = Number(e.streak_longest || 0);
      }
    } catch (e) { /* non-fatal */ }

    return res.json({
      success: true,
      data: {
        total_items: Number(t.total_items || 0),
        due_today: Number(t.due_today || 0),
        overdue: Number(t.overdue || 0),
        mastered,
        streak_days: streakDays,
        best_streak: bestStreak,
        avg_accuracy: avgAccuracy,
        reviews_this_week: reviewsThisWeek,
        avg_interval_days: Math.round(Number(t.avg_interval_days || 0) * 10) / 10,
      },
    });
  } catch (err) {
    console.error('SRE stats error:', err.message);
    return res.status(500).json({ success: false, error_code: 'SRE_SERVER_ERROR', message: 'Server error.' });
  }
}

// Internal helper: add days to now to get date
function intervalToDate(intervalDays) {
  if (intervalDays === 0) return new Date();
  return new Date(Date.now() + intervalDays * 86400000);
}

module.exports = {
  getTodayReviews,
  completeReview,
  getStats,
  ensureSchema,
};
