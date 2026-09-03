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
 * TTS locale: pinned to English regardless of the UI locale (see setLocale
 * below and speak() in sound.ts — Hausa voice quality is poor on target
 * devices, and kids' content audio is English). `getTtsLocale()` always
 * returns en-NG for the Nigerian deployment.
 *
 * Locales are registered in `dictionaries` below (en + en-NG alias en).
 * Future locales (yo/ha/ig) are added via `addLocale(code, dict)` and can be
 * lazy-loaded (dynamic import) to keep the main bundle lean — see
 * team-docs/i18n-l10n-migration.md §3/§5 (P5).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './en';

export type Locale = 'en' | 'en-NG' | 'ha';

/** RTL locales require dir="rtl" on the root element. */
const RTL_LOCALES = new Set<string>(['ha', 'ar', 'fa', 'ur']);

interface I18nState {
  locale: Locale;
  /** BCP-47 tag used by SpeechSynthesis (default en-NG for Nigeria). */
  ttsLocale: string;
  /** Text direction for the current locale. */
  dir: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
}

const STORAGE_KEY = 'elitekids-locale';

function resolveDir(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'en-NG',
      ttsLocale: 'en-NG',
      dir: 'ltr',
      setLocale: (locale) =>
        set({
          locale,
          // TTS is pinned to English regardless of UI language (Hausa voice
          // quality is poor on target devices and kids' content audio is EN).
          ttsLocale: 'en-NG',
          dir: resolveDir(locale),
        }),
    }),
    { name: STORAGE_KEY }
  )
);

/** Available locales (UI label → code). TTS is pinned to English — see speak() in sound.ts. */
export const LOCALES: Array<{ code: Locale; label: string }> = [
  { code: 'en', label: 'English (US)' },
  { code: 'en-NG', label: 'English (Nigeria)' },
  { code: 'ha', label: 'Hausa' },
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

/** Get the current text direction. */
export function getDir(): 'ltr' | 'rtl' {
  return useI18n.getState().dir;
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
 * Lazy-load a locale from the locales/ directory.
 * Usage: await loadLocale('ha');
 */
export async function loadLocale(locale: string): Promise<void> {
  if (locale in dictionaries) return; // already loaded
  try {
    const mod = await import(`./locales/${locale}.json`);
    const dict = mod.default || mod;
    // Strip _meta if present
    const { _meta, ...strings } = dict;
    addLocale(locale, strings);
  } catch {
    // locale file not found — silently ignore, fallback to en
  }
}

/**
 * Translate a key ALWAYS from the base English dictionary — used for TTS
 * (speech stays English even when the UI language is Hausa, per product
 * decision: an English voice reading Hausa text is unintelligible).
 */
export function tEn(key: string, params?: Record<string, string | number>): string {
  let str: string | undefined = dictionaries.en[key];
  if (str === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
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

/**
 * Apply the current locale's text direction to the document.
 * Call this on app init and whenever locale changes.
 */
export function applyDir(): void {
  const dir = useI18n.getState().dir;
  document.documentElement.setAttribute('dir', dir);
}
