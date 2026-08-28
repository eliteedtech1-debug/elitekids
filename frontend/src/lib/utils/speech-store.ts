/**
 * Speech settings store — Zustand + localStorage persistence.
 *
 * Controls:
 *   - rate: speech speed (0.5 = slow, 1.0 = normal, 2.0 = fast)
 *   - voiceName: selected SpeechSynthesis voice name (empty = auto-pick)
 *   - pitch: voice pitch (0.5–2.0, default 1.1 for kids)
 *   - voiceProfile: preset voice type (woman, man, boy, girl)
 *
 * Voice profiles map to pitch/rate presets and filter available voices:
 *   - woman: warm female voice (default, pitch 1.1)
 *   - man: deeper male voice (pitch 0.8)
 *   - boy: young male voice (pitch 1.3, slightly faster)
 *   - girl: young female voice (pitch 1.25)
 *
 * Usage:
 *   import { useSpeechStore } from '@/lib/utils/speech-store';
 *   const { rate, voiceName, voiceProfile, setRate, setVoice, setVoiceProfile } = useSpeechStore();
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type VoiceProfile = 'woman' | 'man' | 'boy' | 'girl';

/** Voice profile metadata for the UI. */
export const VOICE_PROFILES: Record<VoiceProfile, { label: string; emoji: string; pitch: number; rate: number; description: string }> = {
  woman: { label: 'Woman', emoji: '👩', pitch: 1.1, rate: 0.85, description: 'Warm female voice' },
  man:   { label: 'Man',   emoji: '👨', pitch: 0.8, rate: 0.85, description: 'Deep male voice' },
  boy:   { label: 'Boy',   emoji: '👦', pitch: 1.3, rate: 0.9,  description: 'Young male voice' },
  girl:  { label: 'Girl',  emoji: '👧', pitch: 1.25, rate: 0.85, description: 'Young female voice' },
};

interface SpeechSettings {
  rate: number;
  voiceName: string;
  pitch: number;
  voiceProfile: VoiceProfile;
  setRate: (rate: number) => void;
  setVoice: (name: string) => void;
  setPitch: (pitch: number) => void;
  setVoiceProfile: (profile: VoiceProfile) => void;
  reset: () => void;
}

const STORAGE_KEY = 'elitekids-speech';

const DEFAULTS = {
  rate: 0.85,
  voiceName: '',
  pitch: 1.1,
  voiceProfile: 'woman' as VoiceProfile,
};

export const useSpeechStore = create<SpeechSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setRate: (rate: number) => set({ rate: Math.min(2.0, Math.max(0.3, rate)) }),

      setVoice: (name: string) => set({ voiceName: name }),

      setPitch: (pitch: number) => set({ pitch: Math.min(2.0, Math.max(0.5, pitch)) }),

      setVoiceProfile: (profile: VoiceProfile) => {
        const preset = VOICE_PROFILES[profile];
        set({ voiceProfile: profile, pitch: preset.pitch, rate: preset.rate });
      },

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
 * Get voices filtered by gender hint for a profile.
 * - woman/girl → prefer female voices
 * - man/boy → prefer male voices
 * Falls back to all English voices if no gender-specific match.
 */
function getVoicesForProfile(profile: VoiceProfile): SpeechSynthesisVoice[] {
  const allVoices = getAvailableVoices();
  if (allVoices.length === 0) return [];

  const isMale = profile === 'man' || profile === 'boy';
  const genderPattern = isMale ? /male|man|boy|guy/i : /female|woman|girl|lady/i;

  const gendered = allVoices.filter((v) => genderPattern.test(v.name));
  return gendered.length > 0 ? gendered : allVoices;
}

/**
 * Resolve the effective voice from the store setting.
 * Uses voice profile to pick gender-appropriate voice.
 * Falls back to auto-pick if the stored voice isn't available.
 */
export function resolveVoice(voiceName: string, profile: VoiceProfile = 'woman'): SpeechSynthesisVoice | null {
  // If a specific voice is manually selected, use it
  if (voiceName) {
    const allVoices = getAvailableVoices();
    const found = allVoices.find((v) => v.name === voiceName);
    if (found) return found;
  }

  // Use profile to pick a gender-appropriate voice
  const profileVoices = getVoicesForProfile(profile);
  if (profileVoices.length === 0) return null;

  // Profile-specific preferred names
  const preferredNames: Record<VoiceProfile, string[]> = {
    woman: ['Samantha', 'Karen', 'Victoria', 'Fiona', 'Moira', 'Tessa', 'Alice', 'Anna', 'Helena', 'Zira', 'Hazel', 'Google UK English Female', 'Google US English', 'Microsoft Zira', 'Microsoft Hazel'],
    man:   ['James', 'Daniel', 'Google UK English Male', 'Microsoft David', 'Microsoft Mark', 'Google US English'],
    boy:   ['James', 'Daniel', 'Google UK English Male', 'Microsoft David', 'Google US English'],
    girl:  ['Samantha', 'Tessa', 'Alice', 'Anna', 'Google UK English Female', 'Google US English'],
  };

  const names = preferredNames[profile];
  return (
    profileVoices.find((v) => names.some((n) => v.name.includes(n)))
    || profileVoices.find((v) => /natural|clear|kid|child/i.test(v.name))
    || profileVoices[0]
    || null
  );
}
