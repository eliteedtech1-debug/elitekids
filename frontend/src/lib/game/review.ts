/**
 * Q1 Phase 2 (SRS §12.2) — pure helpers behind the SRE v2 grading loop and the
 * ADE v2 next-item "What's next?" recommendations rendered on the result screen.
 *
 * Kept framework-free so they are unit-testable without mounting GamePlay.
 */

/** Map a session's accuracy (0..1) to an SM-2 quality grade (0..5). <3 = fail. */
export function reviewQualityFromAccuracy(pct: number): number {
  if (pct >= 0.9) return 5;
  if (pct >= 0.7) return 4;
  if (pct >= 0.5) return 3;
  if (pct >= 0.3) return 2;
  return 1;
}

/** Convenience: grade a list of per-tap answers (empty → treated as failed). */
export function qualityForAnswers<T extends { correct: boolean }>(answers: T[]): number {
  const pct = answers.length > 0 ? answers.filter((a) => a.correct).length / answers.length : 0;
  return reviewQualityFromAccuracy(pct);
}

/**
 * Filter ADE v2 next-item results down to playable recommendations:
 * keep items that carry a lesson_id, drop the lesson just played, cap at 3.
 */
export interface NextItemRec {
  skill_key: string;
  lesson_id: string | null;
  difficulty: number;
  reason: string;
  mastery_probability: number;
}

export function pickNextRecs(items: NextItemRec[], excludeLessonId?: string | null, limit = 3): NextItemRec[] {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.lesson_id && it.lesson_id !== excludeLessonId)
    .slice(0, limit);
}

/** Kid-safe icon per recommendation reason (language-neutral). */
export function reasonEmoji(reason: string): string {
  return reason === 'needs_practice' ? '🎯' : reason === 'strengthen' ? '💪' : '✨';
}

/** skill_key → display label: 'lesson-u1-tap' → 'Lesson U1 Tap'. */
export function humanizeSkill(skill: string): string {
  return skill.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
