'use strict';

const {
  BridgeContextError,
  assertObservationContext,
} = require('../src/services/lessonBridgeContext');
const { EliteSmsClientError } = require('../src/services/eliteSmsClient');

function request(schoolId, branchId = 'BR-TEST') {
  return {
    headers: { 'x-school-id': schoolId, 'x-branch-id': branchId },
    user: { school_id: schoolId, branch_id: branchId },
  };
}

function bridge(overrides = {}) {
  return {
    id: 'BRIDGE-1',
    school_id: 'SCH-TEST',
    class_code: 'NUR2-A',
    class_label: 'Nursery 2 A',
    context_source: 'elite-sms',
    ...overrides,
  };
}

function child(overrides = {}) {
  return {
    admission_no: 'NUR-001',
    school_id: 'SCH-TEST',
    class_code: 'NUR2-A',
    ...overrides,
  };
}

function smsContext(overrides = {}) {
  return {
    source: 'elite-sms',
    contract_version: '1.0',
    school: { school_id: 'SCH-TEST' },
    branch: { branch_id: 'BR-TEST' },
    class: { class_code: 'NUR2-A', class_name: 'Nursery 2 A' },
    academic: { academic_year: '2026/2027', term: 'First Term', week_number: 3 },
    subjects: [{ subject_code: 'SBJ0001', subject_name: 'Numeracy' }],
    age: { years: 4, as_of: '2026-09-09', source: 'elite-sms.date_of_birth' },
    ...overrides,
  };
}

describe('observation context verification', () => {
  test('rejects observations without a school scope', async () => {
    await expect(assertObservationContext({ headers: {}, user: {} }, {
      bridge: bridge(),
      child: child(),
      admissionNo: 'NUR-001',
    })).rejects.toMatchObject({ code: 'BRIDGE_SCHOOL_REQUIRED', status: 400 });
  });

  test('rejects when the bridge or admission is missing', async () => {
    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: null,
      admissionNo: 'NUR-001',
    })).rejects.toMatchObject({ code: 'BRIDGE_NOT_FOUND', status: 404 });

    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: bridge(),
      admissionNo: '',
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_INVALID_REQUEST', status: 400 });
  });

  test('flagship path verifies bridge class identity against the Kids child record', async () => {
    const verified = await assertObservationContext(request('SCH-ELITE', 'BR-MAIN'), {
      bridge: bridge({ school_id: 'SCH-ELITE', context_source: 'flagship-local' }),
      child: child({ school_id: 'SCH-ELITE', class_code: 'NUR2-A' }),
      admissionNo: 'NUR-001',
    });
    expect(verified).toMatchObject({ context_source: 'flagship-local', verified: 'local' });
  });

  test('flagship path rejects a child whose class does not match the bridge', async () => {
    await expect(assertObservationContext(request('SCH-ELITE', 'BR-MAIN'), {
      bridge: bridge({ school_id: 'SCH-ELITE', context_source: 'flagship-local' }),
      child: child({ school_id: 'SCH-ELITE', class_code: 'KG1-B' }),
      admissionNo: 'NUR-001',
    })).rejects.toMatchObject({ code: 'OBSERVATION_CONTEXT_MISMATCH', status: 422 });
  });

  test('flagship path tolerates class-label variants ("Nur 2 A" ≡ "NUR2-A") but not different sections', async () => {
    const verified = await assertObservationContext(request('SCH-ELITE', 'BR-MAIN'), {
      bridge: bridge({ school_id: 'SCH-ELITE', context_source: 'flagship-local', class_code: 'Nur 2 A' }),
      child: child({ school_id: 'SCH-ELITE', class_code: 'NUR2-A' }),
      admissionNo: 'NUR-001',
    });
    expect(verified.verified).toBe('local');

    await expect(assertObservationContext(request('SCH-ELITE', 'BR-MAIN'), {
      bridge: bridge({ school_id: 'SCH-ELITE', context_source: 'flagship-local', class_code: 'Nur 2 A' }),
      child: child({ school_id: 'SCH-ELITE', class_code: 'NUR2-B' }),
      admissionNo: 'NUR-001',
    })).rejects.toMatchObject({ code: 'OBSERVATION_CONTEXT_MISMATCH', status: 422 });
  });

  test('flagship path keeps historical behavior for legacy bridges without class_code', async () => {
    const verified = await assertObservationContext(request('SCH-ELITE', 'BR-MAIN'), {
      bridge: bridge({ school_id: 'SCH-ELITE', context_source: 'flagship-local', class_code: null }),
      child: child({ school_id: 'SCH-ELITE' }),
      admissionNo: 'NUR-001',
    });
    expect(verified.verified).toBe('local');
  });

  test('non-flagship path verifies the roster through the EliteSMS API only', async () => {
    const getLessonContext = jest.fn().mockResolvedValue(smsContext());
    const verified = await assertObservationContext(request('SCH-TEST'), {
      bridge: bridge(),
      admissionNo: 'NUR-001',
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext },
    });

    expect(getLessonContext).toHaveBeenCalledTimes(1);
    expect(getLessonContext).toHaveBeenCalledWith(expect.objectContaining({
      schoolId: 'SCH-TEST',
      branchId: 'BR-TEST',
      classCode: 'NUR2-A',
      admissionNo: 'NUR-001',
    }));
    expect(verified).toMatchObject({
      context_source: 'elite-sms',
      context_version: '1.0',
      verified: 'elite-sms.roster',
      age: { years: 4 },
    });
  });

  test('non-flagship path fails closed while the SMS bridge rollout is disabled', async () => {
    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: bridge(),
      admissionNo: 'NUR-001',
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'false' },
      client: { getLessonContext: jest.fn() },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_DISABLED', status: 503 });
  });

  test('non-flagship path rejects a bridge without an authoritative class_code', async () => {
    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: bridge({ class_code: null }),
      admissionNo: 'NUR-001',
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext: jest.fn() },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_CLASS_REQUIRED', status: 422 });
  });

  test('non-flagship path surfaces SMS roster rejection (STUDENT_NOT_FOUND) as a 422', async () => {
    // The SMS endpoint answers 404 STUDENT_NOT_FOUND for a child outside the
    // class roster; the client classifies that as a non-retryable rejection.
    const getLessonContext = jest.fn().mockRejectedValue(
      new EliteSmsClientError('SMS_CONTEXT_REJECTED', 'EliteSMS rejected the lesson-context request.', { status: 404 }),
    );
    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: bridge(),
      admissionNo: 'NUR-404',
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_REJECTED', status: 422 });
  });

  test('non-flagship path keeps BridgeContextErrors from the client intact', async () => {
    const getLessonContext = jest.fn().mockRejectedValue(
      new BridgeContextError('SMS_CONTEXT_SUBJECT_MISMATCH', 'mismatch', 422),
    );
    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: bridge(),
      admissionNo: 'NUR-001',
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_SUBJECT_MISMATCH', status: 422 });
  });

  test('non-flagship path maps SMS unavailability to an explicit 503', async () => {
    const getLessonContext = jest.fn().mockRejectedValue(
      new BridgeContextError('SMS_CONTEXT_UNAVAILABLE', 'EliteSMS lesson context is unavailable.', 503),
    );
    await expect(assertObservationContext(request('SCH-TEST'), {
      bridge: bridge(),
      admissionNo: 'NUR-001',
      env: { SMS_CONTEXT_BRIDGE_ENABLED: 'true' },
      client: { getLessonContext },
    })).rejects.toMatchObject({ code: 'SMS_CONTEXT_UNAVAILABLE', status: 503 });
  });
});
