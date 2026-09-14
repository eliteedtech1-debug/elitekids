'use strict';

const {
  BridgeContextError,
  bridgeContextFields,
  resolveBridgeContext,
  isFlagshipSchool,
} = require('../src/services/lessonBridgeContext');

function request(schoolId, branchId = 'BR-TEST') {
  return {
    headers: { 'x-school-id': schoolId, 'x-branch-id': branchId },
    user: { school_id: schoolId, branch_id: branchId },
  };
}

const body = {
  class_code: 'NUR2-A',
  class_label: 'Nursery 2 A',
  subject_id: 'SBJ0001',
  academic_year: '2026/2027',
  term_name: 'First Term',
  week_number: 3,
  sms_lesson_id: 'SMS-LESSON-001',
};

function smsContext() {
  return {
    source: 'elite-sms',
    contract_version: '1.0',
    school: { school_id: 'SCH-TEST' },
    branch: { branch_id: 'BR-TEST' },
    class: { class_code: 'NUR2-A', class_name: 'Nursery 2 A' },
    academic: { academic_year: '2026/2027', term: 'First Term', week_number: 3 },
    subjects: [{ subject_code: 'SBJ0001', subject_name: 'Numeracy' }],
    lesson: {
      lesson_id: 'SMS-LESSON-001',
      subject_code: 'SBJ0001',
      class_code: 'NUR2-A',
      academic_year: '2026/2027',
      term: 'First Term',
      week_number: 3,
    },
    as_of: '2026-09-04T00:00:00.000Z',
  };
}

describe('lesson bridge context boundary', () => {
  test('normalizes non-flagship context from EliteSMS and stores a small snapshot', async () => {
    const context = await resolveBridgeContext(request('SCH-TEST'), body, null, {
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext: jest.fn().mockResolvedValue(smsContext()) },
    });

    expect(context).toMatchObject({
      context_source: 'elite-sms',
      school_id: 'SCH-TEST',
      branch_id: 'BR-TEST',
      class_code: 'NUR2-A',
      subject_code: 'SBJ0001',
      sms_lesson_id: 'SMS-LESSON-001',
      academic_year: '2026/2027',
      term_name: 'First Term',
      week_number: 3,
    });
    expect(context.context_snapshot.lesson.lesson_id).toBe('SMS-LESSON-001');
  });

  test('fails closed while SMS bridge rollout is disabled', async () => {
    await expect(resolveBridgeContext(request('SCH-TEST'), body, null, {
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'false' },
      client: { getLessonContext: jest.fn() },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_DISABLED', status: 503 });
  });

  test('preserves the explicit flagship local path', async () => {
    expect(isFlagshipSchool('SCH-ELITE')).toBe(true);
    const context = await resolveBridgeContext(request('SCH-ELITE', 'BR-MAIN'), {
      ...body,
      class_label: 'Nursery 2',
      subject_id: 'Numeracy',
    });
    expect(context).toMatchObject({ context_source: 'flagship-local', school_id: 'SCH-ELITE' });
  });

  test('rejects a subject that SMS did not assign to the class', async () => {
    await expect(resolveBridgeContext(request('SCH-TEST'), { ...body, subject_id: 'SBJ-NOT-ASSIGNED' }, null, {
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext: jest.fn().mockResolvedValue(smsContext()) },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_SUBJECT_MISMATCH', status: 422 });
  });

  test('does not expose the full SMS response in the persisted bridge fields', async () => {
    const context = await resolveBridgeContext(request('SCH-TEST'), body, null, {
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext: jest.fn().mockResolvedValue(smsContext()) },
    });
    const fields = bridgeContextFields(context);
    expect(fields.context_source).toBe('elite-sms');
    expect(fields.context_snapshot.lesson).toEqual(expect.objectContaining({ lesson_id: 'SMS-LESSON-001' }));
    expect(fields.context_snapshot).not.toHaveProperty('guardian');
  });

  test('exports a typed context error for callers', () => {
    const error = new BridgeContextError('X', 'message', 422);
    expect(error).toMatchObject({ code: 'X', status: 422 });
  });
});
