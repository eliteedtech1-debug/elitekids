/**
 * i18n seam — EliteKids (#3), consolidated.
 *
 * Single-source-of-truth dictionary registry. A Zustand store (persisted to
 * localStorage) holds the active locale; `t()` looks up keys with {param}
 * interpolation and `tN()` adds English plural forms (`.one` / `.other`).
 *
 * Usage:
 *   import { useI18n, t, tN } from '@/lib/i18n';
 *   const { locale, setLocale } = useI18n();
 *   t('login.welcome', { school: name })          // reads current locale dict
 *   tN('offline.indicator.itemsToSync', count)   // "{count} item(s) to sync"
 *
 * TTS locale: sound.ts reads `useI18n.getState().ttsLocale` so speech follows
 * the same locale switch (default en-NG for Nigerian deployment).
 *
 * Locales are registered in `dictionaries` below (en + en-NG alias en).
 * Future locales (yo/ha/ig) are added via `addLocale(code, dict)` and can be
 * lazy-loaded (dynamic import) to keep the main bundle lean — see
 * team-docs/i18n-l10n-migration.md §3/§5 (P5).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './en';

export type Locale = 'en' | 'en-NG';

interface I18nState {
  locale: Locale;
  /** BCP-47 tag used by SpeechSynthesis (default en-NG for Nigeria). */
  ttsLocale: string;
  setLocale: (locale: Locale) => void;
}

const STORAGE_KEY = 'elitekids-locale';

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'en-NG',
      ttsLocale: 'en-NG',
      setLocale: (locale) =>
        set({ locale, ttsLocale: locale === 'en' ? 'en-US' : 'en-NG' }),
    }),
    { name: STORAGE_KEY }
  )
);

/** Available locales (UI label → code). */
export const LOCALES: Array<{ code: Locale; label: string; tts: string }> = [
  { code: 'en', label: 'English (US)', tts: 'en-US' },
  { code: 'en-NG', label: 'English (Nigeria)', tts: 'en-NG' },
];

/** Registered dictionaries, keyed by locale code. en-NG aliases en initially. */
const dictionaries: Record<string, Record<string, string>> = { en, 'en-NG': en };

/** BCP-47 tag for TTS — read by sound.ts speak(). */
export function getTtsLocale(): string {
  return useI18n.getState().ttsLocale;
}

/** Get the current locale code. */
export function getLocale(): string {
  return useI18n.getState().locale;
}

/**
 * Switch the active locale. Persisted through the store; unknown codes are
 * ignored so a bad lazy-load never crashes the UI.
 */
export function setLocale(locale: string): void {
  if (locale in dictionaries) {
    useI18n.getState().setLocale(locale as Locale);
  }
}

/** Add or extend a locale dictionary (for lazy-loaded translations). */
export function addLocale(locale: string, dict: Record<string, string>): void {
  dictionaries[locale] = { ...(dictionaries[locale] || {}), ...dict };
}

/**
 * Translate a key using the active locale dictionary.
 * Falls back to the base `en` dictionary, then to the key itself, so
 * untranslated keys never crash or render empty.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = useI18n.getState().locale;
  let str: string | undefined =
    locale !== 'en' ? dictionaries[locale]?.[key] : undefined;
  if (str === undefined) str = dictionaries.en[key];
  if (str === undefined) return key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/**
 * Plural-aware translation (English rules: one/other).
 * Looks up `${key}.one` when count === 1, `${key}.other` otherwise; falls
 * back to the plain key. Per-locale plural rules can extend the lookup when
 * additional locales land (see team-docs/i18n-l10n-migration.md §6).
 */
export function tN(
  key: string,
  count: number,
  params?: Record<string, string | number>
): string {
  const form = count === 1 ? 'one' : 'other';
  const plural = t(`${key}.${form}`, { count, ...(params || {}) });
  if (plural !== `${key}.${form}`) return plural;
  return t(key, { count, ...(params || {}) });
}
