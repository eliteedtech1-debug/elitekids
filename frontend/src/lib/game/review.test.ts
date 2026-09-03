import { describe, it, expect } from 'vitest';
import {
  reviewQualityFromAccuracy,
  qualityForAnswers,
  pickNextRecs,
  reasonEmoji,
  humanizeSkill,
  type NextItemRec,
} from './review';

describe('reviewQualityFromAccuracy (SRE v2 SM-2 grading)', () => {
  it('maps accuracy bands to SM-2 quality 0-5 (>=3 pass, <3 fail)', () => {
    expect(reviewQualityFromAccuracy(1)).toBe(5);
    expect(reviewQualityFromAccuracy(0.9)).toBe(5); // boundary: >= 0.9 → 5
    expect(reviewQualityFromAccuracy(0.89)).toBe(4);
    expect(reviewQualityFromAccuracy(0.7)).toBe(4); // boundary: >= 0.7 → 4
    expect(reviewQualityFromAccuracy(0.69)).toBe(3);
    expect(reviewQualityFromAccuracy(0.5)).toBe(3); // boundary: >= 0.5 → 3 (pass)
    expect(reviewQualityFromAccuracy(0.49)).toBe(2); // below 0.5 → fail
    expect(reviewQualityFromAccuracy(0.3)).toBe(2); // boundary: >= 0.3 → 2
    expect(reviewQualityFromAccuracy(0.29)).toBe(1);
    expect(reviewQualityFromAccuracy(0)).toBe(1);
  });

  it('grades an answer list by percentage (empty list = failed session)', () => {
    expect(qualityForAnswers([{ correct: true }, { correct: true }, { correct: true }])).toBe(5);
    expect(qualityForAnswers([{ correct: true }, { correct: true }, { correct: false }])).toBe(3); // 0.667 → <0.7 band
    expect(qualityForAnswers([{ correct: true }, { correct: false }])).toBe(3); // 0.5 pass
    expect(qualityForAnswers([{ correct: false }, { correct: false }])).toBe(1); // 0.0
    expect(qualityForAnswers([])).toBe(1); // nothing answered → retry
  });
});

describe('pickNextRecs (ADE v2 next-item result panel)', () => {
  const recs: NextItemRec[] = [
    { skill_key: 'lesson-a', lesson_id: 'lesson-a', difficulty: 3, reason: 'needs_practice', mastery_probability: 0.1 },
    { skill_key: 'lesson-b', lesson_id: 'lesson-b', difficulty: 4, reason: 'strengthen', mastery_probability: 0.4 },
    { skill_key: 'lesson-c', lesson_id: 'lesson-c', difficulty: 2, reason: 'strengthen', mastery_probability: 0.45 },
    { skill_key: 'lesson-d', lesson_id: 'lesson-d', difficulty: 5, reason: 'new_skill', mastery_probability: 0 },
  ];

  it('drops the lesson just played and keeps order', () => {
    const out = pickNextRecs(recs, 'lesson-b');
    expect(out.map((r) => r.lesson_id)).toEqual(['lesson-a', 'lesson-c', 'lesson-d']);
  });

  it('excludes items without a navigable lesson_id (backend sentinel fallback)', () => {
    const withSentinel: NextItemRec[] = [
      ...recs,
      { skill_key: 'general', lesson_id: null, difficulty: 3, reason: 'new_skill', mastery_probability: 0 },
    ];
    const out = pickNextRecs(withSentinel, 'lesson-b');
    expect(out.some((r) => r.lesson_id === null)).toBe(false);
    expect(out).toHaveLength(3);
  });

  it('caps at 3 recommendations and never exceeds them', () => {
    expect(pickNextRecs(recs, 'lesson-x')).toHaveLength(3);
    expect(pickNextRecs(recs, 'lesson-x', 2)).toHaveLength(2);
    expect(pickNextRecs(recs, 'lesson-x', 10)).toHaveLength(4); // fewer than cap → all
  });

  it('tolerates empty / non-array input', () => {
    expect(pickNextRecs([], 'lesson-a')).toEqual([]);
    expect(pickNextRecs(recs, 'lesson-a')).toHaveLength(3);
  });
});

describe('result-screen label helpers', () => {
  it('maps reasons to kid-safe emoji (language-neutral)', () => {
    expect(reasonEmoji('needs_practice')).toBe('🎯');
    expect(reasonEmoji('strengthen')).toBe('💪');
    expect(reasonEmoji('new_skill')).toBe('✨');
    expect(reasonEmoji('anything-else')).toBe('✨'); // default
  });

  it('humanizes skill keys for display', () => {
    expect(humanizeSkill('lesson-u1-tap')).toBe('Lesson U1 Tap');
    expect(humanizeSkill('phonics.blending.cv')).toBe('Phonics.Blending.Cv'); // word boundary after dot too
    expect(humanizeSkill('a17-item-1')).toBe('A17 Item 1');
  });
});
