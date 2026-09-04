'use strict';

/**
 * Monnify payment gateway — alternative to Paystack for EliteKids marketplace
 * purchases (Q4 §2.13). Follows the same conventions as paystackService.js.
 *
 * Requires backend/.env:
 *   MONNIFY_SECRET_KEY  (live/private API key)
 *   MONNIFY_PUBLIC_KEY  (used to derive contract code / display)
 *   MONNIFY_CONTRACT_CODE
 *   MONNIFY_BASE_URL    (default https://api.monnify.com)
 *
 * FAILS OPEN: throws { code: 'MONNIFY_NOT_CONFIGURED' } if any required env
 * key is missing, so a misconfiguration can never break the marketplace paywall.
 */

const MONNIFY_BASE_URL = (process.env.MONNIFY_BASE_URL || 'https://api.monnify.com').replace(/\/$/, '');
const TOKEN_URL = `${MONNIFY_BASE_URL}/api/v1/auth/login`;

let _token = null;
let _tokenExpiresAt = 0;

function configMissing() {
  return !process.env.MONNIFY_SECRET_KEY || !process.env.MONNIFY_CONTRACT_CODE;
}

function notConfiguredError() {
  return Object.assign(new Error('Monnify is not configured (MONNIFY_SECRET_KEY / MONNIFY_CONTRACT_CODE).'), { code: 'MONNIFY_NOT_CONFIGURED' });
}

/** Basic-Auth OAuth2 bearer token, cached until near-expiry. */
async function getAccessToken() {
  if (configMissing()) throw notConfiguredError();
  if (_token && Date.now() < _tokenExpiresAt - 30_000) return _token;

  const basic = Buffer.from(`${process.env.MONNIFY_SECRET_KEY}:${process.env.MONNIFY_PUBLIC_KEY || ''}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.requestSuccessful === false) {
    throw new Error(json.responseMessage || `Monnify token failed (HTTP ${res.status})`);
  }
  _token = json.responseBody && json.responseBody.accessToken;
  _tokenExpiresAt = Date.now() + (Number((json.responseBody || {}).expiresIn) || 3600) * 1000;
  return _token;
}

async function monnifyRequest(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${MONNIFY_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.requestSuccessful === false) {
    throw new Error(json.responseMessage || `Monnify ${path} failed (HTTP ${res.status})`);
  }
  return json.responseBody;
}

/**
 * Initialize a transaction. For marketplace we use card/web (paymentReference +
 * checkoutUrl). Amount is in ATOMIC units (kobo / NGN * 100).
 */
async function initializeTransaction({ amount, currency = 'NGN', paymentReference, customerEmail, customerName, paymentDescription, redirectUrl, metadata } = {}) {
  if (configMissing()) throw notConfiguredError();
  const body = {
    amount,
    currency,
    paymentReference,
    paymentMethods: ['CARD'],
    customerName: customerName || 'EliteKids User',
    customerEmail: customerEmail || 'no-reply@elitekids.com.ng',
    paymentDescription: paymentDescription || 'EliteKids purchase',
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    metaData: metadata || {},
  };
  if (redirectUrl) body.redirectUrl = redirectUrl;
  return monnifyRequest('/api/v2/merchant/transactions/init-transaction', { method: 'POST', body });
}

/** Verify a transaction by payment reference. */
async function verifyTransaction(paymentReference) {
  if (configMissing()) throw notConfiguredError();
  return monnifyRequest(`/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`);
}

/**
 * Verify a webhook signature. Monnify signs the raw body with an HMAC-SHA512 of
 * the raw body using the client secret.
 */
async function verifyWebhookSignature(rawBody, signature) {
  const crypto = require('crypto');
  if (!rawBody || typeof signature !== 'string' || !signature) return false;
  if (configMissing()) return false;
  const expected = crypto.createHmac('sha512', process.env.MONNIFY_SECRET_KEY).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Guard used by the marketplace to know if Monnify is usable. */
function isConfigured() {
  return !configMissing();
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  isConfigured,
  MONNIFY_BASE_URL,
};
