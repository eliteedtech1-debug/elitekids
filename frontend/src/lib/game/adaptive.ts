import {
  LEVELS,
  MASTERY_THRESHOLDS,
  STREAK_MULTIPLIERS,
  type MasteryState,
} from '@/lib/types/adaptive';

// Given total XP, resolve the current level definition.
// Falls back to the highest defined level above the cap.
export function levelFromXp(xp: number): { level: number; title: string; currXp: number; nextXp: number; progress: number; isMax: boolean } {
  let current = LEVELS[0];
  let next = LEVELS[1] || null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp_required || LEVELS[i].level <= current.level) {
      if (LEVELS[i].cumulative_xp <= xp) {
        current = LEVELS[i];
        next = LEVELS[i + 1] || null;
      }
    }
  }
  if (!next || xp >= next.xp_required) {
    const highest = LEVELS[LEVELS.length - 1];
    return {
      level: highest.level,
      title: highest.title,
      currXp: highest.xp_required,
      nextXp: highest.xp_required,
      progress: 1,
      isMax: true,
    };
  }
  const span = current.cumulative_xp !== next.cumulative_xp
    ? next.cumulative_xp - current.cumulative_xp
    : 1;
  const progress = Math.max(0, Math.min(1, (xp - current.cumulative_xp) / span));
  return {
    level: current.level,
    title: current.title,
    currXp: current.cumulative_xp,
    nextXp: next.cumulative_xp,
    progress,
    isMax: false,
  };
}

// Choose the streak multiplier for a given current streak.
export function streakMultiplierFor(streakDays: number): { multiplier: number; label: string } {
  let best: { min_days: number; multiplier: number; label: string } = STREAK_MULTIPLIERS[0];
  for (const entry of STREAK_MULTIPLIERS) {
    if (streakDays >= entry.min_days) best = entry;
  }
  return { multiplier: best.multiplier, label: best.label };
}

// Map a mastery probability (0..1) to its named state.
export function masteryStateOf(probability: number): MasteryState {
  if (probability >= MASTERY_THRESHOLDS.MASTERED) return 'mastered';
  if (probability >= MASTERY_THRESHOLDS.NEARLY_THERE) return 'nearly_there';
  if (probability >= MASTERY_THRESHOLDS.PRACTICING) return 'practicing';
  if (probability >= MASTERY_THRESHOLDS.LEARNING) return 'learning';
  return 'new';
}

// URL-safe display helpers for difficulty + mastery.
export function difficultyLabel(difficulty: number): string {
  const names: Record<number, string> = {
    1: 'Very Easy',
    2: 'Easy',
    3: 'Medium',
    4: 'Hard',
    5: 'Expert',
  };
  return names[difficulty] || 'Medium';
}

export function masteryLabel(state: MasteryState): string {
  const labels: Record<MasteryState, string> = {
    new: 'New',
    learning: 'Learning',
    practicing: 'Practicing',
    nearly_there: 'Almost There',
    mastered: 'Mastered',
  };
  return labels[state];
}
