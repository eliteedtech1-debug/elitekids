'use strict';
/**
 * Revision System — checkpoint-based gating + weekly comprehensive review.
 *
 * Gate Revision:
 *   After a child learns/studies a configurable number of items (default 5),
 *   a revision quiz is triggered as a gate. The child must complete it before
 *   continuing to play new games. Questions are drawn from the items studied
 *   since the last revision.
 *
 * Weekly Revision:
 *   A comprehensive review of everything learned in the past 7 days.
 *   Available once per week, independent of gate revisions.
 *
 * Both generate MCQ questions from published game configs using the same
 * extraction logic as e3fWeekend.
 */
const { Op } = require('sequelize');
const crypto = require('crypto');
const dbm = () => require('../models');

// How many items between revision gates
const GATE_THRESHOLD = 5;

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
    out.push({
      id,
      prompt,
      options: opts.map((o) => ({ id: o.label, label: o.label })),
      correctIndex: opts.findIndex((o) => o.correct),
      lesson_id: cfgRow.lesson_id,
      lesson_title: cfgRow.lesson_title,
      subject: cfgRow.subject,
    });
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

// ─── Gate Revision ──────────────────────────────────────────────────────────

/**
 * GET /kids/revision/gate/check — check if a revision gate is active.
 * Returns { gate_active, items_since_revision, threshold, revision_id }
 */
