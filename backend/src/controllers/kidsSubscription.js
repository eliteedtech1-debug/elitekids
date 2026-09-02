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
    status ENUM('free','trial','active','expired','cancelled') NOT NULL DEFAULT 'free',
    starts_at DATETIME NULL,
    expires_at DATETIME NULL,
    max_children INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sub_school (school_id),
    UNIQUE KEY uq_sub_parent (parent_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Pre-trial installs have the narrower enum — widen it once (checked first
  // so we don't take an ALTER lock on every boot).
  const [statusCol] = await c.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_subscriptions' AND COLUMN_NAME = 'status'`,
    { type: c.QueryTypes.SELECT }
  );
  if (statusCol && !String(statusCol.COLUMN_TYPE).includes('trial')) {
    await c.query(
      `ALTER TABLE kids_subscriptions MODIFY status ENUM('free','trial','active','expired','cancelled') NOT NULL DEFAULT 'free'`
    );
  }

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
  // kids_trial plan (drives the 14-day auto-trial) — idempotent even on DBs
  // whose plan rows were seeded by an older deploy.
  await c.query(
    `INSERT INTO kids_subscription_plans (id, code, name, amount_ngn, billing_period, currency, is_active)
     SELECT UUID(), 'kids_trial', 'Elite Kids Trial', 0, 'free', 'NGN', 1
     WHERE NOT EXISTS (SELECT 1 FROM kids_subscription_plans WHERE code = 'kids_trial')`
  );
  _schemaReady = true;
}

const FLAGSHIP_SCHOOL_ID = 'SCH-ELITE';

/* ── School access gate (login-level paywall) ──────────────────────────
 * Real schools: staff + students can only log in while the school is
 * subscribed OR inside its 14-day auto-trial (started on first login).
 * Flagship SCH-ELITE stays the FREE showcase (freemium lives there only).
 */
const TRIAL_DAYS = 14;

function isFlagshipSchoolId(schoolId) {
  return String(schoolId || '') === FLAGSHIP_SCHOOL_ID;
}

