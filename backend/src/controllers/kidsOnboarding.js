/**
 * Interface Onboarding controller — Doc 16: Gamification Depth.
 *
 * One-time interface onboarding before first lesson.
 * Teaches tap-to-select, drag-to-sort with neutral content-free objects.
 *
 * Endpoints:
 *   GET  /kids/onboarding/status   — check if student has completed onboarding
 *   POST /kids/onboarding/complete — mark onboarding as completed
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../models');

/**
 * GET /kids/onboarding/status?student_id=X
 * Returns whether the student has completed interface onboarding.
 */
async function getOnboardingStatus(req, res) {
  try {
    const studentId = req.query.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const record = await db.KidInterfaceOnboarding.findOne({
      where: { student_id: studentId },
    });

    return res.json({
      success: true,
      data: {
        completed: !!record,
        completed_at: record ? record.completed_at : null,
      },
    });
  } catch (err) {
    console.error('getOnboardingStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/onboarding/complete — mark onboarding as completed.
 * Idempotent: if already completed, returns the existing record.
 */
async function completeOnboarding(req, res) {
  try {
    const studentId = req.body?.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    // Idempotent: check if already completed
    const existing = await db.KidInterfaceOnboarding.findOne({
      where: { student_id: studentId },
    });
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Already completed.' });
    }

    const record = await db.KidInterfaceOnboarding.create({
      id: uuidv4(),
      student_id: studentId,
      completed_at: new Date(),
    });

    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    // Handle duplicate key race condition (two concurrent calls)
    if (err.name === 'SequelizeUniqueConstraintError') {
      const existing = await db.KidInterfaceOnboarding.findOne({
        where: { student_id: req.body?.student_id },
      });
      return res.json({ success: true, data: existing, message: 'Already completed.' });
    }
    console.error('completeOnboarding error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getOnboardingStatus,
  completeOnboarding,
};
