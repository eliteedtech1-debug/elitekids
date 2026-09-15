import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheServerStreak, getStreakLocal, type StreakState } from './streak';

/**
 * A play day is earned by PLAYING, not by opening the app (Q58).
 *
 * This pins the two halves the frontend owns:
 *   1. `cacheServerStreak` — what the dashboard uses to refresh the streak it
 *      displays — must NOT claim the child played, so `lastPlayDate` (which
 *      drives the "played today" reminder) stays truthful;
 *   2. the call sites stay put: the dashboard never records a play day, and the
 *      game-completion path does.
 */

const KEY = 'elitekids-streak';

// vitest runs in a node environment here (no jsdom) and streak.ts keeps its
// offline cache in localStorage — provide the smallest faithful stand-in. The
// module only reads/writes localStorage inside its functions, never at import.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const seed = (partial: Partial<StreakState>) => {
  const state: StreakState = {
    currentStreak: 0,
    longestStreak: 0,
    lastPlayDate: '',
    totalDaysPlayed: 0,
    milestones: [],
    ...partial,
  };
  store.set(KEY, JSON.stringify(state));
  return state;
};

beforeEach(() => store.clear());

describe('cacheServerStreak — a READ, never a play day', () => {
  it('does not claim the child played: lastPlayDate and milestones are untouched', () => {
    // Played three days ago, has not played today.
    seed({
      currentStreak: 4,
      longestStreak: 9,
      lastPlayDate: '2026-09-12',
      totalDaysPlayed: 20,
      milestones: ['seed_starter'],
    });

    const merged = cacheServerStreak(4, 9);

    expect(merged.currentStreak).toBe(4);
    // The whole point: showing the streak must not make the app think the child
    // played today — that used to be exactly how a dashboard load advanced it.
    expect(merged.lastPlayDate).toBe('2026-09-12');
    expect(merged.totalDaysPlayed).toBe(20);
    expect(merged.milestones).toEqual(['seed_starter']);
    expect(getStreakLocal().lastPlayDate).toBe('2026-09-12');
  });

  it('takes the server value for the current streak and never lowers the longest', () => {
    seed({ currentStreak: 4, longestStreak: 9 });

    expect(cacheServerStreak(2, 4).currentStreak).toBe(2);
    expect(cacheServerStreak(2, 4).longestStreak).toBe(9);
  });

  it('leaves a fresh device with no play history exactly that', () => {
    const merged = cacheServerStreak(3, 3);

    expect(merged.currentStreak).toBe(3);
    expect(merged.lastPlayDate).toBe(''); // never played here, and it says so
    expect(merged.totalDaysPlayed).toBe(0);
  });

  it('ignores a non-numeric server value instead of wiping the streak', () => {
    seed({ currentStreak: 5, longestStreak: 5 });

    expect(cacheServerStreak(Number.NaN, Number.NaN).currentStreak).toBe(5);
  });
});

describe('call-site contract: only real play records a play day', () => {
  const read = (rel: string) => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../pages/Student', rel), 'utf8');
    // Match CODE, not prose: a comment that names the call must not satisfy (or
    // trip) the guard.
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  };

  it('StudentHome does not record a play day on mount', () => {
    const src = read('StudentHome.tsx');

    expect(src).not.toMatch(/recordPlayDay\s*\(/);
    // …and it still refreshes what the child sees, from a read.
    expect(src).toMatch(/cacheServerStreak\(/);
  });

  it('GamePlay records the play day where a game actually completes', () => {
    const src = read('GamePlay.tsx');

    expect(src).toMatch(/recordPlayDay\(admissionNo\)/);
  });
});
