/**
 * Centralised UI strings — EliteKids i18n-readiness.
 *
 * Every user-facing string lives here so translators (or AI) can swap
 * languages without touching component code.  Components import `t(key)`
 * instead of hardcoding text.
 *
 * Usage:
 *   import { t } from '@/lib/i18n/strings';
 *   <p>{t('offline.queued')}</p>
 */

// ── English (default) ────────────────────────────────────────────────────────
const en: Record<string, string> = {
  // ── Offline / sync ──────────────────────────────────────────────────────
  'offline.back_online': 'Back online — syncing…',
  'offline.gone_offline': 'Gone offline — changes will sync later',
  'offline.queued': 'Progress saved offline. It will sync when connected.',
  'offline.queue_full': 'Sync queue full — some changes may not save.',
  'offline.sync_failed': 'Sync failed. Will retry shortly.',
  'offline.synced_items': '{sent} synced, {failed} failed, {remaining} remaining.',
  'offline.drop_after_retries': 'Dropped sync item after {n} retries.',
  'offline.not_available': 'Offline mode not available on this device.',

  // ── Network errors ──────────────────────────────────────────────────────
  'error.offline_check': 'You appear to be offline. Check your connection and try again.',
  'error.offline_not_cached': 'You appear to be offline. This data is not cached yet.',
  'error.server': 'Something went wrong. Please try again.',

  // ── GamePlay ────────────────────────────────────────────────────────────
  'game.practice_mode': "Let's practice this a bit more!",
  'game.teacher_help': 'Your teacher will help you with this one. Let\'s try something else!',
  'game.progress_queued': 'Progress saved offline.',
  'game.loading': 'Loading…',
  'game.submitting': 'Submitting…',
  'game.time_up': "Time's up!",

  // ── Generic UI ──────────────────────────────────────────────────────────
  'ui.loading': 'Loading…',
  'ui.error': 'Something went wrong',
  'ui.retry': 'Retry',
  'ui.cancel': 'Cancel',
  'ui.save': 'Save',
  'ui.delete': 'Delete',
  'ui.confirm': 'Confirm',
  'ui.back': 'Back',
  'ui.next': 'Next',
  'ui.done': 'Done',
  'ui.search': 'Search…',
  'ui.no_results': 'No results found',
  'ui.offline_badge': 'Offline',
  'ui.pending_sync': '{count} pending sync',
};

// ── Language registry ────────────────────────────────────────────────────────
type Locale = 'en';
const dictionaries: Record<Locale, Record<string, string>> = { en };
let currentLocale: Locale = 'en';

/** Get a translated string. Supports `{var}` interpolation. */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  let str = dictionaries[currentLocale]?.[key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/** Switch the active locale. */
export function setLocale(locale: string) {
  if (locale in dictionaries) {
    currentLocale = locale as Locale;
  }
}

/** Get the current locale code. */
export function getLocale(): string {
  return currentLocale;
}

/** Add or extend a locale dictionary (for lazy-loaded translations). */
export function addLocale(locale: string, dict: Record<string, string>) {
  (dictionaries as any)[locale] = { ...dictionaries[locale as Locale], ...dict };
}
