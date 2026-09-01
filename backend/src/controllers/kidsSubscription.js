'use strict';

/**
 * EliteKids subscriptions — flagship `elite` model school + school access.
 *
 * Access rule (spec C.1):
 *   - Real schools: every child who wants series needs the SCHOOL subscribed.
 *   - Flagship `elite` (SCH-ELITE): parents without a school self-register,
 *     get a FREE tier (limited games), and subscribe for all games.
 *
 * Pricing (spec C.2, DB-configurable): kids_term = NGN 500, kids_annual = NGN 1 200.
 * Payments go through Paystack with the SAME PAYSTACK_SECRET_KEY as the
 * EliteSMS app (one platform key).
 *
 * Tables (all created in the CONTENT DB — kids-owned, never the shared DB):
 *   kids_subscription_plans, kids_subscriptions, kids_payments
 */
const crypto = require('crypto');
const db = () => require('../models');
const { initializeTransaction, verifyTransaction, verifyWebhookSignature } = require('../services/paystackService');

let _schemaReady = false;

async function ensureSchema() {
  if (_schemaReady) return;
  const c = db().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_subscription_plans (
    id CHAR(36) NOT NULL PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    amount_ngn INT NOT NULL,
    billing_period ENUM('term','annual','free') NOT NULL DEFAULT 'term',
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await c.query(`CREATE TABLE IF NOT EXISTS kids_subscriptions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    subscriber_type ENUM('school','parent') NOT NULL,
    school_id VARCHAR(20) NULL,
    parent_user_id VARCHAR(50) NULL,
    plan_code VARCHAR(30) NOT NULL,
    status ENUM('free','active','expired','cancelled') NOT NULL DEFAULT 'free',
    starts_at DATETIME NULL,
    expires_at DATETIME NULL,
    max_children INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sub_school (school_id),
    UNIQUE KEY uq_sub_parent (parent_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await c.query(`CREATE TABLE IF NOT EXISTS kids_payments (
    id CHAR(36) NOT NULL PRIMARY KEY,
    subscription_id CHAR(36) NOT NULL,
    reference VARCHAR(100) NOT NULL UNIQUE,
    plan_code VARCHAR(30) NOT NULL,
    amount_ngn INT NOT NULL,
    status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
    gateway VARCHAR(20) NOT NULL DEFAULT 'paystack',
    gateway_response JSON NULL,
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Seed default plans (idempotent; prices are DB-configurable — change with an
  // UPDATE, no deploy).
  const [planCount] = await c.query(
    `SELECT COUNT(*) AS n FROM kids_subscription_plans`,
    { type: c.QueryTypes.SELECT }
  );
  if (!planCount || !Number(planCount.n)) {
    await c.query(
      `INSERT INTO kids_subscription_plans (id, code, name, amount_ngn, billing_period, currency, is_active) VALUES
       (UUID(), 'kids_free',   'Elite Kids Free',    0,    'free',   'NGN', 1),
       (UUID(), 'kids_term',   'Elite Kids Term',    500,  'term',   'NGN', 1),
       (UUID(), 'kids_annual', 'Elite Kids Annual',  1200, 'annual', 'NGN', 1)`
    );
  }
  _schemaReady = true;
}

const FLAGSHIP_SCHOOL_ID = 'SCH-ELITE';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function callerRole(req) {
  return String((req.user && (req.user.user_type || req.user.role)) || '').toLowerCase();
}

function isStaff(req) {
  return ['admin', 'branchadmin', 'superadmin', 'teacher'].includes(callerRole(req));
}

function planTermMonths(plan) {
  return plan && plan.billing_period === 'annual' ? 12 : 3; // term ≈ one school term
}

function computeExpiry(plan, from = new Date()) {
  const end = new Date(from);
  end.setMonth(end.getMonth() + planTermMonths(plan));
  return end;
}

async function planByCode(code) {
  await ensureSchema();
  const [plan] = await db().content.query(
    `SELECT * FROM kids_subscription_plans WHERE code = :code AND is_active = 1 LIMIT 1`,
    { replacements: { code }, type: db().content.QueryTypes.SELECT }
  );
  return plan || null;
}

/** Get (or lazily create) the subscription row for a school or flagship parent. */
async function getOrCreateSubscription({ schoolId, parentUserId }) {
  await ensureSchema();
  const c = db().content;
  let sub = null;
  if (schoolId) {
    [sub] = await c.query(
      `SELECT * FROM kids_subscriptions WHERE school_id = :s LIMIT 1`,
      { replacements: { s: schoolId }, type: c.QueryTypes.SELECT }
    );
    if (!sub) {
      await c.query(
        `INSERT INTO kids_subscriptions (id, subscriber_type, school_id, plan_code, status)
         VALUES (:id, 'school', :s, 'kids_free', 'free')`,
        { replacements: { id: crypto.randomUUID(), s: schoolId } }
      );
      [sub] = await c.query(
        `SELECT * FROM kids_subscriptions WHERE school_id = :s LIMIT 1`,
        { replacements: { s: schoolId }, type: c.QueryTypes.SELECT }
      );
    }
  } else if (parentUserId) {
    [sub] = await c.query(
      `SELECT * FROM kids_subscriptions WHERE parent_user_id = :p LIMIT 1`,
      { replacements: { p: parentUserId }, type: c.QueryTypes.SELECT }
    );
    if (!sub) {
      await c.query(
        `INSERT INTO kids_subscriptions (id, subscriber_type, parent_user_id, plan_code, status)
         VALUES (:id, 'parent', :p, 'kids_free', 'free')`,
        { replacements: { id: crypto.randomUUID(), p: parentUserId } }
      );
      [sub] = await c.query(
        `SELECT * FROM kids_subscriptions WHERE parent_user_id = :p LIMIT 1`,
        { replacements: { p: parentUserId }, type: c.QueryTypes.SELECT }
      );
    }
  }
  return sub;
}

function subIsActive(sub) {
  if (!sub) return false;
  if (sub.status !== 'active') return false;
  if (sub.expires_at) {
    const exp = new Date(sub.expires_at);
    if (!Number.isNaN(exp.getTime()) && exp < new Date()) return false;
  }
  return true;
}

/** Resolve the effective entitlement for a caller (school staff or flagship parent). */
async function resolveEntitlement(req) {
  await ensureSchema();
  const user = req.user || {};
  const schoolId = user.school_id || req.headers['x-school-id'] || null;
  const role = callerRole(req);
  const isFlagshipParent = role === 'parent' && schoolId === FLAGSHIP_SCHOOL_ID;

  let sub = null;
  if (isFlagshipParent) {
    sub = await getOrCreateSubscription({ parentUserId: user.id });
  } else if (schoolId) {
    sub = await getOrCreateSubscription({ schoolId });
  }

  const active = subIsActive(sub);
  const plan = sub ? await planByCode(sub.plan_code) : null;
  return {
    subscriber: sub
      ? { type: sub.subscriber_type, plan_code: sub.plan_code, status: sub.status, expires_at: sub.expires_at }
      : null,
    active,
    tier: active ? 'all_games' : isFlagshipParent ? 'free_tier' : 'none',
  };
}

/* ── Handlers ────────────────────────────────────────────────────────── */

/** GET /kids/subscription/plans — public plan + price list. */
async function listPlans(req, res) {
  try {
    await ensureSchema();
    const plans = await db().content.query(
      `SELECT code, name, amount_ngn, billing_period, currency
       FROM kids_subscription_plans WHERE is_active = 1 ORDER BY amount_ngn ASC`,
      { type: db().content.QueryTypes.SELECT }
    );
    return res.json({ success: true, data: plans });
  } catch (err) {
    console.error('listPlans error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load subscription plans.' });
  }
}

/** GET /kids/subscription/status — entitlement for the caller. */
async function getStatus(req, res) {
  try {
    const entitlement = await resolveEntitlement(req);
    return res.json({ success: true, data: entitlement });
  } catch (err) {
    console.error('getStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load subscription status.' });
  }
}

/** POST /kids/subscription/initiate — { plan_code } → Paystack popup. */
async function initiate(req, res) {
  try {
    await ensureSchema();
    const { plan_code, email, callback_url } = req.body || {};
    if (!plan_code) {
      return res.status(400).json({ success: false, message: 'plan_code is required.' });
    }
    const plan = await planByCode(String(plan_code));
    if (!plan) {
      return res.status(404).json({ success: false, message: `Unknown or inactive plan: ${plan_code}` });
    }
    if (plan.billing_period === 'free') {
      return res.status(400).json({ success: false, message: 'The free tier needs no payment.' });
    }

    const user = req.user || {};
    const schoolId = user.school_id || req.headers['x-school-id'] || null;
    const isFlagshipParent = !isStaff(req) && callerRole(req) === 'parent' && schoolId === FLAGSHIP_SCHOOL_ID;

    const subscriber = isFlagshipParent
      ? await getOrCreateSubscription({ parentUserId: user.id })
      : schoolId
        ? await getOrCreateSubscription({ schoolId })
        : null;
    if (!subscriber) {
      return res.status(400).json({ success: false, message: 'Could not determine subscription scope (school or flagship parent).' });
    }

    const payerEmail = String(email || user.email || '').trim();
    if (!payerEmail) {
      return res.status(400).json({ success: false, message: 'email is required for payment.' });
    }

    const reference = `KIDS-${plan.code.toUpperCase()}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const paymentData = {
      amount: plan.amount_ngn * 100, // kobo
      email: payerEmail,
      reference,
      callback_url: callback_url || `${process.env.APP_URL || 'https://elitekids.com.ng'}/subscription/callback`,
      metadata: {
        plan_code: plan.code,
        plan_name: plan.name,
        billing_period: plan.billing_period,
        subscriber_type: subscriber.subscriber_type,
        school_id: subscriber.school_id || null,
        parent_user_id: subscriber.parent_user_id || null,
        subscription_id: subscriber.id,
      },
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    };

    const txn = await initializeTransaction(paymentData);

    await db().content.query(
      `INSERT INTO kids_payments (id, subscription_id, reference, plan_code, amount_ngn, status, gateway)
       VALUES (:id, :sub, :ref, :plan, :amt, 'pending', 'paystack')`,
      { replacements: { id: crypto.randomUUID(), sub: subscriber.id, ref: txn.reference || reference, plan: plan.code, amt: plan.amount_ngn } }
    );

    return res.json({
      success: true,
      message: 'Payment initialized.',
      data: {
        authorization_url: txn.authorization_url,
        access_code: txn.access_code || null,
        reference: txn.reference || reference,
        plan_code: plan.code,
        amount_ngn: plan.amount_ngn,
      },
    });
  } catch (err) {
    console.error('initiate error:', err.message);
    if (err.code === 'PAYSTACK_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: 'Payments are not configured yet.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to initialize payment.', error: err.message });
  }
}

/**
 * Activate a subscription from a verified Paystack transaction.
 * Shared by POST /verify (user session) and the webhook. Idempotent.
 */
async function activateByReference(reference, { via } = {}) {
  await ensureSchema();
  const [payment] = await db().content.query(
    `SELECT * FROM kids_payments WHERE reference = :ref LIMIT 1`,
    { replacements: { ref: reference }, type: db().content.QueryTypes.SELECT }
  );
  if (!payment) {
    const err = new Error('Unknown payment reference.');
    err.code = 'UNKNOWN_REFERENCE';
    throw err;
  }
  if (payment.status === 'success') {
    const [sub] = await db().content.query(
      `SELECT * FROM kids_subscriptions WHERE id = :id LIMIT 1`,
      { replacements: { id: payment.subscription_id }, type: db().content.QueryTypes.SELECT }
    );
    return { already: true, subscription: sub, payment };
  }

  const txn = await verifyTransaction(reference);
  if (txn.status !== 'success') {
    const err = new Error('Payment not successful on gateway.');
    err.code = 'GATEWAY_NOT_SUCCESS';
    throw err;
  }
  // Amount-match guard: gateway amount (kobo) must equal the plan price.
  if (Number(txn.amount) !== Number(payment.amount_ngn) * 100) {
    const err = new Error('Payment amount does not match the plan price.');
    err.code = 'AMOUNT_MISMATCH';
    throw err;
  }

  const plan = await planByCode(payment.plan_code);
  const effPlan = plan || { code: 'kids_term', billing_period: 'term' };

  const [sub] = await db().content.query(
    `SELECT * FROM kids_subscriptions WHERE id = :id LIMIT 1`,
    { replacements: { id: payment.subscription_id }, type: db().content.QueryTypes.SELECT }
  );
  const startsAt = sub && subIsActive(sub) && sub.expires_at ? new Date(sub.expires_at) : new Date();
  const expiresAt = computeExpiry(effPlan, startsAt);

  await db().content.query(
    `UPDATE kids_subscriptions
     SET plan_code = :code, status = 'active', starts_at = :st, expires_at = :ex, updated_at = NOW()
     WHERE id = :id`,
    { replacements: { code: effPlan.code, st: startsAt, ex: expiresAt, id: payment.subscription_id } }
  );
  await db().content.query(
    `UPDATE kids_payments SET status = 'success', gateway_response = :resp, paid_at = NOW() WHERE reference = :ref`,
    { replacements: { resp: JSON.stringify(txn), ref: reference } }
  );

  const [updated] = await db().content.query(
    `SELECT * FROM kids_subscriptions WHERE id = :id LIMIT 1`,
    { replacements: { id: payment.subscription_id }, type: db().content.QueryTypes.SELECT }
  );
  return { already: false, subscription: updated, payment };
}

/** POST /kids/subscription/verify — { reference } → activate on success. */
async function verify(req, res) {
  try {
    const { reference } = req.body || {};
    if (!reference) {
      return res.status(400).json({ success: false, message: 'reference is required.' });
    }
    const result = await activateByReference(String(reference));
    return res.json({
      success: true,
      message: result.already ? 'Payment already verified.' : 'Subscription activated.',
      data: { subscription: result.subscription },
    });
  } catch (err) {
    console.error('verify error:', err.message);
    if (err.code === 'PAYSTACK_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: 'Payments are not configured yet.' });
    }
    if (err.code === 'UNKNOWN_REFERENCE') {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.code === 'AMOUNT_MISMATCH') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.code === 'GATEWAY_NOT_SUCCESS') {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to verify payment.', error: err.message });
  }
}

/** POST /kids/paystack/webhook — gateway callback (no user session). */
async function webhook(req, res) {
  try {
    await ensureSchema();
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const ok = await verifyWebhookSignature(rawBody, signature);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid signature.' });
    }
    const event = req.body || {};
    if (event.event !== 'charge.success') {
      return res.json({ status: 'ignored' });
    }
    const d = event.data || {};
    const reference = d.reference || (d.metadata && d.metadata.reference);
    if (!reference) {
      return res.json({ status: 'ignored', reason: 'no reference' });
    }
    const result = await activateByReference(String(reference), { via: 'webhook' });
    return res.json({ status: result.already ? 'already_verified' : 'activated' });
  } catch (err) {
    console.error('webhook error:', err.message);
    if (err.code === 'UNKNOWN_REFERENCE') {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Webhook processing failed.' });
  }
}

/** Entitlement guard used by series/game routes (see spec C.1). */
async function requireKidsEntitlement(req, res, next) {
  try {
    const ent = await resolveEntitlement(req);
    req.kidsEntitlement = ent;
    if (ent.tier === 'none') {
      return res.status(403).json({
        success: false,
        error_code: 'SUBSCRIPTION_REQUIRED',
        message: 'This school needs an EliteKids subscription to access games.',
      });
    }
    return next();
  } catch (err) {
    console.error('requireKidsEntitlement error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to check subscription.' });
  }
}

module.exports = {
  ensureSchema,
  listPlans,
  getStatus,
  initiate,
  verify,
  webhook,
  requireKidsEntitlement,
  resolveEntitlement,
  getOrCreateSubscription,
  subIsActive,
  activateByReference,
};
