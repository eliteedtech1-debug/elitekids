'use strict';

const {
  resolveBridgeContext,
  bridgeContextErrorResponse,
} = require('../services/lessonBridgeContext');

function isStaff(req) {
  const role = String(req.user?.user_type || req.user?.role || '').toLowerCase();
  return role.includes('admin') || role.includes('branchadmin') || role.includes('teacher')
    || role.includes('superadmin') || role.includes('developer');
}

/**
 * GET /kids/sms/lesson-context
 *
 * Browser-safe projection for teacher authoring. The browser receives the
 * resolved context, never the EliteSMS service credential.
 */
async function getLessonContext(req, res) {
  if (!isStaff(req)) return res.status(403).json({ success: false, message: 'Staff access required.' });
  try {
    const body = {
      class_code: req.query.class_code,
      class_label: req.query.class_label,
      subject_code: req.query.subject_code,
      subject_id: req.query.subject_id,
      sms_lesson_id: req.query.lesson_id || req.query.sms_lesson_id,
      academic_year: req.query.academic_year,
      term_name: req.query.term || req.query.term_name,
      week_number: req.query.week_number === undefined ? undefined : Number(req.query.week_number),
      age_band: req.query.age_band,
    };
    const context = await resolveBridgeContext(req, body);
    return res.json({
      success: true,
      data: {
        context_source: context.context_source,
        context_version: context.context_version,
        school_id: context.school_id,
        branch_id: context.branch_id,
        class_code: context.class_code,
        class_label: context.class_label,
        age_band: context.age_band || null,
        academic_year: context.academic_year,
        term_name: context.term_name,
        week_number: context.week_number,
        subject_code: context.subject_code,
        subjects: context.subjects || [],
        sms_lesson_id: context.sms_lesson_id,
        context_snapshot: context.context_snapshot,
      },
    });
  } catch (error) {
    const response = bridgeContextErrorResponse(error);
    if (response) return res.status(response.status).json(response.body);
    console.error('getLessonContext error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getLessonContext };
