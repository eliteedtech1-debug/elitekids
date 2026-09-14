'use strict';

const { EliteSmsClientError, getLessonContext } = require('./eliteSmsClient');
const { isSmsContextBridgeEnabled } = require('./featureFlags');
const { classToAgeLevel } = require('./ageBand');
const { sameClassIdentity } = require('../utils/classIdentity');

// Keep hermetic practice/test fixtures on the explicit local path as well as
// the two model-school identities. Real non-flagship schools are SMS-only.
const FLAGSHIP_SCHOOL_IDS = new Set(['SCH-ELITE', 'SCH-KIDS']);

class BridgeContextError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'BridgeContextError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clean(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function schoolIdFromRequest(req) {
  // Institutional scope must come from the verified JWT/session. Browser
  // tenant headers are transport hints only and are never accepted as a
  // substitute for an authenticated school claim.
  return clean(req.user?.school_id);
}

function branchIdFromRequest(req) {
  // A branch header cannot widen a user's scope. If the authenticated user is
  // branch-scoped, only that verified claim is sent upstream.
  return clean(req.user?.branch_id);
}

function isFlagshipSchool(schoolId) {
  return FLAGSHIP_SCHOOL_IDS.has(clean(schoolId));
}

function localFlagshipContext(req, body, existing = null) {
  const value = (key) => clean(body[key] !== undefined ? body[key] : existing?.[key]);
  return {
    context_source: 'flagship-local',
    context_version: 'flagship-local-v1',
    school_id: schoolIdFromRequest(req),
    age_band: value('age_band') || classToAgeLevel(value('class_label') || value('class_code')) || null,
    branch_id: branchIdFromRequest(req) || value('branch_id'),
    class_code: value('class_code') || value('class_label'),
    class_label: value('class_label') || value('class_code'),
    academic_year: value('academic_year'),
    term_name: value('term_name'),
    week_number: body.week_number !== undefined ? Number(body.week_number) : existing?.week_number ?? null,
    subject_code: value('subject_code') || value('subject_id'),
    sms_lesson_id: value('sms_lesson_id'),
    context_snapshot: null,
  };
}

function subjectFromContext(data, requestedSubject) {
  const subjects = Array.isArray(data.subjects) ? data.subjects : [];
  const requested = clean(requestedSubject);
  const selected = requested
    ? subjects.find((item) => String(item.subject_code || '').trim() === requested
      || String(item.subject_name || '').trim().toLowerCase() === requested.toLowerCase())
    : subjects[0];
  if (!selected) {
    throw new BridgeContextError(
      'SMS_CONTEXT_SUBJECT_MISMATCH',
      'The selected subject is not assigned to the authoritative SMS class.',
      422,
      { subject: requested },
    );
  }
  return selected;
}

async function resolveBridgeContext(req, body = {}, existing = null, options = {}) {
  const schoolId = schoolIdFromRequest(req);
  if (!schoolId) throw new BridgeContextError('BRIDGE_SCHOOL_REQUIRED', 'school_id is required.', 400);

  if (isFlagshipSchool(schoolId)) {
    return localFlagshipContext(req, body, existing);
  }

  if (!isSmsContextBridgeEnabled(schoolId, options.env || process.env)) {
    throw new BridgeContextError(
      'SMS_CONTEXT_DISABLED',
      'SMS-authoritative context is not enabled for this school yet.',
      503,
    );
  }

  const value = (key) => clean(body[key] !== undefined ? body[key] : existing?.[key]);
  const classCode = value('class_code');
  if (!classCode) {
    throw new BridgeContextError('SMS_CONTEXT_CLASS_REQUIRED', 'class_code is required for non-flagship bridge authoring.', 400);
  }

  const subjectRequest = value('subject_code') || value('subject_id');
  const client = options.client || { getLessonContext };
  let data;
  try {
    data = await client.getLessonContext({
      schoolId,
      branchId: branchIdFromRequest(req) || value('branch_id'),
      classCode,
      subjectCode: subjectRequest,
      lessonId: value('sms_lesson_id'),
      academicYear: value('academic_year'),
      term: value('term_name'),
      weekNumber: body.week_number !== undefined ? Number(body.week_number) : existing?.week_number,
    });
  } catch (error) {
    if (error instanceof BridgeContextError) throw error;
    if (error instanceof EliteSmsClientError) {
      const status = error.code === 'SMS_CONTEXT_REJECTED' || error.code === 'SMS_CONTEXT_MISMATCH'
        ? 422
        : error.code === 'SMS_CONTEXT_INVALID_REQUEST' ? 400 : 503;
      throw new BridgeContextError(error.code, error.message, status, { cause: error });
    }
    throw new BridgeContextError('SMS_CONTEXT_UNAVAILABLE', 'EliteSMS lesson context is unavailable.', 503, { cause: error });
  }

  const selectedSubject = subjectFromContext(data, subjectRequest);
  const academic = data.academic || {};
  const classInfo = data.class || {};
  const lesson = data.lesson || null;
  const ageBand = clean(data.age?.band) || classToAgeLevel(classInfo.class_name || classInfo.class_code);
  return {
    context_source: 'elite-sms',
    context_version: String(data.contract_version || '1.0'),
    school_id: String(data.school?.school_id || schoolId),
    branch_id: clean(data.branch?.branch_id) || branchIdFromRequest(req),
    class_code: String(classInfo.class_code || classCode),
    class_label: String(classInfo.class_name || value('class_label') || classCode),
    age_band: ageBand,
    academic_year: clean(academic.academic_year),
    term_name: clean(academic.term),
    week_number: Number(academic.week_number),
    subject_code: String(selectedSubject.subject_code),
    subjects: (Array.isArray(data.subjects) ? data.subjects : []).map((subject) => ({
      subject_code: String(subject.subject_code || '').trim(),
      subject_name: String(subject.subject_name || subject.subject || '').trim() || null,
      class_code: String(subject.class_code || classInfo.class_code || '').trim() || null,
      status: subject.status || null,
    })).filter((subject) => subject.subject_code),
    sms_lesson_id: clean(lesson?.lesson_id),
    context_snapshot: {
      class: classInfo,
      academic,
      subject: selectedSubject,
      lesson: lesson ? {
        lesson_id: lesson.lesson_id,
        subject_code: lesson.subject_code,
        class_code: lesson.class_code,
        academic_year: lesson.academic_year,
        term: lesson.term,
        week_number: lesson.week_number,
      } : null,
      source: 'elite-sms',
      contract_version: String(data.contract_version || '1.0'),
      as_of: data.as_of || null,
    },
  };
}

