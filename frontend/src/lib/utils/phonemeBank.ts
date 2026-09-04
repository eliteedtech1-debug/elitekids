/**
 * PHONIX phoneme audio bank — Web Audio player.
 *
 * Plays pre-recorded phoneme files (frontend/public/audio/phonemes/<slug>.wav)
 * for PERFECT drill sounds ("shh" is a real /ʃ/, not a TTS respelling).
 * Falls back gracefully: callers check availability and use TTS respelling
 * (phonixSegmentToSpeech) when the bank is missing a sound.
 *
 * Slugs are exactly the PHONEME_MAP values from phonix.ts ("shh", "chuh",
 * "ay", …). Teacher/lesson overrides can remap a slug to any URL.
 */
import { PHONEME_MAP } from './phonix';

const BANK_DIR = '/audio/phonemes';

/** slug → override URL (teacher/lesson pronunciation overrides). */
const overrides = new Map<string, string>();

/** Decoded buffers + availability, filled by preloadPhonemeBank(). */
const buffers = new Map<string, AudioBuffer>();
let ctx: AudioContext | null = null;
let preloading: Promise<number> | null = null;

/** Active playback sources — stopped by cancelPhonemePlayback(). */
let activeSources: AudioBufferSourceNode[] = [];

export function getPhonemeUrl(slug: string): string {
  const key = slug.trim().toLowerCase();
  return overrides.get(key) ?? `${BANK_DIR}/${key}.wav`;
}

/** Teacher/lesson pronunciation override: remap a phoneme slug to a URL. */
export function setPhonemeOverrides(map: Record<string, string> | null | undefined): void {
  if (!map) return;
  for (const [k, v] of Object.entries(map)) {
    const slug = k.trim().toLowerCase();
    if (!slug) continue;
    if (v) overrides.set(slug, v);
    else overrides.delete(slug);
    buffers.delete(slug); // force re-fetch with new URL
  }
}

export function clearPhonemeOverrides(): void {
  overrides.clear();
  buffers.clear();
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Map a grapheme or respelling to its bank slug (PHONEME_MAP value). */
export function phonemeSlug(graphemeOrSound: string): string | null {
  const key = (graphemeOrSound || '').trim().toLowerCase();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(PHONEME_MAP, key)) {
    return PHONEME_MAP[key];
  }
  // Already a slug ("shh") or a respelled sound passed back in.
  if (Object.values(PHONEME_MAP).includes(key)) return key;
  return null;
}

export function isSlugAvailable(slug: string): boolean {
  return buffers.has(slug.trim().toLowerCase());
}

/** Fetch+decode a single slug (private, resolve null on failure). */
async function decodeSlug(slug: string): Promise<AudioBuffer | null> {
  const c = getCtx();
  if (!c) return null;
  try {
    const res = await fetch(getPhonemeUrl(slug));
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = await c.decodeAudioData(ab);
    buffers.set(slug, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Full bank manifest — matches gen-phoneme-audio.mjs output. */
export const PHONEME_BANK_SLUGS = Object.values(PHONEME_MAP);

/**
 * Preload the whole bank (~700 KB, 44 files). Best-effort: missing files
 * just stay unavailable. Safe to call repeatedly (single flight).
 * Resolves with the number of sounds actually available.
 */
export function preloadPhonemeBank(): Promise<number> {
  if (preloading) return preloading;
  const unique = Array.from(new Set(PHONEME_BANK_SLUGS)).filter((s) => !buffers.has(s));
  preloading = (async () => {
    let ok = 0;
    await Promise.all(
      unique.map(async (slug) => {
        const buf = await decodeSlug(slug);
        if (buf) ok += 1;
      })
    );
    return ok;
  })();
  preloading.then(() => { preloading = null; }).catch(() => { preloading = null; });
  return preloading;
}

export function cancelPhonemePlayback(): void {
  for (const s of activeSources) {
    try { s.stop(); } catch { /* already stopped */ }
  }
  activeSources = [];
}

/**
 * Play one phoneme slug. Resolves when the sound finishes (or false-y slug
 * / unavailable → resolves false so caller can fall back to TTS).
 */
export async function playPhoneme(slug: string | null, rate = 1): Promise<boolean> {
  if (!slug) return false;
  const key = slug.trim().toLowerCase();
  const buf = buffers.get(key) ?? (await decodeSlug(key));
  const c = getCtx();
  if (!buf || !c) return false;
  cancelPhonemePlayback();
  return new Promise<boolean>((resolve) => {
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.5, Math.min(2, rate));
      src.connect(c.destination);
      src.onended = () => {
        activeSources = activeSources.filter((s) => s !== src);
        resolve(true);
      };
      activeSources.push(src);
      src.start();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Play phonemes in sequence with a small gap (drill pacing).
 * Resolves false if ANY slug is unavailable (caller falls back to TTS),
 * true when the full sequence played.
 */
export async function playPhonemeSequence(slugs: string[], gapMs = 180): Promise<boolean> {
  const list = slugs.filter(Boolean).map((s) => s.trim().toLowerCase());
  if (!list.length) return false;
  for (const slug of list) {
    if (!buffers.has(slug) && !(await decodeSlug(slug))) return false;
  }
  for (const slug of list) {
    const played = await playPhoneme(slug);
    if (!played) return false;
    await new Promise((r) => setTimeout(r, gapMs));
  }
  return true;
}

/** Segment a word via Phonix and play it as phoneme audio ("ship" → shh ih puh). */
export async function speakPhonemeWord(word: string, gapMs = 180): Promise<boolean> {
  const { phonixSegment } = await import('./phonix');
  const seg = phonixSegment(word);
  if (!seg) return false;
  return playPhonemeSequence(seg.split(' '), gapMs);
}
