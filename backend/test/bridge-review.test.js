'use strict';

/**
 * Review → approval → publish lifecycle for the ECCE lesson bridge, driven
 * through the real HTTP surface.
 *
 * Two properties are the point of this suite:
 *   1. separation of duties — a teacher drafts and submits, but only an
 *      admin/ECCE reviewer approves, publishes or recalls;
 *   2. the publish gate is server-authoritative (SRS FR-13): child visibility is
 *      refused, with the blocking list, until every evaluable gate passes.
 *
 * Bridge rows are seeded directly because bridge CREATION needs an
 * SMS-resolved context (covered by the bridge-context tests); none of the
 * review transitions below calls EliteSMS.
 */

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { testQuery } = require('./helpers/test-db');

const SCHOOL = 'SCH-TEST';
const BRANCH = 'BR-TEST';
const TEACHER = { id: 'BRIDGE-REVIEW-TEACHER', email: 'bridge.teacher@kids.test', password: 'BridgeTeacher@123' };

const READY = 'BRIDGE-REVIEW-READY'; // LESSON-1, which has a game config
const NO_GAME = 'BRIDGE-REVIEW-NO-GAME'; // LESSON-3, which has no game config
const BAD_ITEMS = 'BRIDGE-REVIEW-BAD-ITEMS'; // 12 items in a Nursery 1 band
const DRAFT = 'BRIDGE-REVIEW-DRAFT';
const FOREIGN = 'BRIDGE-REVIEW-FOREIGN'; // another school — must be invisible

const ALL_IDS = [READY, NO_GAME, BAD_ITEMS, DRAFT, FOREIGN];

function bridgeRow(id, {
  lessonId = 'LESSON-1',
  status = 'ready_for_review',
  schoolId = SCHOOL,
  ageBand = 'Nursery 1',
  itemCount = 6,
  approvedBy = null,
} = {}) {
  return {
    id,
    lesson_id: lessonId,
    outcome_id: 'CP-1',
    school_id: schoolId,
    branch_id: BRANCH,
    class_code: 'NUR-A',
    class_label: 'Nursery A',
    age_band: ageBand,
    academic_year: '2026/2027',
    term_name: 'First Term',
    week_number: 3,
    subject_id: 'SBJ0001',
    subject_code: 'SBJ0001',
    sms_lesson_id: 'SMS-LESSON-001',
    context_source: 'elite-sms',
    context_version: '1.0',
    objective: 'Match common colours',
    micro_objectives: ['Recognize red', 'Recognize blue'],
    success_evidence: ['Child matches two colours', 'Child names both colours'],
    evidence_routes: ['point'],
    concrete_experience: 'Sort coloured bottle tops.',
    assessment_plan: { observation: 'teacher-check' },
    game_plan: { components: [{ template: 'matching', item_count: itemCount, order: 1 }] },
    status,
    created_by: 'U1',
    approved_by: approvedBy,
  };
}

async function insertBridge(r) {
  await testQuery(
    `INSERT INTO kids_lesson_bridges
       (id, lesson_id, outcome_id, school_id, branch_id, class_code, class_label, age_band,
        academic_year, term_name, week_number, subject_id, subject_code, sms_lesson_id,
        context_source, context_version, objective, micro_objectives, success_evidence,
        evidence_routes, concrete_experience, assessment_plan, game_plan, status, created_by, approved_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      r.id, r.lesson_id, r.outcome_id, r.school_id, r.branch_id, r.class_code, r.class_label, r.age_band,
      r.academic_year, r.term_name, r.week_number, r.subject_id, r.subject_code, r.sms_lesson_id,
      r.context_source, r.context_version, r.objective, JSON.stringify(r.micro_objectives),
      JSON.stringify(r.success_evidence), JSON.stringify(r.evidence_routes), r.concrete_experience,
      JSON.stringify(r.assessment_plan), JSON.stringify(r.game_plan), r.status, r.created_by, r.approved_by,
    ]
  );
}

async function storedBridge(id) {
  const rows = await testQuery(
    'SELECT status, approved_by, approved_at FROM kids_lesson_bridges WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function loginAs(username, password) {
  const res = await request(app).post('/users/login').send({ username, password, school_id: SCHOOL });
  expect(res.status).toBe(200);
  return res.body.token;
}

function call(method, path, token, body) {
  const req = request(app)[method](path);
  if (token) req.set('Authorization', token);
  return body === undefined ? req : req.send(body);
}

let adminToken;
let teacherToken;

beforeAll(async () => {
  await testQuery('DELETE FROM kids_lesson_bridges WHERE id IN (?,?,?,?,?)', ALL_IDS);
  await insertBridge(bridgeRow(READY));
  await insertBridge(bridgeRow(NO_GAME, { lessonId: 'LESSON-3', status: 'approved', approvedBy: 'U1' }));
  await insertBridge(bridgeRow(BAD_ITEMS, { status: 'approved', itemCount: 12, approvedBy: 'U1' }));
  await insertBridge(bridgeRow(DRAFT, { status: 'draft' }));
  await insertBridge(bridgeRow(FOREIGN, { schoolId: 'SCH-OTHER' }));

  await testQuery('DELETE FROM users WHERE id = ?', [TEACHER.id]);
  await testQuery(
    `INSERT INTO users (id, name, email, username, password, role, user_type, school_id, branch_id, status, is_activated)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [TEACHER.id, 'Bridge Teacher', TEACHER.email, TEACHER.email, bcrypt.hashSync(TEACHER.password, 10),
      'Teacher', 'Teacher', SCHOOL, BRANCH, 'active', 1]
  );

  adminToken = await loginAs('admin@kids.test', 'Admin@123');
  teacherToken = await loginAs(TEACHER.email, TEACHER.password);
});