function trialExpiry(from = new Date()) {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Ensure a school has usable access and return its subscription row:
 *  - active/trial/expired rows are left as they are,
 *  - a stale 'free' row (never trialled) is upgraded to a fresh trial,
 *  - no row → flagship gets the free tier, everyone else starts a trial.
 */
async function grantSchoolAccess(schoolId) {
  await ensureSchema();
  const c = db().content;
  const sid = String(schoolId);
  const [existing] = await c.query(
    `SELECT * FROM kids_subscriptions WHERE school_id = :s LIMIT 1`,
    { replacements: { s: sid }, type: c.QueryTypes.SELECT }
  );
  if (existing) {
    if (existing.status === 'free' && !isFlagshipSchoolId(sid)) {
      await c.query(
        `UPDATE kids_subscriptions
         SET plan_code = 'kids_trial', status = 'trial', starts_at = :st, expires_at = :ex, updated_at = NOW()
         WHERE id = :id`,
        { replacements: { st: new Date(), ex: trialExpiry(), id: existing.id } }
      );
      const [updated] = await c.query(
        `SELECT * FROM kids_subscriptions WHERE id = :id LIMIT 1`,
        { replacements: { id: existing.id }, type: c.QueryTypes.SELECT }
      );
      return updated || existing;
    }
    return existing;
  }
  if (isFlagshipSchoolId(sid)) {
    await c.query(
      `INSERT INTO kids_subscriptions (id, subscriber_type, school_id, plan_code, status)
       VALUES (:id, 'school', :s, 'kids_free', 'free')`,
      { replacements: { id: crypto.randomUUID(), s: sid } }
    );
  } else {
    await c.query(
      `INSERT INTO kids_subscriptions (id, subscriber_type, school_id, plan_code, status, starts_at, expires_at)
       VALUES (:id, 'school', :s, 'kids_trial', 'trial', :st, :ex)`,
      { replacements: { id: crypto.randomUUID(), s: sid, st: new Date(), ex: trialExpiry() } }
    );
  }
  const [sub] = await c.query(
    `SELECT * FROM kids_subscriptions WHERE school_id = :s LIMIT 1`,
    { replacements: { s: sid }, type: c.QueryTypes.SELECT }
  );
  return sub || null;
}

/**
 * Plans + subscription metadata attached to paywall 403s so any client
 * (login wall, game lock screen) can render a full upsell without a
 * second round-trip.
 */
async function subscriptionUpsellPayload(schoolId) {
  try {
    const c = db().content;
    const plans = await c.query(
      `SELECT code, name, amount_ngn, billing_period, currency
       FROM kids_subscription_plans
       WHERE is_active = 1 AND billing_period <> 'free'
       ORDER BY amount_ngn ASC`,
      { type: c.QueryTypes.SELECT }
    );
    let subscription = null;
    if (schoolId) {
      const [sub] = await c.query(
        `SELECT plan_code, status, starts_at, expires_at
         FROM kids_subscriptions WHERE school_id = :s LIMIT 1`,
        { replacements: { s: String(schoolId) }, type: c.QueryTypes.SELECT }
      );
      subscription = sub || null;
    }
    return { plans: plans || [], subscription };
  } catch (err) {
    return { plans: [], subscription: null };
  }
}

/* ── Freemium allocation (spec: "5 free games, then 1 random daily") ──────
 * A non-subscribed child may play each of their FIRST FIVE distinct games
 * once. After those are used up, they get ONE random game per DAY drawn
 * from those five, playable until midnight local server time.
 * Progress rows in kids_progress are the source of truth for usage.
 */
const FREE_GAMES_LIMIT = 5;

function isStaffRole(user) {
  const role = String((user && (user.user_type || user.role)) || '').toLowerCase();
  return ['admin', 'branchadmin', 'superadmin', 'teacher'].includes(role);
}

/**
 * Resolve the freemium allocation for a child.
 * Returns { state, playedLessons, freeRemaining, dailyLessonId, dailyPlayed }.
 *   state: 'staff' | 'subscribed' | 'in_free_window' | 'daily_pick' | 'locked'
 */
async function resolveFreemium(childAdmissionNo, schoolId) {
  const c = db().content;
  // Distinct lessons this child has ever completed (ordered by first play).
  // NOTE: QueryTypes.SELECT → mysql2 resolves rows directly (not [rows]).
  const rows = await c.query(
    `SELECT lesson_id, MIN(createdAt) AS first_play
     FROM kids_progress
     WHERE child_admission_no = :adm AND school_id = :s
     GROUP BY lesson_id
     ORDER BY first_play ASC`,
    { replacements: { adm: childAdmissionNo, s: schoolId }, type: c.QueryTypes.SELECT }
  );
  const playedLessons = rows.map((r) => r.lesson_id);

  // Within the initial free window: they can still start new distinct games.
  if (playedLessons.length < FREE_GAMES_LIMIT) {
    return { state: 'in_free_window', playedLessons, freeRemaining: FREE_GAMES_LIMIT - playedLessons.length, dailyLessonId: null, dailyPlayed: false };
  }

  // Free window used up → deterministic daily pick from the first five.
  // Seeded by (child, date) so every device shows the same game for the day.
  const firstFive = playedLessons.slice(0, FREE_GAMES_LIMIT);
  const today = new Date().toISOString().slice(0, 10); // UTC date; consistent across restarts
  const seedStr = `${childAdmissionNo}:${today}`;
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const dailyLessonId = firstFive[Math.abs(h) % firstFive.length];

  // Did they already complete today's pick today?
  const played = await c.query(
    `SELECT COUNT(*) AS cnt FROM kids_progress
     WHERE child_admission_no = :adm AND school_id = :s AND lesson_id = :lid
       AND createdAt >= :dayStart AND createdAt < :dayEnd`,
    { replacements: { adm: childAdmissionNo, s: schoolId, lid: dailyLessonId, dayStart: `${today} 00:00:00`, dayEnd: `${today} 23:59:59` }, type: c.QueryTypes.SELECT }
  );
  return { state: 'daily_pick', playedLessons, freeRemaining: 0, dailyLessonId, dailyPlayed: (played?.cnt || 0) > 0 };
}

/**
 * Freemium gate for child-facing game/scenes endpoints.
 * Staff + subscribed/trial schools pass untouched. FREEMIUM IS FLAGSHIP-ONLY:
 * SCH-ELITE children get their first 5 distinct games, then one deterministic
 * random daily game from those five. Children at real schools whose trial has
 * lapsed get 403 SCHOOL_NOT_SUBSCRIBED (with upsell plans) — the school admin
 * subscribes via Paystack to restore access for everyone.
 */
async function requireKidsEntitlement(req, res, next) {
  try {
    const ent = await resolveEntitlement(req);
    req.kidsEntitlement = ent;

    const role = callerRole(req);
    const schoolId = req.user?.school_id || req.headers['x-school-id'] || null;

    // Staff are NEVER gated on content endpoints — admin/teacher tools must
    // keep working so schools can manage lessons regardless of child gating.
    if (isStaffRole(req.user)) return next();

    // PAID schools (status 'active', not expired) get full access for everyone.
    if (ent.active && ent.subscriber?.status === 'active') return next();

    // Unpaid flagship parents keep browsing access (they don't play; their
    // child's freemium quota is enforced on the child's own requests).
    if (ent.tier === 'free_tier') return next();

    // FREEMIUM: children of the FLAGSHIP showcase OR of a school still inside
    // its 14-day trial get the 5-free-games + daily-pick allocation.
    const childAdmissionNo = req.user?.admission_no || (role === 'student' ? req.user?.id : null);
    // ent.active validates expires_at (a lapsed 'trial' row must NOT re-enter freemium).
    const freemiumChild = childAdmissionNo && (isFlagshipSchoolId(schoolId) || (ent.active && ent.subscriber?.status === 'trial'));
    if (!freemiumChild) {
      const upsell = await subscriptionUpsellPayload(schoolId);
      return res.status(403).json({
        success: false,
        error_code: 'SCHOOL_NOT_SUBSCRIBED',
        message: 'Your school\'s EliteKids access has ended. Ask your school admin to subscribe to keep playing.',
        ...upsell,
      });
    }

    const alloc = await resolveFreemium(childAdmissionNo, schoolId);
    const lessonId = req.params.id;
    const meta = { error_code: 'SUBSCRIPTION_REQUIRED', free_limit: FREE_GAMES_LIMIT, ...alloc };

    if (alloc.state === 'in_free_window') return next(); // still consuming the free five
    if (alloc.state === 'daily_pick' && lessonId === alloc.dailyLessonId && !alloc.dailyPlayed) return next(); // today's free game

    // Locked: free window used and this isn't today's pick (or already played today).
    const message = alloc.state === 'daily_pick' && lessonId === alloc.dailyLessonId
      ? "You've played today's free game! Come back tomorrow, or ask your parents to subscribe for all games."
      : 'Free games used up! Subscribe to unlock all games, or come back tomorrow for your daily free game.';
    return res.status(403).json({ success: false, ...meta, message });
  } catch (err) {
    console.error('requireKidsEntitlement error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to check subscription.' });
  }
}

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
  // 'trial' counts as usable access (it expires via expires_at below).
  if (sub.status !== 'active' && sub.status !== 'trial') return false;
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
/* requireKidsEntitlement now lives above (freemium-aware). */

