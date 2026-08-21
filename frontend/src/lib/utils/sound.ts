/**
 * Sound utility — Web Audio API tones + Speech Synthesis fallback.
 * All functions are safe to call in SSR (no-op on server).
 */

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
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.2), i * 120));
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

// ── Speech Synthesis ──────────────────────────────────────────

/**
 * Speak text aloud. Uses browser SpeechSynthesis if available.
 * Returns a promise that resolves when speech ends (or immediately if unavailable).
 */
export function speak(text: string, lang = 'en-US', overrideRate?: number): Promise<void> {
  return new Promise((resolve) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      resolve();
      return;
    }
    // Cancel any ongoing speech
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }

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

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
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

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
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

/** Say "Well done!" on completion */
export async function speakComplete(score: number): Promise<void> {
  playComplete();
  const msg = score >= 30 ? 'Well done! You are a superstar!' : score >= 20 ? 'Great job!' : 'Good try!';
  await speak(msg);
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
  await speak(`${num}!`, 'en-NG', 0.85);
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
