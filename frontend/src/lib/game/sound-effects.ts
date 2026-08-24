/**
 * Sound Effects Engine — EliteKids competition & boss battle audio.
 * Web Audio API, user-gesture gated, zero external deps.
 * All sounds are synthesized — no audio files needed.
 */

let audioCtx: AudioContext | null = null;
let enabled = true;

function ctx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function ensureGesture() {
  // Must be called from a user gesture (click/tap) to unlock audio
  if (audioCtx?.state === 'suspended') audioCtx.resume();
}

function beep(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.15) {
  if (!enabled) return;
  try {
    ensureGesture();
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  } catch { /* noop */ }
}

function noise(duration: number, volume = 0.08) {
  if (!enabled) return;
  try {
    ensureGesture();
    const c = ctx();
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * volume;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
  } catch { /* noop */ }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function playTap() {
  beep(800, 0.06, 'sine', 0.1);
}

export function playScore() {
  // Rising two-note "ding"
  beep(523, 0.1, 'sine', 0.12);
  setTimeout(() => beep(659, 0.15, 'sine', 0.12), 80);
}

export function playCombo(level: number) {
  // Higher pitch with each combo level
  const baseFreq = 440 + Math.min(level, 10) * 60;
  beep(baseFreq, 0.08, 'square', 0.1);
  setTimeout(() => beep(baseFreq * 1.25, 0.12, 'square', 0.1), 60);
  if (level >= 5) {
    setTimeout(() => beep(baseFreq * 1.5, 0.15, 'sawtooth', 0.08), 120);
  }
}

export function playComboBreak() {
  // Sad descending tone
  beep(400, 0.15, 'sawtooth', 0.08);
  setTimeout(() => beep(250, 0.2, 'sawtooth', 0.06), 100);
}

export function playMilestone() {
  // Triumphant ascending arpeggio
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    setTimeout(() => beep(f, 0.15, 'sine', 0.12), i * 100);
  });
}

export function playRageFill() {
  // Thunder rumble
  noise(0.3, 0.12);
  setTimeout(() => beep(120, 0.2, 'sawtooth', 0.15), 100);
  setTimeout(() => beep(80, 0.3, 'sawtooth', 0.1), 200);
}

export function playRageActive() {
  // Pulsing power sound
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      beep(200 + i * 100, 0.08, 'square', 0.08);
      noise(0.05, 0.06);
    }, i * 80);
  }
}

export function playBossAttack() {
  // Impact + screen shake feel
  noise(0.15, 0.15);
  beep(100, 0.2, 'sawtooth', 0.15);
  setTimeout(() => beep(60, 0.3, 'square', 0.1), 100);
}

export function playBossDefeated() {
  // Victory fanfare
  const notes = [392, 440, 523, 659, 784, 1047];
  notes.forEach((f, i) => {
    setTimeout(() => beep(f, 0.2, 'sine', 0.12), i * 120);
  });
  setTimeout(() => noise(0.2, 0.05), 600);
}

export function playVictory() {
  // Celebration
  const melody = [523, 659, 784, 1047, 784, 1047];
  melody.forEach((f, i) => {
    setTimeout(() => beep(f, 0.15, 'sine', 0.1), i * 100);
  });
}

export function playDefeatEncourage() {
  // Gentle, encouraging
  beep(440, 0.2, 'sine', 0.08);
  setTimeout(() => beep(392, 0.3, 'sine', 0.08), 200);
  setTimeout(() => beep(440, 0.4, 'sine', 0.06), 500);
}

export function playRopePull() {
  // Creaking rope sound
  noise(0.1, 0.06);
  beep(200, 0.08, 'sawtooth', 0.04);
}

export function playPowerUp() {
  // Sparkle ascending
  const notes = [880, 1100, 1320, 1760];
  notes.forEach((f, i) => {
    setTimeout(() => beep(f, 0.08, 'sine', 0.08), i * 50);
  });
}

export function playPowerUpUse() {
  // Whoosh
  beep(1200, 0.05, 'sine', 0.1);
  setTimeout(() => beep(600, 0.1, 'sine', 0.08), 30);
  setTimeout(() => beep(300, 0.15, 'sine', 0.06), 60);
}

export function playReaction() {
  // Quick pop
  beep(1000, 0.04, 'sine', 0.08);
}

export function playCountdown() {
  // Tick
  beep(600, 0.05, 'square', 0.1);
}

export function playCountdownFinal() {
  // Urgent tick
  beep(900, 0.08, 'square', 0.12);
}

export function playLobbyCountdown(n: number) {
  if (n <= 0) {
    playVictory();
  } else if (n <= 3) {
    playCountdownFinal();
  } else {
    playCountdown();
  }
}

export function playDiceRoll() {
  // Rapid clicks
  for (let i = 0; i < 8; i++) {
    setTimeout(() => beep(600 + Math.random() * 400, 0.03, 'square', 0.06), i * 50);
  }
  setTimeout(() => beep(800, 0.15, 'sine', 0.12), 450);
}

export function setSoundEnabled(v: boolean) { enabled = v; }
export function isSoundEnabled() { return enabled; }
