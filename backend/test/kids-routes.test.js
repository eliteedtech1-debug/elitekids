'use strict';

/**
 * Kids routes integration tests — lessons, progress, and approvals.
 *
 * Run: cd elite-kids/backend && npm test -- test/kids-routes.test.js
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');

afterAll(async () => {
  await closeConnections();
});

async function loginAs(username, password) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

const SCHOOL_HEADER = { 'x-school-id': 'SCH-TEST' };

// ─── Lessons ────────────────────────────────────────────────────────────────

describe('POST /kids/lessons (create lesson + enqueue generation)', () => {
  it('creates a lesson with content_state=generated for a valid teacher/admin', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/lessons')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ title: 'Animal Sounds', subject: 'Music', age_level: 'Nursery' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.content_state).toBe('generated');
    expect(res.body.data.lesson_type).toBe('game');
    expect(res.body.message).toMatch(/Generation started/);
  });

  it('rejects a lesson without required fields', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/lessons')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ title: 'Missing Subject' });

    expect(res.status).toBe(400);
  });

  it('rejects requests without auth', async () => {
    const res = await request(app)
      .post('/kids/lessons')
      .send({ title: 'No Auth', subject: 'X', age_level: 'Nursery' });

    expect(res.status).toBe(401);
  });
});

describe('GET /kids/lessons/:id/game (child-facing published content)', () => {
  it('returns the published game config JSON for a published lesson', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    // Own the fixture: LESSON-1 has multiple published adaptive-tier configs
    // (GAME-1 / T1 / T2) whose createdAt order is non-deterministic across suites
    // sharing the hermetic DB (and across seed second-boundaries). Insert our own
    // newest published config so the endpoint (order createdAt DESC) picks it.
    const fixId = `GAME-FIX-${Date.now()}`;
    await testQuery(
      `INSERT INTO kids_game_configs (id, lesson_id, template, age_level, config_json, content_state, created_by)
       VALUES (?, 'LESSON-1', 'matching', 'Nursery', ?, 'published', 'U1')
       ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), content_state = 'published'`,
      [fixId, JSON.stringify({ title: 'Owned Match Colors', pairs: [{ left: 'Red', right: '🔴' }, { left: 'Blue', right: '🔵' }] })]
    );

    const res = await request(app)
      .get('/kids/lessons/LESSON-1/game')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Owned Match Colors');
    expect(res.body.data.pairs).toHaveLength(2);
  });

  it('returns 404 for a lesson whose game config is not yet published', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/lessons/LESSON-2/game')
      .set('authorization', token);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/No published game/);
  });

  it('returns 404 for a completely unknown lesson id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/lessons/NOPE-000/game')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});

// ─── Progress ───────────────────────────────────────────────────────────────

describe('POST /kids/progress/game-complete', () => {
  it('records a new game completion', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({
        child_admission_no: 'NUR-002',
        lesson_id: 'LESSON-1',
        score: 90,
        stars_earned: 5,
        xp: 15,
        idempotency_key: 'idem-001',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.score).toBe(90);
    expect(res.body.data.idempotency_key).toBe('idem-001');
  });

  it('returns the existing record on a duplicate idempotency_key (no double count)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({
        child_admission_no: 'NUR-002',
        lesson_id: 'LESSON-1',
        score: 95,           // different score — should be ignored
        stars_earned: 6,
        xp: 20,
        idempotency_key: 'idem-001',
      });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.data.score).toBe(90);   // original score preserved
  });

  it('allows the same child+lesson with a different idempotency_key', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({
        child_admission_no: 'NUR-002',
        lesson_id: 'LESSON-1',
        score: 70,
        stars_earned: 2,
        xp: 8,
        idempotency_key: 'idem-002',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.score).toBe(70);
  });

  it('rejects a student acting on another child\'s admission_no', async () => {
    // NUR-001 is a student (ada@kids.test) — acting on NUR-002 should be blocked.
    const loginRes = await request(app)
      .post('/students/login')
      .send({ username: 'ada@kids.test', password: 'Nursery@123', school_id: 'SCH-TEST' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ child_admission_no: 'NUR-002', lesson_id: 'LESSON-1', score: 10 });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only access your own data/i);
  });

  it('requires child_admission_no and lesson_id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/progress/game-complete')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ child_admission_no: 'NUR-001' });

    expect(res.status).toBe(400);
  });
});

describe('GET /kids/progress/child/:admissionNo', () => {
  it('returns the progress summary for NUR-001', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/progress/child/NUR-001')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total_xp).toBeGreaterThanOrEqual(10);
    expect(res.body.data.total_stars).toBeGreaterThanOrEqual(3);
    expect(res.body.data.games_completed).toBeGreaterThanOrEqual(1);
  });

  it('forbids a student from viewing another child\'s progress', async () => {
    const loginRes = await request(app)
      .post('/students/login')
      .send({ username: 'ada@kids.test', password: 'Nursery@123', school_id: 'SCH-TEST' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/kids/progress/child/NUR-002')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(403);
  });
});

// ─── Approvals ──────────────────────────────────────────────────────────────

describe('GET /kids/approvals (pending review queue)', () => {
  it('lists pending approvals for the school', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/approvals')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((a) => a.status === 'pending')).toBe(true);
  });

  it('only shows approvals for the authenticated school', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/approvals')
      .set('authorization', token)
      .set({ 'x-school-id': 'SCH-KIDS' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('POST /kids/approvals/:id/decide', () => {
  it('approves an approval → flips the content to published + lesson to published', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/approvals/APPR-3/decide')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ decision: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Approved and published/);

    // Verify LESSON-2 is now published
    const lessonRes = await request(app)
      .get('/kids/lessons/LESSON-2/game')
      .set('authorization', token);
    expect(lessonRes.status).toBe(200);
    expect(lessonRes.body.data.title).toBe('Shapes Quiz');
  });

  it('rejects an already-decided approval', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    // APPR-3 was approved by the previous test, so re-deciding it must fail.
    const res = await request(app)
      .post('/kids/approvals/APPR-3/decide')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ decision: 'reject', reason: 'Changed mind' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Already reviewed/);
  });

  it('rejects with a reason flips content back to generated', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/approvals/APPR-2/decide')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ decision: 'reject', reason: 'Content needs revision' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Rejected/);
  });

  it('returns 404 for an unknown approval id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/approvals/NOPE-000/decide')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ decision: 'approve' });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid decision value', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/kids/approvals/APPR-1/decide')
      .set('authorization', token)
      .set(SCHOOL_HEADER)
      .send({ decision: 'maybe' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/approve.*reject/i);
  });
});

// ─── Scene Scripts (child-facing) ───────────────────────────────────────────

describe('GET /kids/lessons/:id/scenes (child-facing published scenes)', () => {
  it('returns published scene scripts for LESSON-1 (2 scenes)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/lessons/LESSON-1/scenes')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    const sceneTypes = res.body.data.map((s) => s.sceneType);
    expect(sceneTypes).toContain('teach');
    expect(sceneTypes).toContain('reinforce');

    const backgrounds = res.body.data.map((s) => s.background);
    expect(backgrounds).toContain('classroom');
    expect(backgrounds).toContain('playground');
  });

  it('returns 404 for a lesson with no published scenes', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/lessons/LESSON-2/scenes')
      .set('authorization', token);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/No published scenes/);
  });

  it('returns 404 for a completely unknown lesson id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/lessons/NOPE-000/scenes')
      .set('authorization', token);

    expect(res.status).toBe(404);
  });
});

// ─── Generation Job Status (teacher polling) ─────────────────────────────────

describe('GET /kids/generation-jobs/:id', () => {
  it('returns the status of a known job', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/generation-jobs/JOB-1')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('JOB-1');
    expect(res.body.data.lesson_id).toBe('LESSON-2');
    expect(res.body.data.status).toBe('queued');
    expect(res.body.data.content_type).toBe('game_config');
  });

  it('returns succeeded job status', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/generation-jobs/JOB-2')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('succeeded');
    expect(res.body.data.content_type).toBe('scene_script');
  });

  it('returns 404 for an unknown job id', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/generation-jobs/NOPE-000')
      .set('authorization', token);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Job not found/);
  });
});

describe('GET /kids/generation-jobs?lesson_id=X', () => {
  it('returns all jobs for LESSON-2', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/generation-jobs?lesson_id=LESSON-2')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((j) => j.lesson_id === 'LESSON-2')).toBe(true);
  });

  it('returns an empty list for a lesson with no jobs', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/generation-jobs?lesson_id=LESSON-3')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns all jobs when no lesson_id filter is provided', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/generation-jobs')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Lessons listing ─────────────────────────────────────────────────────────

describe('GET /kids/lessons (list)', () => {
  it('admin sees all lessons for their school', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/lessons')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // SCH-TEST has 2 lessons (LESSON-1 published + LESSON-2 generated)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .get('/kids/lessons');

    expect(res.status).toBe(401);
  });
});

// ─── Parent activities ───────────────────────────────────────────────────────

describe('GET /kids/parent/activities', () => {
  it('returns published lessons + progress for linked children', async () => {
    const token = await loginAs('parent@kids.test', 'Parent@123');
    const res = await request(app)
      .get('/kids/parent/activities')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // U2 has children linked — at least one child should appear
    if (res.body.data.length > 0) {
      const entry = res.body.data[0];
      expect(entry.child).toBeDefined();
      expect(entry.progress).toBeDefined();
      expect(entry.lessons).toBeDefined();
      expect(entry.total_published).toBeGreaterThanOrEqual(1);

      // Lesson activities should include has_games/has_scenes flags
      const lessonAct = entry.lessons.find((l) => l.id === 'LESSON-1');
      if (lessonAct) {
        expect(lessonAct.has_games).toBe(true);
        expect(lessonAct.has_scenes).toBe(true);
      }
    }
  });

  it('rejects non-parent users', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .get('/kids/parent/activities')
      .set('authorization', token)
      .set(SCHOOL_HEADER);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only parents/);
  });
});
