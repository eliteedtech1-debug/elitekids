'use strict';

const {
  EliteSmsClient,
  EliteSmsClientError,
  buildContextQuery,
  getConfig,
  normalizeContextResponse,
} = require('../src/services/eliteSmsClient');
const { classTokens, classCanonical, sameClassIdentity, resolveClassIdentity } = require('../src/utils/classIdentity');

function validContext() {
  return {
    success: true,
    data: {
      source: 'elite-sms',
      contract_version: '1.0',
      class: { class_code: 'NUR2-A', class_name: 'Nursery 2 A' },
      academic: { academic_year: '2026/2027', term: 'First Term', week_number: 3 },
      subjects: [{ subject_code: 'SBJ0001', subject_name: 'Numeracy' }],
    },
  };
}

describe('EliteSMS server client contract', () => {
  test('builds only the documented context query fields', () => {
    const query = buildContextQuery({
      classCode: 'NUR2-A',
      schoolId: 'SCH-TEST',
      subjectCode: 'SBJ0001',
      weekNumber: 3,
      ignored: 'must-not-be-sent',
    });

    expect(Object.fromEntries(query.entries())).toEqual({
      class_code: 'NUR2-A',
      subject_code: 'SBJ0001',
      week_number: '3',
    });
  });

  test('uses a fixture only when explicitly enabled and never needs credentials', async () => {
    const client = new EliteSmsClient({
      env: { NODE_ENV: 'test', ELITE_SMS_USE_FIXTURE: 'true' },
      fixture: () => validContext(),
    });

    await expect(client.getLessonContext({ classCode: 'NUR2-A' })).resolves.toMatchObject({
      source: 'elite-sms',
      contract_version: '1.0',
    });
  });

  test('does not silently use a fixture when the opt-in flag is absent', async () => {
    const client = new EliteSmsClient({
      env: { NODE_ENV: 'test' },
      fixture: () => validContext(),
    });

    await expect(client.getLessonContext({ classCode: 'NUR2-A' })).rejects.toMatchObject({
      code: 'SMS_CONTEXT_NOT_CONFIGURED',
    });
  });

  test('retries transient GET failures but stops at the configured bound', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const client = new EliteSmsClient({
      config: {
        baseUrl: 'https://sms.test',
        apiKey: 'server-secret-not-logged',
        timeoutMs: 1000,
        maxRetries: 2,
      },
      fetchImpl,
      sleepImpl: async () => {},
    });

    await expect(client.getLessonContext({ classCode: 'NUR2-A' })).rejects.toMatchObject({
      code: 'SMS_CONTEXT_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('X-Secret');
    expect(fetchImpl.mock.calls[0][1].headers['X-Shared-Service-Key']).toBe('server-secret-not-logged');
  });

  test('does not retry a rejected request or leak the response body', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValue({ ok: false, status: 403, json: async () => ({ secret: 'do-not-return' }) });
    const client = new EliteSmsClient({
      config: { baseUrl: 'https://sms.test', jwt: 'jwt-not-logged', maxRetries: 3 },
      fetchImpl,
      sleepImpl: async () => {},
    });

    await expect(client.getLessonContext({ classCode: 'NUR2-A' })).rejects.toEqual(
      expect.objectContaining({
        code: 'SMS_CONTEXT_REJECTED',
        status: 403,
        retryable: false,
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('bounds environment timeout and retry settings', () => {
    expect(getConfig({
      ELITE_SMS_REQUEST_TIMEOUT_MS: '999999',
      ELITE_SMS_MAX_RETRIES: '999',
    })).toMatchObject({ timeoutMs: 30000, maxRetries: 3 });
  });

  test('exports a stable typed error class', () => {
    const error = new EliteSmsClientError('SMS_CONTEXT_UNAVAILABLE', 'Unavailable.', { status: 503, retryable: true });
    expect(error).toMatchObject({ code: 'SMS_CONTEXT_UNAVAILABLE', status: 503, retryable: true });
  });
});

describe('tolerant class identity (classIdentity util)', () => {
  test.each([
    ['NUR2-A', 'Nur 2 A'],
    ['NUR2-A', 'Nur2A'],
    ['NUR2-A', 'nursery2a'],
    ['NUR2-A', 'Nursery-2A'],
    ['NUR2-A', 'Nursery 2 A'],
    ['NUR2-A', 'nur two a'],
    ['KG1-A', 'Kindergarten 1 A'],
    ['Creche', 'Crèche'],
    // Real elite_db.classes.class_name values
    ['LOWER KG', 'KG1'],
    ['UPPER KG', 'KG2'],
    ['BASIC 3', 'Primary 3'],
    ['BASIC 3', 'PRY3'],
    ['Crech', 'Creche'],
    ['SS1', 'SS 1'],
    ['JSS 2', 'jss2'],
  ])('matches %s ≡ %s', (a, b) => {
    expect(sameClassIdentity(a, b)).toBe(true);
  });

  test.each([
    ['NUR2-A', 'NUR2-B'],
    ['NUR2', 'NUR2A'],
    ['KG1-A', 'KG2-A'],
    ['PRY1', 'Primary 2'],
    ['NUR2-A', ''],
    ['Primary 1 Fagge', 'Primary 1 Dala'],
    ['BASIC 2', 'Primary 3'],
    ['LOWER KG', 'UPPER KG'],
    ['Primary 2 A', 'Primary 2 B'],
  ])('rejects %s vs %s', (a, b) => {
    expect(sameClassIdentity(a, b)).toBe(false);
  });

  test('classTokens canonicalizes variants to identical tokens', () => {
    expect(classTokens('Nursery 2 A')).toEqual(classTokens('NUR2-A'));
    expect(classCanonical('LOWER KG')).toBe('kindergarten1');
    expect(classCanonical('BASIC 3')).toBe('primary3');
  });
});

describe('two-tier class resolution (exact first, tolerant second, ambiguous fails closed)', () => {
  const rows = [
    { class_code: 'CLS0007', class_name: 'BASIC 3' },
    { class_code: 'CLS0429', class_name: 'Primary 3' },
    { class_code: 'CLS0430', class_name: 'Primary 3 A' },
    { class_code: 'CLS0941', class_name: 'Nursery 2' },
  ];

  test('legacy/new duplicate naming is ambiguous and fails closed', () => {
    const resolution = resolveClassIdentity('basic3', rows);
    expect(resolution.ambiguous).toHaveLength(2);
    expect(resolution.ambiguous.map((r) => r.class_code)).toEqual(expect.arrayContaining(['CLS0007', 'CLS0429']));
  });

  test('exact class_name wins (tier: exact)', () => {
    expect(resolveClassIdentity('Nursery 2', rows)).toMatchObject({ tier: 'exact', row: { class_code: 'CLS0941' } });
  });

  test('a canonical variant resolves to the single matching row', () => {
    expect(resolveClassIdentity('nursery-two', rows)).toMatchObject({ tier: 'canonical', row: { class_code: 'CLS0941' } });
  });

  test('section letters are identity during resolution too', () => {
    // 'Primary 3' must NOT resolve to the 'Primary 3 A' row.
    expect(resolveClassIdentity('Primary 3', rows)).toMatchObject({ tier: 'exact', row: { class_code: 'CLS0429' } });
    expect(resolveClassIdentity('Primary 3 A', rows)).toMatchObject({ tier: 'exact', row: { class_code: 'CLS0430' } });
  });

  test('unknown classes resolve to null', () => {
    expect(resolveClassIdentity('Primary 9', rows)).toBeNull();
    expect(resolveClassIdentity('', rows)).toBeNull();
  });
});

describe('client response class validation (tolerant identity)', () => {
  test('accepts a response whose class code is a tolerant variant of the request', () => {
    const body = validContext();
    body.data.class.class_code = 'Nursery 2 A';
    expect(() => normalizeContextResponse(body, { classCode: 'NUR2-A' })).not.toThrow();
  });

  test('still rejects a response for a different class (section letter is identity)', () => {
    const body = validContext();
    body.data.class.class_code = 'NUR2-B';
    try {
      normalizeContextResponse(body, { classCode: 'NUR2-A' });
      throw new Error('expected SMS_CONTEXT_MISMATCH');
    } catch (error) {
      expect(error).toBeInstanceOf(EliteSmsClientError);
      expect(error.code).toBe('SMS_CONTEXT_MISMATCH');
    }
  });
});
