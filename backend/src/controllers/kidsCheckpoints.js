'use strict';

/**
 * Jump-ahead checkpoints — "I already know this, let me start higher".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT DOES
 *
 * The learning path locks every later unit behind the cumulative E3f chain (a
 * unit counts as done only when every lesson in it has a passing Test). That is
 * right for most children and punishing for an advanced one, who otherwise has
 * to grind through content they already know.
 *
 * A checkpoint covers EVERY unfinished unit the subject still has up to the
 * child's age-band ceiling — one assessment, not one per unit — and on approval
 * marks those units exempt so the chain unlocks in a single step. The assessment
 * is built from those units' own published games (services/checkpointAssessment
 * takes one question per lesson, at least one per unit), so it tests exactly the
 * prerequisite the lock demands.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHO CONFIRMS (the rule, and its one exception)
 *
 * RULE — a child cannot be the judge of their own prerequisite, so a pass is
 * only a RECOMMENDATION and a teacher/admin confirms it (…/approve). A pass is
 * required to approve: the endpoint refuses to unlock on a below-threshold score
 * or on a unit the child never answered correctly.
 *
 * EXCEPTION — the flagship/showcase tenants are self-paced by design (children
 * join through a parent, no active teacher), so there is nobody to confirm. In
 * those schools a passing checkpoint confirms itself, recorded with
 * decided_by='self:flagship-self-paced' and self_approved=1 so the audit trail
 * never reads as a human approval that did not happen.
 *
 * The privilege belongs to the SCHOOL, never to the game. The same lesson and the
 * same game config are played by a normal school and a flagship alike, so the
 * assessment — questions, threshold, per-unit coverage, exemption semantics — is
 * byte-for-byte the same for both; only the confirmer changes. Nothing about the
 * content (its author, its school, its category) can grant the exception, and an
 * unresolvable school fails closed to human confirmation. Membership is an
 * explicit allow-list (services/selfPacedSchools.js), never inferred from a role.
 * Because no human throttles attempts in a self-paced school, that path also
 * auto-closes a failed attempt and enforces the re-attempt cool-down.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT NEVER DOES
 *
 *  - It never records mastery. Approval writes kid_progress rows with
 *    mode='checkpoint' (0 stars, 0 xp), which the done rule accepts explicitly
 *    and the mastery rule ('test' && score>=50) deliberately does not — so an
 *    exemption satisfies the lock while staying visible as "tested out".
 *  - It never exposes an answer key: `questions` holds correctId server-side and
 *    every response goes through publicExam(), which strips it.
 *  - It never grades from client data: grading always re-reads the issued set.
 *  - It never sees content above the child's band: the chain comes from the same
 *    computeLearningPath() the student path renders.
 *
 * Endpoints:
 *   GET  /kids/checkpoint?student_id&series_id   — issue (or resume) an attempt
 *   POST /kids/checkpoint/:id/submit             — the child answers
 *   GET  /kids/checkpoint/status?student_id      — latest attempt per subject
 *   GET  /kids/checkpoint/queue                  — staff: awaiting confirmation
 *   POST /kids/checkpoint/:id/approve            — admin: confirm the unlock
 *   POST /kids/checkpoint/:id/reject             — admin: decline, with a note
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');
const { isAdminRole } = require('../config/config');
const { admissionAllowed } = require('./kidsGoals');
const { computeLearningPath } = require('./kidsSeries');
const { toRuntimeGameConfig } = require('./kids');
const {
  SCOPE,
  policyRowId,
  policyFor,
  autoDecisionLabels,
} = require('../services/checkpointPolicy');
const {
  CHECKPOINT_PASS_PCT,
  CHECKPOINT_RETRY_COOLDOWN_MS,
  maxQuestionsForBand,
  sampleCheckpoint,
  gradeCheckpoint,
  checkpointVerdict,
} = require('../services/checkpointAssessment');

const STATUS = Object.freeze({
  ISSUED: 'issued',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

/**
 * Who may confirm a jump-ahead is a POLICY, resolved child → class → school →
 * platform default (services/checkpointPolicy.js).
 *
 * The assessment itself is not school-specific: the same lesson, the same games,
 * the same threshold and the same per-unit coverage rule apply to every school
 * (content lives once, in kids_lessons / kids_game_configs, and is played
 * identically). Only the confirmer changes — never the content, never the game,
 * never its author. An unresolvable school is not self-paced, so it fails CLOSED
 * to human confirmation rather than silently granting an unattended unlock.
 */
