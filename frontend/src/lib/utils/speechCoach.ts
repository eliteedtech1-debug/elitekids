/**
 * Pure helpers for the Q2 speech FE leaf (PronunciationCoach + ReadingTracker).
 * All exported for vitest — no DOM, no API.
 */

export type CoachMode = 'letter' | 'word' | 'sentence';

export interface CoachItem {
  id: string;
  expected_text: string;
  mode: CoachMode;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const WORDS = ['book', 'water', 'school', 'teacher', 'friend', 'sun', 'moon', 'tree', 'cat', 'dog'];
const SENTENCES = [
  'I love my school.',
  'Nigeria is my country.',
  'The sun is bright today.',
  'I can read a book.',
  'We play and learn together.',
  'My teacher is kind.',
];

const POOL: Record<CoachMode, string[]> = {
  letter: LETTERS,
  word: WORDS,
  sentence: SENTENCES,
};

/** Build a deterministic practice pack of `count` items (clamped to pool size). */
export function buildCoachPack(mode: CoachMode, count = 5): CoachItem[] {
  const pool = POOL[mode];
  const n = Math.max(1, Math.min(count, pool.length));
  return pool.slice(0, n).map((text, i) => ({ id: `${mode}-${i + 1}`, expected_text: text, mode }));
}

export interface BandInfo {
  band: 'amazing' | 'good' | 'getting_there' | 'try_again';
  stars: 1 | 2 | 3;
}

/** Map an overall score (0–100) to the same bands the backend uses. */
export function bandForScore(overall: number): BandInfo {
  if (overall >= 85) return { band: 'amazing', stars: 3 };
  if (overall >= 65) return { band: 'good', stars: 2 };
  if (overall >= 40) return { band: 'getting_there', stars: 1 };
  return { band: 'try_again', stars: 1 };
}

/** "1 min", "2 min", etc. from milliseconds (rounds up from ≥30s, min 1). */
export function minutesLabel(totalMs: number): string {
  if (totalMs <= 0) return '0 min';
  const mins = Math.max(1, Math.round(totalMs / 60000));
  return `${mins} min`;
}

/** Sum durations of passing attempts only (reading minutes actually spoken). */
export function readingMinutes(attempts: Array<{ passed: boolean; duration_ms: number }>): number {
  return attempts
    .filter((a) => a.passed)
    .reduce((sum, a) => sum + Math.max(0, Number(a.duration_ms) || 0), 0);
}

export interface ProgressDay {
  day: string;
  attempts: number;
  passed: number;
  avg_score: number;
}

/** Today's rollup from the /kids/speech/progress days array (or zeros). */
export function todayRollup(days: ProgressDay[] | null | undefined, today?: string): { attempts: number; passed: number } {
  const list = Array.isArray(days) ? days : [];
  const key = today || new Date().toISOString().slice(0, 10);
  const row = list.find((d) => String(d.day).slice(0, 10) === key);
  return { attempts: Number(row?.attempts || 0), passed: Number(row?.passed || 0) };
}

/** Consecutive-day reading streak ending today (days with attempts > 0). */
export function readingStreak(days: ProgressDay[] | null | undefined, today?: string): number {
  const list = Array.isArray(days) ? days : [];
  if (!list.length) return 0;
  const key = today || new Date().toISOString().slice(0, 10);
  const active = new Set(list.filter((d) => Number(d.attempts || 0) > 0).map((d) => String(d.day).slice(0, 10)));
  let streak = 0;
  const cursor = new Date(`${key}T00:00:00Z`);
  // Walk backwards from today; a streak survives if today hasn't been read yet
  // but yesterday was (active.set check handles both).
  for (let i = 0; i < 366; i++) {
    const ds = cursor.toISOString().slice(0, 10);
    if (active.has(ds)) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      // allow a "still today" gap only at the very start
      if (i === 0) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        continue;
      }
      break;
    }
  }
  return streak;
}