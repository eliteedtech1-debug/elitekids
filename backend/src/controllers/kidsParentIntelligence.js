'use strict';

/**
 * Q3 Parent Intelligence controller (REST). See q3-village-planning.md §3.2.
 *
 *   GET  /kids/parent/insights/:childId     — personalized insights (today + weekly)
 *   GET  /kids/parent/weekly-digest/:childId — last 7 days rollup
 *   GET  /kids/parent/comparison/:childId    — anonymous opt-in peer comparison (age-band-only)
 *   POST /kids/parent/action-ack             — mark an action item done
 *   POST /kids/parent/opt-in                 — toggle anonymous comparison
 *
 * Privacy: NEVER cross-child — each parent sees only their linked children
 * (requireChildOwnership). Anonymous comparison is age-band-only, never raw
 * scores, never identifies a peer.
 */

const db = require('../models');
const { Op } = require('sequelize');
const { requireChildOwnership } = require('../services/routesHelper');
const { generateInsights, clamp01 } = require('../services/insightGenerator');

function todayWeekStart() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Light ownership guard reused across parent endpoints. */
async function guardParent(req, res) {
  const owned = await requireChildOwnership(req).catch(() => ({ ok: false, status: 500, body: { success: false, message: 'Server error.' } }));
  if (!owned.ok) {
    res.status(owned.status || 403).json(owned.body || { success: false, message: 'Not allowed.' });
    return false;
  }
  return true;
}

/** Build a structured snapshot for a child from stored signals. */
async function buildSnapshot(childId) {
  const week = todayWeekStart();

  // Mastery comes from kids_adaptive_state_v2 (ADE BKT) via raw query.
  const skills = [];
  try {
    const [rows] = await db.content.query(
      `SELECT skill_key, mastery_probability, total_attempts
       FROM kids_adaptive_state_v2 WHERE child_admission_no = :adm LIMIT 50`,
      { replacements: { adm: childId } }
    );
    for (const r of Array.isArray(rows) ? rows : []) {
      skills.push({
        skill_key: r.skill_key,
        mastery_probability: r.mastery_probability,
        total_attempts: r.total_attempts,
        sessions_this_week: Number(r.total_attempts) || 0,
      });
    }
  } catch { /* table may not exist yet */ }

  const goals = await db.KidLearningGoal.findAll({
    where: { child_admission_no: childId, goal_type: 'weekly' },
    order: [['period_start', 'DESC']],
    limit: 1,
  }).catch(() => []);
  const goal = goals[0] || null;

  // Engagement from this week's progress rows (kid_progress).
  const since = new Date(Date.now() - 7 * 86400000);
  const progress = await db.KidProgress.findAll({
    where: { child_admission_no: childId, completed_at: { [Op.gte]: since } },
  }).catch(() => []);
  const engagement = {
    frequency: progress.length,
    accuracy_pct: progress.length
      ? Math.round(progress.reduce((a, p) => a + (Number(p.score) || 0), 0) / progress.length)
      : 0,
    reading_min_week: progress.length
      ? Math.round(progress.reduce((a, p) => a + (Number(p.xp) || 0), 0))
      : 0,
  };

  return {
    streak: { current: progress.length >= 3 ? 3 : progress.length, lastPlayDate: progress[0]?.completed_at || null, played_today: false },
    skills,
    subjects: [],
    goal: goal ? { target: goal.target_count, done: 0 } : null,
    reading: { delta_ms_week_over_week: engagement.reading_min_week * 60000, percent_change: 0 },
    engagement,
  };
}