/**
 * POST /kids/subscription/public-initiate — start Paystack checkout WITHOUT a
 * session. Used by the login wall: the school admin isn't logged in yet (their
 * school is locked out), so the plan code + school identity come from the body
 * and are validated against school_setup before a transaction is created.
 */
async function publicInitiate(req, res) {
  try {
    await ensureSchema();
    const { plan_code, email, school_id, short_name, callback_url } = req.body || {};
    if (!plan_code) {
      return res.status(400).json({ success: false, message: 'plan_code is required.' });
    }
    const plan = await planByCode(String(plan_code));
    if (!plan || plan.billing_period === 'free') {
      return res.status(400).json({ success: false, message: 'Choose a paid plan to subscribe.' });
    }

    let schoolId = school_id ? String(school_id) : null;
    if (!schoolId && short_name) {
      const [row] = await db().sequelize.query(
        `SELECT school_id FROM school_setup WHERE short_name = :sn AND LOWER(status) = 'active' LIMIT 1`,
        { replacements: { sn: String(short_name) }, type: db().sequelize.QueryTypes.SELECT }
      );
      schoolId = row?.school_id || null;
    }
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'school_id or short_name is required.' });
    }
    if (isFlagshipSchoolId(schoolId)) {
      return res.status(400).json({ success: false, message: 'The flagship school is already on the free showcase tier.' });
    }

    const sub = await grantSchoolAccess(schoolId);
    if (!sub) {
      return res.status(400).json({ success: false, message: 'Could not resolve the school subscription.' });
    }

    const payerEmail = String(email || '').trim();
    if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      return res.status(400).json({ success: false, message: 'A valid email is required for payment.' });
    }

    const reference = `KIDS-${plan.code.toUpperCase()}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const txn = await initializeTransaction({
      amount: plan.amount_ngn * 100, // kobo
      email: payerEmail,
      reference,
      callback_url: callback_url || `${process.env.APP_URL || 'https://elitekids.com.ng'}/login?sub=success`,
      metadata: {
        plan_code: plan.code,
        plan_name: plan.name,
        billing_period: plan.billing_period,
        subscriber_type: 'school',
        school_id: schoolId,
        subscription_id: sub.id,
      },
      channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    });

    await db().content.query(
      `INSERT INTO kids_payments (id, subscription_id, reference, plan_code, amount_ngn, status, gateway)
       VALUES (:id, :sub, :ref, :plan, :amt, 'pending', 'paystack')`,
      { replacements: { id: crypto.randomUUID(), sub: sub.id, ref: txn.reference || reference, plan: plan.code, amt: plan.amount_ngn } }
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
    console.error('publicInitiate error:', err.message);
    if (err.code === 'PAYSTACK_NOT_CONFIGURED') {
      return res.status(503).json({ success: false, message: 'Payments are not configured yet.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to initialize payment.', error: err.message });
  }
}

/**
 * POST /kids/subscription/public-verify — { reference } → activate without a
 * session (login-wall callback). Same activation path as /verify.
 */
async function publicVerify(req, res) {
  try {
    const { reference } = req.body || {};
    if (!reference) {
      return res.status(400).json({ success: false, message: 'reference is required.' });
    }
    const result = await activateByReference(String(reference));
    return res.json({
      success: true,
      message: result.already ? 'Payment already verified.' : 'Subscription activated — you can log in now!',
      data: { subscription: result.subscription },
    });
  } catch (err) {
    console.error('publicVerify error:', err.message);
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
  grantSchoolAccess,
  subscriptionUpsellPayload,
  publicInitiate,
  publicVerify,
  isFlagshipSchoolId,
  TRIAL_DAYS,
};
