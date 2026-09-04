/**
 * PHONIX tests — phonics notation must be spoken as SOUNDS, never split
 * alphabet names ("/sh/" → "shh" not "ess aitch").
 */
import { describe, it, expect } from 'vitest';
import {
  PHONEME_MAP,
  isPhonicsNotation,
  phonixToSpeech,
  phonixSegment,
  phonixSegmentToSpeech,
  toPhoneme,
} from './phonix';

describe('phoneme map', () => {
  it('covers the core Jolly Phonics digraphs', () => {
    expect(PHONEME_MAP.sh).toBe('shh');
    expect(PHONEME_MAP.ch).toBe('chuh');
    expect(PHONEME_MAP.th).toBe('thh');
    expect(PHONEME_MAP.ai).toBe('ay');
    expect(PHONEME_MAP.ng).toBe('nng');
    expect(PHONEME_MAP.oo).toBe('ooh');
  });

  it('covers trigraphs, magic-e and vowel teams (full English inventory)', () => {
    expect(PHONEME_MAP.igh).toBe('eye');
    expect(PHONEME_MAP.tch).toBe('chuh');
    expect(PHONEME_MAP.dge).toBe('juh');
    expect(PHONEME_MAP.a_e).toBe('ay');
    expect(PHONEME_MAP.i_e).toBe('eye');
    expect(PHONEME_MAP.o_e).toBe('oh');
    expect(PHONEME_MAP.ea).toBe('ee');
    expect(PHONEME_MAP.ou).toBe('ow');
    expect(PHONEME_MAP.oi).toBe('oy');
    expect(PHONEME_MAP.air).toBe('air');
    expect(PHONEME_MAP.ear).toBe('eer');
    expect(PHONEME_MAP.ure).toBe('yoor');
    expect(PHONEME_MAP.qu).toBe('kwuh');
  });

  it('covers every single letter of the alphabet', () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const l of letters) expect(isKeyLike(l)).toBe(true);
  });

  const isKeyLike = (k: string) =>
    Object.prototype.hasOwnProperty.call(PHONEME_MAP, k);
});

describe('slash notation /x/', () => {
  it('converts a bare /sh/ token', () => {
    expect(phonixToSpeech('/sh/')).toBe('shh');
  });

  it('converts /x/ inside a prompt', () => {
    expect(phonixToSpeech('Tap the /ai/ sound')).toBe('Tap the ay sound');
    expect(phonixToSpeech('I say /ch/ — tap it!')).toBe('I say chuh — tap it!');
  });

  it('is case-insensitive', () => {
    expect(phonixToSpeech('/Sh/')).toBe('shh');
    expect(phonixToSpeech('/CH/')).toBe('chuh');
  });

  it('leaves unknown slash tokens alone', () => {
    expect(phonixToSpeech('/xyz/')).toBe('/xyz/');
  });

  it('converts multi-letter slash notation', () => {
    expect(phonixToSpeech('/igh/')).toBe('eye');
    expect(phonixToSpeech('/tch/')).toBe('chuh');
    expect(phonixToSpeech('find /air/')).toBe('find air');
  });
});

describe('split grapheme runs', () => {
  it('reads split digraphs as sounds, not letter names', () => {
    expect(phonixToSpeech('s h')).toBe('sss huh');
    expect(phonixToSpeech('S-H')).toBe('sss huh');
    expect(phonixToSpeech('c a t')).toBe('cuh aah tuh');
  });

  it('handles phonics-style drill sentences', () => {
    expect(phonixToSpeech('sh ch th')).toBe('shh chuh thh');
  });

  it('merges split vowel teams into one sound', () => {
    expect(phonixToSpeech('i e')).toBe('eye');
    expect(phonixToSpeech('a e')).toBe('ay');
  });

  it('maps standalone grapheme words (digraphs/trigraphs)', () => {
    expect(phonixToSpeech('sh')).toBe('shh');
    expect(phonixToSpeech('igh')).toBe('eye');
    expect(phonixToSpeech('tch')).toBe('chuh');
  });

  it('guards real English words that collide with graphemes', () => {
    expect(phonixToSpeech('or air are ear')).toBe('or air are ear');
  });

  it('keeps ordinary words untouched', () => {
    expect(phonixToSpeech('The ship sails at sea')).toBe('The ship sails at sea');
    expect(phonixToSpeech('cat')).toBe('cat'); // single 3-letter word
    expect(phonixToSpeech('Tap the red apple')).toBe('Tap the red apple');
  });

  it('does not transform single words of 1-2 letters unless part of a run', () => {
    // "at" alone is a word, not a grapheme run.
    expect(phonixToSpeech('sit at the table')).toBe('sit at the table');
  });
});

describe('heuristic', () => {
  it('detects phonics notation', () => {
    expect(isPhonicsNotation('/sh/')).toBe(true);
    expect(isPhonicsNotation('s h')).toBe(true);
    expect(isPhonicsNotation('hello world')).toBe(false);
  });
});

describe('toPhoneme (single grapheme)', () => {
  it('maps graphemes and falls back to input', () => {
    expect(toPhoneme('sh')).toBe('shh');
    expect(toPhoneme('s')).toBe('sss');
    expect(toPhoneme('zz')).toBe('zz'); // unknown → passthrough
  });
});

describe('oral segmentation (whole word → sounds)', () => {
  it('segments words with digraphs (longest-first matches trigraphs)', () => {
    expect(phonixSegment('ship')).toBe('shh ih puh');
    expect(phonixSegment('chat')).toBe('chuh aah tuh');
    expect(phonixSegment('high')).toBe('huh eye'); // h + igh — correct phonics!
  });

  it('segments with vowel teams as single sounds', () => {
    expect(phonixSegment('see')).toBe('sss ee'); // s + ee — two phonemes
  });

  it('formats for TTS with ellipsis pacing', () => {
    expect(phonixSegmentToSpeech('ship')).toBe('shh … ih … puh');
  });

  it('keeps unmapped letters rather than dropping them', () => {
    expect(phonixSegment('pxq')).toBe('puh ks q'); // x → 'ks'; lone q (no u) stays
  });
});

describe('idempotency / safety', () => {
  it('does not double-transform respelled sounds', () => {
    const once = phonixToSpeech('s h');
    expect(phonixToSpeech(once)).toBe(once); // "sss huh" chunks are 3-letter words → guarded? no — but they are not keys
  });
});
