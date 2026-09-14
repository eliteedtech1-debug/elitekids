'use strict';

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');
const { requireClassAccess } = require('../services/routesHelper');
const { buildNeutralLearningSummary } = require('../services/neutralLearningSummary');
const {
  assertObservationContext,
  bridgeContextErrorResponse,
} = require('../services/lessonBridgeContext');

const LEVELS = ['independent', 'with_prompt', 'emerging', 'not_yet_observed', 'not_applicable'];
const ROUTES = ['point', 'gesture', 'movement', 'speech', 'home_language', 'sign', 'AAC', 'drawing', 'mark-making', 'mixed'];
const PROMPTS = ['none', 'model', 'gesture', 'verbal_clue', 'two_choices', 'full_support'];

function schoolIdOf(req) {
  // Institutional scope is taken from the verified JWT/session only. A
  // browser-supplied tenant header must never select another school's data.
  return String(req.user?.school_id || '').trim();
}
function actorIdOf(req) { return String(req.user?.id || req.user?.user_id || '').trim(); }
function roleOf(req) { return String(req.user?.user_type || req.user?.role || '').toLowerCase(); }
function isStaff(req) { return roleOf(req).includes('admin') || roleOf(req).includes('teacher') || roleOf(req).includes('developer'); }
function plain(row) { return row?.toJSON ? row.toJSON() : row; }

function validateObservation(body) {
  const errors = {};
  for (const field of ['child_admission_no', 'lesson_bridge_id', 'observation_level', 'response_route', 'prompt_level', 'next_step']) {
    if (typeof body[field] !== 'string' || !body[field].trim()) errors[field] = `${field} is required.`;
  }
  if (body.observation_level && !LEVELS.includes(body.observation_level)) errors.observation_level = `observation_level must be one of: ${LEVELS.join(', ')}.`;
  if (body.response_route && !ROUTES.includes(body.response_route)) errors.response_route = `response_route must be one of: ${ROUTES.join(', ')}.`;
  if (body.prompt_level && !PROMPTS.includes(body.prompt_level)) errors.prompt_level = `prompt_level must be one of: ${PROMPTS.join(', ')}.`;
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') errors.note = 'note must be a string.';
  if (body.context !== undefined && body.context !== null && typeof body.context !== 'string') errors.context = 'context must be a string.';
  return errors;
}

async function loadBridgeForSchool(id, schoolId) {
  return db.KidLessonBridge.findOne({ where: { id, school_id: schoolId } });
}

async function loadChildForSchool(admission, schoolId) {
  return db.KidChild.findOne({ where: { admission_no: admission, school_id: schoolId } });
}

async function assertClassAccess(req, classId) {
  if (!classId) return true;
  const result = await requireClassAccess(req, classId);
  return result.ok;
}

