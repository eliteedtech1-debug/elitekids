/**
 * Phoneme audio bank tests — slug mapping, overrides, availability,
 * sequenced playback, and graceful behavior without Web Audio.
 * (Repo vitest runs in a plain node environment, so we stub globalThis.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  phonemeSlug,
  getPhonemeUrl,
  setPhonemeOverrides,
  clearPhonemeOverrides,
  preloadPhonemeBank,
  isSlugAvailable,
  playPhoneme,
  playPhonemeSequence,
} from './phonemeBank';

type AnyRec = Record<string, unknown>;
const g = globalThis as unknown as AnyRec;

// ── Web Audio + fetch stubs ─────────────────────────────────
class FakeSource {
  buffer: unknown = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect() { /* noop */ }
  start() {
    setTimeout(() => this.onended?.(), 0);
  }
  stop() { /* noop */ }
}

function installAudioMock() {
  const ctx = {
    state: 'running',
    resume: async () => {},
    destination: {},
    createBufferSource: () => new FakeSource(),
    decodeAudioData: async () => ({ duration: 0.3 }),
  };
  const Ctor = function () { return ctx; };
  g.window = { AudioContext: Ctor };
  return ctx;
}

function installFetchMock() {
  const fetched: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    if (url.endsWith('/shh.wav') || url.endsWith('/sss.wav') || url.endsWith('/ih.wav') || url.endsWith('/puh.wav')) {
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }
    return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
  });
  return fetched;
}

beforeEach(() => {
  clearPhonemeOverrides();
  installAudioMock();
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete g.window;
});

describe('no Web Audio environment', () => {
  // NOTE: must run BEFORE any test that creates the module-level
  // AudioContext singleton, otherwise the cached ctx masks the missing
  // constructor. Keep this block first.
  it('degrades to false without throwing', async () => {
    g.window = {}; // window exists but no AudioContext constructor
    await expect(playPhoneme('shh')).resolves.toBe(false);
    await expect(playPhonemeSequence(['shh'], 0)).resolves.toBe(false);
    await expect(preloadPhonemeBank()).resolves.toBe(0);
  });

  it('degrades without any window at all', async () => {
    delete g.window;
    await expect(playPhoneme('shh')).resolves.toBe(false);
  });
});

describe('phonemeSlug', () => {
  it('maps graphemes to their bank slug', () => {
    expect(phonemeSlug('sh')).toBe('shh');
    expect(phonemeSlug('SH')).toBe('shh');
    expect(phonemeSlug('ai')).toBe('ay');
  });

  it('accepts slugs / respelled sounds directly', () => {
    expect(phonemeSlug('shh')).toBe('shh');
    expect(phonemeSlug('chuh')).toBe('chuh');
  });

  it('returns null for unknown keys', () => {
    expect(phonemeSlug('zz')).toBeNull();
    expect(phonemeSlug('')).toBeNull();
  });
});

describe('overrides', () => {
  it('remap slug URLs and can be cleared', () => {
    expect(getPhonemeUrl('shh')).toBe('/audio/phonemes/shh.wav');
    setPhonemeOverrides({ shh: '/audio/custom/sh-sound.mp3' });
    expect(getPhonemeUrl('shh')).toBe('/audio/custom/sh-sound.mp3');
    setPhonemeOverrides({ SHH: null as unknown as string });
    expect(getPhonemeUrl('shh')).toBe('/audio/phonemes/shh.wav'); // null clears override
    clearPhonemeOverrides();
    expect(getPhonemeUrl('shh')).toBe('/audio/phonemes/shh.wav');
  });
});

describe('preload + availability', () => {
  it('counts only sounds that actually loaded', async () => {
    const n = await preloadPhonemeBank();
    expect(n).toBeGreaterThanOrEqual(3); // shh, sss, ih, puh exist in the fetch stub
    expect(isSlugAvailable('shh')).toBe(true);
    expect(isSlugAvailable('igh')).toBe(false); // stub 404s it
  });

  it('plays an available slug and reports success', async () => {
    await preloadPhonemeBank();
    await expect(playPhoneme('shh')).resolves.toBe(true);
  });

  it('resolves false for missing slugs (caller falls back to TTS)', async () => {
    await expect(playPhoneme('igh')).resolves.toBe(false);
    await expect(playPhoneme(null)).resolves.toBe(false);
  });
});

describe('sequenced playback', () => {
  it('plays full available sequences', async () => {
    await preloadPhonemeBank();
    await expect(playPhonemeSequence(['shh', 'ih', 'puh'], 0)).resolves.toBe(true);
  });

  it('fails fast when any slug is missing', async () => {
    await preloadPhonemeBank();
    await expect(playPhonemeSequence(['shh', 'zzz-missing'], 0)).resolves.toBe(false);
  });
});
