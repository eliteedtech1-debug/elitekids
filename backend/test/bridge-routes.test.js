'use strict';

/**
 * Route-surface guard — the ECCE bridge authoring + evidence routes must stay
 * mounted on the real HTTP surface.
 *
 * Why this exists: the bridge, lesson-context and observation controllers were
 * implemented but never mounted in `src/routes/kids.js`, so every call fell
 * through to Express's own 404 and the whole teacher bridge write path (plus the
 * SMS roster guard behind POST /kids/observations) was unreachable in
 * production — while the service-level unit tests stayed green.
 *
 * An unmounted path 404s *before* any route middleware runs, so a 401 without a
 * token is the proof that a route exists. The staff assertions below then prove
 * the handler itself is wired (a controller-shaped JSON error, not a bare 404).
 */

const request = require('supertest');
const app = require('../src/app');

const SCHOOL = 'SCH-TEST';

// [method, path] for the teacher bridge write path + evidence surface.
const ROUTES = [
  ['get', '/kids/sms/lesson-context'],
  ['get', '/kids/learning-outcomes'],
  ['get', '/kids/lesson-bridges'],
  ['post', '/kids/lesson-bridges'],
  ['get', '/kids/lesson-bridges/BRIDGE-ROUTE-PROBE'],
  ['patch', '/kids/lesson-bridges/BRIDGE-ROUTE-PROBE'],
  ['post', '/kids/lesson-bridges/BRIDGE-ROUTE-PROBE/submit-review'],
  ['post', '/kids/observations'],
  ['get', '/kids/observations'],
  ['patch', '/kids/observations/OBS-ROUTE-PROBE'],
  ['get', '/kids/learning-summary/NUR-001'],
];

async function loginAs(username, password) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id: SCHOOL });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('ECCE bridge route surface', () => {
  test.each(ROUTES)('%s %s is mounted and requires authentication', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(401);
  });

  describe('as staff', () => {
    let token;

    beforeAll(async () => {
      token = await loginAs('admin@kids.test', 'Admin@123');
    });

    test('GET /kids/learning-outcomes reaches the controller', async () => {
      const res = await request(app).get('/kids/learning-outcomes').set('Authorization', token);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /kids/lesson-bridges reaches the controller', async () => {
      const res = await request(app).get('/kids/lesson-bridges').set('Authorization', token);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('POST /kids/lesson-bridges runs the bridge validation path (never a bare 404)', async () => {
      const res = await request(app)
        .post('/kids/lesson-bridges')
        .set('Authorization', token)
        .send({});
      expect(res.status).not.toBe(404);
      // Validation failure or the fail-closed SMS-context refusal — either way a
      // controller-shaped response, not Express's route-not-found.
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeTruthy();
    });
  });
});