afterAll(async () => {
  await testQuery('DELETE FROM kids_lesson_bridges WHERE id IN (?,?,?,?,?)', ALL_IDS);
  await testQuery('DELETE FROM users WHERE id = ?', [TEACHER.id]);
});

describe('bridge review → approval → publish', () => {
  test.each([
    ['get', `/kids/lesson-bridges/${READY}/publish-gate`],
    ['post', `/kids/lesson-bridges/${READY}/approve`],
    ['post', `/kids/lesson-bridges/${READY}/publish`],
    ['post', `/kids/lesson-bridges/${READY}/recall`],
  ])('%s %s is mounted and requires authentication', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(401);
  });

  test('the author cannot approve, publish or recall their own bridge', async () => {
    for (const path of ['approve', 'publish', 'recall']) {
      const res = await call('post', `/kids/lesson-bridges/${READY}/${path}`, teacherToken);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Admin review access required.');
    }
    // ...but the teacher may still read the blockers on their own bridge
    const gate = await call('get', `/kids/lesson-bridges/${READY}/publish-gate`, teacherToken);
    expect(gate.status).toBe(200);
    expect(gate.body.data.publishable).toBe(false);
  });

  test('the gate blocks child visibility before review, with reasons', async () => {
    const res = await call('get', `/kids/lesson-bridges/${READY}/publish-gate`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.bridge_id).toBe(READY);
    expect(res.body.data.publishable).toBe(false);
    expect(res.body.data.gates.ece_reviewed).toBe(false);
    expect(res.body.data.blocking_reasons.join(' ')).toContain('ece_reviewed');
    expect(res.body.data.not_evaluated).toEqual(['safety_passed', 'story_alignment_reviewed']);
  });

  test('a draft cannot be approved', async () => {
    const res = await call('post', `/kids/lesson-bridges/${DRAFT}/approve`, adminToken);
    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('BRIDGE_STATUS_CONFLICT');
    expect(res.body.status).toBe('draft');
  });

  test('an admin approves a submitted bridge, recording the reviewer', async () => {
    const res = await call('post', `/kids/lesson-bridges/${READY}/approve`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.approved_by).toBe('U1');
    expect(res.body.gate.gates.ece_reviewed).toBe(true);
    expect(res.body.gate.gates.bridge_complete).toBe(true);
    expect(res.body.gate.publishable).toBe(true);

    const stored = await storedBridge(READY);
    expect(stored.status).toBe('approved');
    expect(stored.approved_by).toBe('U1');
    expect(stored.approved_at).toBeTruthy();
  });

  test('an approved bridge cannot be approved again', async () => {
    const res = await call('post', `/kids/lesson-bridges/${READY}/approve`, adminToken);
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('approved');
  });

  test('publishing requires approval (an approved bridge from another route is still gated)', async () => {
    const res = await call('post', `/kids/lesson-bridges/${NO_GAME}/publish`, adminToken);
    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('BRIDGE_PUBLISH_GATE_FAILED');
    expect(res.body.gates.game_present).toBe(false);
    expect(res.body.blocking_reasons.join(' ')).toContain('game_present');
    expect(res.body.publishable).toBe(false);
  });

  test('the gate enforces the band item cap, not just schema bounds', async () => {
    const res = await call('get', `/kids/lesson-bridges/${BAD_ITEMS}/publish-gate`, adminToken);
    expect(res.status).toBe(200);
    // 12 items is schema-legal (5-15) but over the early-years cap of 10.
    expect(res.body.data.gates.schema_passed).toBe(true);
    expect(res.body.data.gates.item_load_valid).toBe(false);
    expect(res.body.data.blocking_reasons.join(' ')).toContain('5-10');
  });

  test('an approved, gate-clean bridge publishes', async () => {
    const res = await call('post', `/kids/lesson-bridges/${READY}/publish`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('published');
    expect(res.body.gate.publishable).toBe(true);
    expect((await storedBridge(READY)).status).toBe('published');
  });

  test('an already published bridge cannot be published twice', async () => {
    const res = await call('post', `/kids/lesson-bridges/${READY}/publish`, adminToken);
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('published');
  });

  test('a published bridge can be recalled, and a recalled one cannot come back', async () => {
    const recalled = await call('post', `/kids/lesson-bridges/${READY}/recall`, adminToken);
    expect(recalled.status).toBe(200);
    expect(recalled.body.data.status).toBe('recalled');
    expect((await storedBridge(READY)).status).toBe('recalled');

    const again = await call('post', `/kids/lesson-bridges/${READY}/publish`, adminToken);
    expect(again.status).toBe(409);
    expect(again.body.status).toBe('recalled');

    const draft = await call('post', `/kids/lesson-bridges/${DRAFT}/recall`, adminToken);
    expect(draft.status).toBe(409);
  });

  test("another school's bridge is not reachable", async () => {
    const res = await call('get', `/kids/lesson-bridges/${FOREIGN}/publish-gate`, adminToken);
    expect(res.status).toBe(404);
  });
});
