/**
 * Daily Streak Tracker — Doc 16 §3 (Reward Equity).
 *
 * Tracks consecutive days of play. Backend is source of truth;
 * localStorage serves as offline cache / fallback.
 *
 * Streak milestones unlock sticker rewards:
 *   1 day  → First sticker (🌰 Seed Starter)
 *   3 days → 🌱 Green Thumb
 *   7 days → ⭐ Super Star
 *  14 days → 🏆 Champion
 *  30 days → 🌈 Legend
 */

import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const STREAK_KEY = 'elitekids-streak';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastPlayDate: string;  // YYYY-MM-DD
  totalDaysPlayed: number;
  milestones: string[];  // earned milestone IDs
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// ── localStorage helpers (offline fallback) ──────────────────────────────

export function getStreakLocal(): StreakState {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { currentStreak: 0, longestStreak: 0, lastPlayDate: '', totalDaysPlayed: 0, milestones: [] };
}

function saveStreakLocal(state: StreakState): void {
  localStorage.setItem(STREAK_KEY, JSON.stringify(state));
}

function daysBetween(d1: string, d2: string): number {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Offline record (localStorage only) ──────────────────────────────────

function recordPlayDayLocal(): StreakState {
  const state = getStreakLocal();
  const today = todayKey();
  if (state.lastPlayDate === today) return state;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split('T')[0];

  if (state.lastPlayDate === yesterdayKey) {
    state.currentStreak += 1;
  } else if (state.lastPlayDate) {
    state.currentStreak = 1;
  } else {
    state.currentStreak = 1;
  }

  state.lastPlayDate = today;
  state.totalDaysPlayed += 1;
  state.longestStreak = Math.max(state.longestStreak, state.currentStreak);

  const MILESTONES = [
    { id: 'seed_starter', days: 1 },
    { id: 'green_thumb', days: 3 },
    { id: 'super_star', days: 7 },
    { id: 'champion', days: 14 },
    { id: 'legend', days: 30 },
  ];
  for (const m of MILESTONES) {
    if (state.currentStreak >= m.days && !state.milestones.includes(m.id)) {
      state.milestones.push(m.id);
    }
  }

  saveStreakLocal(state);
  return state;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get streak state. Tries backend first, falls back to localStorage.
 */
export async function getStreak(childAdmissionNo?: string): Promise<StreakState> {
  try {
    const url = childAdmissionNo
      ? `${ENDPOINTS.STREAK.GET}?child_admission_no=${encodeURIComponent(childAdmissionNo)}`
      : ENDPOINTS.STREAK.GET;
    const res = await apiClient.get(url);
    const data = res.data?.data;
    if (data) {
      const state: StreakState = {
        currentStreak: data.currentStreak || 0,
        longestStreak: data.longestStreak || 0,
        lastPlayDate: data.lastPlayDate || '',
        totalDaysPlayed: data.totalDaysPlayed || 0,
        milestones: data.milestones || [],
      };
      saveStreakLocal(state); // cache for offline
      return state;
    }
  } catch {}
  return getStreakLocal();
}

/**
 * Record a play day. Tries backend first, falls back to localStorage.
 */
export async function recordPlayDay(childAdmissionNo?: string): Promise<StreakState> {
  try {
    const res = await apiClient.post(ENDPOINTS.STREAK.RECORD, {
      child_admission_no: childAdmissionNo || '',
    });
    const data = res.data?.data;
    if (data) {
      const state: StreakState = {
        currentStreak: data.currentStreak || 0,
        longestStreak: data.longestStreak || 0,
        lastPlayDate: data.lastPlayDate || '',
        totalDaysPlayed: data.totalDaysPlayed || 0,
        milestones: data.milestones || [],
      };
      saveStreakLocal(state);
      return state;
    }
  } catch {}
  return recordPlayDayLocal();
}

// ── Helpers (no async needed) ───────────────────────────────────────────

export function getStreakEmoji(streak: number): string {
  if (streak >= 30) return '🌈';
  if (streak >= 14) return '🏆';
  if (streak >= 7) return '⭐';
  if (streak >= 3) return '🌱';
  if (streak >= 1) return '🔥';
  return '💤';
}

export function getMilestoneRewards(): Array<{ id: string; days: number; emoji: string; label: string; earned: boolean }> {
  const state = getStreakLocal(); // sync read is fine for display
  return [
    { id: 'seed_starter', days: 1, emoji: '🌰', label: 'Seed Starter', earned: state.milestones.includes('seed_starter') },
    { id: 'green_thumb', days: 3, emoji: '🌱', label: 'Green Thumb', earned: state.milestones.includes('green_thumb') },
    { id: 'super_star', days: 7, emoji: '⭐', label: 'Super Star', earned: state.milestones.includes('super_star') },
    { id: 'champion', days: 14, emoji: '🏆', label: 'Champion', earned: state.milestones.includes('champion') },
    { id: 'legend', days: 30, emoji: '🌈', label: 'Legend', earned: state.milestones.includes('legend') },
  ];
}
