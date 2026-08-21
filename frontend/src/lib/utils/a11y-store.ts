/**
 * Accessibility settings store — Zustand + localStorage persistence.
 *
 * Persists user preferences across sessions:
 *   - colorblindMode: use colorblind-safe palette
 *   - reducedMotion: disable animations
 *   - highContrast: increase contrast ratios
 *   - largeText: increase font sizes
 *
 * Auto-detects OS preferences on first load, then respects user overrides.
 *
 * Usage:
 *   import { useA11yStore } from '@/lib/utils/a11y-store';
 *   const { colorblindMode, reducedMotion, toggleColorblind } = useA11yStore();
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface A11ySettings {
  colorblindMode: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  toggleColorblind: () => void;
  toggleReducedMotion: () => void;
  toggleHighContrast: () => void;
  toggleLargeText: () => void;
  reset: () => void;
}

const STORAGE_KEY = 'elitekids-a11y';

function detectOsPreferences() {
  if (typeof window === 'undefined') {
    return { reducedMotion: false, highContrast: false };
  }
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: window.matchMedia('(prefers-contrast: more)').matches,
  };
}

function applyA11yVars(s: { colorblindMode: boolean; reducedMotion: boolean; highContrast: boolean; largeText: boolean }) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-colorblind', String(s.colorblindMode));
  root.setAttribute('data-reduced-motion', String(s.reducedMotion));
  root.setAttribute('data-high-contrast', String(s.highContrast));
  root.setAttribute('data-large-text', String(s.largeText));
  if (s.reducedMotion) {
    root.style.setProperty('--animation-duration', '0.01ms');
  } else {
    root.style.removeProperty('--animation-duration');
  }
  root.classList.toggle('high-contrast', s.highContrast);
  root.classList.toggle('large-text', s.largeText);
}

const osPrefs = detectOsPreferences();

const initialState = {
  colorblindMode: false as boolean,
  reducedMotion: osPrefs.reducedMotion as boolean,
  highContrast: osPrefs.highContrast as boolean,
  largeText: false as boolean,
};

export const useA11yStore = create<A11ySettings>()(
  persist(
    (set) => ({
      ...initialState,

      toggleColorblind: () =>
        set((state) => {
          const next = { colorblindMode: !state.colorblindMode };
          applyA11yVars({ ...state, ...next });
          return next;
        }),

      toggleReducedMotion: () =>
        set((state) => {
          const next = { reducedMotion: !state.reducedMotion };
          applyA11yVars({ ...state, ...next });
          return next;
        }),

      toggleHighContrast: () =>
        set((state) => {
          const next = { highContrast: !state.highContrast };
          applyA11yVars({ ...state, ...next });
          return next;
        }),

      toggleLargeText: () =>
        set((state) => {
          const next = { largeText: !state.largeText };
          applyA11yVars({ ...state, ...next });
          return next;
        }),

      reset: () =>
        set(() => {
          applyA11yVars(initialState);
          return { ...initialState };
        }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);

// Apply settings on module load (for SSR safety)
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const settings = parsed?.state || parsed;
      applyA11yVars(settings);
    } else {
      applyA11yVars(initialState);
    }
  } catch {
    applyA11yVars(initialState);
  }
}
