'use strict';

/**
 * Q3 Teacher AI Assistant controller (REST). See q3-village-planning.md §3.3.
 *
 *   GET  /kids/teacher/insights      — class-level insights (struggling, deltas)
 *   GET  /kids/teacher/suggestions   — content/activity suggestions (gap detection)
 *   POST /kids/teacher/auto-assign   — auto-assign based on analytics
 *   GET  /kids/teacher/weekly-report — generated class report (JSON)
 *   GET  /kids/teacher/struggling    — students below mastery threshold (0.40)
 *
 * All routes are staff-gated (requireStaff in routes/kids.js).
 */

const db = require('../models');
const { Op } = require('sequelize');
const { aggregateClassInsights, detectContentGaps, autoAssignHeuristic, weeklyReport } = require('../services/teacherAssistant');
const { STRUGGLE } = require('../services/insightGenerator');
const { requireClassAccess } = require('../services/routesHelper');

function classIdOf(req) {
  return String(req.query.class_id || req.body.class_id || req.user.class_id || '').trim();
}

function todayWeekStart() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Load per-child mastery from kids_adaptive_state_v2 for a class. */
async function loadClassMastery(classId) {
  const [rows] = await db.content.query(
    `SELECT child_admission_no, skill_key, mastery_probability, total_attempts
     FROM kids_adaptive_state_v2
     WHERE child_admission_no IN (
       SELECT admission_no FROM kids_children WHERE class_code = :cid
     )`,
    { replacements: { cid: classId } }
  ).catch(() => [[]]);
  return Array.isArray(rows) ? rows : [];
}

