'use strict';

/**
 * Phase 1 — professional lesson bridge.
 *
 * The bridge is teacher-facing planning data. It is intentionally separate
 * from child game delivery: draft and review records never become child
 * content by themselves. All records are stored in the dedicated kids DB via
 * KidLessonBridge.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const { AGE_BANDS } = require('../services/ageBand');
const {
  resolveBridgeContext,
  bridgeContextFields,
  bridgeContextErrorResponse,
} = require('../services/lessonBridgeContext');

const TERM_NAMES = ['First Term', 'Second Term', 'Third Term'];
const EVIDENCE_ROUTES = ['point', 'gesture', 'movement', 'speech', 'home_language', 'sign', 'AAC', 'drawing', 'mark-making', 'mixed'];
const FOLLOW_UP_TYPES = ['new-skill', 'new-representation', 'reinforcement', 'transfer', 'extension'];
const MAX_TEXT = 5000;

function schoolIdOf(req) {
  // Institutional scope is taken from the verified JWT/session only. A
  // browser-supplied tenant header must never select another school's data.
  return String(req.user?.school_id || '').trim();
}

function actorIdOf(req) {
  return String(req.user?.id || req.user?.user_id || '').trim();
}

function plain(row) {
  return row?.toJSON ? row.toJSON() : row;
}

function isStaff(req) {
  const role = String(req.user?.user_type || req.user?.role || '').toLowerCase();
  return role.includes('admin') || role.includes('branchadmin') || role.includes('teacher') || role.includes('superadmin') || role.includes('developer');
}

function text(value, field, required = false) {
  if (value === undefined || value === null || value === '') {
    return required ? `${field} is required.` : null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) return `${field} must be a non-empty string.`;
  if (value.length > MAX_TEXT) return `${field} must be ${MAX_TEXT} characters or fewer.`;
  return null;
}

function list(value, field, { min = 0, max = 50, required = false } = {}) {
  if (value === undefined || value === null) return required ? `${field} is required.` : null;
  if (!Array.isArray(value)) return `${field} must be an array.`;
  if (value.length < min || value.length > max) return `${field} must contain ${min}-${max} entries.`;
  if (value.some((item) => typeof item !== 'string' || !item.trim())) return `${field} must contain non-empty strings.`;
  return null;
}

function validateGamePlan(gamePlan) {
  if (!gamePlan || typeof gamePlan !== 'object' || Array.isArray(gamePlan)) return 'game_plan is required and must be an object.';
  if (!Array.isArray(gamePlan.components) || gamePlan.components.length < 1) return 'game_plan.components must contain at least one game component.';
  const seenOrders = new Set();
  for (let i = 0; i < gamePlan.components.length; i += 1) {
    const component = gamePlan.components[i];
    if (!component || typeof component !== 'object' || Array.isArray(component)) return `game_plan.components[${i}] must be an object.`;
    const template = String(component.template || '').trim();
    if (!template || template === 'game-chain') return `game_plan.components[${i}].template must be a standalone game template.`;
    // 5-15 playable items (Primary band may use up to 15 per user directive;
    // early-years bands stay 5-10). See curriculum/game-size-and-module-standard.md.
    const count = Number(component.item_count ?? component.playable_item_count);
    if (!Number.isInteger(count) || count < 5 || count > 15) {
      return `game_plan.components[${i}] must contain 5-15 playable items.`;
    }
    const order = component.order === undefined ? i + 1 : Number(component.order);
    if (!Number.isInteger(order) || order < 1 || seenOrders.has(order)) return `game_plan.components[${i}].order must be unique and positive.`;
    seenOrders.add(order);
  }
  const orders = [...seenOrders].sort((a, b) => a - b);
  if (orders.some((value, index) => value !== index + 1)) return 'game_plan component order must be contiguous from 1.';
  return null;
}

function validateBridge(body, { partial = false } = {}) {
  const errors = {};
  const requiredText = ['class_label', 'age_band', 'subject_id', 'objective', 'concrete_experience'];
  for (const field of requiredText) {
    if (!partial || body[field] !== undefined) {
      const error = text(body[field], field, !partial);
      if (error) errors[field] = error;
    }
  }
  if (!partial || body.outcome_id !== undefined) {
    const error = text(body.outcome_id, 'outcome_id', !partial);
    if (error) errors.outcome_id = error;
  }
  if (!partial || body.lesson_id !== undefined) {
    const error = text(body.lesson_id, 'lesson_id', !partial);
    if (error) errors.lesson_id = error;
  }

  if (!partial || body.term_name !== undefined) {
    if (!TERM_NAMES.includes(body.term_name)) errors.term_name = `term_name must be one of: ${TERM_NAMES.join(', ')}.`;
  }
  if (!partial || body.week_number !== undefined) {
    const week = Number(body.week_number);
    if (!Number.isInteger(week) || week < 1 || week > 10) errors.week_number = 'week_number must be an integer from 1 to 10.';
  }
  if (!partial || body.age_band !== undefined) {
    if (!AGE_BANDS.includes(body.age_band)) errors.age_band = `age_band must be one of: ${AGE_BANDS.join(', ')}.`;
  }

  for (const field of ['micro_objectives', 'success_evidence']) {
    if (!partial || body[field] !== undefined) {
      const error = list(body[field], field, { min: 2, max: 4, required: !partial });
      if (error) errors[field] = error;
    }
  }
  if (!partial || body.evidence_routes !== undefined) {
    const error = list(body.evidence_routes, 'evidence_routes', { min: 1, max: EVIDENCE_ROUTES.length, required: !partial });
    if (error) errors.evidence_routes = error;
    else {
      const invalid = body.evidence_routes.filter((route) => !EVIDENCE_ROUTES.includes(route));
      if (invalid.length) errors.evidence_routes = `Unsupported evidence route(s): ${invalid.join(', ')}.`;
    }
  }
  if (!partial || body.assessment_plan !== undefined) {
    if (!body.assessment_plan || typeof body.assessment_plan !== 'object' || Array.isArray(body.assessment_plan)) errors.assessment_plan = 'assessment_plan is required and must be an object.';
  }
  if (!partial || body.game_plan !== undefined) {
    const error = validateGamePlan(body.game_plan);
    if (error) errors.game_plan = error;
  }
  if (body.follow_up_type !== undefined && body.follow_up_type !== null && !FOLLOW_UP_TYPES.includes(body.follow_up_type)) {
    errors.follow_up_type = `follow_up_type must be one of: ${FOLLOW_UP_TYPES.join(', ')}.`;
  }
  if (body.follow_up_type === 'new-representation') {
    const reinforcementError = list(body.reinforcement_of, 'reinforcement_of', { min: 1, max: 20, required: true });
    if (reinforcementError) errors.reinforcement_of = reinforcementError;
    const sequenceError = list(body.representation_sequence, 'representation_sequence', { min: 2, max: 20, required: true });
    if (sequenceError) errors.representation_sequence = sequenceError;
  }
  return errors;
}

function bridgeValues(body, user, existing = null, context = null) {
  const value = (key, fallback = null) => body[key] !== undefined ? body[key] : (existing ? existing[key] : fallback);
  const contextValues = context ? bridgeContextFields(context) : {};
  return {
    lesson_id: value('lesson_id'),
    outcome_id: value('outcome_id'),
    ...contextValues,
    school_id: contextValues.school_id || existing?.school_id || schoolIdOf({ headers: {}, user }),
    branch_id: contextValues.branch_id || existing?.branch_id || String(user.branch_id || '').trim() || null,
    class_code: contextValues.class_code || value('class_code'),
    class_label: contextValues.class_label || value('class_label'),
    academic_year: contextValues.academic_year || value('academic_year'),
    term_name: contextValues.term_name || value('term_name'),
    week_number: contextValues.week_number || value('week_number'),
    subject_id: value('subject_id') || contextValues.subject_code,
    subject_code: contextValues.subject_code || value('subject_code'),
    sms_lesson_id: contextValues.sms_lesson_id || value('sms_lesson_id'),
    strand: value('strand'),
    sub_strand: value('sub_strand'),
    objective: value('objective'),
    micro_objectives: value('micro_objectives', []),
    success_evidence: value('success_evidence', []),
    evidence_routes: value('evidence_routes', []),
    previous_experience: value('previous_experience'),
    concrete_experience: value('concrete_experience'),
    guided_play: value('guided_play'),
    transfer_activity: value('transfer_activity'),
    differentiation: value('differentiation'),
    vocabulary: value('vocabulary'),
    home_connection: value('home_connection'),
    assessment_plan: value('assessment_plan', {}),
    follow_up_type: value('follow_up_type'),
    reinforcement_of: value('reinforcement_of'),
    representation_sequence: value('representation_sequence'),
    grouping: value('grouping'),
    item_range: value('item_range'),
    game_plan: value('game_plan', {}),
    scene_plan: value('scene_plan'),
  };
}

async function findSchoolLesson(lessonId, schoolId) {
  if (!lessonId || !schoolId) return null;
  return db.KidLesson.findOne({ where: { id: lessonId, school_id: schoolId } });
}

async function validateReferences(req, body, existing = null) {
  const errors = {};
  const schoolId = schoolIdOf(req);
  const lessonId = body.lesson_id ?? existing?.lesson_id;
  const outcomeId = body.outcome_id ?? existing?.outcome_id;
  const lesson = await findSchoolLesson(lessonId, schoolId);
  if (!lesson) errors.lesson_id = 'lesson_id must reference a lesson in your school.';
  const outcome = outcomeId ? await db.KidCurriculumPoint.findByPk(outcomeId) : null;
  if (!outcome) errors.outcome_id = 'outcome_id must reference a reviewed curriculum point.';
  else if (body.age_band && outcome.age_band !== body.age_band) errors.age_band = 'age_band must match the selected curriculum outcome.';
  return { errors, lesson, outcome };
}

function canEdit(req, row) {
  const schoolId = schoolIdOf(req);
  const actor = actorIdOf(req);
  return !!row && row.school_id === schoolId && (row.created_by === actor || String(req.user?.user_type || req.user?.role || '').toLowerCase().includes('admin'));
}

/** GET /kids/learning-outcomes */
async function listOutcomes(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const where = {};
    if (req.query.age_band) {
      if (!AGE_BANDS.includes(req.query.age_band)) return res.status(400).json({ success: false, message: `age_band must be one of: ${AGE_BANDS.join(', ')}.` });
      where.age_band = req.query.age_band;
    }
    if (req.query.subject_id) where.category = String(req.query.subject_id).trim();
    const rows = await db.KidCurriculumPoint.findAll({ where, order: [['age_band', 'ASC'], ['category', 'ASC'], ['id', 'ASC']] });
    return res.json({ success: true, data: rows.map((row) => ({
      id: row.id,
      source: row.curriculum_source || 'Reviewed curriculum',
      age_band: row.age_band,
      subject_id: row.category,
      strand: row.nerdc_strand || null,
      sub_strand: row.nerdc_sub_strand || null,
      statement: row.learning_objective,
      observable_actions: [],
      suggested_representations: [],
    })) });
  } catch (err) {
    console.error('listOutcomes error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/lesson-bridges */
async function listBridges(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const where = { school_id: schoolIdOf(req) };
    if (req.query.lesson_id) where.lesson_id = String(req.query.lesson_id).trim();
    if (req.query.status) where.status = String(req.query.status).trim();
    const rows = await db.KidLessonBridge.findAll({ where, order: [['updatedAt', 'DESC']] });
    return res.json({ success: true, data: rows.map(plain) });
  } catch (err) {
    console.error('listBridges error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/lesson-bridges */
async function createBridge(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const body = req.body || {};
    const errors = validateBridge(body);
    const refs = await validateReferences(req, body);
    Object.assign(errors, refs.errors);
    let context;
    try {
      context = await resolveBridgeContext(req, body);
    } catch (error) {
      const response = bridgeContextErrorResponse(error);
      if (response) return res.status(response.status).json(response.body);
      throw error;
    }
    if (context.context_source === 'elite-sms' && body.age_band && context.age_band && body.age_band !== context.age_band) {
      return res.status(422).json({ success: false, error_code: 'SMS_CONTEXT_AGE_MISMATCH', message: 'age_band must match the SMS-authoritative class context.' });
    }
    if (context.context_source === 'elite-sms' && body.subject_id && context.subject_code
      && body.subject_id !== context.subject_code) {
      return res.status(422).json({ success: false, error_code: 'SMS_CONTEXT_SUBJECT_MISMATCH', message: 'subject_id must use the SMS subject_code.' });
    }
    Object.assign(errors, refs.errors);
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Bridge validation failed.', errors });
    const schoolId = schoolIdOf(req);
    const duplicate = await db.KidLessonBridge.findOne({ where: { lesson_id: body.lesson_id, school_id: schoolId } });
    if (duplicate) return res.status(409).json({ success: false, message: 'A lesson bridge already exists for this lesson.' });
    const row = await db.KidLessonBridge.create({
      id: uuidv4(),
      ...bridgeValues(body, { ...req.user, school_id: schoolId }, null, context),
      school_id: schoolId,
      created_by: actorIdOf(req),
      status: 'draft',
    });
    return res.status(201).json({ success: true, data: plain(row) });
  } catch (err) {
    console.error('createBridge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/lesson-bridges/:id */
async function getBridge(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const row = await db.KidLessonBridge.findOne({ where: { id: req.params.id, school_id: schoolIdOf(req) } });
    if (!row) return res.status(404).json({ success: false, message: 'Lesson bridge not found.' });
    return res.json({ success: true, data: plain(row) });
  } catch (err) {
    console.error('getBridge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** PATCH /kids/lesson-bridges/:id */
async function updateBridge(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const row = await db.KidLessonBridge.findOne({ where: { id: req.params.id, school_id: schoolIdOf(req) } });
    if (!row) return res.status(404).json({ success: false, message: 'Lesson bridge not found.' });
    if (!canEdit(req, row)) return res.status(403).json({ success: false, message: 'You may only edit your own bridge.' });
    if (['approved', 'published', 'recalled'].includes(row.status)) return res.status(409).json({ success: false, message: 'This bridge is no longer editable.' });
    const errors = validateBridge(req.body || {}, { partial: true });
    const refs = await validateReferences(req, req.body || {}, row);
    Object.assign(errors, refs.errors);
    let context;
    try {
      context = await resolveBridgeContext(req, req.body || {}, row);
    } catch (error) {
      const response = bridgeContextErrorResponse(error);
      if (response) return res.status(response.status).json(response.body);
      throw error;
    }
    if (context.context_source === 'elite-sms' && req.body?.age_band && context.age_band && req.body.age_band !== context.age_band) {
      return res.status(422).json({ success: false, error_code: 'SMS_CONTEXT_AGE_MISMATCH', message: 'age_band must match the SMS-authoritative class context.' });
    }
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Bridge validation failed.', errors });
    await row.update({ ...bridgeValues(req.body || {}, { ...req.user, school_id: schoolIdOf(req) }, row, context), status: 'draft' });
    return res.json({ success: true, data: plain(row) });
  } catch (err) {
    console.error('updateBridge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/lesson-bridges/:id/submit-review */
async function submitBridgeReview(req, res) {
  try {
    if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
    const row = await db.KidLessonBridge.findOne({ where: { id: req.params.id, school_id: schoolIdOf(req) } });
    if (!row) return res.status(404).json({ success: false, message: 'Lesson bridge not found.' });
    if (!canEdit(req, row)) return res.status(403).json({ success: false, message: 'You may only submit your own bridge.' });
    const body = plain(row);
    const errors = validateBridge(body);
    try {
      await resolveBridgeContext(req, body, row);
    } catch (error) {
      const response = bridgeContextErrorResponse(error);
      if (response) return res.status(response.status).json({ ...response.body, message: 'Bridge context is no longer authoritative.' });
      throw error;
    }
    const refs = await validateReferences(req, body, row);
    Object.assign(errors, refs.errors);
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Bridge is not ready for review.', errors });
    await row.update({ status: 'ready_for_review' });
    return res.json({ success: true, data: plain(row), message: 'Bridge submitted for review.' });
  } catch (err) {
    console.error('submitBridgeReview error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  AGE_BANDS,
  TERM_NAMES,
  EVIDENCE_ROUTES,
  FOLLOW_UP_TYPES,
  validateGamePlan,
  validateBridge,
  listOutcomes,
  listBridges,
  createBridge,
  getBridge,
  updateBridge,
  submitBridgeReview,
};
