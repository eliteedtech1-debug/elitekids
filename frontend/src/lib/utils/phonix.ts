/**
 * PHONIX — Phonics-aware speech preprocessing (pure functions).
 *
 * Web Speech reads phonics notation as alphabet NAMES ("/sh/" → "ess
 * aitch", "s h" → "ess aych", "igh" → "eye-gee-aitch"). Phonics teaches
 * SOUNDS — so this module converts ALL English phonics notation to
 * TTS-friendly respellings BEFORE speech synthesis, at the single choke
 * point (sound.ts:speak()).
 *
 * Coverage: single letters, digraphs, TRIGRAPHS (igh/tch/dge), magic-e
 * (a_e → ay), vowel teams, double vowels (ee/oo), r-controlled, and oral
 * segmentation ("ship" → "shh ih puh") for oral/sound games.
 *
 * Design: team-docs/PHONIX-SPEECH-ENGINE.md
 *
 * Pure + testable: no DOM, no audio. A "grapheme run" (letter-tokens of
 * 1–3 chars, e.g. "s h", "S-H", "sh ch th") is only transformed when
 * EVERY token is a key in PHONEME_MAP — ordinary prose ("sit at the
 * table") never matches because "at"/"the" are not phoneme keys.
 */

/** Grapheme → TTS-friendly spoken sound. Keys are lowercase. */
export const PHONEME_MAP: Record<string, string> = {
  // ── Single letters (consonants spoken with schwa, vowels short) ──
  s: 'sss', a: 'aah', t: 'tuh', i: 'ih', p: 'puh', n: 'nnn',
  c: 'cuh', k: 'kuh', e: 'eh', h: 'huh', r: 'rrr', m: 'mmm', d: 'duh',
  g: 'guh', o: 'oh', u: 'uh', l: 'lll', f: 'fff', b: 'buh',
  j: 'juh', z: 'zzz', w: 'wuh', v: 'vvv', y: 'yuh', x: 'ks', q: 'kwuh',
  // ── Digraphs & vowel teams ──
  sh: 'shh', ch: 'chuh', th: 'thh', ng: 'nng', ph: 'ff', wh: 'wuh',
  ck: 'kuh', qu: 'kwuh',
  ai: 'ay', oa: 'oh', ie: 'eye', ee: 'ee', oo: 'ooh',
  ou: 'ow', oi: 'oy', ue: 'yoo', ui: 'woo', ea: 'ee', ay: 'ay',
  ow: 'ow', aw: 'aw', ew: 'yoo', oe: 'oh', au: 'aw', ae: 'ay',
  // r-controlled
  ar: 'ar', er: 'ur', ir: 'ur', ur: 'ur',
  // ── Trigraphs ──
  igh: 'eye', tch: 'chuh', dge: 'juh', air: 'air', ear: 'eer', ure: 'yoor',
  // Split (magic-e) digraphs — written a_e / i_e in phonics notation
  a_e: 'ay', i_e: 'eye', o_e: 'oh', u_e: 'yoo', e_e: 'ee',
};

/** Graphemes sorted longest-first (used by future inline tokenizers). */
const GRAPHEMES = Object.keys(PHONEME_MAP).sort((x, y) => y.length - x.length);

/** English words that collide with grapheme keys — never transformed. */
const WORD_GUARDS = new Set(['or', 'air', 'are', 'ear', 'our', 'ace', 'ice']);

/** Maximal run of 1–3 letter tokens separated by spaces/hyphens. */
const RUN_RE = /\b[a-zA-Z]{1,3}(?:[\s\-–—_]+[a-zA-Z]{1,3})+\b/g;

/** Standalone grapheme word: a lone token that is a multi-char key ("sh", "igh"). */
const SOLO_RE = /\b[a-zA-Z]{2,4}\b/g;

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
  if (/\/[a-zA-Z]{1,4}\//.test(input)) return true; // /sh/, /igh/ slash notation
  const runs = input.match(RUN_RE) || [];
  return runs.some(isPhonicsRun);
}

/**
 * Merge split vowel teams inside a run: "i e" → single "ie" token (magic-e
 * and split digraphs are taught as ONE sound). Only merges pairs that form
 * a known key.
 */
