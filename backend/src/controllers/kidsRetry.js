/**
 * Retry / Adaptive Difficulty controller — Doc 16: Gamification Depth.
 *
 * Logic:
 *   - First Test failure → route to Practice (neutral framing)
 *   - After 2 Practice passes → offer Test again
 *   - 3+ failures → flag to teacher (non-alarming)
 *   - Never block moving to different item/category
 *
 * Endpoints:
 *   POST /kids/retry/test-complete    — record a Test attempt, returns routing decision
 *   GET  /kids/retry/status           — get retry status for a student+item
 *   GET  /kids/retry/teacher-flags    — list students flagged for teacher review
 */
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');

/** Number of practice passes needed before re-test is offered. */
const PRACTICE_PASSES_BEFORE_RETEST = 2;

/** Number of failures before teacher flag. */
const FAILURES_BEFORE_TEACHER_FLAG = 3;

/**
 * POST /kids/retry/test-complete — record a Test attempt.
 *
 * Body:
 *   student_id, item_id, tier, result ('pass'|'fail'), distractor_count, response_time_ms
 *
 * Returns:
 *   { routing: 'mastered'|'retry'|'practice'|'teacher_flag', attempt_number, message }
 */
async function recordTestComplete(req, res) {
  try {
    const { student_id, item_id, tier, result, distractor_count, response_time_ms } = req.body || {};
    if (!student_id || !item_id || tier === undefined || !result) {
      return res.status(400).json({
        success: false,
        message: 'student_id, item_id, tier, and result are required.',
      });
    }
    if (!['pass', 'fail'].includes(result)) {
      return res.status(400).json({ success: false, message: "result must be 'pass' or 'fail'." });
    }

    // Count existing attempts for this student+item
    const attemptCount = await db.KidTestAttempt.count({
      where: { student_id, item_id },
    });
    const attemptNumber = attemptCount + 1;

    // Determine routing
    let routedTo;
    let message;
    if (result === 'pass') {
      routedTo = 'retest';
      message = 'Great job! You mastered this item.';
    } else {
      // fail
      if (attemptNumber >= FAILURES_BEFORE_TEACHER_FLAG) {
        routedTo = 'teacher_flag';
        message = 'Your teacher will help you with this one. Let\'s try something else for now!';
      } else {
        routedTo = 'practice';
        message = 'Let\'s practice this a bit more — you\'re getting there!';
      }
    }

    // Record the attempt
    const attempt = await db.KidTestAttempt.create({
      id: uuidv4(),
      student_id,
      item_id,
      tier,
      result,
      attempt_number: attemptNumber,
      routed_to: routedTo,
    });

    // Also record the item response for pattern tracking
    await db.KidGameItemResponse.create({
      student_id,
      item_id,
      tier,
      distractor_count: distractor_count || 0,
      response_time_ms: response_time_ms || 0,
      mode: 'test',
      correct: result === 'pass',
    }).catch((e) => console.error('⚠️ Pattern tracking write failed:', e.message));

    return res.status(201).json({
      success: true,
      data: {
        attempt,
        routing: routedTo,
        attempt_number: attemptNumber,
        message,
        can_retake: result === 'fail' && attemptNumber < FAILURES_BEFORE_TEACHER_FLAG,
      },
    });
  } catch (err) {
    console.error('recordTestComplete error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/retry/status?student_id=X&item_id=Y
 * Returns the retry status for a student+item combination.
 *
 * Response:
 *   { attempts, passes, failures, can_retake, needs_practice, practice_passes_remaining, teacher_flagged }
 */
async function getRetryStatus(req, res) {
  try {
    const { student_id, item_id } = req.query;
    if (!student_id || !item_id) {
      return res.status(400).json({ success: false, message: 'student_id and item_id are required.' });
    }

    const attempts = await db.KidTestAttempt.findAll({
      where: { student_id, item_id },
      order: [['attempt_number', 'ASC']],
    });

    const passes = attempts.filter((a) => a.result === 'pass').length;
    const failures = attempts.filter((a) => a.result === 'fail').length;
    const teacherFlagged = failures >= FAILURES_BEFORE_TEACHER_FLAG;

    // Check practice passes for re-test eligibility
    let practicePassesRemaining = 0;
    let needsPractice = false;
    if (failures > 0 && passes === 0) {
      // Student has failed but never passed — check if they've done enough practice
      const practiceResponses = await db.KidGameItemResponse.findAll({
        where: { student_id, item_id, mode: 'practice', correct: true },
      });
      const practicePasses = practiceResponses.length;
      practicePassesRemaining = Math.max(0, PRACTICE_PASSES_BEFORE_RETEST - practicePasses);
      needsPractice = practicePassesRemaining > 0;
    }

    return res.json({
      success: true,
      data: {
        attempts: attempts.length,
        passes,
        failures,
        can_retake: !teacherFlagged && (!needsPractice || practicePassesRemaining === 0),
        needs_practice: needsPractice,
        practice_passes_remaining: practicePassesRemaining,
        teacher_flagged: teacherFlagged,
      },
    });
  } catch (err) {
    console.error('getRetryStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/retry/teacher-flags?school_id=X
 * List students flagged for teacher review (3+ failures on any item).
 */
async function getTeacherFlags(req, res) {
  try {
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    if (!school_id) {
      return res.status(400).json({ success: false, message: 'school_id is required.' });
    }

    // Find items with 3+ failures
    const flagged = await db.KidTestAttempt.findAll({
      attributes: ['student_id', 'item_id', 'tier',
        [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'total_attempts'],
        [db.Sequelize.fn('SUM', db.Sequelize.literal("CASE WHEN result='fail' THEN 1 ELSE 0 END")), 'fail_count'],
      ],
      group: ['student_id', 'item_id', 'tier'],
      having: db.Sequelize.literal("SUM(CASE WHEN result='fail' THEN 1 ELSE 0 END) >= 3"),
      raw: true,
    });

    // Enrich with student names
    const studentIds = [...new Set(flagged.map((f) => f.student_id))];
    const students = studentIds.length
      ? await db.KidChild.findAll({
          where: { admission_no: { [Op.in]: studentIds }, school_id },
          attributes: ['admission_no', 'full_name', 'class_code'],
        })
      : [];
    const studentMap = new Map(students.map((s) => [s.admission_no, s.toJSON()]));

    const enriched = flagged
      .filter((f) => studentMap.has(f.student_id))
      .map((f) => ({
        ...f,
        student: studentMap.get(f.student_id) || null,
        total_attempts: Number(f.total_attempts),
        fail_count: Number(f.fail_count),
      }));

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('getTeacherFlags error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  recordTestComplete,
  getRetryStatus,
  getTeacherFlags,
};
