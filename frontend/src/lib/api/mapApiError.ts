import { t } from '@/lib/i18n';

/**
 * Maps backend error_code fields to i18n keys.
 * Used by API interceptors and error boundaries to show localized messages.
 */
const ERROR_MAP: Record<string, string> = {
  // Auth
  AUTH_REQUIRED: 'error.authRequired',
  AUTH_INVALID_TOKEN: 'error.invalidToken',
  AUTH_EXPIRED_TOKEN: 'error.expiredToken',
  AUTH_PASSWORD_WRONG: 'error.wrongPassword',
  AUTH_ACCOUNT_NOT_FOUND: 'error.accountNotFound',
  AUTH_ACCOUNT_DISABLED: 'error.accountDisabled',

  // Subscription
  SUBSCRIPTION_REQUIRED: 'error.subscriptionRequired',
  SUBSCRIPTION_EXPIRED: 'error.subscriptionExpired',
  SUBSCRIPTION_INVALID_PLAN: 'error.invalidPlan',
  SUBSCRIPTION_PAYMENT_FAILED: 'error.paymentFailed',

  // Parent / Child
  PARENT_NOT_LINKED: 'error.notLinked',
  PARENT_CHILD_OWNERSHIP_DENIED: 'error.ownershipDenied',
  CHILD_NOT_FOUND: 'error.childNotFound',

  // Content
  CONTENT_NOT_FOUND: 'error.contentNotFound',
  CONTENT_NOT_PUBLISHED: 'error.contentNotPublished',
  CONTENT_APPROVAL_REQUIRED: 'error.approvalRequired',

  // Game / Play
  PLAY_LIMIT_REACHED: 'error.playLimitReached',
  PLAY_TIME_WINDOW: 'error.playTimeWindow',
  MODE_LOCK_ACTIVE: 'error.modeLockActive',

  // General
  VALIDATION_ERROR: 'error.validationError',
  NOT_FOUND: 'error.notFound',
  RATE_LIMITED: 'error.rateLimited',
  SERVER_ERROR: 'error.serverError',
};

/**
 * Map a backend error_code or raw message to a localized user-facing string.
 * Falls back to the raw message if no mapping exists.
 */
export function mapApiError(error: { error_code?: string; message?: string }): string {
  if (error.error_code && ERROR_MAP[error.error_code]) {
    return t(ERROR_MAP[error.error_code]);
  }
  return error.message || t('error.serverError');
}

export { ERROR_MAP };
