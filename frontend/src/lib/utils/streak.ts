/**
 * Daily Streak Tracker — Doc 16 §3 (Reward Equity).
 *
 * Tracks consecutive days of play using localStorage.
 * Streak is participation-based, not performance-based (reward equity).
 *
 * Streak milestones unlock sticker rewards:
 *   1 day  → First sticker (🌰 Seed Starter)
 *   3 days → 🌱 Green Thumb
 *   7 days → ⭐ Super Star
 *  14 days → 🏆 Champion
 *  30 days → 🌈 Legend
 */

const STREAK_KEY = 'elitekids-streak';

interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastPlayDate: string;  // YYYY-MM-DD
  totalDaysPlayed: number;
  milestones: string[];  // earned milestone IDs
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(d1: string, d2: string): number {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function getStreak(): StreakState {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { currentStreak: 0, longestStreak: 0, lastPlayDate: '', totalDaysPlayed: 0, milestones: [] };
}

export function saveStreak(state: StreakState): void {
  localStorage.setItem(STREAK_KEY, JSON.stringify(state));
}

/**
 * Record a play session. Returns the updated streak state.
 * Call this once per day when the student plays.
 */
export function recordPlayDay(): StreakState {
  const state = getStreak();
  const today = todayKey();

  // Already recorded today — no change
  if (state.lastPlayDate === today) return state;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split('T')[0];

  if (state.lastPlayDate === yesterdayKey) {
    // Consecutive day — extend streak
    state.currentStreak += 1;
  } else if (state.lastPlayDate) {
    // Streak broken — restart from 1
    state.currentStreak = 1;
  } else {
    // First ever play
    state.currentStreak = 1;
  }

  state.lastPlayDate = today;
  state.totalDaysPlayed += 1;
  state.longestStreak = Math.max(state.longestStreak, state.currentStreak);

  // Check milestones
  const MILESTONES = [
    { id: 'seed_starter', days: 1, emoji: '🌰', label: 'Seed Starter' },
    { id: 'green_thumb', days: 3, emoji: '🌱', label: 'Green Thumb' },
    { id: 'super_star', days: 7, emoji: '⭐', label: 'Super Star' },
    { id: 'champion', days: 14, emoji: '🏆', label: 'Champion' },
    { id: 'legend', days: 30, emoji: '🌈', label: 'Legend' },
  ];

  for (const m of MILESTONES) {
    if (state.currentStreak >= m.days && !state.milestones.includes(m.id)) {
      state.milestones.push(m.id);
    }
  }

  saveStreak(state);
  return state;
}

export function getStreakEmoji(streak: number): string {
  if (streak >= 30) return '🌈';
  if (streak >= 14) return '🏆';
  if (streak >= 7) return '⭐';
  if (streak >= 3) return '🌱';
  if (streak >= 1) return '🔥';
  return '💤';
}

export function getMilestoneRewards(): Array<{ id: string; days: number; emoji: string; label: string; earned: boolean }> {
  const state = getStreak();
  return [
    { id: 'seed_starter', days: 1, emoji: '🌰', label: 'Seed Starter', earned: state.milestones.includes('seed_starter') },
    { id: 'green_thumb', days: 3, emoji: '🌱', label: 'Green Thumb', earned: state.milestones.includes('green_thumb') },
    { id: 'super_star', days: 7, emoji: '⭐', label: 'Super Star', earned: state.milestones.includes('super_star') },
    { id: 'champion', days: 14, emoji: '🏆', label: 'Champion', earned: state.milestones.includes('champion') },
    { id: 'legend', days: 30, emoji: '🌈', label: 'Legend', earned: state.milestones.includes('legend') },
  ];
}