async function checkGate(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.json({ success: true, data: { gate_active: false } });

    // Find the last completed revision (gate or weekly)
    const [lastRev] = await dbm().content.query(
      `SELECT lesson_id, created_at FROM kids_progress
       WHERE child_admission_no=:adm
         AND (lesson_id LIKE 'revision-gate-%' OR lesson_id LIKE 'revision-weekly-%')
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { adm: admission } },
    ).catch(() => [[]]);
    const rows = Array.isArray(lastRev) ? lastRev : [];
    const lastRevisionAt = rows.length > 0 ? rows[0].created_at : null;

    // Count items played since last revision (or all if never revised)
    const whereClause = lastRevisionAt
      ? { child_admission_no: admission, created_at: { [Op.gt]: lastRevisionAt } }
      : { child_admission_no: admission };
    const [countResult] = await dbm().content.query(
      `SELECT COUNT(DISTINCT lesson_id) AS item_count
       FROM kids_progress
       WHERE child_admission_no=:adm
         ${lastRevisionAt ? 'AND created_at > :since' : ''}
         AND lesson_id IS NOT NULL
         AND lesson_id NOT LIKE 'revision-%'`,
      { replacements: { adm: admission, since: lastRevisionAt } },
    ).catch(() => [[]]);
    const countRows = Array.isArray(countResult) ? countResult : [];
    const itemsSinceRevision = countRows[0]?.item_count || 0;
    const gateActive = itemsSinceRevision >= GATE_THRESHOLD;

    // If gate is active, generate the revision ID
    let revisionId = null;
    if (gateActive) {
      const today = new Date().toISOString().slice(0, 10);
      revisionId = `revision-gate-${admission}-${today}-${crypto.randomUUID().slice(0, 8)}`;
    }

    return res.json({
      success: true,
      data: {
        gate_active: gateActive,
        items_since_revision: itemsSinceRevision,
        threshold: GATE_THRESHOLD,
        items_remaining: Math.max(0, GATE_THRESHOLD - itemsSinceRevision),
        revision_id: revisionId,
      },
    });
  } catch (err) {
    console.error('checkGate error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/revision/gate — generate the gate revision quiz.
 * Questions from items studied since last revision.
 */
async function getGateRevision(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.status(403).json({ success: false, message: 'Student profile required.' });

    // Find last revision timestamp
    const [lastRev] = await dbm().content.query(
      `SELECT created_at FROM kids_progress
       WHERE child_admission_no=:adm
         AND (lesson_id LIKE 'revision-gate-%' OR lesson_id LIKE 'revision-weekly-%')
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { adm: admission } },
    ).catch(() => [[]]);
    const rows = Array.isArray(lastRev) ? lastRev : [];
    const lastRevisionAt = rows.length > 0 ? rows[0].created_at : null;

    // Get lessons studied since last revision
    const [recent] = await dbm().content.query(
      `SELECT DISTINCT p.lesson_id
       FROM kids_progress p
       WHERE p.child_admission_no=:adm
         ${lastRevisionAt ? 'AND p.created_at > :since' : ''}
         AND p.lesson_id IS NOT NULL
         AND p.lesson_id NOT LIKE 'revision-%'`,
      { replacements: { adm: admission, since: lastRevisionAt } },
    ).catch(() => [[]]);
    const lessonIds = (Array.isArray(recent) ? recent : []).map((r) => r.lesson_id).filter(Boolean);

    if (lessonIds.length === 0) {
      return res.json({ success: true, data: { completed: false, questions: [], reason: 'No items to review yet.' } });
    }

    // Fetch game configs
    const [configs] = await dbm().content.query(
      `SELECT gc.*, l.title AS lesson_title, l.subject
       FROM kids_game_configs gc
       JOIN kids_lessons l ON l.id = gc.lesson_id
       WHERE gc.lesson_id IN (:ids) AND gc.content_state = 'published'`,
      { replacements: { ids: lessonIds } },
    ).catch(() => [[]]);

    // Extract questions (up to 5 for gate)
    const seen = new Set();
    let questions = [];
    for (const cfg of (Array.isArray(configs) ? configs : [])) {
      if (questions.length >= 5) break;
      questions.push(...questionsFromConfig(cfg, seen, 5 - questions.length));
    }
    questions = shuffleArr(questions.slice(0, 5));

    return res.json({
      success: true,
      data: {
        completed: false,
        type: 'gate',
        questions,
        lesson_count: lessonIds.length,
        subjects: [...new Set((Array.isArray(configs) ? configs : []).map((c) => c.subject).filter(Boolean))],
      },
    });
  } catch (err) {
    console.error('getGateRevision error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Weekly Revision ────────────────────────────────────────────────────────

/**
 * GET /kids/revision/weekly — comprehensive weekly review.
 * All items played in the past 7 days, up to 15 questions.
 */
async function getWeeklyRevision(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) return res.status(403).json({ success: false, message: 'Student profile required.' });

    // Deterministic weekly ID
    const now = new Date();
    const dayOfWeek = now.getUTCDay() || 7;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    const weekKey = monday.toISOString().slice(0, 10);
    const revisionId = `revision-weekly-${admission}-${weekKey}`;

    // Check if already completed this week
    const existing = await dbm().content.query(
      `SELECT id FROM kids_progress WHERE child_admission_no=:adm AND lesson_id=:rid LIMIT 1`,
      { replacements: { adm: admission, rid: revisionId } },
    ).catch(() => [[]]);
    const eRows = Array.isArray(existing[0]) ? existing[0] : [];
    if (eRows.length > 0) {
      return res.json({ success: true, data: { completed: true, revision_id: revisionId } });
    }

    // Harvest recent lessons (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [recent] = await dbm().content.query(
      `SELECT DISTINCT p.lesson_id
       FROM kids_progress p
       WHERE p.child_admission_no=:adm
         AND p.created_at >= :since
         AND p.lesson_id IS NOT NULL
         AND p.lesson_id NOT LIKE 'revision-%'`,
      { replacements: { adm: admission, since: weekAgo } },
    ).catch(() => [[]]);
    const lessonIds = (Array.isArray(recent) ? recent : []).map((r) => r.lesson_id).filter(Boolean);

    if (lessonIds.length === 0) {
      return res.json({ success: true, data: { completed: false, questions: [], reason: 'No lessons played this week.' } });
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
    questions = shuffleArr(questions.slice(0, 15));

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

// ─── Complete Revision ──────────────────────────────────────────────────────

/**
 * POST /kids/revision/complete — mark revision done, award XP.
 * Body: { revision_id, score, total, type: 'gate'|'weekly' }
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

    // XP: gate = 30 base, weekly = 50 base, + 5 per correct
    const baseXP = type === 'weekly' ? 50 : 30;
    const bonusXP = (Number(score) || 0) * 5;
    const xp = baseXP + bonusXP;
    const pct = (Number(score) || 0) / Math.max(1, Number(total) || 1);
    const stars = pct >= 0.8 ? 3 : pct >= 0.5 ? 2 : 1;

    // Record (idempotent via INSERT IGNORE pattern)
    await dbm().content.query(
      `INSERT INTO kids_progress (id, child_admission_no, lesson_id, score, stars_earned, xp, created_at, updated_at)
       VALUES (:id, :adm, :rid, :score, :stars, :xp, NOW(), NOW())
       ON DUPLICATE KEY UPDATE score=VALUES(score), stars_earned=VALUES(stars_earned), xp=VALUES(xp)`,
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

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * GET /kids/revision/status — dashboard status for both gate and weekly.
 */
async function getRevisionStatus(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const admission = String(u.admission_no || u.id || '');
    if (!admission) {
      return res.json({ success: true, data: { gate: { active: false, items_remaining: GATE_THRESHOLD }, weekly: { completed: false } } });
    }

    // Gate status
    const [lastRev] = await dbm().content.query(
      `SELECT created_at FROM kids_progress
       WHERE child_admission_no=:adm
         AND (lesson_id LIKE 'revision-gate-%' OR lesson_id LIKE 'revision-weekly-%')
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { adm: admission } },
    ).catch(() => [[]]);
    const rRows = Array.isArray(lastRev) ? lastRev : [];
    const lastRevisionAt = rRows.length > 0 ? rRows[0].created_at : null;

    const [countResult] = await dbm().content.query(
      `SELECT COUNT(DISTINCT lesson_id) AS item_count
       FROM kids_progress
       WHERE child_admission_no=:adm
         ${lastRevisionAt ? 'AND created_at > :since' : ''}
         AND lesson_id IS NOT NULL
         AND lesson_id NOT LIKE 'revision-%'`,
      { replacements: { adm: admission, since: lastRevisionAt } },
    ).catch(() => [[]]);
    const cRows = Array.isArray(countResult) ? countResult : [];
    const itemsSinceRevision = cRows[0]?.item_count || 0;

    // Weekly status
    const now = new Date();
    const dayOfWeek = now.getUTCDay() || 7;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    const weekKey = monday.toISOString().slice(0, 10);
    const weeklyId = `revision-weekly-${admission}-${weekKey}`;

    const [weeklyCheck] = await dbm().content.query(
      `SELECT score, xp FROM kids_progress WHERE child_admission_no=:adm AND lesson_id=:rid LIMIT 1`,
      { replacements: { adm: admission, rid: weeklyId } },
    ).catch(() => [[]]);
    const wRows = Array.isArray(weeklyCheck) ? weeklyCheck : [];

    return res.json({
      success: true,
      data: {
        gate: {
          active: itemsSinceRevision >= GATE_THRESHOLD,
          items_since_revision: itemsSinceRevision,
          threshold: GATE_THRESHOLD,
          items_remaining: Math.max(0, GATE_THRESHOLD - itemsSinceRevision),
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
  checkGate,
  getGateRevision,
  getWeeklyRevision,
  markRevisionComplete,
  getRevisionStatus,
};