function mergeSplitVowelTeams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const pair = `${tokens[i]}${tokens[i + 1] ?? ''}`.toLowerCase();
    if (i + 1 < tokens.length && isKey(pair) && pair.length === 2 && /^[aeiou]/.test(pair)) {
      out.push(pair);
      i += 1; // consumed both
    } else {
      out.push(tokens[i].toLowerCase());
    }
  }
  return out;
}

/**
 * Convert phonics notation to TTS-friendly speech text.
 *  - "/sh/" / "/igh/" (with optional surrounding words) → "shh" / "eye"
 *  - "s h" / "S-H" / "sh ch th" runs → "sss huh" / "shh chuh thh"
 *  - split vowel teams merge first: "i e" → "ie" → "eye"
 *  - standalone grapheme words ("sh", "igh", "tch") → their sound
 *  - ordinary words/sentences pass through untouched
 */
export function phonixToSpeech(text: string): string {
  const input = String(text || '');
  if (!input) return input;

  // 1) Slash notation: /sh/ → shh, /igh/ → eye (unknown tokens keep slashes).
  let out = input.replace(
    /(^|\s)\/([a-zA-Z]{1,4})\/(?=\s|$|[.,!?])/g,
    (_m, pre: string, g: string) => {
      const sound = PHONEME_MAP[g.toLowerCase()];
      return sound ? `${pre}${sound}` : `${pre}/${g}/`;
    }
  );

  // 2) Grapheme runs → joined sounds (split vowel teams merged first).
  out = out.replace(RUN_RE, (run) => {
    if (!isPhonicsRun(run)) return run;
    const tokens = runTokens(run);
    const merged = mergeSplitVowelTeams(tokens);
    // Re-check after merge: every merged token must be a key.
    if (!merged.every(isKey)) return run;
    return merged.map((p) => PHONEME_MAP[p]).join(' ');
  });

  // 3) Standalone grapheme words: a lone 2-4 letter token that is a key and
  //    not a guarded English word ("or", "air"…) gets its sound.
  out = out
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk;
      const core = chunk.replace(/[^a-zA-Z]/g, '');
      if (core.length < 2 || core.length > 4) return chunk;
      if (WORD_GUARDS.has(core.toLowerCase())) return chunk;
      if (!/^[a-zA-Z]{2,4}$/.test(core)) return chunk;
      const key = core.toLowerCase();
      if (!isKey(key) || key.length < 2) return chunk;
      return chunk.replace(core, PHONEME_MAP[key]);
    })
    .join('');

  return out.trim();
}

/**
 * Oral segmentation — speak a WHOLE WORD as its sounds ("ship" → "shh ih
 * puh", "chat" → "chuh aah tuh"). Used by oral/sound games to articulate
 * words phoneme by phoneme. Returns the respelling (no TTS here).
 */
export function phonixSegment(word: string): string {
  const w = String(word || '').trim().toLowerCase();
  if (!w) return '';
  const parts: string[] = [];
  let i = 0;
  let matched = 0;
  while (i < w.length) {
    const g = GRAPHEMES.find((key) => w.startsWith(key, i) && key !== 'q');
    if (g) {
      parts.push(PHONEME_MAP[g]);
      i += g.length;
      matched += 1;
    } else {
      parts.push(w[i]); // unmapped letter — keep it (better than dropping)
      i += 1;
      matched += 1;
    }
  }
  // Only return segmentation when the word actually decomposed into
  // multiple phonemes; single-phoneme "words" return the sound itself.
  return matched > 1 ? parts.join(' ') : parts.join(' ');
}

/**
 * Segment + format for TTS: "ship" → "shh … ih … puh" (ellipsis pacing).
 */
export function phonixSegmentToSpeech(word: string): string {
  return phonixSegment(word).split(' ').join(' … ');
}

/**
 * Convert a single grapheme to its sound (drop-in replacement for the old
 * toPhonicsSound, kept for existing callers). Falls back to input.
 */
export function toPhoneme(grapheme: string): string {
  const key = (grapheme || '').trim().toLowerCase();
  return PHONEME_MAP[key] ?? grapheme;
}
