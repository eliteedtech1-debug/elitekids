'use strict';

/**
 * Q2-E Learning Portfolio (roadmap §2.7) — v1 (2026-09-03).
 *
 * Endpoints:
 *   GET /kids/portfolio/:childId        — skill map (ADE v2) + evidence
 *                                          (speech attempts + game sessions) + recommendations
 *   GET /kids/portfolio/:childId/export — same payload as a downloadable JSON file
 *
 * Read-only aggregation over LIVE sources only:
 *   - kids_adaptive_state_v2 (ADE BKT mastery per skill)          — Q1
 *   - kids_speech_logs (spoken attempts + pronunciation scores)   — Q2-A/B (slice 1)
 *   - kids_progress (game sessions w/ score, stars, xp, mode)     — Q1
 *
 * Drawing evidence + PDF/share links are later slices (drawing logs don't exist yet;
 * PDF needs a renderer decision — see Q2-E split). Every source is fetched defensively:
 * a missing/empty table degrades to [] instead of failing the whole portfolio.
 */

const db = require('../models');
const { Op } = require('sequelize');
const { admissionAllowed } = require('./kidsGoals');
const { resolveBandForAdmission } = require('../services/ageBand');
const { getMasteryState } = require('../services/adaptiveEngine');

const STRUGGLE_P = 0.4; // mastery below this = "needs support"
const MASTERED_P = 0.85; // mastery at/above this = "strength/mastered"

/* ── Pure aggregation helpers (unit-tested, no DB) ───────────────── */

/** Raw kids_adaptive_state_v2 rows → skill map + summary bands. */
function buildSkillMap(rows) {
  const skills = (Array.isArray(rows) ? rows : []).map((r) => {
    const mastery = Math.max(0, Math.min(1, Number(r.mastery_probability) || 0));
    return {
      skill_key: r.skill_key,
      mastery_probability: Math.round(mastery * 10000) / 10000,
      mastery_pct: Math.round(mastery * 100),
      mastery_state: getMasteryState(mastery),
      difficulty: Number(r.current_difficulty || 3),
      total_attempts: Number(r.total_attempts || 0),
      last_practiced_at: r.last_practiced_at || null,
    };
  });
  const state = (s) => s.mastery_state;
  return {
    skills,
    summary: {
      total: skills.length,
      mastered: skills.filter((s) => state(s) === 'mastered').length,
      nearly_there: skills.filter((s) => state(s) === 'nearly_there').length,
      practicing: skills.filter((s) => state(s) === 'practicing').length,
      learning: skills.filter((s) => state(s) === 'learning').length,
      new: skills.filter((s) => state(s) === 'new').length,
    },
  };
}

/** kids_speech_logs rows → speaking evidence rollup + latest N attempts. */
function summarizeSpeech(rows, recentN = 8) {
  const all = Array.isArray(rows) ? rows : [];
  const attempts = all.length;
  const passed = all.filter((r) => Boolean(r.passed)).length;
  const avgRaw =
    all.length > 0 ? all.reduce((s, r) => s + (Number(r.overall_score) || 0), 0) / all.length : 0;
  const recent = all
    .slice(0, recentN)
    .map((r) => ({
      expected_text: r.expected_text,
      transcript: r.transcript || null,
      mode: r.mode || 'word',
      overall_score: Number(r.overall_score) || 0,
      passed: Boolean(r.passed),
      created_at: r.created_at || null,
    }));
  return {
    attempts,
    passed,
    pass_rate_pct: attempts > 0 ? Math.round((passed / attempts) * 100) : 0,
    avg_score_pct: Math.round(avgRaw),
    recent,
  };
}

/** kids_progress rows → game-session evidence rollup (optionally since a date). */
function summarizeGames(rows, recentN = 8) {
  const all = Array.isArray(rows) ? rows : [];
  const sessions = all.length;
  const avgScore =
    all.length > 0 ? all.reduce((s, r) => s + (Number(r.score) || 0), 0) / all.length : 0;
  const recent = all
    .slice(0, recentN)
    .map((r) => ({
      lesson_id: r.lesson_id,
      mode: r.mode || 'practice',
      score: Number(r.score) || 0,
      stars_earned: Number(r.stars_earned) || 0,
      xp: Number(r.xp) || 0,
      completed_at: r.completed_at || null,
    }));
  return {
    sessions,
    total_stars: all.reduce((s, r) => s + (Number(r.stars_earned) || 0), 0),
    total_xp: all.reduce((s, r) => s + (Number(r.xp) || 0), 0),
    avg_score_pct: Math.round(avgScore),
    recent,
  };
}

