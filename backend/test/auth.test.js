'use strict';

/**
 * Auth integration tests (Jest + Supertest) — port-verification for the
 * elite-cbt-api auth routes running against the hermetic test DB.
 *
 * Run: cd elite-kids/backend && npm test -- test/auth.test.js
 */
const request = require('supertest');
const app = require('../src/app');
const { testQuery } = require('./helpers/test-db');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

describe('POST /users/login', () => {
  it('logs in an Admin with correct credentials (school scoped)', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'admin@kids.test', password: 'Admin@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toMatch(/^Bearer /);
    expect(res.body.user.user_type).toBe('Admin');
    expect(res.body.user.school_id).toBe('SCH-TEST');
  });

  it('resolves the school by short_name instead of school_id', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'admin@kids.test', password: 'Admin@123', short_name: 'testkids' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.school_id).toBe('SCH-TEST');
  });

  it('rejects a wrong password with 400', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'admin@kids.test', password: 'wrong', school_id: 'SCH-TEST' });

    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();
  });

  it('rejects an unknown email with 404', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'ghost@kids.test', password: 'Admin@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(404);
    expect(res.body.errors.username).toBeDefined();
  });

  it('rejects an unknown/inactive school with 400 school error', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'admin@kids.test', password: 'Admin@123', school_id: 'SCH-DOES-NOT-EXIST' });

    expect(res.status).toBe(400);
    expect(res.body.school).toBe('School not found or inactive.');
  });

  it('logs in a Parent via the parents table (email path)', async () => {
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'parent@kids.test', password: 'Parent@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(String(res.body.user.user_type).toLowerCase()).toBe('parent');
    expect(res.body.user.id).toBe('U2');
  });

  it('returns school selection for multi-school accounts (no school scoping)', async () => {
    // No school_id/short_name → the account exists in 2 schools, so the API
    // returns the school list + a selection token instead of logging in.
    const res = await request(app)
      .post('/users/login')
      .send({ username: 'multi@kids.test', password: 'Multi@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requires_school_selection).toBe(true);
    expect(res.body.schools).toHaveLength(2);
    expect(res.body.selection_token).toBeDefined();
  });

  it('requires username + password (400)', async () => {
    const res = await request(app).post('/users/login').send({ school_id: 'SCH-TEST' });
    expect(res.status).toBe(400);
    expect(res.body.errors.username).toBeDefined();
  });
});

