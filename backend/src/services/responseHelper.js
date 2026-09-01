'use strict';
/**
 * Standardized error codes for EliteKids API responses.
 * Every error response should include an `error_code` field so the frontend
 * can map it to a localized message via mapApiError().
 *
 * Convention: CATEGORY_DETAIL (SCREAMING_SNAKE_CASE).
 */

const ERROR_CODES = {
  // Auth
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',
  AUTH_PASSWORD_WRONG: 'AUTH_PASSWORD_WRONG',
  AUTH_ACCOUNT_NOT_FOUND: 'AUTH_ACCOUNT_NOT_FOUND',
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',

  // Subscription / Entitlement
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_INVALID_PLAN: 'SUBSCRIPTION_INVALID_PLAN',
  SUBSCRIPTION_PAYMENT_FAILED: 'SUBSCRIPTION_PAYMENT_FAILED',

  // Parent / Child
  PARENT_NOT_LINKED: 'PARENT_NOT_LINKED',
  PARENT_CHILD_OWNERSHIP_DENIED: 'PARENT_CHILD_OWNERSHIP_DENIED',
  CHILD_NOT_FOUND: 'CHILD_NOT_FOUND',

  // Content
  CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
  CONTENT_NOT_PUBLISHED: 'CONTENT_NOT_PUBLISHED',
  CONTENT_APPROVAL_REQUIRED: 'CONTENT_APPROVAL_REQUIRED',

  // Game / Play
  PLAY_LIMIT_REACHED: 'PLAY_LIMIT_REACHED',
  PLAY_TIME_WINDOW: 'PLAY_TIME_WINDOW',
  MODE_LOCK_ACTIVE: 'MODE_LOCK_ACTIVE',

  // General
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
};

/**
 * Send a standardized error response.
 * @param {import('express').Res} res
 * @param {number} status - HTTP status code
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable message (English fallback)
 */
function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error_code: code,
    message,
  });
}

/**
 * Send a standardized success response.
 */
function sendSuccess(res, data, status = 200) {
  return res.status(status).json({
    success: true,
    data,
  });
}

module.exports = { ERROR_CODES, sendError, sendSuccess };
