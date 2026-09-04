/**
 * PHONIX — Phonics-aware speech preprocessing (pure functions).
 *
 * Web Speech reads phonics notation as alphabet NAMES ("/sh/" → "ess
 * aitch", "s h" → "ess aych"). Jolly Phonics teaches SOUNDS — so this
 * module converts phonics notation to TTS-friendly respellings BEFORE
 * speech synthesis, at the single choke point (sound.ts:speak()).
 *
 * Design: team-docs/PHONIX-SPEECH-ENGINE.md
 *
 * Pure + testable: no DOM, no audio. A "grapheme run" (≥2 letter-tokens of
 * 1–2 chars each, e.g. "s h", "S-H", "sh ch th") is only transformed when
 * EVERY token is a key in PHONEME_MAP — ordinary prose ("sit at the
 * table") never matches because "at"/"the" are not phoneme keys.
 */

/** Grapheme → TTS-friendly spoken sound. Keys are lowercase. */
export const PHONEME_MAP: Record<string, string> = {
  // Single-letter sounds (Jolly Phonics groups 1-3 + rest)
  s: 'sss', a: 'aah', t: 'tuh', i: 'ih', p: 'puh', n: 'nnn',
  c: 'cuh', k: 'kuh', e: 'eh', h: 'huh', r: 'rrr', m: 'mmm', d: 'duh',
  g: 'guh', o: 'oh', u: 'uh', l: 'lll', f: 'fff', b: 'buh',
  // Digraphs & vowel teams (checked via all-key runs — no ordering traps)
  ai: 'ay', oa: 'oh', ie: 'eye', ee: 'ee', or: 'or',
  z: 'zzz', w: 'wuh', ng: 'nng', v: 'vvv', oo: 'ooh',
  y: 'yuh', x: 'ks', ch: 'chuh', sh: 'shh', th: 'thh',
  qu: 'kwuh', ou: 'ow', oi: 'oy', ue: 'yoo', er: 'ur', ar: 'ar',
  ph: 'ff', wh: 'wuh', ck: 'kuh',
};

/** Maximal run of 1–2 letter tokens separated by spaces/hyphens. */
const RUN_RE = /\b[a-zA-Z]{1,2}(?:[\s\-–—_]+[a-zA-Z]{1,2})+\b/g;

const isKey = (token: string) =>
  Object.prototype.hasOwnProperty.call(PHONEME_MAP, token.toLowerCase());

/** Split a run into its grapheme tokens. */
const runTokens = (run: string) => run.split(/[\s\-–—_]+/).filter(Boolean);

/** True when every token of the run is a known phoneme key. */
function isPhonicsRun(run: string): boolean {
  const parts = runTokens(run);
  return parts.length >= 2 && parts.every(isKey);
}

/** True when the text contains phonics notation we should transform. */
export function isPhonicsNotation(text: string): boolean {
  const input = String(text || '');
  if (!input) return false;
  if (/\/[a-zA-Z]{1,3}\//.test(input)) return true; // /sh/ slash notation
  const runs = input.match(RUN_RE) || [];
  return runs.some(isPhonicsRun);
}

/**
 * Convert phonics notation to TTS-friendly speech text.
 *  - "/sh/" (with optional surrounding words) → "shh"
 *  - "s h" / "S-H" / "sh ch th" runs → "sss hhh" / "shh chuh thh"
 *  - ordinary words/sentences pass through untouched
 */
export function phonixToSpeech(text: string): string {
  const input = String(text || '');
  if (!input) return input;

  // 1) Slash notation: /sh/ → shh  (also inside prompts: "the /ai/ sound").
  //    Unknown tokens keep their slashes (passthrough for /xyz/).
  let out = input.replace(
    /(^|\s)\/([a-zA-Z]{1,3})\/(?=\s|$|[.,!?])/g,
    (_m, pre: string, g: string) => {
      const sound = PHONEME_MAP[g.toLowerCase()];
      return sound ? `${pre}${sound}` : `${pre}/${g}/`;
    }
  );

  // 2) Grapheme runs → joined sounds.
  out = out.replace(RUN_RE, (run) => {
    if (!isPhonicsRun(run)) return run;
    return runTokens(run)
      .map((p) => PHONEME_MAP[p.toLowerCase()])
      .join(' ');
  });

  return out.trim();
}

/**
 * Convert a single grapheme to its sound (drop-in replacement for the old
 * toPhonicsSound, kept for existing callers). Falls back to input.
 */
export function toPhoneme(grapheme: string): string {
  const key = (grapheme || '').trim().toLowerCase();
  return PHONEME_MAP[key] ?? grapheme;
}