describe('POST /students/login', () => {
  it('logs in a student by admission_no (tablet mode)', async () => {
    const res = await request(app)
      .post('/students/login')
      .send({ username: 'NUR-001', password: 'Nursery@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toMatch(/^Bearer /);
    expect(res.body.user.admission_no).toBe('NUR-001');
  });

  it('logs in a student by email (flagship practice path)', async () => {
    const res = await request(app)
      .post('/students/login')
      .send({ username: 'ada@kids.test', password: 'Nursery@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects an unknown admission number with 404', async () => {
    const res = await request(app)
      .post('/students/login')
      .send({ username: 'NOPE-999', password: 'Nursery@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(404);
  });

  it('uses the shared EliteSMS password until a Kids-local password is set', async () => {
    const parent = await request(app)
      .post('/users/login')
      .send({ username: 'parent@kids.test', password: 'Parent@123', school_id: 'SCH-TEST' });
    expect(parent.status).toBe(200);

    const before = await testQuery(
      `SELECT password_hash FROM kids_children WHERE admission_no = ? AND school_id = ?`,
      ['NUR-001', 'SCH-TEST']
    );
    expect(before).toHaveLength(1);
    expect(before[0].password_hash).toBeNull();

    try {
      const update = await request(app)
        .put('/kids/children/NUR-001')
        .set('authorization', parent.body.token)
        .send({ new_password: 'KidsOnly@456' });
      expect(update.status).toBe(200);
      expect(update.body.data.password_hash).toBeUndefined();

      // The local password is authoritative inside EliteKids.
      const oldLogin = await request(app)
        .post('/students/login')
        .send({ username: 'NUR-001', password: 'Nursery@123', school_id: 'SCH-TEST' });
      expect(oldLogin.status).toBe(400);

      const localLogin = await request(app)
        .post('/students/login')
        .send({ username: 'NUR-001', password: 'KidsOnly@456', school_id: 'SCH-TEST' });
      expect(localLogin.status).toBe(200);
      expect(localLogin.body.user.password_hash).toBeUndefined();
      expect(localLogin.body.user.password).toBeUndefined();
    } finally {
      await testQuery(
        `UPDATE kids_children SET password_hash = NULL WHERE admission_no = ? AND school_id = ?`,
        ['NUR-001', 'SCH-TEST']
      );
    }
  });

  it('logs in a Kids-only child with a local password', async () => {
    const res = await request(app)
      .post('/students/login')
      .send({ username: 'REVIEW-001', password: 'ReviewChild@123', school_id: 'SCH-TEST' });

    expect(res.status).toBe(200);
    expect(res.body.user.admission_no).toBe('REVIEW-001');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects a wrong password with 400', async () => {
    const res = await request(app)
      .post('/students/login')
      .send({ username: 'NUR-001', password: 'wrong', school_id: 'SCH-TEST' });

    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();
  });
});

describe('POST /superadmin-login', () => {
  it('logs in a superadmin', async () => {
    const res = await request(app)
      .post('/superadmin-login')
      .send({ username: 'superadmin', password: 'Super@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.user_type).toBe('superadmin');
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/superadmin-login')
      .send({ username: 'superadmin', password: 'wrong' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown superadmin', async () => {
    const res = await request(app)
      .post('/superadmin-login')
      .send({ username: 'nope', password: 'Super@123' });
    expect(res.status).toBe(404);
  });
});

describe('POST /auth/parent-signup', () => {
  it('creates a parent account with the shared-schema-compatible fields', async () => {
    const res = await request(app)
      .post('/auth/parent-signup')
      .send({
        name: 'New Test Parent',
        email: 'new.parent@kids.test',
        phone: '08077778888',
        password: 'NewParent@123',
        school_id: 'SCH-TEST',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.user_type).toBe('parent');
    expect(res.body.user.phone).toBe('+2348077778888');

    const rows = await testQuery(
      `SELECT u.email, u.user_type, p.phone, p.school_id
       FROM users u JOIN parents p ON p.user_id = u.id
       WHERE u.email = ?`,
      ['new.parent@kids.test'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_type).toBe('Parent');
    expect(rows[0].phone).toBe('+2348077778888');
    expect(rows[0].school_id).toBe('SCH-TEST');
  });

  it('rejects duplicate parent phone numbers', async () => {
    const res = await request(app)
      .post('/auth/parent-signup')
      .send({
        name: 'Duplicate Parent',
        email: 'duplicate.parent@kids.test',
        phone: '08012345678',
        password: 'NewParent@123',
        school_id: 'SCH-TEST',
      });

    expect(res.status).toBe(409);
  });
});

describe('GET /verify-token', () => {
  async function loginAs(username, password, school_id) {
    const res = await request(app)
      .post('/users/login')
      .send({ username, password, school_id });
    return res.body.token; // 'Bearer <jwt>'
  }

  it('returns the full session for a valid admin token', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app).get('/verify-token').set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe('U1');
    expect(res.body.user_type).toBe('Admin');
    expect(res.body.school.school_id).toBe('SCH-TEST');
    expect(res.body.school.kids_stand_alone).toBe(1);
    // auxiliary tables don't exist in the test DB — safeQuery returns []
    expect(res.body.classes).toEqual([]);
  });

  it('accepts a token signed by elite-api (same shared secret, same payload shape)', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: 'U1', user_type: 'Admin', email: 'admin@kids.test', school_id: 'SCH-TEST', branch_id: 'BR-TEST' },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '1h' }
    );
    const res = await request(app).get('/verify-token').set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe('U1');
  });

  it('returns 401 for a garbage token', async () => {
    const res = await request(app).get('/verify-token').set('authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });

  it('returns 401 without an authorization header', async () => {
    const res = await request(app).get('/verify-token');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/forgot-password + /auth/reset-password', () => {
  it('answers the same generic message for known and unknown emails (no enumeration)', async () => {
    const known = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'admin@kids.test', school_id: 'SCH-TEST' });
    const unknown = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'ghost@kids.test', school_id: 'SCH-TEST' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets the password with the OTP, then the new password logs in', async () => {
    // 1) Request reset → API writes OTP to password_reset_tokens
    await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'admin@kids.test', school_id: 'SCH-TEST' });

    // 2) Read the OTP the API generated (integration: same DB the API writes to)
    const rows = await testQuery(
      `SELECT otp_code FROM password_reset_tokens WHERE contact = ? AND school_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
      ['admin@kids.test', 'SCH-TEST']
    );
    expect(rows.length).toBe(1);
    const otp = rows[0].otp_code;

    // 3) Reset with OTP
    const reset = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'admin@kids.test', otp_code: otp, new_password: 'NewPass@456', school_id: 'SCH-TEST' });
    expect(reset.status).toBe(200);
    expect(reset.body.success).toBe(true);

    // 4) Old password no longer works; new one does
    const oldLogin = await request(app)
      .post('/users/login')
      .send({ username: 'admin@kids.test', password: 'Admin@123', school_id: 'SCH-TEST' });
    expect(oldLogin.status).toBe(400);

    const newLogin = await request(app)
      .post('/users/login')
      .send({ username: 'admin@kids.test', password: 'NewPass@456', school_id: 'SCH-TEST' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.success).toBe(true);

    // Restore the fixture password so later test files see the original state
    // (tests share one seeded DB across files under --runInBand).
    await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'admin@kids.test', school_id: 'SCH-TEST' });
    const rows2 = await testQuery(
      `SELECT otp_code FROM password_reset_tokens WHERE contact = ? AND school_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
      ['admin@kids.test', 'SCH-TEST']
    );
    const restore = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'admin@kids.test', otp_code: rows2[0].otp_code, new_password: 'Admin@123', school_id: 'SCH-TEST' });
    expect(restore.status).toBe(200);
  });

  it('rejects an invalid OTP', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'admin@kids.test', otp_code: '000000', new_password: 'Whatever@1', school_id: 'SCH-TEST' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or expired OTP.');
  });
});
