'use strict';

/**
 * Subscription + Paystack integration tests (Jest + Supertest).
 *
 * Flagship `elite` model school + school access (spec: FLAGSHIP-ELITE-SCHOOL-SPEC.md).
 * The Paystack gateway is MOCKED — no network calls. Covers:
 *   - public plan list with the DB-configurable prices (500 term / 1200 annual)
 *   - entitlement status: real school w/o sub → none; flagship parent → free_tier
 *   - initiate → Paystack initialize (kobo amount) + pending payment row
 *   - verify → activation, idempotent repeat, amount-mismatch guard
 *   - webhook → HMAC signature check + charge.success activation
 *
 * Run: cd elite-kids/backend && npm test -- test/subscription.test.js --runInBand
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { testQuery } = require('./helpers/test-db');
const { closeConnections } = require('./helpers/teardown');

// Mock the gateway so tests never hit Paystack. The controller destructures the
// service at require-time, so the mock must be in place before `app` is used.
jest.mock('../src/services/paystackService', () => ({
  initializeTransaction: jest.fn(),
  verifyTransaction: jest.fn(),
  verifyWebhookSignature: jest.fn(),
}));
const paystack = require('../src/services/paystackService');

process.env.PAYSTACK_SECRET_KEY = 'test-paystack-secret';

afterAll(async () => {
  await closeConnections();
});

async function loginAs(username, password, school_id) {
  const res = await request(app).post('/users/login').send({ username, password, school_id });
  expect(res.status).toBe(200);
  return res.body.token; // 'Bearer <jwt>'
}

async function loginFlagshipParent() {
  const res = await request(app)
    .post('/kids/parent/login')
    .send({ phone: '08077777777', password: 'Parent@123', school_id: 'SCH-KIDS' });
  expect(res.status).toBe(200);
  return res.body.data.token; // raw jwt
}

/** Create a flagship parent account directly in the hermetic DB (no API). */
async function seedFlagshipParent() {
  const hash = bcrypt.hashSync('Parent@123', 10);
  await testQuery(
    `INSERT INTO users (id, name, email, username, password, role, user_type, school_id, branch_id, status, is_activated)
     VALUES ('U-FLAG', 'Flag Parent', 'flag@kids.test', 'flag', ?, 'Parent', 'Parent', 'SCH-KIDS', 'BR-KIDS', 'active', 1)`,
    [hash]
  );
  await testQuery(
    `INSERT INTO parents (user_id, phone, school_id, password) VALUES ('U-FLAG', '08077777777', 'SCH-KIDS', ?)`,
    [hash]
  );
}

describe('GET /kids/subscription/plans (public)', () => {
  it('lists the seeded plans with configurable prices', async () => {
    const res = await request(app).get('/kids/subscription/plans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const byCode = Object.fromEntries(res.body.data.map((p) => [p.code, p]));
    expect(byCode.kids_free.amount_ngn).toBe(0);
    expect(byCode.kids_term.amount_ngn).toBe(500);
    expect(byCode.kids_term.billing_period).toBe('term');
    expect(byCode.kids_annual.amount_ngn).toBe(1200);
    expect(byCode.kids_annual.billing_period).toBe('annual');
  });
});

describe('GET /kids/subscription/status (entitlement)', () => {
  it('real school without a subscription → tier none', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .get('/kids/subscription/status')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST');
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
    expect(res.body.data.tier).toBe('none');
  });

  it('flagship parent without a paid subscription → tier free_tier', async () => {
    await seedFlagshipParent();
    const token = await loginFlagshipParent();
    const res = await request(app)
      .get('/kids/subscription/status')
      .set('authorization', `Bearer ${token}`)
      .set('x-school-id', 'SCH-KIDS');
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
    expect(res.body.data.tier).toBe('free_tier');
  });
});

describe('POST /kids/subscription/initiate', () => {
  beforeEach(() => {
    paystack.initializeTransaction.mockReset();
  });

  it('requires plan_code', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects an unknown plan', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .send({ plan_code: 'kids_ultra' });
    expect(res.status).toBe(404);
  });

  it('rejects the free plan (no payment needed)', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .send({ plan_code: 'kids_free' });
    expect(res.status).toBe(400);
  });

  it('initializes a Paystack transaction for a school (kobo amount) and records a pending payment', async () => {
    paystack.initializeTransaction.mockResolvedValue({
      authorization_url: 'https://checkout.paystack.com/test',
      access_code: 'testcode',
      reference: 'KIDS-TERM-TESTREF',
    });
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST')
      .send({ plan_code: 'kids_term', email: 'admin@kids.test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authorization_url).toContain('paystack.com');
    expect(res.body.data.reference).toBe('KIDS-TERM-TESTREF');
    expect(res.body.data.amount_ngn).toBe(500);

    const call = paystack.initializeTransaction.mock.calls[0][0];
    expect(call.amount).toBe(50000); // NGN 500 * 100 kobo
    expect(call.channels).toContain('card');
    expect(call.metadata.plan_code).toBe('kids_term');
    expect(call.metadata.subscriber_type).toBe('school');
    expect(call.metadata.school_id).toBe('SCH-TEST');

    const rows = await testQuery(
      `SELECT * FROM kids_payments WHERE reference = ?`,
      ['KIDS-TERM-TESTREF']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].amount_ngn).toBe(500);
  });

  it('returns 503 when PAYSTACK_SECRET_KEY is not configured', async () => {
    const err = new Error('PAYSTACK_SECRET_KEY is not configured.');
    err.code = 'PAYSTACK_NOT_CONFIGURED';
    paystack.initializeTransaction.mockRejectedValue(err);
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST')
      .send({ plan_code: 'kids_term', email: 'admin@kids.test' });
    expect(res.status).toBe(503);
  });
});