/** GET /kids/teacher/insights */
async function getTeacherInsights(req, res) {
  try {
    const classId = classIdOf(req);
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    let rows = await db.KidTeacherInsight.findAll({
      where: { class_id: classId, week_start: todayWeekStart() },
      order: [['severity', 'DESC']],
    }).catch(() => []);

    if (!rows || rows.length === 0) {
      const mastery = await loadClassMastery(classId);
      const byChild = {};
      for (const m of mastery) {
        (byChild[m.child_admission_no] = byChild[m.child_admission_no] || { skills: [] }).skills.push(m);
      }
      const snapshots = Object.entries(byChild).map(([child_admission_no, sd]) => ({
        child_admission_no,
        snapshot: { skills: sd.skills.map((s) => ({ skill_key: s.skill_key, mastery_probability: s.mastery_probability, total_attempts: s.total_attempts, sessions_this_week: Number(s.total_attempts) || 0 })) },
      }));
      const generated = aggregateClassInsights(snapshots);
      rows = generated.map((g) =>
        db.KidTeacherInsight.create({
          school_id: String(req.user.school_id || ''),
          class_id: classId,
          insight_type: g.insight_type,
          headline: g.headline,
          body: g.body,
          severity: g.severity,
          meta: g.meta || null,
          week_start: todayWeekStart(),
        }).catch(() => null)
      );
      rows = (await Promise.all(rows)).filter(Boolean);
    }

    return res.json({ success: true, data: rows.map((r) => r.get({ plain: true })) });
  } catch (err) {
    console.error('getTeacherInsights error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/teacher/suggestions */
async function getSuggestions(req, res) {
  try {
    const classId = classIdOf(req);
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    let rows = await db.KidContentSuggestion.findAll({
      where: { class_id: classId, status: 'open' },
      order: [['priority', 'DESC'], ['created_at', 'DESC']],
      limit: 50,
    }).catch(() => []);

    if (!rows || rows.length === 0) {
      // Detect content gaps by NERDC strand coverage (lessons created vs expected).
      const [coverage] = await db.content.query(
        `SELECT nerdc_strand AS strand, COUNT(*) AS coverage
         FROM kids_lessons WHERE nerdc_strand IS NOT NULL GROUP BY nerdc_strand`
      ).catch(() => [[]]);
      const gaps = detectContentGaps((Array.isArray(coverage) ? coverage : []).map((c) => ({
        class_id: classId,
        strand: c.strand,
        coverage: Number(c.coverage) || 0,
        expected: 10, // heuristic expectation; teacher can adjust
      })));
      rows = gaps.map((g) =>
        db.KidContentSuggestion.create({
          school_id: String(req.user.school_id || ''),
          class_id: classId,
          suggestion_type: 'gap',
          title: `Content gap: ${g.strand}`,
          body: `${g.gap} more ${g.strand} lesson${g.gap === 1 ? '' : 's'} suggested to close the coverage gap.`,
          strand: g.strand,
          status: 'open',
          priority: g.priority,
          meta: { coverage: g.coverage, expected: g.expected, coverage_pct: g.coverage_pct },
        }).catch(() => null)
      );
      rows = (await Promise.all(rows)).filter(Boolean);
    }

    return res.json({ success: true, data: rows.map((r) => r.get({ plain: true })) });
  } catch (err) {
    console.error('getSuggestions error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/teacher/auto-assign { class_id, threshold? } */
async function autoAssign(req, res) {
  try {
    const classId = classIdOf(req);
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    const threshold = Number(req.body.threshold) || STRUGGLE;
    const mastery = await loadClassMastery(classId);

    // BKT low → assign a matching lesson; ADE struggling → schedule review.
    const recommendations = [];
    const seen = new Set();
    for (const m of mastery) {
      const mp = Number(m.mastery_probability) || 0;
      if (mp > 0 && mp < threshold) {
        if (seen.has(`${m.child_admission_no}:${m.skill_key}`)) continue;
        seen.add(`${m.child_admission_no}:${m.skill_key}`);
        recommendations.push({
          child_admission_no: m.child_admission_no,
          skill_key: m.skill_key,
          action: m.total_attempts >= 2 ? 'review' : 'assign',
          lesson_id: null,
        });
      }
    }

    const intents = autoAssignHeuristic(recommendations).slice(0, 100);
    const saved = [];
    for (const it of intents) {
      const row = await db.KidContentSuggestion.create({
        school_id: String(req.user.school_id || ''),
        class_id: classId,
        suggestion_type: it.action === 'review' ? 'review' : 'assign',
        title: it.action === 'review' ? `Review for ${it.child_admission_no}` : `Assign lesson for ${it.child_admission_no}`,
        body: `${it.action === 'review' ? 'Schedule a review' : 'Assign a matching lesson'} for mastery on ${it.skill_key || 'this skill'}.`,
        child_admission_no: it.child_admission_no,
        status: 'assigned',
        priority: 'high',
        meta: { skill_key: it.skill_key },
      }).catch(() => null);
      if (row) saved.push(row.get({ plain: true }));
    }

    return res.json({ success: true, data: { assigned: saved, total_intents: intents.length } });
  } catch (err) {
    console.error('autoAssign error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/teacher/weekly-report */
async function getWeeklyReport(req, res) {
  try {
    const classId = classIdOf(req);
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    const since = new Date(Date.now() - 7 * 86400000);
    const [children] = await db.content.query(
      `SELECT admission_no FROM kids_children WHERE class_code = :cid`,
      { replacements: { cid: classId } }
    ).catch(() => [[]]);
    const admissions = (Array.isArray(children) ? children : []).map((c) => c.admission_no);

    const students = [];
    for (const adm of admissions.slice(0, 200)) {
      const prog = await db.KidProgress.findAll({
        where: { child_admission_no: adm, completed_at: { [Op.gte]: since } },
      }).catch(() => []);
      students.push({
        child_admission_no: adm,
        engaged: prog.length > 0,
        xp: prog.reduce((a, p) => a + (Number(p.xp) || 0), 0),
        avg_score: prog.length
          ? Math.round(prog.reduce((a, p) => a + (Number(p.score) || 0), 0) / prog.length)
          : 0,
      });
    }

    const insights = await db.KidTeacherInsight.findAll({ where: { class_id: classId, week_start: todayWeekStart() } }).catch(() => []);
    const suggestions = await db.KidContentSuggestion.findAll({ where: { class_id: classId } }).catch(() => []);
    const report = weeklyReport({
      class_id: classId,
      week_start: todayWeekStart(),
      students,
      insights,
      suggestions,
    });
    return res.json({ success: true, data: report });
  } catch (err) {
    console.error('getWeeklyReport error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/teacher/struggling */
async function getStruggling(req, res) {
  try {
    const classId = classIdOf(req);
    const threshold = Number(req.query.threshold) || STRUGGLE;
    if (!classId) return res.status(400).json({ success: false, message: 'class_id is required.' });
    const classAccess = await requireClassAccess(req, classId);
    if (!classAccess.ok) return res.status(classAccess.status).json(classAccess.body);

    const mastery = await loadClassMastery(classId);
    const byChild = {};
    for (const m of mastery) {
      if (Number(m.mastery_probability) > 0 && Number(m.mastery_probability) < threshold) {
        (byChild[m.child_admission_no] = byChild[m.child_admission_no] || []).push(m);
      }
    }

    const out = Object.entries(byChild).map(([child_admission_no, skills]) => ({
      child_admission_no,
      mastery: Number(skills.reduce((a, s) => a + (Number(s.mastery_probability) || 0), 0) / skills.length).toFixed(2),
      struggling_skills: skills.map((s) => ({
        skill_key: s.skill_key,
        mastery_probability: s.mastery_probability,
        total_attempts: s.total_attempts,
      })),
    }));

    return res.json({ success: true, data: out });
  } catch (err) {
    console.error('getStruggling error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getTeacherInsights,
  getSuggestions,
  autoAssign,
  getWeeklyReport,
  getStruggling,
};
