/**
 * Shared Web Speech recognition helper (Q2 Voice-First).
 *
 * Same pattern SpeechGame uses inline — extracted here so the Q2 speech FE
 * leaf components (PronunciationCoach, ReadingTracker) reuse one implementation.
 * SpeechGame.tsx keeps its own copy (Q24 owns its embedded-mode change).
 */

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: 1;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}

/** Create an en-NG recognition instance, or null on unsupported browsers. */
export function getRecognition(): SpeechRecognitionLike | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.lang = 'en-NG';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  return rec;
}

/** True when the device/browser supports Web Speech recognition. */
export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Detach handlers + stop a live recognition instance (idempotent). */
export function stopRecognition(rec: SpeechRecognitionLike | null): void {
  if (!rec) return;
  rec.onresult = null;
  rec.onerror = null;
  rec.onend = null;
  try { rec.stop(); } catch { /* already stopped */ }
}