function requiresConfirmation(policy) {
  return !(policy && policy.auto_approve);
}

/**
 * Labels for a declined self-closing attempt. An auto policy that missed means
 * the same thing as a flagship miss: the child keeps practising and the
 * cool-down runs, because nobody is manually throttling attempts.
 */
function autoRejectNote(policy) {
  return policy && policy.source === 'platform_self_paced'
    ? 'Self-paced flagship exception: assessment not passed — the cool-down applies before another attempt.'
    : `Auto-confirmed ${policy ? policy.source : 'policy'} jump-ahead: assessment not passed — the cool-down applies before another attempt.`;
}

// ── Small helpers ───────────────────────────────────────────────────────────

const text = (value) => String(value == null ? '' : value).trim();

function roleOf(user) {
  return text(user && (user.user_type || user.role)).toLowerCase();
}

function isStaff(user) {
  const role = roleOf(user);
  return (
    role.includes('admin') ||
    role.includes('branchadmin') ||
    role.includes('superadmin') ||
    role.includes('teacher') ||
    role.includes('developer')
  );
}

/** The child themself (not a parent, not staff) — the only party who may sit it. */
function isSelf(user, admission) {
  return !isStaff(user) && text(user && (user.admission_no || user.id)) === text(admission);
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

/** An answer key must never leave the server. */
function stripAnswerKey(question) {
  const { correctId, ...rest } = question || {};
  return rest;
}

function examStatusPayload(exam) {
  const questions = parseJson(exam.questions) || [];
  return {
    id: exam.id,
    series_id: exam.series_id,
    band: exam.band,
    // The school the attempt belongs to — the party whose privilege decided who
    // confirmed it (not the content's author and not the game's owner).
    school_id: exam.school_id || null,
    status: exam.status,
    score_pct: exam.score_pct,
    threshold_pct: CHECKPOINT_PASS_PCT,
    self_approved: !!exam.self_approved,
    decided_by: exam.decided_by || null,
    decided_at: exam.decided_at || null,
    decision_note: exam.decision_note || null,
    submitted_at: exam.submitted_at || null,
    asked_count: questions.length,
    unit_ids: Array.isArray(exam.unit_ids) ? exam.unit_ids : [],
  };
}

function examPublic(exam) {
  const questions = parseJson(exam.questions) || [];
  return { ...examStatusPayload(exam), questions: questions.map(stripAnswerKey) };
}

/** A missing table is a rollout state, not a server fault — say so plainly. */
function fail(res, err, label) {
  if (err && (err.name === 'SequelizeDatabaseError' || /doesn't exist|Unknown table/i.test(String(err.message)))) {
    console.error(`${label} schema error:`, err.message);
    return res.status(503).json({
      success: false,
      code: 'schema_missing',
      message: 'Checkpoint storage is not provisioned — run database/kids-checkpoint-exams-migration.js --apply.',
    });
  }
  console.error(`${label} error:`, err.message);
  return res.status(500).json({ success: false, message: 'Server error.' });
}

function sendError(res, ctx) {
  return res.status(ctx.status).json({
    success: false,
    code: ctx.code,
    message: ctx.message,
    ...(ctx.data ? { data: ctx.data } : {}),
  });
}

// ── Chain + question set ────────────────────────────────────────────────────

/**
 * What a stored attempt covers, resolved from its own unit_ids.
 *
 * Shared by the issue, resume and status responses so a learner resuming an
 * attempt sees exactly what a fresh one would show.
 */
async function unitSummariesFor(unitIds) {
  const ids = (Array.isArray(unitIds) ? unitIds : []).map(String).filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.KidGameUnit.findAll({ where: { id: { [Op.in]: ids } } });
  const byId = new Map(rows.map((unit) => [String(unit.id), unit]));
  return ids.map((unitId) => {
    const unit = byId.get(unitId);
    return {
      unit_id: unitId,
      unit_number: unit ? unit.unit_number : null,
      title: unit ? unit.title || null : null,
    };
  });
}

/** Best config per lesson, preferring a published one. One query, no N+1. */
async function loadConfigsByLesson(lessonIds) {
  if (!lessonIds.length) return new Map();
  const rows = await db.KidGameConfig.findAll({ where: { lesson_id: { [Op.in]: lessonIds } } });
  const best = new Map();
  for (const row of rows) {
    const key = String(row.lesson_id);
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }
    if (row.content_state === 'published' && current.content_state !== 'published') best.set(key, row);
  }
  return best;
}

/**
 * Everything the assessment needs: the child's band, the subject, the ordered
 * chain of unfinished units, and the sampled question set.
 */
async function buildCheckpointContext(studentId, seriesId) {
  const { band, child, path } = await computeLearningPath(studentId);
  if (!band) {
    return {
      ok: false,
      status: 400,
      code: 'band_unresolved',
      message: "Could not resolve the child's age band (class/age_level missing).",
    };
  }

  const series = (path || []).find((entry) => String(entry.series_id) === String(seriesId));
  if (!series) {
    return {
      ok: false,
      status: 404,
      code: 'series_not_visible',
      message: 'That subject has no levels this child can see yet.',
    };
  }

  const unfinished = (series.units || []).filter((unit) => !unit.done);
  if (!unfinished.length) {
    return {
      ok: false,
      status: 409,
      code: 'nothing_to_test_out',
      message: 'Nothing left to test out of — every level visible to this child is already done.',
    };
  }

  const lessonIds = [...new Set(
    unfinished.flatMap((unit) => (unit.lessons || []).map((lesson) => String(lesson.lesson_id)))
  )];
  const configs = await loadConfigsByLesson(lessonIds);

  const chain = unfinished.map((unit) => ({
    unit_id: String(unit.unit_id),
    unit_number: unit.unit_number,
    title: unit.title || null,
    lessons: (unit.lessons || []).map((lesson) => {
      const row = configs.get(String(lesson.lesson_id));
      const raw = row ? parseJson(row.config_json) : null;
      return {
        id: String(lesson.lesson_id),
        title: lesson.title || null,
        config: raw ? toRuntimeGameConfig(raw) : null,
      };
    }),
  }));

  return {
    ok: true,
    band,
    child,
    series,
    chain,
    sample: sampleCheckpoint(chain, { maxQuestions: maxQuestionsForBand(band) }),
    school_id: text(child && child.school_id),
  };
}

// ── GET /kids/checkpoint ────────────────────────────────────────────────────

async function issueCheckpoint(req, res) {
  try {
    const studentId = text(req.query.student_id || req.body?.student_id);
    const seriesId = text(req.query.series_id || req.body?.series_id);
    if (!studentId) return res.status(400).json({ success: false, message: 'student_id is required.' });
    if (!seriesId) return res.status(400).json({ success: false, message: 'series_id is required.' });
    if (!(await admissionAllowed(req, studentId))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }

    // Resume rather than duplicate: one open attempt per child per subject.
    const open = await db.KidCheckpointExam.findOne({
      where: {
        child_admission_no: studentId,
        series_id: seriesId,
        status: { [Op.in]: [STATUS.ISSUED, STATUS.SUBMITTED] },
      },
      order: [['createdAt', 'DESC']],
    });
    if (open) {
      const policy = await policyFor(db, { admissionNo: studentId, schoolId: open.school_id });
      const needsHuman = requiresConfirmation(policy);
      const units = await unitSummariesFor(open.unit_ids);
      if (open.status === STATUS.ISSUED) {
        return res.json({
          success: true,
          data: { ...examPublic(open), units, resumed: true, requires_confirmation: needsHuman, policy },
        });
      }
      return res.json({
        success: true,
        data: { ...examStatusPayload(open), units, resumed: true, awaiting_review: needsHuman, requires_confirmation: needsHuman, policy },
      });
    }

    // Cool-down after a decline — the throttle the self-paced path has no human
    // for, and a fair study window for the teacher-confirmed path.
    const declined = await db.KidCheckpointExam.findOne({
      where: { child_admission_no: studentId, series_id: seriesId, status: STATUS.REJECTED },
      order: [['decided_at', 'DESC']],
    });
    if (declined && declined.decided_at) {
      const retryAt = new Date(new Date(declined.decided_at).getTime() + CHECKPOINT_RETRY_COOLDOWN_MS);
      if (retryAt.getTime() > Date.now()) {
        return res.status(429).json({
          success: false,
          code: 'retry_cooldown',
          message: 'Another attempt is available after the cool-down — keep practising this subject first.',
          data: { retry_after: retryAt.toISOString(), score_pct: declined.score_pct, decision_note: declined.decision_note || null },
        });
      }
    }

    const ctx = await buildCheckpointContext(studentId, seriesId);
    if (!ctx.ok) return sendError(res, ctx);

    if (!ctx.sample.ok) {
      // Either the chain is longer than one assessment can probe, or a unit has
      // no answerable content. Refusing beats unlocking a foundation we never
      // asked about.
      const message = ctx.sample.reason === 'chain_too_long'
        ? 'This subject has more unfinished levels than one assessment can cover. Ask a teacher to review them.'
        : 'One of these levels has no question we can ask yet, so it cannot be tested out.';
      return sendError(res, {
        status: 409,
        code: ctx.sample.reason,
        message,
        data: { units: ctx.sample.units || null },
      });
    }

    const schoolId = ctx.school_id || text(req.user && req.user.school_id);
    const policy = await policyFor(db, {
      admissionNo: studentId,
      schoolId,
      classCode: ctx.child && ctx.child.class_code,
    });
    const exam = await db.KidCheckpointExam.create({
      id: `chk-${uuidv4()}`.slice(0, 50),
      school_id: schoolId,
      branch_id: text(ctx.child && ctx.child.branch_id) || text(req.user && req.user.branch_id) || null,
      child_admission_no: studentId,
      series_id: seriesId,
      band: ctx.band,
      unit_ids: ctx.chain.map((unit) => unit.unit_id),
      questions: ctx.sample.questions,
      status: STATUS.ISSUED,
      requested_by: text(req.user && (req.user.id || req.user.user_id)) || null,
    });

    return res.json({
      success: true,
      data: {
        ...examPublic(exam),
        // Resolved from the CHILD (school → class → child, falling back to the
        // caller's session), never from the content: the same games are played by
        // every school, and staff can steer this per class or per child.
        requires_confirmation: requiresConfirmation(policy),
        policy,
        thin: ctx.sample.thin,
        max_questions: ctx.sample.max_questions,
        units: await unitSummariesFor(exam.unit_ids),
      },
    });
  } catch (err) {
    return fail(res, err, 'issueCheckpoint');
  }
}

// ── POST /kids/checkpoint/:id/submit ────────────────────────────────────────

/** Write the exempt rows + close the exam. Idempotent per exam. */
async function applyExemption(exam, { decidedBy, selfApproved, note }) {
  const unitIds = Array.isArray(exam.unit_ids) ? exam.unit_ids.map(String) : [];
  const units = unitIds.length
    ? await db.KidGameUnit.findAll({ where: { id: { [Op.in]: unitIds } } })
    : [];

  const lessons = [];
  for (const unit of units) {
    const items = Array.isArray(unit.content_items) ? unit.content_items : [];
    for (const item of items) {
      const lessonId = item && (item.lesson_id || item.item_id || item.id);
      if (lessonId) lessons.push(String(lessonId));
    }
  }

  // MySQL treats NULL as distinct in a unique index, and these rows have no
  // game_config_id — so de-duplicate explicitly instead of relying on the key.
  const existing = await db.KidProgress.findAll({
    where: {
      child_admission_no: exam.child_admission_no,
      mode: 'checkpoint',
      idempotency_key: { [Op.like]: `cp:${exam.id}:%` },
    },
    attributes: ['idempotency_key'],
  });
  const have = new Set(existing.map((row) => String(row.idempotency_key)));

  const pending = [...new Set(lessons)].filter((lessonId) => !have.has(`cp:${exam.id}:${lessonId}`));
  if (pending.length) {
    await db.KidProgress.bulkCreate(
      pending.map((lessonId) => ({
        id: `cp-${uuidv4()}`.slice(0, 50),
        school_id: exam.school_id,
        branch_id: exam.branch_id || '',
        child_admission_no: exam.child_admission_no,
        lesson_id: lessonId,
        game_config_id: null,
        score: Number(exam.score_pct) || 0,
        // A skipped game has not been played: no stars, no XP, no mastery.
        stars_earned: 0,
        xp: 0,
        completed_at: new Date(),
        idempotency_key: `cp:${exam.id}:${lessonId}`.slice(0, 100),
        mode: 'checkpoint',
      }))
    );
  }

  const decidedAt = new Date();
  await exam.update({
    status: STATUS.APPROVED,
    decided_by: decidedBy,
    decided_at: decidedAt,
    decision_note: note,
    self_approved: !!selfApproved,
  });

  return { unit_ids: unitIds, lessons_exempted: [...new Set(lessons)].length, decided_at: decidedAt };
}

async function submitCheckpoint(req, res) {
  try {
    const exam = await db.KidCheckpointExam.findByPk(text(req.params.id));
    if (!exam) return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    if (!isSelf(req.user, exam.child_admission_no)) {
      return res.status(403).json({ success: false, message: 'Only the child can sit their own checkpoint.' });
    }
    if (exam.status !== STATUS.ISSUED) {
      return res.status(409).json({
        success: false,
        code: 'exam_not_open',
        message: `This checkpoint is ${exam.status}.`,
      });
    }

    const questions = parseJson(exam.questions) || [];
    const answers = req.body?.answers;
    const grade = gradeCheckpoint(questions, answers);
    const verdict = checkpointVerdict(grade);
    // Identical grading for every school, class and child; only the confirmer
    // differs, and that is re-resolved HERE — the decision to unlock without a
    // person must reflect the policy at decision time, not at issue time.
    const policy = await policyFor(db, { admissionNo: exam.child_admission_no, schoolId: exam.school_id });
    const autoConfirm = requiresConfirmation(policy) === false;

    await exam.update({
      answers: answers && typeof answers === 'object' ? answers : {},
      score_pct: grade.score_pct,
      per_unit: grade.per_unit,
      submitted_at: new Date(),
      status: STATUS.SUBMITTED,
    });

    if (!autoConfirm) {
      return res.json({
        success: true,
        data: {
          ...examStatusPayload(exam),
          eligible: verdict.eligible,
          reason: verdict.reason,
          requires_confirmation: true,
          awaiting_review: true,
          policy,
          per_unit: grade.per_unit,
        },
      });
    }

    // Auto-confirm policy (platform self-paced default, or a school/class/child
    // policy a member of staff set): the verdict closes the attempt here — and a
    // miss is closed as a decline so the cool-down runs, since nobody is
    // manually throttling attempts.
    const labels = autoDecisionLabels(policy);
    if (verdict.eligible) {
      const applied = await applyExemption(exam, {
        decidedBy: labels.decided_by,
        selfApproved: true,
        note: labels.note,
      });
      return res.json({
        success: true,
        data: {
          ...examStatusPayload(exam),
          eligible: true,
          reason: null,
          self_approved: true,
          requires_confirmation: false,
          awaiting_review: false,
          policy,
          exempt_units: applied.unit_ids,
          lessons_exempted: applied.lessons_exempted,
          stars_awarded: 0,
          xp_awarded: 0,
          per_unit: grade.per_unit,
        },
      });
    }

    const declinedAt = new Date();
    await exam.update({
      status: STATUS.REJECTED,
      decided_by: labels.decided_by,
      decided_at: declinedAt,
      decision_note: autoRejectNote(policy),
    });
    return res.json({
      success: true,
      data: {
        ...examStatusPayload(exam),
        eligible: false,
        reason: verdict.reason,
        self_approved: false,
        requires_confirmation: false,
        awaiting_review: false,
        policy,
        retry_after: new Date(declinedAt.getTime() + CHECKPOINT_RETRY_COOLDOWN_MS).toISOString(),
        per_unit: grade.per_unit,
      },
    });
  } catch (err) {
    return fail(res, err, 'submitCheckpoint');
  }
}

// ── GET /kids/checkpoint/status ─────────────────────────────────────────────

async function getCheckpointStatus(req, res) {
  try {
    const studentId = text(req.query.student_id || req.body?.student_id);
    if (!studentId) return res.status(400).json({ success: false, message: 'student_id is required.' });
    if (!(await admissionAllowed(req, studentId))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }

    const rows = await db.KidCheckpointExam.findAll({
      where: { child_admission_no: studentId },
      order: [['createdAt', 'DESC']],
    });

    const unitIds = [...new Set(rows.flatMap((row) => (Array.isArray(row.unit_ids) ? row.unit_ids : []).map(String)))];
    const units = unitIds.length ? await db.KidGameUnit.findAll({ where: { id: { [Op.in]: unitIds } } }) : [];
    const unitById = new Map(units.map((unit) => [String(unit.id), unit]));

    // Latest attempt per subject — what the UI needs to label each locked chain.
    const latest = new Map();
    for (const row of rows) {
      const key = String(row.series_id);
      if (latest.has(key)) continue;
      latest.set(key, {
        ...examStatusPayload(row),
        units: (Array.isArray(row.unit_ids) ? row.unit_ids : []).map((unitId) => {
          const unit = unitById.get(String(unitId));
          return {
            unit_id: String(unitId),
            unit_number: unit ? unit.unit_number : null,
            title: unit ? unit.title || null : null,
          };
        }),
        // An open attempt is resumable; a submitted one is waiting on a person;
        // a declined one reports when it can be retried.
        can_retry_at: row.status === STATUS.REJECTED && row.decided_at
          ? new Date(new Date(row.decided_at).getTime() + CHECKPOINT_RETRY_COOLDOWN_MS).toISOString()
          : null,
      });
    }

    return res.json({
      success: true,
      data: {
        threshold_pct: CHECKPOINT_PASS_PCT,
        exams: [...latest.values()],
      },
    });
  } catch (err) {
    return fail(res, err, 'getCheckpointStatus');
  }
}

// ── GET /kids/checkpoint/queue (staff) ──────────────────────────────────────

async function listCheckpointQueue(req, res) {
  try {
    const where = { status: STATUS.SUBMITTED };
    const schoolId = text(req.user && req.user.school_id);
    // A branch/school admin reviews their own school; a superadmin sees all.
    if (schoolId && !roleOf(req.user).includes('superadmin')) where.school_id = schoolId;

    const rows = await db.KidCheckpointExam.findAll({ where, order: [['submitted_at', 'ASC']], limit: 100 });

    const unitIds = [...new Set(rows.flatMap((row) => (Array.isArray(row.unit_ids) ? row.unit_ids : []).map(String)))];
    const units = unitIds.length ? await db.KidGameUnit.findAll({ where: { id: { [Op.in]: unitIds } } }) : [];
    const unitById = new Map(units.map((unit) => [String(unit.id), unit]));

    const items = rows.map((row) => {
      const questions = parseJson(row.questions) || [];
      const grade = gradeCheckpoint(questions, parseJson(row.answers));
      return {
        ...examStatusPayload(row),
        child_admission_no: row.child_admission_no,
        eligible: checkpointVerdict(grade).eligible,
        reason: checkpointVerdict(grade).reason,
        thin: questions.length < 5,
        per_unit: grade.per_unit,
        units: (Array.isArray(row.unit_ids) ? row.unit_ids : []).map((unitId) => {
          const unit = unitById.get(String(unitId));
          return {
            unit_id: String(unitId),
            unit_number: unit ? unit.unit_number : null,
            title: unit ? unit.title || null : null,
          };
        }),
      };
    });

    return res.json({ success: true, data: { threshold_pct: CHECKPOINT_PASS_PCT, pending: items.length, items } });
  } catch (err) {
    return fail(res, err, 'listCheckpointQueue');
  }
}

// ── Policy: who may confirm a jump-ahead ────────────────────────────────────

/**
 * GET /kids/checkpoint/policy?student_id=X (staff)
 *
 * The effective rule for one child plus every override in play, so a teacher can
 * see WHY it resolved that way and what to change. `effective.source` is one of
 * child | class | school | platform_self_paced | platform_default.
 */
async function getCheckpointPolicy(req, res) {
  try {
    const studentId = text(req.query.student_id || req.body?.student_id);
    if (!studentId) return res.status(400).json({ success: false, message: 'student_id is required.' });
    if (!(await admissionAllowed(req, studentId))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }

    const policy = await policyFor(db, { admissionNo: studentId });
    const overrides = {};
    for (const row of policy.rows || []) {
      overrides[row.scope] = {
        scope: row.scope,
        scope_id: row.scope_id,
        auto_approve: !!row.auto_approve,
        set_by: row.set_by || null,
        note: row.note || null,
        updated_at: row.updatedAt || null,
      };
    }

    return res.json({
      success: true,
      data: {
        student_id: studentId,
        school_id: policy.school_id,
        class_code: policy.class_code,
        effective: {
          auto_approve: policy.auto_approve,
          source: policy.source,
          scope_id: policy.scope_id,
          note: policy.note,
          set_by: policy.set_by,
        },
        overrides,
      },
    });
  } catch (err) {
    return fail(res, err, 'getCheckpointPolicy');
  }
}

/** GET /kids/checkpoint/policy/list (staff) — every override in this school. */
async function listCheckpointPolicies(req, res) {
  try {
    const schoolId = text(req.user && req.user.school_id);
    const where = {};
    if (schoolId && !roleOf(req.user).includes('superadmin')) where.school_id = schoolId;
    const rows = await db.KidCheckpointPolicy.findAll({ where, order: [['scope', 'ASC'], ['scope_id', 'ASC']], limit: 200 });
    return res.json({
      success: true,
      data: rows.map((row) => ({
        scope: row.scope,
        scope_id: row.scope_id,
        school_id: row.school_id,
        auto_approve: !!row.auto_approve,
        set_by: row.set_by || null,
        note: row.note || null,
        updated_at: row.updatedAt || null,
      })),
    });
  } catch (err) {
    return fail(res, err, 'listCheckpointPolicies');
  }
}

/**
 * PUT /kids/checkpoint/policy (admin)
 * body { scope: 'school'|'class'|'child', scope_id, auto_approve, note? }
 *
 * `auto_approve: true` hands that scope an unattended unlock, so the narrowest
 * scope that does the job is the right one — a class or a single child beats the
 * whole school, and the response says which scopes remain stricter than it.
 */
async function setCheckpointPolicy(req, res) {
  try {
    if (!isAdminRole(roleOf(req.user))) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }

    const scope = text(req.body?.scope).toLowerCase();
    if (!Object.values(SCOPE).includes(scope)) {
      return res.status(400).json({ success: false, message: `scope must be one of: ${Object.values(SCOPE).join(', ')}.` });
    }
    const schoolId = text(req.user && req.user.school_id);
    const scopeId = text(req.body?.scope_id) || (scope === SCOPE.SCHOOL ? schoolId : '');
    if (!scopeId) {
      return res.status(400).json({ success: false, message: 'scope_id is required (a class code, an admission number, or the school id).' });
    }
    if (typeof req.body?.auto_approve !== 'boolean') {
      return res.status(400).json({ success: false, message: 'auto_approve must be true or false.' });
    }

    // A tenant may only set policy for its own learners: a child/class scope must
    // belong to the caller's school.
    if (scope !== SCOPE.SCHOOL && schoolId && !roleOf(req.user).includes('superadmin')) {
      const child =
        scope === SCOPE.CHILD
          ? await db.KidChild.findOne({ where: { admission_no: scopeId }, attributes: ['school_id'] })
          : null;
      if (child && child.school_id && String(child.school_id) !== schoolId) {
        return res.status(403).json({ success: false, message: 'That learner belongs to another school.' });
      }
    }

    const id = policyRowId(scope, scopeId);
    const existing = await db.KidCheckpointPolicy.findByPk(id);
    const row = existing
      ? await existing.update({
          auto_approve: req.body.auto_approve,
          note: text(req.body?.note) || null,
          set_by: text(req.user && (req.user.id || req.user.user_id)) || 'admin',
        })
      : await db.KidCheckpointPolicy.create({
          id,
          scope,
          scope_id: scopeId,
          school_id: scope === SCOPE.SCHOOL ? scopeId : schoolId,
          auto_approve: req.body.auto_approve,
          note: text(req.body?.note) || null,
          set_by: text(req.user && (req.user.id || req.user.user_id)) || 'admin',
        });

    return res.json({
      success: true,
      data: {
        scope: row.scope,
        scope_id: row.scope_id,
        auto_approve: !!row.auto_approve,
        set_by: row.set_by || null,
        note: row.note || null,
        created: !existing,
      },
    });
  } catch (err) {
    return fail(res, err, 'setCheckpointPolicy');
  }
}