/** POST /kids/observations */
async function createObservation(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const body = req.body || {};
    const errors = validateObservation(body);
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Observation validation failed.', errors });
    const schoolId = schoolIdOf(req);
    const bridge = await loadBridgeForSchool(body.lesson_bridge_id, schoolId);
    if (!bridge) return res.status(404).json({ success: false, message: 'Lesson bridge not found.' });
    const child = await loadChildForSchool(body.child_admission_no, schoolId);
    if (!child) return res.status(404).json({ success: false, message: 'Child not found in your school.' });
    if (!(await assertClassAccess(req, child.class_code))) return res.status(403).json({ success: false, message: 'You do not have access to this child\'s class.' });
    // Evidence must be recorded against one authoritative class context: the
    // child and the bridge are verified together. For non-flagship schools the
    // child roster is confirmed through the EliteSMS API (no direct shared-DB
    // read); flagship/model schools keep the local class-identity check.
    try {
      await assertObservationContext(req, {
        bridge: plain(bridge),
        child: plain(child),
        admissionNo: body.child_admission_no.trim(),
      });
    } catch (error) {
      const response = bridgeContextErrorResponse(error);
      if (response) return res.status(response.status).json(response.body);
      throw error;
    }
    const key = body.idempotency_key ? String(body.idempotency_key).trim() : null;
    if (key) {
      const existing = await db.KidTeacherObservation.findOne({ where: { observer_id: actorIdOf(req), idempotency_key: key } });
      if (existing) return res.status(200).json({ success: true, data: plain(existing), deduplicated: true });
    }
    const observedAt = body.observed_at ? new Date(body.observed_at) : new Date();
    if (Number.isNaN(observedAt.getTime())) return res.status(400).json({ success: false, message: 'observed_at must be a valid date.' });
    const row = await db.KidTeacherObservation.create({
      id: uuidv4(),
      child_admission_no: body.child_admission_no.trim(),
      lesson_bridge_id: bridge.id,
      lesson_id: bridge.lesson_id,
      outcome_id: bridge.outcome_id,
      school_id: schoolId,
      class_id: child.class_code || null,
      observer_id: actorIdOf(req),
      observation_level: body.observation_level,
      response_route: body.response_route,
      prompt_level: body.prompt_level,
      context: body.context ? String(body.context).trim().slice(0, 120) : null,
      note: body.note ? String(body.note).trim().slice(0, 10000) : null,
      next_step: body.next_step.trim().slice(0, 10000),
      work_sample_ref: body.work_sample_ref ? String(body.work_sample_ref).trim().slice(0, 255) : null,
      observed_at: observedAt,
      idempotency_key: key,
    });
    return res.status(201).json({ success: true, data: plain(row) });
  } catch (err) {
    console.error('createObservation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/observations?child_admission_no=X&lesson_bridge_id=Y */
async function listObservations(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const where = { school_id: schoolIdOf(req) };
    if (req.query.child_admission_no) where.child_admission_no = String(req.query.child_admission_no).trim();
    if (req.query.lesson_bridge_id) where.lesson_bridge_id = String(req.query.lesson_bridge_id).trim();
    const rows = await db.KidTeacherObservation.findAll({ where, order: [['observed_at', 'DESC']], limit: 100 });
    return res.json({ success: true, data: rows.map(plain) });
  } catch (err) {
    console.error('listObservations error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** PATCH /kids/observations/:id — observer may correct their own record only. */
async function updateObservation(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const row = await db.KidTeacherObservation.findOne({ where: { id: req.params.id, school_id: schoolIdOf(req) } });
    if (!row) return res.status(404).json({ success: false, message: 'Observation not found.' });
    if (row.observer_id !== actorIdOf(req) && !roleOf(req).includes('admin')) return res.status(403).json({ success: false, message: 'You may only edit your own observation.' });
    const allowed = ['observation_level', 'response_route', 'prompt_level', 'context', 'note', 'next_step', 'work_sample_ref', 'observed_at'];
    const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    const errors = validateObservation({ ...row.toJSON(), ...patch });
    delete errors.child_admission_no; delete errors.lesson_bridge_id;
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Observation validation failed.', errors });
    if (patch.observed_at) {
      patch.observed_at = new Date(patch.observed_at);
      if (Number.isNaN(patch.observed_at.getTime())) return res.status(400).json({ success: false, message: 'observed_at must be a valid date.' });
    }
    await row.update(patch);
    return res.json({ success: true, data: plain(row) });
  } catch (err) {
    console.error('updateObservation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/learning-summary/:childAdmissionNo?lesson_bridge_id=X */
async function getLearningSummary(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const admission = String(req.params.childAdmissionNo || '').trim();
    if (!admission) return res.status(400).json({ success: false, message: 'childAdmissionNo is required.' });
    const schoolId = schoolIdOf(req);
    const child = await loadChildForSchool(admission, schoolId);
    if (!child) return res.status(404).json({ success: false, message: 'Child not found in your school.' });
    if (!(await assertClassAccess(req, child.class_code))) return res.status(403).json({ success: false, message: 'You do not have access to this child\'s class.' });
    const where = { school_id: schoolId, child_admission_no: admission };
    if (req.query.lesson_bridge_id) where.lesson_bridge_id = String(req.query.lesson_bridge_id).trim();
    const observations = await db.KidTeacherObservation.findAll({ where, order: [['observed_at', 'DESC']], limit: 50 });
    const bridge = observations[0]
      ? await db.KidLessonBridge.findByPk(observations[0].lesson_bridge_id)
      : req.query.lesson_bridge_id ? await db.KidLessonBridge.findOne({ where: { id: req.query.lesson_bridge_id, school_id: schoolId } }) : null;
    const lessonIds = bridge ? [bridge.lesson_id] : [];
    const digitalRows = lessonIds.length ? await db.KidProgress.findAll({ where: { child_admission_no: admission, lesson_id: { [Op.in]: lessonIds } }, attributes: ['lesson_id', 'completed_at'] }) : [];
    const summary = buildNeutralLearningSummary({
      bridge: plain(bridge),
      digital: { sessions: digitalRows.length, games_played: digitalRows.length, attempt_count: digitalRows.length, last_played_at: digitalRows[0]?.completed_at || null },
      observations: observations.map(plain),
    });
    return res.json({ success: true, data: { ...summary, child_admission_no: admission, observations_count: observations.length } });
  } catch (err) {
    console.error('getLearningSummary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  LEVELS,
  ROUTES,
  PROMPTS,
  validateObservation,
  createObservation,
  listObservations,
  updateObservation,
  getLearningSummary,
};
