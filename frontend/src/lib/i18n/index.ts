/**
 * i18n readiness seam — EliteKids (#3).
 *
 * Lightweight dictionary-based i18n. No heavy framework: a locale store
 * (Zustand + localStorage) and a `t()` lookup with {param} interpolation.
 * The seam exists so every user-facing string is extractable — the goal of
 * this phase is READINESS (a single chokepoint), not a full translation
 * roll-out.
 *
 * Usage:
 *   import { useI18n, t } from '@/lib/i18n';
 *   const { locale, setLocale } = useI18n();
 *   t('login.welcome', { school: name })  // reads current locale dict
 *
 * TTS locale: sound.ts reads `useI18n.getState().ttsLocale` so speech
 * follows the same locale switch (default en-NG for Nigerian deployment).
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

/**
 * Translate a key using the active locale dictionary.
 * Falls back to the base `en` dictionary, then to the key itself, so
 * untranslated keys never crash or render empty.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let str: string | undefined =
    useI18n.getState().locale !== 'en'
      ? dictionaries[useI18n.getState().locale]?.[key]
      : undefined;
  if (str === undefined) str = dictionaries.en[key];
  if (str === undefined) return key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/** BCP-47 tag for TTS — read by sound.ts speak(). */
export function getTtsLocale(): string {
  return useI18n.getState().ttsLocale;
}

const dictionaries: Record<string, Record<string, string>> = { en, 'en-NG': en };
