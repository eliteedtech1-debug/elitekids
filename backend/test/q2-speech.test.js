'use strict';

/**
 * Q2 2027 — Speech Analyzer pure-logic tests (roadmap §2.5).
 * No DB required (mirrors q1-economy.test.js convention).
 */

const { normalize, wordSimilarity, scoreAttempt, feedbackBand } = require('../src/services/speechAnalyzer');

describe('normalize', () => {
  test('lowercases, strips punctuation, collapses spaces', () => {
    expect(normalize('  Hello,  World! ')).toBe('hello world');
    expect(normalize('A-B-C')).toBe('a b c');
  });
});

describe('wordSimilarity', () => {
  test('identical words = 1', () => {
    expect(wordSimilarity('cat', 'cat')).toBe(1);
  });
  test('near-miss counts partially (kid accent tolerance)', () => {
    const s = wordSimilarity('cat', 'cap');
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });
  test('unrelated words are low', () => {
    expect(wordSimilarity('cat', 'dog')).toBeLessThanOrEqual(0.34);
  });
});

describe('scoreAttempt — word mode', () => {
  test('perfect transcript scores high and passes', () => {
    const r = scoreAttempt({ expectedText: 'apple', transcript: 'apple', durationMs: 900, mode: 'word' });
    expect(r.overall).toBeGreaterThanOrEqual(85);
    expect(r.wordAccuracy).toBe(1);
  });

  test('near-miss transcript gets partial credit', () => {
    const perfect = scoreAttempt({ expectedText: 'apple', transcript: 'apple' });
    const near = scoreAttempt({ expectedText: 'apple', transcript: 'aple' });
    expect(near.overall).toBeGreaterThan(30);
    expect(near.overall).toBeLessThan(perfect.overall);
  });

  test('wrong transcript scores low', () => {
    const r = scoreAttempt({ expectedText: 'apple', transcript: 'banana' });
    expect(r.overall).toBeLessThan(40);
  });
});

describe('scoreAttempt — sentence mode', () => {
  test('all words present = high word accuracy', () => {
    const r = scoreAttempt({
      expectedText: 'The cat sat on the mat',
      transcript: 'the cat sat on the mat',
      mode: 'sentence',
      durationMs: 2500,
    });
    expect(r.wordAccuracy).toBe(1);
    expect(r.overall).toBeGreaterThanOrEqual(80);
  });

  test('missing words reduce accuracy proportionally', () => {
    const r = scoreAttempt({
      expectedText: 'The cat sat on the mat',
      transcript: 'the cat sat mat',
      mode: 'sentence',
    });
    expect(r.wordAccuracy).toBeGreaterThan(0.5);
    expect(r.wordAccuracy).toBeLessThan(1);
  });
});

describe('scoreAttempt — letter mode', () => {
  test('correct letter passes', () => {
    const r = scoreAttempt({ expectedText: 'B', transcript: 'bee', mode: 'letter' });
    expect(r.letterAccuracy).toBe(1);
    expect(r.overall).toBeGreaterThanOrEqual(60);
  });
});

describe('feedbackBand', () => {
  test('bands escalate with score', () => {
    expect(feedbackBand(95).band).toBe('amazing');
    expect(feedbackBand(70).band).toBe('good');
    expect(feedbackBand(50).band).toBe('getting_there');
    expect(feedbackBand(10).band).toBe('try_again');
  });
});
