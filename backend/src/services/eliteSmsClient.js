'use strict';

/**
 * Server-to-server client for the EliteSMS shared API.
 *
 * This module must only be imported by the EliteKids backend. Do not import it
 * from frontend code and never return its credential to a browser.
 *
 * EliteSMS owns institutional context. EliteKids owns the game bridge and must
 * not replace an unavailable API call with a new direct shared-DB query.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const CONTRACT_VERSION = '1.0';

const { sameClassIdentity } = require('../utils/classIdentity');

class EliteSmsClientError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'EliteSmsClientError';
    this.code = code;
    this.status = details.status;
    this.retryable = Boolean(details.retryable);
    this.cause = details.cause;
  }
}

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getConfig(env = process.env) {
  return {
    baseUrl: cleanBaseUrl(env.ELITE_SMS_API_BASE_URL),
    jwt: String(env.ELITE_SMS_SHARED_JWT || '').trim(),
    apiKey: String(env.ELITE_SMS_SHARED_API_KEY || '').trim(),
    timeoutMs: numberInRange(env.ELITE_SMS_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 500, MAX_TIMEOUT_MS),
    maxRetries: numberInRange(env.ELITE_SMS_MAX_RETRIES, DEFAULT_MAX_RETRIES, 0, MAX_RETRIES),
    useFixture: String(env.ELITE_SMS_USE_FIXTURE || '').toLowerCase() === 'true',
  };
}

function assertRequestConfig(config) {
  if (!config.baseUrl) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_NOT_CONFIGURED',
      'EliteSMS API base URL is not configured.',
    );
  }
  if (!config.jwt && !config.apiKey) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_NOT_CONFIGURED',
      'EliteSMS service authentication is not configured.',
    );
  }
}

function requiredString(value, field) {
  const result = String(value || '').trim();
  if (!result) {
    throw new EliteSmsClientError('SMS_CONTEXT_INVALID_REQUEST', `${field} is required.`);
  }
  return result;
}

function queryValue(params, key) {
  const value = params[key];
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim();
}

function buildContextQuery(params = {}) {
  const query = new URLSearchParams();
  query.set('class_code', requiredString(params.classCode || params.class_code, 'classCode'));

  const mappings = [
    ['branch_id', params.branchId ?? params.branch_id],
    ['subject_code', params.subjectCode ?? params.subject_code],
    ['lesson_id', params.lessonId ?? params.lesson_id],
    ['admission_no', params.admissionNo ?? params.admission_no],
    ['academic_year', params.academicYear ?? params.academic_year],
    ['term', params.term ?? params.termName ?? params.term_name],
    ['week_number', params.weekNumber ?? params.week_number],
  ];
  for (const [key, raw] of mappings) {
    const value = queryValue({ value: raw }, 'value');
    if (value !== null) query.set(key, value);
  }
  return query;
}

function sleep(ms, timer = setTimeout) {
  return new Promise((resolve) => timer(resolve, ms));
}

function retryDelay(attempt) {
  // Small bounded backoff is enough for a teacher form; it avoids adding a
  // queue/Redis dependency to this low-cost integration path.
  return Math.min(250 * (2 ** attempt), 1000);
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isAbortError(error) {
  return error && (error.name === 'AbortError' || error.code === 'ABORT_ERR');
}

function normalizeContextResponse(body, requested = {}) {
  if (!body || body.success !== true || !body.data || typeof body.data !== 'object') {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'EliteSMS returned an invalid lesson-context response.',
    );
  }

  const context = body.data;
  if (context.source !== 'elite-sms') {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'EliteSMS lesson context has an invalid source marker.',
    );
  }
  if (!context.contract_version) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'EliteSMS lesson context has no contract version.',
    );
  }
  if (!context.class || !context.class.class_code) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'EliteSMS lesson context has no class identity.',
    );
  }
  const requestedSchool = queryValue(requested, 'schoolId') || queryValue(requested, 'school_id');
  const requestedBranch = queryValue(requested, 'branchId') || queryValue(requested, 'branch_id');
  const returnedSchool = queryValue(context.school || {}, 'school_id');
  const returnedBranch = queryValue(context.branch || {}, 'branch_id');
  if (requestedSchool && returnedSchool !== requestedSchool) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_MISMATCH',
      'EliteSMS returned a different school from the authenticated request.',
    );
  }
  if (requestedBranch && returnedBranch !== requestedBranch) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_MISMATCH',
      'EliteSMS returned a different branch from the authenticated request.',
    );
  }
  // Class identity is separator/case/abbreviation-tolerant ("NUR2-A" and
  // "Nur 2 A" are the same class) but section letters and ordinals are
  // identity: NUR2-A ≠ NUR2-B and NUR2 ≠ NUR2A.
  if (!sameClassIdentity(context.class.class_code, requested.classCode)) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_MISMATCH',
      'EliteSMS returned a different class from the requested context.',
    );
  }
  if (!context.academic || !context.academic.academic_year || !context.academic.term) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'EliteSMS lesson context has incomplete academic identity.',
    );
  }
  if (!Array.isArray(context.subjects)) {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'EliteSMS lesson context has no subject list.',
    );
  }

  return {
    ...context,
    contract_version: String(context.contract_version),
    source: 'elite-sms',
  };
}

function fixtureContext(fixture, params) {
  const value = typeof fixture === 'function' ? fixture(params) : fixture;
  if (!value || typeof value !== 'object') {
    throw new EliteSmsClientError(
      'SMS_CONTEXT_INVALID_RESPONSE',
      'The configured EliteSMS test fixture is invalid.',
    );
  }
  return normalizeContextResponse(value.success === undefined ? { success: true, data: value } : value, {
    classCode: String(params.classCode || params.class_code).trim(),
  });
}

class EliteSmsClient {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.config = { ...getConfig(this.env), ...(options.config || {}) };
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.fixture = options.fixture;
    this.sleepImpl = options.sleepImpl || sleep;
  }

  async getLessonContext(params = {}) {
    const classCode = requiredString(params.classCode || params.class_code, 'classCode');
    const request = { ...params, classCode };

    // Fixtures are deliberately unavailable in production, even if a stale
    // environment variable enables them. Production must prove the deployed
    // EliteSMS trust boundary rather than silently bypassing it.
    if (this.config.useFixture && this.env.NODE_ENV === 'production') {
      throw new EliteSmsClientError(
        'SMS_CONTEXT_NOT_CONFIGURED',
        'EliteSMS fixtures are disabled in production.',
      );
    }
    if (this.fixture && this.config.useFixture && this.env.NODE_ENV !== 'production') {
      return fixtureContext(this.fixture, request);
    }
    if (this.config.useFixture && this.env.NODE_ENV !== 'production') {
      const rawFixture = this.env.ELITE_SMS_CONTEXT_FIXTURE;
      if (rawFixture) {
        try {
          return fixtureContext(JSON.parse(rawFixture), request);
        } catch (error) {
          if (error instanceof EliteSmsClientError) throw error;
          throw new EliteSmsClientError('SMS_CONTEXT_INVALID_RESPONSE', 'EliteSMS fixture JSON is invalid.', { cause: error });
        }
      }
    }

    assertRequestConfig(this.config);
    if (typeof this.fetchImpl !== 'function') {
      throw new EliteSmsClientError('SMS_CONTEXT_NOT_CONFIGURED', 'No server HTTP client is available.');
    }

    const url = `${this.config.baseUrl}/api/v1/shared/kids/lesson-context?${buildContextQuery(request).toString()}`;
    const headers = { Accept: 'application/json' };
    if (this.config.jwt) headers.Authorization = `Bearer ${this.config.jwt}`;
    if (this.config.apiKey) headers['X-Shared-Service-Key'] = this.config.apiKey;
    // Static-key deployments require this header; it is harmless for JWT
    // deployments and gives the SMS service an explicit request invariant.
    const schoolId = queryValue({ value: params.schoolId ?? params.school_id }, 'value');
    if (schoolId) headers['X-School-Id'] = schoolId;

    let lastError;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, { method: 'GET', headers }, this.config.timeoutMs);
        const body = await this.readJson(response);
        if (!response.ok) {
          const retryable = shouldRetryStatus(response.status);
          throw new EliteSmsClientError(
            retryable ? 'SMS_CONTEXT_UNAVAILABLE' : 'SMS_CONTEXT_REJECTED',
            retryable
              ? 'EliteSMS lesson context is temporarily unavailable.'
              : 'EliteSMS rejected the lesson-context request.',
            { status: response.status, retryable },
          );
        }
        return normalizeContextResponse(body, request);
      } catch (error) {
        lastError = error instanceof EliteSmsClientError
          ? error
          : new EliteSmsClientError(
            'SMS_CONTEXT_UNAVAILABLE',
            'EliteSMS lesson context could not be reached.',
            { retryable: !isAbortError(error), cause: error },
          );
        if (!lastError.retryable || attempt >= this.config.maxRetries) break;
        await this.sleepImpl(retryDelay(attempt));
      }
    }

    // Preserve a stable public code while keeping the underlying cause out of
    // API responses. Callers can log `code` and `status`, never credentials.
    throw lastError || new EliteSmsClientError('SMS_CONTEXT_UNAVAILABLE', 'EliteSMS lesson context is unavailable.');
  }

  async fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      throw new EliteSmsClientError(
        'SMS_CONTEXT_INVALID_RESPONSE',
        'EliteSMS returned a non-JSON response.',
        { status: response.status, cause: error },
      );
    }
  }
}

function createEliteSmsClient(options = {}) {
  return new EliteSmsClient(options);
}

const defaultClient = createEliteSmsClient();

module.exports = {
  CONTRACT_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  EliteSmsClient,
  EliteSmsClientError,
  createEliteSmsClient,
  getConfig,
  buildContextQuery,
  normalizeContextResponse,
  getLessonContext: (params) => defaultClient.getLessonContext(params),
};