/** DELETE /kids/checkpoint/policy?scope=child&scope_id=NUR-001 (admin) — revert. */
async function clearCheckpointPolicy(req, res) {
  try {
    if (!isAdminRole(roleOf(req.user))) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const scope = text(req.query.scope || req.body?.scope).toLowerCase();
    const scopeId = text(req.query.scope_id || req.body?.scope_id);
    if (!Object.values(SCOPE).includes(scope) || !scopeId) {
      return res.status(400).json({ success: false, message: 'scope and scope_id are required.' });
    }
    const removed = await db.KidCheckpointPolicy.destroy({ where: { id: policyRowId(scope, scopeId) } });
    return res.json({ success: true, data: { removed: removed > 0, scope, scope_id: scopeId } });
  } catch (err) {
    return fail(res, err, 'clearCheckpointPolicy');
  }
}

// ── POST /kids/checkpoint/:id/approve | /reject (admin) ─────────────────────

async function approveCheckpoint(req, res) {
  try {
    if (!isAdminRole(roleOf(req.user))) {
      return res.status(403).json({ success: false, message: 'Admin review access required.' });
    }

    const exam = await db.KidCheckpointExam.findByPk(text(req.params.id));
    if (!exam) return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    if (exam.status !== STATUS.SUBMITTED) {
      return res.status(409).json({
        success: false,
        code: 'exam_status_conflict',
        message: `Only a submitted checkpoint can be confirmed (this one is ${exam.status}).`,
      });
    }

    // A band change since the assessment would unlock a different (wider) chain
    // than the one that was actually assessed.
    const { band } = await computeLearningPath(exam.child_admission_no);
    if (band && exam.band && String(band) !== String(exam.band)) {
      return res.status(409).json({
        success: false,
        code: 'band_changed',
        message: "The child's band changed since this assessment — issue a fresh checkpoint.",
        data: { assessed_band: exam.band, current_band: band },
      });
    }

    const questions = parseJson(exam.questions) || [];
    const grade = gradeCheckpoint(questions, parseJson(exam.answers));
    const verdict = checkpointVerdict(grade);
    if (!verdict.eligible) {
      return res.status(409).json({
        success: false,
        code: 'not_eligible',
        message: verdict.reason === 'score_below_threshold'
          ? `Score ${grade.score_pct}% is below the ${CHECKPOINT_PASS_PCT}% threshold.`
          : 'The assessment did not demonstrate every level it would unlock — decline it so the child keeps practising.',
        data: { score_pct: grade.score_pct, threshold_pct: CHECKPOINT_PASS_PCT, per_unit: grade.per_unit },
      });
    }

    const applied = await applyExemption(exam, {
      decidedBy: text(req.user && (req.user.id || req.user.user_id)) || 'admin',
      selfApproved: false,
      note: text(req.body?.note) || null,
    });

    return res.json({
      success: true,
      data: {
        ...examStatusPayload(exam),
        eligible: true,
        exempt_units: applied.unit_ids,
        lessons_exempted: applied.lessons_exempted,
        stars_awarded: 0,
        xp_awarded: 0,
      },
    });
  } catch (err) {
    return fail(res, err, 'approveCheckpoint');
  }
}