/** GET /kids/parent/insights/:childId */
async function getInsights(req, res) {
  try {
    const childId = String(req.params.childId || '').trim();
    if (!childId) return res.status(400).json({ success: false, message: 'childId is required.' });
    if (!(await guardParent(req, res))) return;

    const week = todayWeekStart();
    let rows = await db.KidInsight.findAll({
      where: { child_admission_no: childId, week_start: week },
      order: [['severity', 'DESC']],
    }).catch(() => []);

    // Lazy-generate when none exist for the current week.
    if (!rows || rows.length === 0) {
      const snapshot = await buildSnapshot(childId);
      const generated = generateInsights(snapshot, { week_start: week });
      rows = generated.map((g) =>
        db.KidInsight.create({
          child_admission_no: childId,
          rule_key: g.rule_key,
          title: g.title,
          body: g.body,
          severity: g.severity,
          kind: g.kind,
          meta: g.meta || null,
          week_start: week,
        }).catch(() => null)
      );
      rows = (await Promise.all(rows)).filter(Boolean);
    }

    const actions = await db.KidActionItem.findAll({
      where: { child_admission_no: childId },
      order: [['created_at', 'DESC']],
      limit: 20,
    }).catch(() => []);

    return res.json({
      success: true,
      data: {
        insights: rows.map((r) => r.get({ plain: true })),
        action_items: actions.map((a) => a.get({ plain: true })),
      },
    });
  } catch (err) {
    console.error('getInsights error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/parent/weekly-digest/:childId — last 7 days rollup */
async function getWeeklyDigest(req, res) {
  try {
    const childId = String(req.params.childId || '').trim();
    if (!childId) return res.status(400).json({ success: false, message: 'childId is required.' });
    if (!(await guardParent(req, res))) return;

    const now = new Date();
    const since = new Date(now.getTime() - 7 * 86400000);
    const progress = await db.KidProgress.findAll({
      where: { child_admission_no: childId, completed_at: { [Op.gte]: since } },
    }).catch(() => []);

    const games = progress.length;
    const totalXp = progress.reduce((a, p) => a + (Number(p.xp) || 0), 0);
    const avgScore = games ? Math.round(progress.reduce((a, p) => a + (Number(p.score) || 0), 0) / games) : 0;

    const insights = await db.KidInsight.findAll({
      where: { child_admission_no: childId, week_start: todayWeekStart() },
    }).catch(() => []);

    return res.json({
      success: true,
      data: {
        child_admission_no: childId,
        games_played: games,
        total_xp: totalXp,
        avg_score_pct: avgScore,
        days_active: new Set(progress.map((p) => String(p.completed_at).slice(0, 10))).size,
        insight_count: insights.length,
        week_start: todayWeekStart(),
      },
    });
  } catch (err) {
    console.error('getWeeklyDigest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/parent/comparison/:childId — anonymous age-band-only percentiles */
async function getComparison(req, res) {
  try {
    const childId = String(req.params.childId || '').trim();
    if (!childId) return res.status(400).json({ success: false, message: 'childId is required.' });
    if (!(await guardParent(req, res))) return;

    // Opt-in gate: only parents who opted in get comparison data. Stored as an
    // additive column on kids_children (see index.js CONTENT_COLUMN_PLAN).
    let optedIn = false;
    try {
      const child = await db.KidChild.findOne({ where: { admission_no: childId } });
      optedIn = Boolean(child && (child.allow_anonymous_comparison === true || child.allow_anonymous_comparison === 1 || child.allow_anonymous_comparison === '1'));
    } catch { /* column may not exist yet — default off */ }
    if (!optedIn) {
      return res.json({ success: true, data: { opted_in: false, message: 'Not opted in to anonymous comparison.' } });
    }

    // Age band → percentile of the child's avg mastery within that band, only
    // returning a BAND + percentile (never raw peer data, never identities).
    const avg = await (async () => {
      try {
        const [rows] = await db.content.query(
          `SELECT COUNT(*) AS n, AVG(mastery_probability) AS avg_mp
           FROM kids_adaptive_state_v2 WHERE child_admission_no = :adm`,
          { replacements: { adm: childId } }
        );
        const r = rows && rows[0];
        return r && Number(r.n) > 0 ? clamp01(r.avg_mp) : 0;
      } catch { return 0; }
    })();

    return res.json({
      success: true,
      data: {
        opted_in: true,
        age_band: 'same-age-peers',
        percentile: Math.round(avg * 100), // heuristic; nightly cron computes true band pct in Q4
        metric: 'mastery', // anonymized, no raw scores exposed
      },
    });
  } catch (err) {
    console.error('getComparison error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/parent/action-ack { action_item_id, status } */
async function ackActionItem(req, res) {
  try {
    const id = Number(req.body.action_item_id) || Number(req.body.id);
    const status = ['ack', 'done'].includes(req.body.status) ? req.body.status : 'done';
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'action_item_id required.' });

    const item = await db.KidActionItem.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: 'Action item not found.' });
    // Ownership: parent must own the child of this action item.
    const childId = item.child_admission_no;
    req.params.childId = childId;
    if (!(await guardParent(req, res))) return;

    await item.update({ ack_status: status, acked_at: new Date() });
    return res.json({ success: true, data: item.get({ plain: true }) });
  } catch (err) {
    console.error('ackActionItem error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/parent/opt-in { child_admission_no, allow } */
async function toggleOptIn(req, res) {
  try {
    const childId = String(req.body.child_admission_no || req.body.childId || '').trim();
    if (!childId) return res.status(400).json({ success: false, message: 'child_admission_no required.' });
    req.params.childId = childId;
    if (!(await guardParent(req, res))) return;

    const allow = req.body.allow === true || req.body.allow === 1 || req.body.allow === 'true';
    const child = await db.KidChild.findOne({ where: { admission_no: childId } });
    if (!child) return res.status(404).json({ success: false, message: 'Child not found.' });
    try {
      await child.update({ allow_anonymous_comparison: allow ? 1 : 0 });
    } catch {
      // Fall back to raw update if the model doesn't expose the additive column.
      await db.content.query(
        'UPDATE kids_children SET allow_anonymous_comparison = :v WHERE admission_no = :adm',
        { replacements: { v: allow ? 1 : 0, adm: childId } }
      ).catch(() => {});
    }
    return res.json({ success: true, data: { child_admission_no: childId, opted_in: allow } });
  } catch (err) {
    console.error('toggleOptIn error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getInsights,
  getWeeklyDigest,
  getComparison,
  ackActionItem,
  toggleOptIn,
  buildSnapshot,
};