function bridgeContextFields(context) {
  return {
    school_id: context.school_id,
    branch_id: context.branch_id || null,
    class_code: context.class_code || null,
    class_label: context.class_label,
    academic_year: context.academic_year || null,
    term_name: context.term_name || null,
    week_number: context.week_number,
    subject_code: context.subject_code || null,
    sms_lesson_id: context.sms_lesson_id || null,
    age_band: context.age_band || null,
    context_source: context.context_source,
    context_version: context.context_version,
    context_snapshot: context.context_snapshot || null,
  };
}

/**
 * Verify that the child and lesson bridge belong to the same authoritative
 * class context before evidence is recorded against them.
 *
 * For non-flagship schools the child roster is verified through the EliteSMS
 * lesson-context API (admission_no filter) — never through a direct shared-DB
 * query. Flagship/model schools keep the explicit local path using the
 * Kids-owned child record and the bridge's stored class identity.
 */
async function assertObservationContext(req, { bridge, child, admissionNo, env = process.env, client } = {}) {
  const schoolId = schoolIdFromRequest(req);
  if (!schoolId) throw new BridgeContextError('BRIDGE_SCHOOL_REQUIRED', 'school_id is required.', 400);

  if (!bridge) throw new BridgeContextError('BRIDGE_NOT_FOUND', 'Lesson bridge not found.', 404);
  if (!admissionNo) throw new BridgeContextError('SMS_CONTEXT_INVALID_REQUEST', 'child admission_no is required.', 400);

  // Flagship/model schools: the bridge's stored class identity is authoritative.
  if (isFlagshipSchool(schoolId)) {
    if (!child) {
      throw new BridgeContextError('CHILD_NOT_FOUND', 'Child not found in your school.', 404);
    }
    // Compare identity, not display labels: class_label is free text and must
    // never silently override class identity. Matching is tolerant of case,
    // separators and grade abbreviations ("NUR2-A" ≡ "Nur 2 A") while section
    // letters stay identity (NUR2-A ≠ NUR2-B). Legacy flagship bridges without
    // a class_code keep the historical local behavior.
    const bridgeClass = clean(bridge.class_code);
    const childClass = clean(child.class_code);
    if (bridgeClass && childClass && !sameClassIdentity(bridgeClass, childClass)) {
      throw new BridgeContextError(
        'OBSERVATION_CONTEXT_MISMATCH',
        'The child\'s class does not match the bridge\'s class context.',
        422,
        { bridge_class: bridgeClass, child_class: childClass },
      );
    }
    return { context_source: 'flagship-local', verified: 'local' };
  }

  // Non-flagship schools: the SMS API is the only roster authority.
  if (!isSmsContextBridgeEnabled(schoolId, env)) {
    throw new BridgeContextError(
      'SMS_CONTEXT_DISABLED',
      'SMS-authoritative context is not enabled for this school yet.',
      503,
    );
  }

  const classCode = clean(bridge.class_code);
  if (!classCode) {
    throw new BridgeContextError(
      'SMS_CONTEXT_CLASS_REQUIRED',
      'The lesson bridge has no authoritative class_code to verify against.',
      422,
    );
  }

  const smsClient = client || { getLessonContext };
  let data;
  try {
    data = await smsClient.getLessonContext({
      schoolId,
      branchId: branchIdFromRequest(req),
      classCode,
      admissionNo,
    });
  } catch (error) {
    if (error instanceof BridgeContextError) throw error;
    if (error instanceof EliteSmsClientError) {
      const status = error.code === 'SMS_CONTEXT_REJECTED' || error.code === 'SMS_CONTEXT_MISMATCH'
        ? 422
        : error.code === 'SMS_CONTEXT_INVALID_REQUEST' ? 400 : 503;
      throw new BridgeContextError(error.code, error.message, status, { cause: error });
    }
    throw new BridgeContextError('SMS_CONTEXT_UNAVAILABLE', 'EliteSMS lesson context is unavailable.', 503, { cause: error });
  }

  // The SMS endpoint enforces school/branch/class/admission internally and
  // returns STUDENT_NOT_FOUND when the child is not in this class roster.
  const rosterAge = data.age || null;
  return {
    context_source: 'elite-sms',
    context_version: String(data.contract_version || '1.0'),
    verified: 'elite-sms.roster',
    age: rosterAge,
  };
}

function bridgeContextErrorResponse(error) {
  if (!error || !error.code) return null;
  return {
    status: error.status || 503,
    body: {
      success: false,
      error_code: error.code,
      message: error.message,
      ...(error.details && Object.keys(error.details).length && !error.details.cause
        ? { details: error.details }
        : {}),
    },
  };
}

module.exports = {
  FLAGSHIP_SCHOOL_IDS,
  BridgeContextError,
  isFlagshipSchool,
  resolveBridgeContext,
  assertObservationContext,
  bridgeContextFields,
  bridgeContextErrorResponse,
};
