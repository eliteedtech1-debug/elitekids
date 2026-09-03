'use strict';

/**
 * Weekly learning goals (G7).
 *   GET  /kids/goals/:admissionNo          — current week's goal (lazy auto-init 1/week)
 *   POST /kids/goals/:admissionNo          — { target_count, set_by: child|teacher }
 *
 * Rollover is computed on read from period math (Monday start, UTC) — no cron.
 * `done` counts real play in the current period: lessons with a passed test
 * (mode='test' AND score>=50); Creche counts practice completions instead
 * (they have no tests).
 */

const db = require('../models');
const { Op } = require('sequelize');
const { resolveChildBand } = require('../services/ageBand');

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Monday-start week bounds (UTC) → { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }. */
function currentWeekBounds(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const fmt = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  return { start: fmt(start), end: fmt(end) };
}

/** Confirm the caller may act on this admission (self / own child / staff). */
async function admissionAllowed(req, admission) {
  const user = req.user || {};
  const type = String(user.user_type || user.role || '').toLowerCase();
  const isStaff = type.includes('admin') || type.includes('branchadmin') || type.includes('teacher') || type.includes('superadmin');
  if (isStaff) return true;
  if (String(user.admission_no || user.id || '') === String(admission)) return true;
  // Parent: only children linked to their account.
  const child = await db.KidChild.findOne({ where: { admission_no: admission } });
  if (child && child.parent_user_id && String(child.parent_user_id) === String(user.id || user.user_id || '')) return true;
  return false;
}

/** Fetch (creating lazily) the current week's goal row + compute `done`. */
async function getCurrentGoalData(admission, { now = new Date() } = {}) {
  const bounds = currentWeekBounds(now);
  let row = await db.KidLearningGoal.findOne({
    where: { child_admission_no: admission, goal_type: 'weekly', period_start: bounds.start },
  });
  if (!row) {
    row = await db.KidLearningGoal.create({
      child_admission_no: admission,
      goal_type: 'weekly',
      target_count: 1,
      period_start: bounds.start,
      period_end: bounds.end,
      set_by: 'auto',
      status: 'active',
    });
  }

  const child = await db.KidChild.findOne({ where: { admission_no: admission } });
  const band = resolveChildBand(child);
  const creche = band === 'Creche';

  // Real Date objects (never ISO strings w/ 'Z'): MySQL compares DATETIME
  // columns to Date objects as 'YYYY-MM-DD HH:MM:SS' — ISO literals with a
  // trailing 'Z' do not convert cleanly on every MySQL build.
  const start = new Date(`${bounds.start}T00:00:00Z`);
  const end = new Date(`${bounds.end}T00:00:00Z`);
  const prog = await db.KidProgress.findAll({
    where: {
      child_admission_no: admission,
      completed_at: { [Op.gte]: start, [Op.lt]: end },
    },
    attributes: ['lesson_id', 'mode', 'score'],
  });
  const done = new Set();
  for (const p of prog) {
    if (creche ? p.mode === 'practice' : p.mode === 'test' && Number(p.score) >= 50) {
      done.add(p.lesson_id);
    }
  }
  const status = done.size >= row.target_count ? 'done' : row.status;
  if (status !== row.status) {
    await row.update({ status });
  }
  return {
    type: 'weekly',
    target: row.target_count,
    done: done.size,
    period_start: row.period_start,
    period_end: row.period_end,
    set_by: row.set_by,
    status,
  };
}

/** GET /kids/goals/:admissionNo */
async function getChildGoal(req, res) {
  try {
    const admission = String(req.params.admissionNo || '').trim();
    if (!admission) return res.status(400).json({ success: false, message: 'admissionNo is required.' });
    if (!(await admissionAllowed(req, admission))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }
    const goal = await getCurrentGoalData(admission);
    return res.json({ success: true, data: goal });
  } catch (err) {
    console.error('getChildGoal error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/goals/:admissionNo { target_count, set_by } */
async function setChildGoal(req, res) {
  try {
    const admission = String(req.params.admissionNo || '').trim();
    if (!admission) return res.status(400).json({ success: false, message: 'admissionNo is required.' });

    const { target_count, set_by } = req.body || {};
    const target = Number(target_count);
    if (!Number.isInteger(target) || target < 1 || target > 20) {
      return res.status(400).json({ success: false, message: 'target_count must be an integer between 1 and 20.' });
    }
    const by = ['child', 'teacher'].includes(set_by) ? set_by : 'child';

    if (!(await admissionAllowed(req, admission))) {
      return res.status(403).json({ success: false, message: 'Not allowed to set goals for this child.' });
    }
    // Child may only raise/keep their own target (never teacher, and never
    // lower below their own previous choice) — light guard: child sets own.
    const bounds = currentWeekBounds();
    const existing = await db.KidLearningGoal.findOne({
      where: { child_admission_no: admission, goal_type: 'weekly', period_start: bounds.start },
    });
    if (existing && by === 'child' && existing.set_by === 'teacher' && target < existing.target_count) {
      return res.status(403).json({ success: false, message: 'A teacher set this week\'s goal — ask your teacher to change it.' });
    }
    const row = existing
      ? await existing.update({ target_count: target, set_by: by, status: 'active' })
      : await db.KidLearningGoal.create({
          child_admission_no: admission,
          goal_type: 'weekly',
          target_count: target,
          period_start: bounds.start,
          period_end: bounds.end,
          set_by: by,
          status: 'active',
        });
    const goal = await getCurrentGoalData(admission);
    return res.json({ success: true, data: { ...goal, id: row.id } });
  } catch (err) {
    console.error('setChildGoal error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  currentWeekBounds,
  admissionAllowed,
  getCurrentGoalData,
  getChildGoal,
  setChildGoal,
};
