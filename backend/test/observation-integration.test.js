'use strict';

/**
 * Integration test — observation SMS roster guard (real HTTP surface).
 *
 * Proves that POST /kids/observations for a NON-flagship school verifies the
 * child against the EliteSMS roster (via the lesson-context API, never a
 * direct shared-DB read) and REJECTS the observation when the roster check
 * fails. The EliteSMS HTTP client is stubbed at the module boundary so no
 * real SMS deployment is required; everything below it (routes, auth,
 * controllers, Kids DB) runs for real against the hermetic _test databases.
 *
 * Note: bridge rows are seeded directly because bridge CREATION requires an
 * SMS-resolved context — that path is covered by the bridge tests, not here.
 */

const request = require('supertest');
// The rollout flag defaults OFF (fail-closed); this test exercises the
// enabled-for-pilot path, so it opts in for this jest process only.
process.env.SMS_CONTEXT_BRIDGE_ENABLED = 'true';
const app = require('../src/app');
const { testQuery } = require('./helpers/test-db');

// Stub ONLY the EliteSMS HTTP client — the roster authority boundary.
jest.mock('../src/services/eliteSmsClient', () => {
  const actual = jest.requireActual('../src/services/eliteSmsClient');
  return {
    ...actual,
    getLessonContext: jest.fn(),
  };
});

const { getLessonContext } = require('../src/services/eliteSmsClient');

// SCH-TEST is NOT in the flagship set (SCH-ELITE / SCH-KIDS) → SMS-authoritative.
const SCHOOL = 'SCH-TEST';
const BRANCH = 'BR-TEST';
const BRIDGE_ID = 'BRIDGE-OBS-INT-1';

function smsContext() {
  return {
    success: true,
    data: {
      source: 'elite-sms',
      contract_version: '1.0',
      school: { school_id: SCHOOL },
      branch: { branch_id: BRANCH },
      class: { class_code: 'NUR-A', class_name: 'Nursery A' },
      academic: { academic_year: '2026/2027', term: 'First Term', week_number: 3 },
      subjects: [{ subject_code: 'SBJ0001', subject_name: 'Numeracy', class_code: 'NUR-A' }],
      age: { years: 4, as_of: '2026-09-09', source: 'elite-sms.date_of_birth' },
    },
  };
}

function observationBody(overrides = {}) {
  return {
    child_admission_no: 'NUR-001',
    lesson_bridge_id: BRIDGE_ID,
    observation_level: 'independent',
    response_route: 'point',
    prompt_level: 'none',
    next_step: 'Practice counting objects at home.',
    ...overrides,
  };
}

async function loginAs(username, password) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id: SCHOOL });
  expect(res.status).toBe(200);
  return res.body.token;
}

let staffToken;

beforeAll(async () => {
  // A published-context bridge for a non-flagship school, seeded straight into
  // the Kids DB. class_code matches the SMS fixture class above.
  await testQuery(
    `INSERT INTO kids_lesson_bridges
       (id, lesson_id, outcome_id, school_id, branch_id, class_code, class_label, age_band,
        academic_year, term_name, week_number, subject_id, subject_code, sms_lesson_id,
        context_source, context_version, objective, micro_objectives, success_evidence,
        evidence_routes, concrete_experience, assessment_plan, game_plan, status, created_by)
     VALUES (?, 'LESSON-1', 'CP-1', ?, ?, 'NUR-A', 'Nursery A', 'Nursery',
        '2026/2027', 'First Term', 3, 'SBJ0001', 'SBJ0001', 'SMS-LESSON-001',
        'elite-sms', '1.0', 'Match common colours', ?, ?, ?, 'Sort coloured bottle tops.',
        ?, ?, 'draft', 'U1')`,
    [
      BRIDGE_ID,
      SCHOOL,
      BRANCH,
      JSON.stringify(['Recognize red', 'Recognize blue']),
      JSON.stringify(['Child matches two colours']),
      JSON.stringify(['point']),
      JSON.stringify({ observation: 'teacher-check' }),
      JSON.stringify({ components: [{ template: 'matching', item_count: 6, order: 1 }] }),
    ]
  );

  staffToken = await loginAs('admin@kids.test', 'Admin@123');
});

afterAll(async () => {
  await testQuery('DELETE FROM kids_lesson_bridges WHERE id = ?', [BRIDGE_ID]);
  await testQuery('DELETE FROM kids_teacher_observations WHERE lesson_bridge_id = ?', [BRIDGE_ID]);
});

beforeEach(() => {
  getLessonContext.mockReset();
});

describe('POST /kids/observations — non-flagship SMS roster guard', () => {
  test('rejects with 422 when the child is NOT in the SMS class roster (STUDENT_NOT_FOUND)', async () => {
    // EliteSMS answers 404 STUDENT_NOT_FOUND; the client classifies that as a
    // non-retryable SMS_CONTEXT_REJECTED error.
    getLessonContext.mockRejectedValue(
      new (require('../src/services/eliteSmsClient').EliteSmsClientError)(
        'SMS_CONTEXT_REJECTED',
        'EliteSMS rejected the lesson-context request.',
        { status: 404 },
      ),
    );

    const res = await request(app)
      .post('/kids/observations')
      .set('Authorization', staffToken)
      .send(observationBody());

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('SMS_CONTEXT_REJECTED');

    // No evidence row may be persisted.
    const rows = await testQuery(
      'SELECT id FROM kids_teacher_observations WHERE lesson_bridge_id = ?',
      [BRIDGE_ID],
    );
    expect(rows).toHaveLength(0);

    // The roster authority was actually consulted with the right identity.
    expect(getLessonContext).toHaveBeenCalledTimes(1);
    expect(getLessonContext).toHaveBeenCalledWith(expect.objectContaining({
      schoolId: SCHOOL,
      classCode: 'NUR-A',
      admissionNo: 'NUR-001',
    }));
  });

  test('rejects with 503 when the EliteSMS API is unavailable (no context invented)', async () => {
    getLessonContext.mockRejectedValue(
      new (require('../src/services/eliteSmsClient').EliteSmsClientError)(
        'SMS_CONTEXT_UNAVAILABLE',
        'EliteSMS lesson context could not be reached.',
        { status: 503, retryable: false },
      ),
    );

    const res = await request(app)
      .post('/kids/observations')
      .set('Authorization', staffToken)
      .send(observationBody());

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error_code).toBe('SMS_CONTEXT_UNAVAILABLE');

    const rows = await testQuery(
      'SELECT id FROM kids_teacher_observations WHERE lesson_bridge_id = ?',
      [BRIDGE_ID],
    );
    expect(rows).toHaveLength(0);
  });

  test('creates the observation when the SMS roster confirms the child', async () => {
    getLessonContext.mockResolvedValue(smsContext());

    const res = await request(app)
      .post('/kids/observations')
      .set('Authorization', staffToken)
      .send(observationBody({ idempotency_key: 'obs-int-1' }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.child_admission_no).toBe('NUR-001');
    expect(res.body.data.lesson_bridge_id).toBe(BRIDGE_ID);

    const rows = await testQuery(
      'SELECT id, child_admission_no, lesson_id, outcome_id FROM kids_teacher_observations WHERE lesson_bridge_id = ?',
      [BRIDGE_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].child_admission_no).toBe('NUR-001');
    expect(rows[0].lesson_id).toBe('LESSON-1');
    expect(rows[0].outcome_id).toBe('CP-1');
  });
});
