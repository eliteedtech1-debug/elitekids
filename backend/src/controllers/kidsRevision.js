'use strict';
/**
 * Daily & Weekly Revision — auto-generated review quizzes.
 *
 * Daily: harvests lessons played in the last 2-3 days, picks 3-5 items
 *        per subject, generates MCQ review questions.
 * Weekly: harvests all lessons played in the past 7 days, generates a
 *         comprehensive 10-15 question review quiz.
 *
 * Both use the same question-extraction logic as e3fWeekend (MCQ from
 * game configs) but with different time windows and item counts.
 */
const { Op } = require('sequelize');
const crypto = require('crypto');
const dbm = () => require('../models');

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math(0, (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Extract MCQ questions from a game config row. */
function questionsFromConfig(cfgRow, seen, limit) {
  const cj = cfgRow.config_json || {};
  const out = [];
  const base = String(cj.item_id || cfgRow.item_id || cfgRow.id);

  const push = (id, prompt, opts) => {
    if (out.length >= limit || seen.has(id)) return;
    shuffleArr(opts);
    seen.add(id);
    out.push({ id, prompt, options: opts.map((o) => ({ id: o.label, label: o.label })), correctIndex: opts.findIndex((o) => o.correct) });
  };

  // Quiz questions
  if (Array.isArray(cj.questions)) {
    for (const q of cj.questions) {
      if (out.length >= limit) break;
      if (!Array.isArray(q.options) || typeof q.correctIndex !== 'number' || !q.options[q.correctIndex]) continue;
      push(`rev-${base}-q-${q.id || out.length}`, q.prompt,
        q.options.map((o, i) => ({ label: String(o.label), correct: i === q.correctIndex })));
    }
  }

  // Matching pairs → MCQ
  if (Array.isArray(cj.pairs) && cj.pairs.length >= 3) {
    for (const p of cj.pairs) {
      if (out.length >= limit) break;
      if (!p.a || !p.b) continue;
      const distractors = shuffleArr(cj.pairs.filter((x) => x.b && x.b !== p.b).map((x) => x.b)).slice(0, 2);
      push(`rev-${base}-m-${p.a}`, `Which one matches "${p.a}"?`,
        [{ label: p.b, correct: true }, ...distractors.map((l) => ({ label: l, correct: false }))]);
    }
  }

  // Fill-in-blank sentences → MCQ
  if (Array.isArray(cj.sentences)) {
    for (const s of cj.sentences) {
      if (out.length >= limit) break;
      const ans = s.blanks && s.blanks[0] && s.blanks[0].answer;
      if (!ans) continue;
      const distractors = shuffleArr((s.wordBank || []).filter((w) => w && w !== ans)).slice(0, 2);
      push(`rev-${base}-f-${ans}`, s.sentence,
        [{ label: ans, correct: true }, ...distractors.map((l) => ({ label: l, correct: false }))]);
    }
  }

  // Drag-sort → "which came first" MCQ
  if (cj.template === 'drag-sort' && Array.isArray(cj.items) && cj.items.length >= 3) {
    const labels = cj.items.map((it) => it.label).filter(Boolean);
    if (labels.length >= 3) {
      const first = labels[0];
      const distractors = shuffleArr(labels.slice(1)).slice(0, 2);
      push(`rev-${base}-s-${first}`, `You sorted: ${labels.join(' · ')}. Which came FIRST?`,
        [{ label: first, correct: true }, ...distractors.map((l) => ({ label: l, correct: false }))]);
    }
  }

  return out;
}

/**
 * GET /kids/revision/daily — today's daily revision.
 * Harvests lessons played in the last 3 days, picks up to 5 questions.
 */
async function getDailyRevision(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.status(403).json({ success: false, message: 'Student profile required.' });

    // Deterministic daily ID (same all day)
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const revisionId = `revision-daily-${admission}-${today}`;

    // Check if already completed today
    const existing = await dbm().content.query(
      `SELECT id FROM kids_progress WHERE child_admission_no=:adm AND lesson_id=:rid LIMIT 1`,
      { replacements: { adm: admission, rid: revisionId } },
    ).catch(() => [[]]);
    const rows = Array.isArray(existing[0]) ? existing[0] : [];
    if (rows.length > 0) {
      return res.json({ success: true, data: { completed: true, revision_id: revisionId } });
    }

    // Harvest recent lessons (last 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    const [recent] = await dbm().content.query(
      `SELECT DISTINCT p.lesson_id
       FROM kids_progress p
       WHERE p.child_admission_no=:adm
         AND p.created_at >= :since
         AND p.lesson_id IS NOT NULL`,
      { replacements: { adm: admission, since: threeDaysAgo } },
    ).catch(() => [[]]);
    const lessonIds = (Array.isArray(recent) ? recent : []).map((r) => r.lesson_id).filter(Boolean);

    if (lessonIds.length === 0) {
      return res.json({ success: true, data: { completed: false, questions: [], reason: 'No lessons played recently. Play some games first!' } });
    }

    // Fetch game configs for these lessons
    const [configs] = await dbm().content.query(
      `SELECT gc.*, l.title AS lesson_title, l.subject
       FROM kids_game_configs gc
       JOIN kids_lessons l ON l.id = gc.lesson_id
       WHERE gc.lesson_id IN (:ids) AND gc.content_state = 'published'`,
      { replacements: { ids: lessonIds } },
    ).catch(() => [[]]);

    // Extract questions (up to 5)
    const seen = new Set();
    let questions = [];
    for (const cfg of (Array.isArray(configs) ? configs : [])) {
      if (questions.length >= 5) break;
      questions.push(...questionsFromConfig(cfg, seen, 5 - questions.length));
    }
    questions = questions.slice(0, 5);

    return res.json({
      success: true,
      data: {
        completed: false,
        revision_id: revisionId,
        type: 'daily',
        date: today,
        questions,
        lesson_count: lessonIds.length,
      },
    });
  } catch (err) {
    console.error('getDailyRevision error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/revision/weekly — this week's comprehensive review.
 * Harvests all lessons played in the past 7 days, up to 15 questions.
 */
async function getWeeklyRevision(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.status(403).json({ success: false, message: 'Student profile required.' });

    // Deterministic weekly ID (same all week)
    const now = new Date();
    const dayOfWeek = now.getUTCDay() || 7; // Mon=1..Sun=7
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    const weekKey = monday.toISOString().slice(0, 10);
    const revisionId = `revision-weekly-${admission}-${weekKey}`;

    // Check if already completed this week
    const existing = await dbm().content.query(
      `SELECT id FROM kids_progress WHERE child_admission_no=:adm AND lesson_id=:rid LIMIT 1`,
      { replacements: { adm: admission, rid: revisionId } },
    ).catch(() => [[]]);
    const rows = Array.isArray(existing[0]) ? existing[0] : [];
    if (rows.length > 0) {
      return res.json({ success: true, data: { completed: true, revision_id: revisionId } });
    }

    // Harvest recent lessons (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [recent] = await dbm().content.query(
      `SELECT DISTINCT p.lesson_id
       FROM kids_progress p
       WHERE p.child_admission_no=:adm
         AND p.created_at >= :since
         AND p.lesson_id IS NOT NULL`,
      { replacements: { adm: admission, since: weekAgo } },
    ).catch(() => [[]]);
    const lessonIds = (Array.isArray(recent) ? recent : []).map((r) => r.lesson_id).filter(Boolean);

    if (lessonIds.length === 0) {
      return res.json({ success: true, data: { completed: false, questions: [], reason: 'No lessons played this week. Play some games first!' } });
    }

    // Fetch game configs
    const [configs] = await dbm().content.query(
      `SELECT gc.*, l.title AS lesson_title, l.subject
       FROM kids_game_configs gc
       JOIN kids_lessons l ON l.id = gc.lesson_id
       WHERE gc.lesson_id IN (:ids) AND gc.content_state = 'published'`,
      { replacements: { ids: lessonIds } },
    ).catch(() => [[]]);

    // Extract questions (up to 15)
    const seen = new Set();
    let questions = [];
    for (const cfg of (Array.isArray(configs) ? configs : [])) {
      if (questions.length >= 15) break;
      questions.push(...questionsFromConfig(cfg, seen, 15 - questions.length));
    }
    questions = questions.slice(0, 15);

    // Shuffle final order
    shuffleArr(questions);

    return res.json({
      success: true,
      data: {
        completed: false,
        revision_id: revisionId,
        type: 'weekly',
        week: weekKey,
        questions,
        lesson_count: lessonIds.length,
      },
    });
  } catch (err) {
    console.error('getWeeklyRevision error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/revision/complete — mark a revision as done, award bonus XP.
 * Body: { revision_id, score, total, type: 'daily'|'weekly' }
 */
async function markRevisionComplete(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    const { revision_id, score, total, type } = req.body || {};
    if (!revision_id) {
      return res.status(400).json({ success: false, message: 'revision_id required.' });
    }

    // Award bonus XP: daily = 20 XP, weekly = 50 XP, + 5 per correct answer
    const baseXP = type === 'weekly' ? 50 : 20;
    const bonusXP = (Number(score) || 0) * 5;
    const xp = baseXP + bonusXP;
    const stars = (Number(score) || 0) >= (Number(total) || 1) * 0.8 ? 3
      : (Number(score) || 0) >= (Number(total) || 1) * 0.5 ? 2 : 1;

    // Record as a progress entry (idempotent — same revision_id)
    await dbm().content.query(
      `INSERT IGNORE INTO kids_progress (id, child_admission_no, lesson_id, score, stars_earned, xp, created_at, updated_at)
       VALUES (:id, :adm, :rid, :score, :stars, :xp, NOW(), NOW())`,
      {
        replacements: {
          id: crypto.randomUUID(),
          adm: admission,
          rid: revision_id,
          score: Number(score) || 0,
          stars,
          xp,
        },
      },
    ).catch(() => {});

    return res.json({
      success: true,
      data: { xp_earned: xp, stars_earned: stars, type },
    });
  } catch (err) {
    console.error('markRevisionComplete error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/revision/status — quick status for dashboard cards.
 * Returns whether daily/weekly are completed today/this week.
 */
async function getRevisionStatus(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.json({ success: true, data: { daily: { completed: false }, weekly: { completed: false } } });

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const dayOfWeek = now.getUTCDay() || 7;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    const weekKey = monday.toISOString().slice(0, 10);

    const dailyId = `revision-daily-${admission}-${today}`;
    const weeklyId = `revision-weekly-${admission}-${weekKey}`;

    const [dailyCheck] = await dbm().content.query(
      `SELECT score, xp FROM kids_progress WHERE child_admission_no=:adm AND lesson_id=:rid LIMIT 1`,
      { replacements: { adm: admission, rid: dailyId } },
    ).catch(() => [[]]);
    const [weeklyCheck] = await dbm().content.query(
      `SELECT score, xp FROM kids_progress WHERE child_admission_no=:adm AND lesson_id=:rid LIMIT 1`,
      { replacements: { adm: admission, rid: weeklyId } },
    ).catch(() => [[]]);

    const dRows = Array.isArray(dailyCheck) ? dailyCheck : [];
    const wRows = Array.isArray(weeklyCheck) ? weeklyCheck : [];

    return res.json({
      success: true,
      data: {
        daily: {
          completed: dRows.length > 0,
          score: dRows[0]?.score || 0,
          xp: dRows[0]?.xp || 0,
        },
        weekly: {
          completed: wRows.length > 0,
          score: wRows[0]?.score || 0,
          xp: wRows[0]?.xp || 0,
        },
      },
    });
  } catch (err) {
    console.error('getRevisionStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getDailyRevision,
  getWeeklyRevision,
  markRevisionComplete,
  getRevisionStatus,
};
