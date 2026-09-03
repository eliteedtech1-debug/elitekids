import {
  LEVELS,
  MASTERY_THRESHOLDS,
  STREAK_MULTIPLIERS,
  type LevelDefinition,
  type MasteryState,
} from '@/lib/types/adaptive';

// Given total XP, resolve the current level definition.
// LEVELS is ascending; the highest row whose xp_required <= xp wins.
// isMax only at the final threshold (xp >= LEVELS[last].xp_required).
export function levelFromXp(xp: number): { level: number; title: string; currXp: number; nextXp: number; progress: number; isMax: boolean } {
  let current = LEVELS[0];
  let next: LevelDefinition | null = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp_required) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  if (!next) {
    return {
      level: current.level,
      title: current.title,
      currXp: current.xp_required,
      nextXp: current.xp_required,
      progress: 1,
      isMax: true,
    };
  }
  const span = Math.max(1, next.xp_required - current.xp_required);
  const progress = Math.max(0, Math.min(1, (xp - current.xp_required) / span));
  return {
    level: current.level,
    title: current.title,
    currXp: current.xp_required,
    nextXp: next.xp_required,
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