/** Deterministic recommendations from the skill map (no LLM in v1). */
function recommend(skills) {
  const recs = [];
  const ranked = [...skills].sort((a, b) => a.mastery_probability - b.mastery_probability);
  const weakest = ranked.filter((s) => s.mastery_probability < STRUGGLE_P && s.total_attempts > 0);
  const supports = ranked.filter(
    (s) => s.mastery_probability >= STRUGGLE_P && s.mastery_probability < MASTERED_P,
  );
  const strengths = ranked.filter((s) => s.mastery_probability >= MASTERED_P);

  for (const s of weakest.slice(0, 3)) {
    recs.push({
      type: 'support',
      skill_key: s.skill_key,
      mastery_pct: s.mastery_pct,
      note: 'Needs support — review games recommended.',
    });
  }
  for (const s of supports.slice(0, 2)) {
    recs.push({
      type: 'focus',
      skill_key: s.skill_key,
      mastery_pct: s.mastery_pct,
      note: 'Keep practicing to master this skill.',
    });
  }
  for (const s of strengths.slice(0, 3)) {
    recs.push({
      type: 'strength',
      skill_key: s.skill_key,
      mastery_pct: s.mastery_pct,
      note: 'Mastered — celebrate this win!',
    });
  }
  if (recs.length === 0) {
    recs.push({ type: 'celebrate', skill_key: null, mastery_pct: 0, note: 'Play a first game to start your skill map.' });
  }
  return recs;
}

/* ── Read-only assembler (defensive per source) ─────────────────── */

async function buildPortfolio(admission) {
  const { content } = db;

  // Skill map — ADE v2 BKT state (Q1). Missing table → [] (never 500).
  let skillRows = [];
  try {
    const [rows] = await content.query(
      `SELECT skill_key, mastery_probability, current_difficulty, total_attempts, last_practiced_at
         FROM kids_adaptive_state_v2
        WHERE child_admission_no = :adm
        ORDER BY mastery_probability ASC`,
      { replacements: { adm: admission } },
    );
    skillRows = Array.isArray(rows) ? rows : [];
  } catch { /* adaptive table not present yet */ }

  // Speaking evidence — kids_speech_logs (Q2 slice 1).
  let speechRows = [];
  try {
    const [rows] = await content.query(
      `SELECT expected_text, transcript, mode, overall_score, passed, created_at
         FROM kids_speech_logs
        WHERE child_admission_no = :adm
        ORDER BY created_at DESC
        LIMIT 50`,
      { replacements: { adm: admission } },
    );
    speechRows = Array.isArray(rows) ? rows : [];
  } catch { /* speech table not present yet */ }

  // Game-session evidence — kids_progress (Q1).
  const [gameRows, gameRows7d] = await Promise.all([
    db.KidProgress.findAll({
      where: { child_admission_no: admission },
      order: [['completed_at', 'DESC']],
      limit: 50,
      attributes: ['lesson_id', 'mode', 'score', 'stars_earned', 'xp', 'completed_at'],
    }).catch(() => []),
    db.KidProgress.findAll({
      where: { child_admission_no: admission, completed_at: { [Op.gte]: new Date(Date.now() - 7 * 86400000) } },
      attributes: ['xp'],
    }).catch(() => []),
  ]);

  // Identity: kids_children row first, elite_db.students mirror fallback
  // (SMS-imported kids have no kids_children row — the mirror carries name + class).
  let name = '';
  let className = '';
  try {
    const child = await db.KidChild.findOne({ where: { admission_no: admission }, attributes: ['full_name'] });
    if (child) name = child.full_name || '';
  } catch { /* no kids_children row */ }
  try {
    const student = await db.Student.findOne({ where: { admission_no: admission }, attributes: ['student_name', 'class_name'] });
    if (student) {
      if (!name) name = student.student_name || '';
      className = student.class_name || '';
    }
  } catch { /* not mirrored */ }
  const band = await resolveBandForAdmission(admission).catch(() => null);

  const { skills, summary } = buildSkillMap(skillRows);
  const speaking = summarizeSpeech(speechRows);
  const games = summarizeGames(gameRows);
  const weekly = {
    sessions_7d: gameRows7d.length,
    xp_7d: gameRows7d.reduce((s, r) => s + (Number(r.xp) || 0), 0),
  };

  return {
    child: { admission_no: admission, name, class_name: className, band },
    generated_at: new Date().toISOString(),
    skill_map: skills,
    skill_summary: summary,
    evidence: { speaking, games },
    weekly,
    recommendations: recommend(skills),
  };
}

/* ── Endpoints ────────────────────────────────────────────────────── */

/** GET /kids/portfolio/:childId */
async function getPortfolio(req, res) {
  try {
    const admission = String(req.params.childId || '').trim();
    if (!admission) return res.status(400).json({ success: false, message: 'childId is required.' });
    if (!(await admissionAllowed(req, admission))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }
    const data = await buildPortfolio(admission);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getPortfolio error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/portfolio/:childId/export — same payload as a downloadable JSON file. */
async function exportPortfolio(req, res) {
  try {
    const admission = String(req.params.childId || '').trim();
    if (!admission) return res.status(400).json({ success: false, message: 'childId is required.' });
    if (!(await admissionAllowed(req, admission))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }
    const data = await buildPortfolio(admission);
    const safe = admission.replace(/[^A-Za-z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio-${safe}.json"`);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('exportPortfolio error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  buildSkillMap,
  summarizeSpeech,
  summarizeGames,
  recommend,
  buildPortfolio,
  getPortfolio,
  exportPortfolio,
};
