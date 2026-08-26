/**
 * Sound utility — Web Audio API tones + Speech Synthesis fallback.
 * All functions are safe to call in SSR (no-op on server).
 */

// #3 i18n: TTS follows the app locale (default en-NG for Nigeria) instead of
// a hardcoded en-US tag. Safe to import directly — i18n has no dep on sound.
import { getTtsLocale } from '@/lib/i18n';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// ── Tone generator ──────────────────────────────────────────────

function playTone(freq: number, duration = 0.15, type: OscillatorType = 'sine', volume = 0.3) {
  const ctx = getCtx();
  if (!ctx) return;
  // Resume context if suspended (autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// ── Named sounds ──────────────────────────────────────────────

/** Short "ding" for correct answer */
export function playCorrect() {
  playTone(880, 0.12, 'sine', 0.25);
  setTimeout(() => playTone(1175, 0.15, 'sine', 0.25), 100);
}

/** Short "buzz" for wrong answer */
export function playWrong() {
  playTone(200, 0.2, 'sawtooth', 0.15);
  setTimeout(() => playTone(160, 0.25, 'sawtooth', 0.15), 150);
}

/** Celebration jingle for game complete */
export function playComplete() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  // Iconic "level-up" fanfare (original composition): ta-da-da-DAA!
  // Layered sine+triangle oscillators for a rich, memorable arcade victory sound.
  const t = ctx.currentTime;
  const note = (freq: number, start: number, dur: number, vol = 0.22) => {
    for (const [type, v] of [
      ['sine', vol],
      ['triangle', vol * 0.5],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.exponentialRampToValueAtTime(v, t + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur);
    }
  };

  note(523.25, 0.0, 0.14);          // C5 — ta
  note(523.25, 0.16, 0.14);         // C5 — da
  note(523.25, 0.32, 0.14);         // C5 — da
  note(659.26, 0.48, 0.28);         // E5 — daa
  note(783.99, 0.72, 0.55);         // G5 — DAAA (held)
  // Final shimmer chord: C-major sparkle
  note(1046.5, 1.05, 0.7, 0.18);    // C6
  note(1318.5, 1.12, 0.62, 0.13);   // E6
  note(1567.98, 1.19, 0.55, 0.11);  // G6
}

/** Button tap sound — bright pop */
export function playTap() {
  playTone(800, 0.05, 'sine', 0.18);
  setTimeout(() => playTone(1200, 0.04, 'sine', 0.12), 40);
}

/** Button dance — playful bouncy tone */
export function playDance() {
  playTone(660, 0.08, 'sine', 0.15);
  setTimeout(() => playTone(880, 0.08, 'sine', 0.15), 60);
  setTimeout(() => playTone(1100, 0.08, 'sine', 0.12), 120);
}

/** Intro/scene transition sound */
export function playScene() {
  playTone(440, 0.1, 'triangle', 0.15);
  setTimeout(() => playTone(660, 0.1, 'triangle', 0.15), 80);
}

/** Match-pair success (softer than correct) */
export function playMatch() {
  playTone(660, 0.1, 'sine', 0.2);
}

/** Drag-place sound */
export function playPlace() {
  playTone(500, 0.08, 'triangle', 0.15);
}

/** Streak milestone — ascending chime (3, 5, 7 correct in a row) */
export function playStreak(level: number) {
  const base = 600 + level * 100;
  playTone(base, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(base + 200, 0.1, 'sine', 0.2), 80);
  setTimeout(() => playTone(base + 400, 0.15, 'sine', 0.25), 160);
}

/** Hint reveal — soft encouraging tone */
export function playHint() {
  playTone(520, 0.12, 'triangle', 0.15);
  setTimeout(() => playTone(660, 0.15, 'triangle', 0.12), 120);
}

/** Brief celebration burst — for mini-celebrations between questions */
export function playCelebration() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;
  const note = (freq: number, start: number, dur: number, vol = 0.18) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + start);
    gain.gain.exponentialRampToValueAtTime(vol, t + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + start);
    osc.stop(t + start + dur);
  };
  note(784, 0.0, 0.12);    // G5
  note(988, 0.1, 0.12);    // B5
  note(1175, 0.2, 0.2);    // D6
}

// ── Speech Synthesis ──────────────────────────────────────────

/**
 * Speak text aloud. Uses browser SpeechSynthesis if available.
 * Returns a promise that resolves when speech ends (or immediately if unavailable).
 */
