/**
 * L2-FE Phase 3 gate — scene normalizer + library helpers.
 *
 *  - legacy {id,text,type} / {sceneId,narrationText,sceneType} → canonical v2
 *  - emoji/palette fallback chain for unknown backgrounds + characters
 *  - visual-story detection (text-only lessons keep the legacy path)
 *  - flattenScenes across wrapper shapes
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeScene,
  flattenScenes,
  isVisualStory,
  estimateDurationSec,
  libraryEntry,
  backgroundVisual,
} from '@/lib/utils/scenes';

describe('normalizeScene — legacy → v2', () => {
  it('maps legacy {id,text,type} cards into canonical v2', () => {
    const s = normalizeScene({ id: 1, text: 'Hello!', type: 'intro' });
    expect(s.id).toBe('1');
    expect(s.text).toBe('Hello!');
    expect(s.type).toBe('intro');
    expect(s.legacy).toBe(true);
    expect(s.transition).toBe('fade');
    expect(s.subtitles).toBe(true);
    expect(s.characters).toEqual([]);
    expect(s.durationSec).toBeUndefined();
  });

  it('tolerates the AI alias shape {sceneId,narrationText,sceneType}', () => {
    const s = normalizeScene({ sceneId: 's9', narrationText: 'Watch this!', sceneType: 'teach' });
    expect(s.id).toBe('s9');
    expect(s.text).toBe('Watch this!');
    expect(s.type).toBe('teach');
  });

  it('keeps unknown types safe (never crashes)', () => {
    expect(normalizeScene({ id: 1, text: 'x', type: 'mystery' }).type).toBe('intro');
    expect(normalizeScene(null).text).toBe('');
    expect(normalizeScene(undefined).legacy).toBe(true);
  });

  it('legacy "match" normalizes to reinforce (no standalone match scene type)', () => {
    expect(normalizeScene({ text: 'go', type: 'match' }).type).toBe('reinforce');
  });

  it('preserves v2 visual fields + clamps durationSec', () => {
    const s = normalizeScene({
      id: 'c1',
      type: 'game_checkpoint',
      text: 'Play!',
      background: 'farm-daytime',
      image: 'https://cdn/x.png',
      characters: [{ name: 'Buddy', rigId: 'buddy-the-fox', position: 'center' }],
      narrationAudio: 'https://cdn/a.mp3',
      durationSec: 90,
      transition: 'slide',
      subtitles: false,
      gameId: 'L1',
    });
    expect(s.legacy).toBe(false);
    expect(s.type).toBe('game_checkpoint');
    expect(s.background).toBe('farm-daytime');
    expect(s.durationSec).toBe(60); // clamped
    expect(s.transition).toBe('slide');
    expect(s.subtitles).toBe(false);
    expect(s.gameId).toBe('L1');
    expect(s.characters?.[0]?.name).toBe('Buddy');
  });
});

describe('visual story detection', () => {
  it('text-only stories are NOT visual (legacy path keeps playing)', () => {
    expect(
      isVisualStory([
        { id: 1, text: 'Once upon a time…', type: 'intro' },
        { id: 2, text: 'The end.', type: 'recap' },
      ]),
    ).toBe(false);
  });

  it('any v2 visual field flips the story into pager mode', () => {
    expect(isVisualStory([{ text: 'x', type: 'intro' }, { text: 'y', type: 'teach', background: 'classroom' }])).toBe(true);
    expect(isVisualStory([{ text: 'x', type: 'game_checkpoint', gameId: 'L9' }])).toBe(true);
    expect(isVisualStory([{ text: 'x', type: 'recap', durationSec: 6 }])).toBe(true);
    expect(isVisualStory([])).toBe(false);
  });
});

describe('estimateDurationSec', () => {
  it('uses an explicit duration when present', () => {
    expect(estimateDurationSec({ durationSec: 7, text: 'x', type: 'intro' })).toBe(7);
  });
  it('estimates from narration length for text cards', () => {
    const short = estimateDurationSec({ text: 'Hi', type: 'teach' });
    expect(short).toBeGreaterThanOrEqual(3);
    expect(short).toBeLessThanOrEqual(14);
    const long = estimateDurationSec({ text: 'word '.repeat(30), type: 'teach' });
    expect(long).toBeGreaterThan(short);
  });
  it('checkpoint cards get a stable default', () => {
    expect(estimateDurationSec({ text: '', type: 'game_checkpoint' })).toBe(8);
  });
});

describe('flattenScenes across wrapper shapes', () => {
  it('flattens wrapper arrays, raw arrays and mixtures in order', () => {
    const payload = [
      { scenes: [{ id: 1, text: 'a', type: 'intro' }, { id: 2, text: 'b', type: 'teach' }] },
      [{ id: 3, text: 'c', type: 'reinforce' }],
      { id: 4, text: 'd', type: 'recap' },
    ];
    const flat = flattenScenes(payload);
    expect(flat.map((s) => s.text)).toEqual(['a', 'b', 'c', 'd']);
    // ORDER is preserved for every shape.
    expect(flat.map((s) => s.type)).toEqual(['intro', 'teach', 'reinforce', 'recap']);
  });
});

describe('library fallback chain', () => {
  it('looks up approved backgrounds and falls back to built-ins offline', () => {
    const lib = { backgrounds: [{ key: 'farm-daytime', label: 'Farm', emoji: '🌾', palette: ['#a', '#b'] }], characters: [], transitions: [] };
    const hit = libraryEntry(lib, 'backgrounds', 'farm-daytime');
    expect(hit?.emoji).toBe('🌾');
    // Unknown key → built-in default lookup still answers with a fallback visual
    const unknown = backgroundVisual({}, 'farm-daytime');
    expect(unknown.emoji).toBeTruthy();
    const visual = backgroundVisual({}, 'not-a-key');
    expect(visual.emoji).toBeTruthy(); // generic fallback, never broken
    expect(visual.palette.length).toBe(2);
  });
});
