/**
 * PHONIX tests — phonics notation must be spoken as SOUNDS, never split
 * alphabet names ("/sh/" → "shh" not "ess aitch").
 */
import { describe, it, expect } from 'vitest';
import {
  PHONEME_MAP,
  isPhonicsNotation,
  phonixToSpeech,
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

describe('idempotency / safety', () => {
  it('does not double-transform respelled sounds', () => {
    const once = phonixToSpeech('s h');
    expect(phonixToSpeech(once)).toBe(once); // "sss hhh" chunks are 3 letters → words
  });
});