async function rejectCheckpoint(req, res) {
  try {
    if (!isAdminRole(roleOf(req.user))) {
      return res.status(403).json({ success: false, message: 'Admin review access required.' });
    }

    const exam = await db.KidCheckpointExam.findByPk(text(req.params.id));
    if (!exam) return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    if (exam.status !== STATUS.SUBMITTED) {
      return res.status(409).json({
        success: false,
        code: 'exam_status_conflict',
        message: `Only a submitted checkpoint can be declined (this one is ${exam.status}).`,
      });
    }

    const decidedAt = new Date();
    await exam.update({
      status: STATUS.REJECTED,
      decided_by: text(req.user && (req.user.id || req.user.user_id)) || 'admin',
      decided_at: decidedAt,
      decision_note: text(req.body?.note) || null,
    });

    return res.json({
      success: true,
      data: {
        ...examStatusPayload(exam),
        retry_after: new Date(decidedAt.getTime() + CHECKPOINT_RETRY_COOLDOWN_MS).toISOString(),
      },
    });
  } catch (err) {
    return fail(res, err, 'rejectCheckpoint');
  }
}

module.exports = {
  CHECKPOINT_STATUS: STATUS,
  issueCheckpoint,
  submitCheckpoint,
  getCheckpointStatus,
  listCheckpointQueue,
  getCheckpointPolicy,
  listCheckpointPolicies,
  setCheckpointPolicy,
  clearCheckpointPolicy,
  approveCheckpoint,
  rejectCheckpoint,
  // exported for tests
  buildCheckpointContext,
  applyExemption,
};
