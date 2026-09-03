import { XP_ACTIONS, STREAK_MULTIPLIERS, type EconomyAction } from '@/lib/types/adaptive';

export { streakMultiplierFor } from './adaptive';

// Compute the effective XP for an action, applying the streak multiplier.
export function xpForAction(action: EconomyAction, streakDays = 0): {
  base: number;
  multiplier: number;
  bonus: number;
  total: number;
} {
  const base = XP_ACTIONS[action] || 0;
  let multiplier: number = STREAK_MULTIPLIERS[0].multiplier;
  for (const entry of STREAK_MULTIPLIERS) {
    if (streakDays >= entry.min_days) multiplier = entry.multiplier;
  }
  const bonus = Math.round(base * (multiplier - 1));
  return { base, multiplier, bonus, total: base + bonus };
}

// Format a streak day display (1st, 2nd, 3rd...).
export function ordinalDay(day: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = day % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${day}${suffix}`;
}
