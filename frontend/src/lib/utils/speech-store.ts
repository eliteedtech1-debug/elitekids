/**
 * Speech settings store — Zustand + localStorage persistence.
 *
 * Controls:
 *   - rate: speech speed (0.5 = slow, 1.0 = normal, 2.0 = fast)
 *   - voiceName: selected SpeechSynthesis voice name (empty = auto-pick)
 *   - pitch: voice pitch (0.5–2.0, default 1.1 for kids)
 *
 * Usage:
 *   import { useSpeechStore } from '@/lib/utils/speech-store';
 *   const { rate, voiceName, setRate, setVoice } = useSpeechStore();
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SpeechSettings {
  rate: number;
  voiceName: string;
  pitch: number;
  setRate: (rate: number) => void;
  setVoice: (name: string) => void;
  setPitch: (pitch: number) => void;
  reset: () => void;
}

const STORAGE_KEY = 'elitekids-speech';

const DEFAULTS = {
  rate: 0.85,
  voiceName: '',
  pitch: 1.1,
};

export const useSpeechStore = create<SpeechSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setRate: (rate: number) => set({ rate: Math.min(2.0, Math.max(0.3, rate)) }),

      setVoice: (name: string) => set({ voiceName: name }),

      setPitch: (pitch: number) => set({ pitch: Math.min(2.0, Math.max(0.5, pitch)) }),

      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);

/**
 * Get available SpeechSynthesis voices (English only, sorted).
 * Chrome loads them async, so this may return empty on first call.
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith('en'))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve the effective voice from the store setting.
 * Falls back to auto-pick if the stored voice isn't available.
 */
export function resolveVoice(voiceName: string): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices();
  if (!voices.length) return null;
  if (voiceName) {
    const found = voices.find((v) => v.name === voiceName);
    if (found) return found;
  }
  // Auto-pick: friendly female voice
  const femaleNames = ['Samantha', 'Karen', 'Victoria', 'Fiona', 'Moira', 'Tessa', 'Alice', 'Anna', 'Helena', 'Zira', 'Hazel', 'Google UK English Female', 'Google US English', 'Microsoft Zira', 'Microsoft Hazel'];
  return (
    voices.find((v) => femaleNames.some((n) => v.name.includes(n)))
    || voices.find((v) => /female|woman|girl/i.test(v.name))
    || voices[0]
    || null
  );
}
