import { describe, it, expect } from 'vitest';
import {
  getPromptDisplay,
  getResponseDisplay,
  validateInteraction,
  suggestResponseMode,
  describeInteraction,
  GAME_INTERACTIONS,
} from './game';

// ── getPromptDisplay ────────────────────────────────────────────────────────

describe('getPromptDisplay', () => {
  it('image mode: shows image only, no text', () => {
    const result = getPromptDisplay(
      { promptMode: 'image' },
      { image: 'cat.webp', label: 'Cat', text: 'Cat' },
    );
    expect(result.showImage).toBe(true);
    expect(result.showText).toBe(false);
    expect(result.image).toBe('cat.webp');
    expect(result.text).toBeUndefined();
  });

  it('text mode: shows text, image available for caller', () => {
    // getPromptDisplay returns showImage=true if item has an image,
    // but the actual rendering in GamePlay.tsx shows text-only for text mode.
    const result = getPromptDisplay(
      { promptMode: 'text' },
      { image: 'cat.webp', label: 'Cat', text: 'Find Cat' },
    );
    expect(result.showText).toBe(true);
    expect(result.showImage).toBe(true); // image data available
    expect(result.text).toBe('Find Cat');
    expect(result.image).toBe('cat.webp');
  });

  it('text mode without image: showImage is false', () => {
    const result = getPromptDisplay(
      { promptMode: 'text' },
      { label: 'Cat', text: 'Find Cat' },
    );
    expect(result.showText).toBe(true);
    expect(result.showImage).toBe(false);
  });

  it('audio mode: shows audio, no text or image', () => {
    const result = getPromptDisplay(
      { promptMode: 'audio' },
      { audio: 'meow.mp3', label: 'Cat' },
    );
    expect(result.showAudio).toBe(true);
    expect(result.showText).toBe(false);
    expect(result.showImage).toBe(false);
    expect(result.audio).toBe('meow.mp3');
  });

  it('context mode: shows text (the riddle), optional image', () => {
    const result = getPromptDisplay(
      { promptMode: 'context' },
      { context: 'An animal that says meow', image: 'cat.webp' },
    );
    expect(result.showText).toBe(true);
    expect(result.text).toBe('An animal that says meow');
    expect(result.showImage).toBe(true);
    expect(result.image).toBe('cat.webp');
  });

  it('defaults to text mode when promptMode is undefined', () => {
    const result = getPromptDisplay(
      {},
      { label: 'Cat' },
    );
    expect(result.showText).toBe(true);
    expect(result.text).toBe('Cat');
  });
});

// ── getResponseDisplay ──────────────────────────────────────────────────────

describe('getResponseDisplay', () => {
  it('image mode: shows image only, no text', () => {
    const result = getResponseDisplay(
      { responseMode: 'image' },
      { image: 'cat.webp', label: 'Cat' },
    );
    expect(result.showImage).toBe(true);
    expect(result.showText).toBe(false);
    expect(result.image).toBe('cat.webp');
    expect(result.text).toBeUndefined();
  });

  it('text mode: shows text only, NO image or emoji', () => {
    const result = getResponseDisplay(
      { responseMode: 'text' },
      { image: 'cat.webp', label: 'Cat', emoji: '🐱' },
    );
    expect(result.showText).toBe(true);
    expect(result.showImage).toBe(false);
    expect(result.text).toBe('Cat');
    // Critical: no image/emoji in text mode
    expect(result.image).toBeUndefined();
  });

  it('text mode with emoji option: returns only label text', () => {
    const result = getResponseDisplay(
      { responseMode: 'text' },
      { label: 'Dog', emoji: '🐶' },
    );
    expect(result.showText).toBe(true);
    expect(result.text).toBe('Dog');
    expect(result.showImage).toBe(false);
  });

  it('audio mode: shows audio indicator', () => {
    const result = getResponseDisplay(
      { responseMode: 'audio' },
      { label: 'Cat', audio: 'meow.mp3' },
    );
    expect(result.showAudio).toBe(true);
    expect(result.text).toBe('Cat');
  });

  it('defaults to text mode when responseMode is undefined', () => {
    const result = getResponseDisplay(
      {},
      { label: 'Cat' },
    );
    expect(result.showText).toBe(true);
    expect(result.text).toBe('Cat');
  });
});

// ── validateInteraction ─────────────────────────────────────────────────────

describe('validateInteraction', () => {
  it('warns when text prompt contains the answer text', () => {
    const warnings = validateInteraction(
      'tap-recognition',
      'text',
      'text',
      'Find the cat',
      'cat',
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe('answer-revealed');
    expect(warnings[0].message).toContain('cat');
  });

  it('no warning for image→text cross-modal', () => {
    const warnings = validateInteraction(
      'tap-recognition',
      'image',
      'text',
      undefined,
      'Cat',
    );
    expect(warnings).toHaveLength(0);
  });

  it('warns for text→text matching (redundant)', () => {
    const warnings = validateInteraction(
      'matching',
      'text',
      'text',
      'Cat',
      'Cat',
    );
    const redundant = warnings.find(w => w.type === 'redundant');
    expect(redundant).toBeDefined();
  });

  it('warns for unsupported prompt mode', () => {
    const warnings = validateInteraction(
      'drag-sort',
      'audio',
      'text',
    );
    expect(warnings.some(w => w.type === 'unsupported')).toBe(true);
  });
});

// ── suggestResponseMode ─────────────────────────────────────────────────────

describe('suggestResponseMode', () => {
  it('suggests text response for image prompt (cross-modal)', () => {
    expect(suggestResponseMode('tap-recognition', 'image')).toBe('text');
  });

  it('suggests image response for text prompt (cross-modal)', () => {
    expect(suggestResponseMode('tap-recognition', 'text')).toBe('image');
  });

  it('suggests text response for context prompt', () => {
    expect(suggestResponseMode('quiz', 'context')).toBe('text');
  });

  it('suggests image response for audio prompt', () => {
    expect(suggestResponseMode('tap-recognition', 'audio')).toBe('image');
  });
});

// ── GAME_INTERACTIONS ───────────────────────────────────────────────────────

describe('GAME_INTERACTIONS', () => {
  it('tap-recognition supports image prompt + text response', () => {
    const interactions = GAME_INTERACTIONS['tap-recognition'];
    expect(interactions.promptModes).toContain('image');
    expect(interactions.responseModes).toContain('text');
  });

  it('quiz supports image prompt + text response', () => {
    const interactions = GAME_INTERACTIONS['quiz'];
    expect(interactions.promptModes).toContain('image');
    expect(interactions.responseModes).toContain('text');
  });

  it('matching supports text prompt + image response', () => {
    const interactions = GAME_INTERACTIONS['matching'];
    expect(interactions.promptModes).toContain('text');
    expect(interactions.responseModes).toContain('image');
  });
});

// ── describeInteraction ─────────────────────────────────────────────────────

describe('describeInteraction', () => {
  it('describes image→text as vocabulary identification', () => {
    const desc = describeInteraction('image', 'text');
    expect(desc).toBe('Show image, pick the correct word');
  });

  it('describes text→image as reading + recognition', () => {
    const desc = describeInteraction('text', 'image');
    expect(desc).toBe('Show text, pick the matching image');
  });
});
