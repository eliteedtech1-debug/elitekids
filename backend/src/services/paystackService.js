'use strict';

/**
 * Paystack gateway for EliteKids subscriptions.
 *
 * Uses the SAME platform credential as the EliteSMS app: `PAYSTACK_SECRET_KEY`
 * from this backend's .env (must be kept identical to elite-api/.env — one
 * platform key). No vendor subaccount logic is needed for platform plans.
 *
 * Only two operations are used by subscriptions:
 *   - initializeTransaction  → POST /transaction/initialize
 *   - verifyTransaction      → GET  /transaction/verify/:reference
 * plus webhook HMAC verification for the charge.success callback.
 *
 * Uses Node's global fetch (Node ≥ 18) — no extra dependency.
 */

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error('PAYSTACK_SECRET_KEY is not configured.'), { code: 'PAYSTACK_NOT_CONFIGURED' });
  }
  return key;
}

async function paystackRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new Error(json.message || `Paystack ${path} failed (HTTP ${res.status})`);
  }
  return json.data;
}

/** POST /transaction/initialize — returns { authorization_url, access_code, reference }. */
async function initializeTransaction(paymentData) {
  return paystackRequest('/transaction/initialize', { method: 'POST', body: paymentData });
}

/** GET /transaction/verify/:reference — returns the transaction object. */
async function verifyTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/**
 * Verify a Paystack webhook signature (x-paystack-signature = HMAC-SHA512 of
 * the raw request body with the secret key).
 */
async function verifyWebhookSignature(rawBody, signature) {
  const crypto = require('crypto');
  if (!rawBody || typeof signature !== 'string' || !signature) return false;
  const expected = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  PAYSTACK_BASE_URL,
};
