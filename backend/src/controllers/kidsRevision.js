'use strict';
/**
 * Revision System — reinforcement-based, not blocking.
 *
 * 1. Failed Items Tracking: records which items the child got wrong.
 *    Stored in kids_failed_items for targeted review.
 *
 * 2. Gentle Nudges: shows "Time to review X!" cards on dashboard.
 *    Based on spaced repetition (next_review_at) + failed item age.
 *    Never blocks play — just suggestions.
 *
 * 3. Smart Mixing: when a child starts a new game, 1-2 review questions
 *    from previously failed items are injected into the game config.
 *    This reinforces learning naturally within the play flow.
 *
 * 4. Weekly Summary: comprehensive review of all weak areas.
 */
const { Op } = require('sequelize');
const crypto = require('crypto');
const dbm = () => require('../models');

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Schema: kids_failed_items ──────────────────────────────────────────────

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await dbm().content.query(`CREATE TABLE IF NOT EXISTS kids_failed_items (
    id CHAR(36) NOT NULL PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    question_id VARCHAR(100) NULL,
    question_text TEXT NULL,
    given_answer VARCHAR(200) NULL,
    correct_answer VARCHAR(200) NULL,
    subject VARCHAR(100) NULL,
    topic VARCHAR(100) NULL,
    times_seen INT NOT NULL DEFAULT 1,
    times_correct INT NOT NULL DEFAULT 0,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mastered TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_failed_child (child_admission_no),
    KEY idx_failed_lesson (lesson_id),
    KEY idx_failed_mastered (mastered),
    UNIQUE KEY uq_failed_child_question (child_admission_no, lesson_id, question_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(() => {});
  _schemaReady = true;
}

// ─── Record Failed Item ─────────────────────────────────────────────────────

/**
 * POST /kids/revision/failed — record a failed answer.
 * Body: { lesson_id, question_id, question_text, given_answer, correct_answer, subject, topic }
 */
async function recordFailed(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    const { lesson_id, question_id, question_text, given_answer, correct_answer, subject, topic } = req.body || {};
    if (!lesson_id || !question_id) {
      return res.status(400).json({ success: false, message: 'lesson_id and question_id required.' });
    }

    await ensureSchema();

    // Upsert: if already exists, increment times_seen
    await dbm().content.query(
      `INSERT INTO kids_failed_items (id, child_admission_no, lesson_id, question_id, question_text, given_answer, correct_answer, subject, topic, times_seen, last_seen_at)
       VALUES (:id, :adm, :lid, :qid, :qt, :ga, :ca, :sub, :t, 1, NOW())
       ON DUPLICATE KEY UPDATE
         times_seen = times_seen + 1,
         given_answer = VALUES(given_answer),
         last_seen_at = NOW(),
         mastered = IF(times_seen >= 3 AND times_correct >= 2, 1, 0)`,
      {
        replacements: {
          id: crypto.randomUUID(),
          adm: admission,
          lid: lesson_id,
          qid: question_id,
          qt: question_text || null,
          ga: given_answer || null,
          ca: correct_answer || null,
          sub: subject || null,
          t: topic || null,
        },
      },
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('recordFailed error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Mark Correct (for failed items getting retried) ────────────────────────

/**
 * POST /kids/revision/retry-correct — mark a failed item as correct on retry.
 * Body: { lesson_id, question_id }
 */
async function markRetryCorrect(req, res) {
  try {
    const u = req.user || {};
    const admission = String(u.admission_no || u.id || '');
    const { lesson_id, question_id } = req.body || {};
    if (!lesson_id || !question_id) {
      return res.status(400).json({ success: false, message: 'lesson_id and question_id required.' });
    }

    await ensureSchema();
    await dbm().content.query(
      `UPDATE kids_failed_items
       SET times_correct = times_correct + 1,
           mastered = IF(times_seen >= 3 AND (times_correct + 1) >= 2, 1, 0)
       WHERE child_admission_no=:adm AND lesson_id=:lid AND question_id=:qid`,
      { replacements: { adm: admission, lid: lesson_id, qid: question_id } },
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('markRetryCorrect error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Get Review Nudges (gentle suggestions) ─────────────────────────────────

/**
 * GET /kids/revision/nudges — get gentle review invitations.
 * Returns topics that are:
 *   - Getting rusty (next_review_at passed)
 *   - Have failed items that need reinforcement
 *   - Not mastered yet
 */
async function getNudges(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.json({ success: true, data: [] });

    await ensureSchema();

    // Get unmastered failed items grouped by lesson_id
    const [failedItems] = await dbm().content.query(
      `SELECT lesson_id, subject, topic,
              COUNT(*) AS total_failed,
              MIN(last_seen_at) AS first_failed,
              MAX(last_seen_at) AS last_seen
       FROM kids_failed_items
       WHERE child_admission_no=:adm AND mastered=0
       GROUP BY lesson_id, subject, topic
       ORDER BY last_seen ASC
       LIMIT 10`,
      { replacements: { adm: admission } },
    ).catch(() => [[]]);

    const nudges = (Array.isArray(failedItems) ? failedItems : []).map((item) => ({
      lesson_id: item.lesson_id,
      subject: item.subject,
      topic: item.topic,
      failed_count: item.total_failed,
      days_since: Math.round((Date.now() - new Date(item.last_seen).getTime()) / 86400000),
      reason: item.total_failed >= 3 ? 'needs_practice' : 'reinforce',
    }));

    // Also check spaced repetition due reviews
    const [spacedDue] = await dbm().content.query(
      `SELECT subject, topic, accuracy_7d, next_review_at
       FROM kids_adaptive_profiles
       WHERE child_admission_no=:adm
         AND next_review_at <= NOW()
         AND next_review_at IS NOT NULL
         AND accuracy_7d < 80
       ORDER BY next_review_at ASC
       LIMIT 5`,
      { replacements: { adm: admission } },
    ).catch(() => [[]]);

    for (const item of (Array.isArray(spacedDue) ? spacedDue : [])) {
      // Don't duplicate if already in failed items
      if (!nudges.find((n) => n.subject === item.subject && n.topic === item.topic)) {
        nudges.push({
          lesson_id: null,
          subject: item.subject,
          topic: item.topic,
          failed_count: 0,
          days_since: 0,
          reason: 'review_due',
          accuracy: item.accuracy_7d,
        });
      }
    }

    return res.json({ success: true, data: nudges });
  } catch (err) {
    console.error('getNudges error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Get Failed Items for Review (smart mixing) ─────────────────────────────

/**
 * GET /kids/revision/failed-items?lesson_id=X&limit=2
 * Returns unmastered failed items for a specific lesson to mix into new games.
 */
async function getFailedItems(req, res) {
  try {
    const u = req.user || {};
    const admission = String(u.admission_no || u.id || '');
    const { lesson_id, limit = 2 } = req.query || {};
    if (!admission || !lesson_id) {
      return res.json({ success: true, data: [] });
    }

    await ensureSchema();

    const [items] = await dbm().content.query(
      `SELECT question_id, question_text, given_answer, correct_answer
       FROM kids_failed_items
       WHERE child_admission_no=:adm AND lesson_id=:lid AND mastered=0
       ORDER BY times_seen DESC, last_seen ASC
       LIMIT :lim`,
      { replacements: { adm: admission, lid: lesson_id, lim: Number(limit) || 2 } },
    ).catch(() => [[]]);

    return res.json({ success: true, data: Array.isArray(items) ? items : [] });
  } catch (err) {
    console.error('getFailedItems error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Weekly Summary ─────────────────────────────────────────────────────────

/**
 * GET /kids/revision/weekly — weekly summary of weak areas + review quiz.
 */
async function getWeeklySummary(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.status(403).json({ success: false, message: 'Student profile required.' });

    await ensureSchema();

    // Get all unmastered failed items from this week
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [items] = await dbm().content.query(
      `SELECT f.*, l.title AS lesson_title, l.subject AS lesson_subject
       FROM kids_failed_items f
       LEFT JOIN kids_lessons l ON l.id = f.lesson_id
       WHERE f.child_admission_no=:adm
         AND f.mastered=0
         AND f.last_seen_at >= :since
       ORDER BY f.times_seen DESC
       LIMIT 20`,
      { replacements: { adm: admission, since: weekAgo } },
    ).catch(() => [[]]);

    const failedItems = Array.isArray(items) ? items : [];

    // Build review questions from failed items
    const questions = failedItems.map((item) => ({
      id: `weekly-${item.question_id}`,
      prompt: item.question_text || `Review: ${item.topic || item.subject || 'this topic'}`,
      options: [
        { id: item.correct_answer, label: item.correct_answer },
        { id: 'retry', label: item.given_answer || 'Try again' },
      ].filter((o) => o.label),
      correctIndex: 0,
      lesson_id: item.lesson_id,
      lesson_title: item.lesson_title,
      subject: item.subject,
    })).filter((q) => q.options.length >= 2);

    // Stats
    const totalFailed = failedItems.length;
    const bySubject = {};
    for (const item of failedItems) {
      const sub = item.subject || 'General';
      if (!bySubject[sub]) bySubject[sub] = 0;
      bySubject[sub]++;
    }

    return res.json({
      success: true,
      data: {
        questions: shuffleArr(questions).slice(0, 15),
        stats: {
          total_weak_items: totalFailed,
          by_subject: bySubject,
          week: new Date().toISOString().slice(0, 10),
        },
      },
    });
  } catch (err) {
    console.error('getWeeklySummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * GET /kids/revision/status — dashboard status.
 */
async function getRevisionStatus(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) {
      return res.json({ success: true, data: { failed_items: 0, nudges: 0, weekly_completed: false } });
    }

    await ensureSchema();

    // Count unmastered failed items
    const [failedCount] = await dbm().content.query(
      `SELECT COUNT(*) AS cnt FROM kids_failed_items WHERE child_admission_no=:adm AND mastered=0`,
      { replacements: { adm: admission } },
    ).catch(() => [[{ cnt: 0 }]]);
    const fRows = Array.isArray(failedCount) ? failedCount : [];
    const failedItems = fRows[0]?.cnt || 0;

    // Count nudges (topics due for review)
    const [nudgeCount] = await dbm().content.query(
      `SELECT COUNT(*) AS cnt FROM kids_adaptive_profiles
       WHERE child_admission_no=:adm AND next_review_at <= NOW() AND next_review_at IS NOT NULL AND accuracy_7d < 80`,
      { replacements: { adm: admission } },
    ).catch(() => [[{ cnt: 0 }]]);
    const nRows = Array.isArray(nudgeCount) ? nudgeCount : [];
    const nudges = nRows[0]?.cnt || 0;

    return res.json({
      success: true,
      data: {
        failed_items: failedItems,
        nudges,
        weekly_completed: false,
      },
    });
  } catch (err) {
    console.error('getRevisionStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  recordFailed,
  markRetryCorrect,
  getNudges,
  getFailedItems,
  getWeeklySummary,
  getRevisionStatus,
};