describe('POST /kids/subscription/verify', () => {
  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
  });

  it('rejects an unknown reference', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .post('/kids/subscription/verify')
      .set('authorization', token)
      .send({ reference: 'KIDS-NOPE' });
    expect(res.status).toBe(404);
  });

  it('activates the subscription on gateway success (idempotent on repeat)', async () => {
    // Initiate first (creates the pending payment row)
    paystack.initializeTransaction.mockResolvedValue({
      authorization_url: 'https://checkout.paystack.com/x',
      reference: 'KIDS-TERM-ACT1',
    });
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST')
      .send({ plan_code: 'kids_term', email: 'admin@kids.test' });

    // Verify: gateway says success, amount matches (50000 kobo == 500 NGN)
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 50000 });
    const res = await request(app)
      .post('/kids/subscription/verify')
      .set('authorization', token)
      .send({ reference: 'KIDS-TERM-ACT1' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Subscription activated.');
    expect(res.body.data.subscription.plan_code).toBe('kids_term');
    expect(res.body.data.subscription.status).toBe('active');
    expect(res.body.data.subscription.expires_at).toBeTruthy();

    const rows = await testQuery(`SELECT status FROM kids_payments WHERE reference = ?`, ['KIDS-TERM-ACT1']);
    expect(rows[0].status).toBe('success');

    // Idempotent: second verify returns already-verified without extending again
    const again = await request(app)
      .post('/kids/subscription/verify')
      .set('authorization', token)
      .send({ reference: 'KIDS-TERM-ACT1' });
    expect(again.status).toBe(200);
    expect(again.body.message).toBe('Payment already verified.');
  });

  it('rejects a gateway non-success transaction', async () => {
    paystack.initializeTransaction.mockResolvedValue({ authorization_url: 'https://checkout.paystack.com/y', reference: 'KIDS-TERM-FAIL' });
    paystack.verifyTransaction.mockResolvedValue({ status: 'failed', amount: 50000 });
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST')
      .send({ plan_code: 'kids_term', email: 'admin@kids.test' });
    const res = await request(app)
      .post('/kids/subscription/verify')
      .set('authorization', token)
      .send({ reference: 'KIDS-TERM-FAIL' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not successful/i);
  });

  it('rejects an amount mismatch (tamper guard)', async () => {
    paystack.initializeTransaction.mockResolvedValue({ authorization_url: 'https://checkout.paystack.com/z', reference: 'KIDS-TERM-TAMPER' });
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 1 }); // 1 kobo ≠ 50000
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST')
      .send({ plan_code: 'kids_term', email: 'admin@kids.test' });
    const res = await request(app)
      .post('/kids/subscription/verify')
      .set('authorization', token)
      .send({ reference: 'KIDS-TERM-TAMPER' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/amount does not match/i);
  });

  it('after payment the school entitlement becomes all_games', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .get('/kids/subscription/status')
      .set('authorization', token)
      .set('x-school-id', 'SCH-TEST');
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
    expect(res.body.data.tier).toBe('all_games');
  });
});

describe('POST /kids/paystack/webhook', () => {
  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.verifyWebhookSignature.mockReset();
  });

  it('rejects a bad HMAC signature with 401', async () => {
    paystack.verifyWebhookSignature.mockResolvedValue(false);
    const res = await request(app)
      .post('/kids/paystack/webhook')
      .set('x-paystack-signature', 'bad')
      .send({ event: 'charge.success', data: { reference: 'KIDS-TERM-ACT1' } });
    expect(res.status).toBe(401);
  });

  it('activates a subscription on a valid charge.success webhook', async () => {
    // Initiate a parent subscription (flagship parent flow)
    paystack.initializeTransaction.mockResolvedValue({
      authorization_url: 'https://checkout.paystack.com/w',
      reference: 'KIDS-ANNUAL-FLAG',
    });
    const token = await loginFlagshipParent();
    await request(app)
      .post('/kids/subscription/initiate')
      .set('authorization', `Bearer ${token}`)
      .set('x-school-id', 'SCH-KIDS')
      .send({ plan_code: 'kids_annual', email: 'flag@kids.test' });
    expect(paystack.initializeTransaction).toHaveBeenCalled();

    paystack.verifyWebhookSignature.mockResolvedValue(true);
    paystack.verifyTransaction.mockResolvedValue({ status: 'success', amount: 120000 }); // NGN 1200
    const res = await request(app)
      .post('/kids/paystack/webhook')
      .set('x-paystack-signature', 'sig')
      .send({ event: 'charge.success', data: { reference: 'KIDS-ANNUAL-FLAG' } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('activated');

    // Parent now has all_games
    const status = await request(app)
      .get('/kids/subscription/status')
      .set('authorization', `Bearer ${token}`)
      .set('x-school-id', 'SCH-KIDS');
    expect(status.body.data.active).toBe(true);
    expect(status.body.data.tier).toBe('all_games');
    expect(status.body.data.subscriber.plan_code).toBe('kids_annual');
  });
});
