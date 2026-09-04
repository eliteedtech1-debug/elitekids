'use strict';

const crypto = require('crypto');
const db = require('../models');
const { Op } = require('sequelize');
const {
  predictChild,
  aggregatePopulation,
  scoreContent,
} = require('../services/predictiveAnalytics');
const { requireClassAccess } = require('../services/routesHelper');

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await db.content.query(`CREATE TABLE IF NOT EXISTS kids_predictions (
    id VARCHAR(50) NOT NULL PRIMARY KEY,
    school_id VARCHAR(50) NOT NULL,
    child_admission_no VARCHAR(80) NOT NULL,
    prediction_type VARCHAR(40) NOT NULL,
    score DECIMAL(5,4) NOT NULL DEFAULT 0,
    band VARCHAR(20) NULL,
    confidence DECIMAL(5,4) NULL,
    reasons JSON NULL,
    payload JSON NULL,
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_prediction_child (school_id, child_admission_no),
    KEY idx_prediction_type (prediction_type, generated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  schemaReady = true;
}

function classIdOf(req) {
  return String(req.query.class_id || req.body?.class_id || '').trim();
}

async function guardClass(req, res) {
  const classId = classIdOf(req);
  if (!classId) {
    res.status(400).json({ success: false, message: 'class_id is required.' });
    return null;
  }
  const access = await requireClassAccess(req, classId);
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return null;
  }
  return classId;
}

async function classAdmissions(schoolId, classId) {
  if (!schoolId || !classId) return [];
  const rows = await db.sequelize.query(
    `SELECT admission_no FROM students WHERE school_id = :schoolId AND class_code = :classId LIMIT 500`,
    { replacements: { schoolId, classId }, type: db.Sequelize.QueryTypes.SELECT },
  ).catch(() => []);
  return (Array.isArray(rows) ? rows : []).map((r) => String(r.admission_no || '').trim()).filter(Boolean);
}

async function loadSignals({ schoolId, classId, childId } = {}) {
  const admissions = await classAdmissions(schoolId, classId);
  if (!admissions.length || (childId && !admissions.includes(String(childId)))) return [];
  const selected = childId ? [String(childId)] : admissions;
  const [rows] = await db.content.query(
    `SELECT p.child_admission_no,
            COUNT(*) AS attempts,
            AVG(p.score) AS average_score,
            DATEDIFF(CURRENT_DATE, MAX(p.completed_at)) AS days_inactive
     FROM kids_progress p
     WHERE p.school_id = :schoolId AND p.child_admission_no IN (:admissions)
     GROUP BY p.child_admission_no`,
    { replacements: { schoolId, admissions: selected } },
  ).catch(() => [[]]);

  const [mastery] = await db.content.query(
    `SELECT child_admission_no, AVG(mastery_probability) AS mastery
     FROM kids_adaptive_state_v2
     WHERE child_admission_no IN (:admissions)
     GROUP BY child_admission_no`,
    { replacements: { admissions: selected } },
  ).catch(() => [[]]);
  const masteryMap = new Map((Array.isArray(mastery) ? mastery : []).map((r) => [String(r.child_admission_no), Number(r.mastery) || 0]));
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    child_admission_no: String(r.child_admission_no),
    attempts: Number(r.attempts) || 0,
    avgScore: Number(r.average_score) || 0,
    daysInactive: Number(r.days_inactive) || 0,
    mastery: masteryMap.get(String(r.child_admission_no)) || 0,
  }));
}

async function getPredictions(req, res) {
  try {
    const classId = await guardClass(req, res);
    if (!classId) return;
    const childId = String(req.params.childId || '').trim();
    if (!childId) return res.status(400).json({ success: false, message: 'childId is required.' });
    await ensureSchema();
    const [signal] = await loadSignals({ schoolId: req.user.school_id, classId, childId });
    if (!signal) return res.status(404).json({ success: false, message: 'Child has no analytics data in this class.' });
    const prediction = predictChild({
      ...signal,
      child_admission_no: childId,
      avgScore: signal.avgScore,
    });
    const now = new Date();
    await db.KidPrediction.create({
      id: crypto.randomUUID(),
      school_id: String(req.user.school_id || ''),
      child_admission_no: childId,
      prediction_type: 'child_risk_mastery',
      score: prediction.dropout_risk.score,
      band: prediction.dropout_risk.band,
      confidence: prediction.mastery.confidence,
      reasons: prediction.dropout_risk.reasons,
      payload: prediction,
      generated_at: now,
    }).catch(() => {});
    return res.json({ success: true, data: prediction });
  } catch (err) {
    console.error('getPredictions error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to generate predictions.' });
  }
}

async function getEarlyWarnings(req, res) {
  try {
    const classId = await guardClass(req, res);
    if (!classId) return;
    const signals = await loadSignals({ schoolId: req.user.school_id, classId });
    const warnings = signals.map((s) => predictChild(s)).filter((p) => p.dropout_risk.band !== 'low')
      .sort((a, b) => b.dropout_risk.score - a.dropout_risk.score);
    return res.json({ success: true, data: warnings.slice(0, 100), meta: { class_id: classId, explainable: true } });
  } catch (err) {
    console.error('getEarlyWarnings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load early warnings.' });
  }
}

async function getPopulation(req, res) {
  try {
    const classId = await guardClass(req, res);
    if (!classId) return;
    const signals = await loadSignals({ schoolId: req.user.school_id, classId });
    return res.json({ success: true, data: aggregatePopulation(signals.map((s) => ({ ...s, score: s.avgScore }))), meta: { class_id: classId, explainable: true } });
  } catch (err) {
    console.error('getPopulation error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load population insights.' });
  }
}

async function getContentEffectiveness(req, res) {
  try {
    const classId = await guardClass(req, res);
    if (!classId) return;
    const admissions = await classAdmissions(req.user.school_id, classId);
    if (!admissions.length) return res.json({ success: true, data: [], meta: { class_id: classId, explainable: true } });
    const [rows] = await db.content.query(
      `SELECT p.lesson_id,
              MAX(l.title) AS title,
              COUNT(*) AS attempts,
              COUNT(DISTINCT p.child_admission_no) AS unique_students,
              AVG(p.score) AS average_score,
              AVG(CASE WHEN p.score >= 50 THEN 1 ELSE 0 END) AS completion_rate
       FROM kids_progress p
       LEFT JOIN kids_lessons l ON l.id = p.lesson_id
       WHERE p.school_id = :schoolId AND p.child_admission_no IN (:admissions)
       GROUP BY p.lesson_id
       ORDER BY average_score DESC, completion_rate DESC
       LIMIT 50`,
      { replacements: { schoolId: req.user.school_id, admissions } },
    ).catch(() => [[]]);
    return res.json({ success: true, data: scoreContent(Array.isArray(rows) ? rows : []), meta: { class_id: classId, explainable: true } });
  } catch (err) {
    console.error('getContentEffectiveness error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load content effectiveness.' });
  }
}

module.exports = {
  ensureSchema,
  getPredictions,
  getEarlyWarnings,
  getPopulation,
  getContentEffectiveness,
  loadSignals,
};