// ── FB-16: strip emoji before TTS ────────────────────────────
// Emoji glyphs are visual fallbacks only; TTS engines voice glyph names
// ("🐱" -> "cat face"), which teaches kids wrong labels ("Cat cat face").
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export function stripEmojiForSpeech(text: string): string {
  return String(text || '')
    .replace(EMOJI_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Track the currently-speaking utterance so we only cancel when something is
// actually queued — calling cancel() right before speak() on some engines
// (Chrome/Android) cancels the NEW utterance too, which made questions go silent.
let activeUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, lang?: string, overrideRate?: number): Promise<void> {
  return new Promise((resolve) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      resolve();
      return;
    }
    // Cancel only ongoing speech (never a just-started one)
    if (activeUtterance) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }

    // Read settings from the speech store (lazy import to avoid circular deps)
    let rate = 0.85;
    let pitch = 1.1;
    let voiceName = '';
    try {
      const raw = localStorage.getItem('elitekids-speech');
      if (raw) {
        const parsed = JSON.parse(raw);
        const s = parsed?.state || parsed;
        rate = s.rate ?? 0.85;
        pitch = s.pitch ?? 1.1;
        voiceName = s.voiceName ?? '';
      }
    } catch { /* use defaults */ }
    if (overrideRate !== undefined) rate = overrideRate;

    // FB-16: never voice emoji glyph names
    const spokenText = stripEmojiForSpeech(text);
    if (!spokenText) { resolve(); return; }
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = lang || getTtsLocale();
    utterance.rate = rate;
    utterance.volume = 1;
    utterance.pitch = pitch;

    // Resolve voice: stored preference → auto-pick
    const voices = window.speechSynthesis.getVoices();
    let preferred: SpeechSynthesisVoice | null = null;
    if (voiceName) {
      preferred = voices.find((v) => v.name === voiceName) || null;
    }
    if (!preferred) {
      const femaleNames = ['Samantha', 'Karen', 'Victoria', 'Fiona', 'Moira', 'Tessa', 'Alice', 'Anna', 'Helena', 'Zira', 'Hazel', 'Google UK English Female', 'Google US English', 'Microsoft Zira', 'Microsoft Hazel'];
      preferred =
        voices.find((v) => v.lang.startsWith('en') && femaleNames.some((n) => v.name.includes(n)))
        || voices.find((v) => v.lang.startsWith('en') && /female|woman|girl/i.test(v.name))
        || voices.find((v) => v.lang.startsWith('en'))
        || voices[0]
        || null;
    }
    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang;
    }

    const finish = () => {
      activeUtterance = null;
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    activeUtterance = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      activeUtterance = null;
      resolve();
      return;
    }

    // Fallback resolve after 5s in case onend never fires
    setTimeout(resolve, 5000);
  });
}

// ── Combined: play tone + speak ──────────────────────────────

/** Say a scene intro text aloud */
export async function speakScene(text: string): Promise<void> {
  playScene();
  await speak(text);
}

/**
 * Completion celebration — plays the iconic victory fanfare ONLY.
 * The "Super Star!" message is shown as on-screen TEXT (see GamePlay screens);
 * deliberately NO text-to-speech here.
 */
export async function speakComplete(score: number): Promise<void> {
  playComplete();
}

// ── Game-specific speech (fallback when no audio file) ─────────

/** Speak an item label — used as fallback when no audio file exists */
export async function speakItem(label: string): Promise<void> {
  playTap();
  await speak(label);
}

/** Speak an animal name with excitement */
export async function speakAnimal(name: string): Promise<void> {
  playDance();
  await speak(`This is a ${name}!`);
}

/** Speak a number with emphasis */
export async function speakNumber(num: number): Promise<void> {
  playDance();
  await speak(`${num}!`, undefined, 0.85);
}

/** Speak a shape name */
export async function speakShape(name: string): Promise<void> {
  playDance();
  await speak(`This is a ${name}!`);
}

/** Speak a color name */
export async function speakColor(name: string): Promise<void> {
  playDance();
  await speak(`This is ${name}!`);
}

/** Speak feedback for correct/wrong in test mode */
export async function speakFeedback(isCorrect: boolean): Promise<void> {
  if (isCorrect) {
    playCorrect();
    await speak('Correct!');
  } else {
    playWrong();
    await speak('Try again!');
  }
}

// ── Init: preload voices (Chrome loads them async) ────────────

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
