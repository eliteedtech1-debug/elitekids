// ─── ADE Types ─────────────────────────────────────────────────

export type MasteryState = 'new' | 'learning' | 'practicing' | 'nearly_there' | 'mastered';

export interface AdaptiveSkillState {
  skill_key: string;
  mastery_probability: number;
  mastery_state: MasteryState;
  difficulty: 1 | 2 | 3 | 4 | 5;
  total_attempts: number;
  correct_attempts: number;
  avg_response_time_ms: number;
  last_practiced_at: string | null;
  next_review_at: string | null;
  streak_days: number;
  elo_rating: number;
}

export interface AdaptiveProfileResponse {
  skills: AdaptiveSkillState[];
  summary: {
    total_skills: number;
    mastered: number;
    practicing: number;
    learning: number;
    new: number;
  };
}

export interface ItemResponse {
  skill_key: string;
  item_id: string;
  correct: boolean;
  quality: 0 | 1 | 2 | 3 | 4 | 5;
  response_time_ms?: number;
  mode?: 'learning' | 'practice' | 'test';
  distractor_count?: number;
  hints_used?: number;
  total_items?: number;
  session_accuracy_start?: number;
  session_accuracy_current?: number;
}

export interface AdaptiveUpdateResponse {
  mastery_probability: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  mastery_state: MasteryState;
  struggle_detected: boolean;
  struggle_severity?: 'none' | 'low' | 'medium' | 'high';
  next_item_recommended: {
    skill_key: string;
    difficulty: number;
    reason: string;
  } | null;
  xp_earned: number;
  streak_multiplier: number;
}

// ─── SRE Types ─────────────────────────────────────────────────

export interface ReviewItem {
  review_id: string;
  skill_key: string;
  item_id: string;
  lesson_id: string;
  lesson_title: string;
  next_review_at: string;
  days_overdue: number;
  current_interval_days: number;
  mastery_probability: number;
  quality_last: number | null;
}

export interface ReviewStats {
  total_items: number;
  due_today: number;
  overdue: number;
  mastered: number;
  streak_days: number;
  best_streak: number;
  avg_accuracy: number;
  reviews_this_week: number;
  avg_interval_days: number;
}

export interface ReviewCompleteResponse {
  next_review_at: string;
  interval_days: number;
  mastery_probability: number;
  mastery_state: MasteryState;
  xp_earned: number;
  reviews_remaining: number;
}

// ─── Economy Types ─────────────────────────────────────────────

export type EconomyAction =
  | 'daily_login'
  | 'game_complete'
  | 'perfect_score'
  | 'review_complete'
  | 'boss_defeated'
  | 'festival_complete'
  | 'help_classmate'
  | 'first_game_of_day';

export interface EconomyBalance {
  xp_total: number;
  xp_current_level: number;
  xp_next_level: number;
  level: number;
  level_name: string;
  streak: {
    current: number;
    longest: number;
    freeze_count: number;
    last_play_date: string | null;
  };
  multiplier: number;
  title: string | null;
  badges: string[];
}

export interface EarnXPResponse {
  xp_earned: number;
  base_amount: number;
  streak_bonus: number;
  perfect_bonus: number;
  multiplier_applied: number;
  new_total: number;
  level_up: boolean;
  new_level: number;
  new_level_name: string;
  xp_to_next_level: number;
}

export interface StreakResponse {
  streak: number;
  streak_increased: boolean;
  freeze_used: boolean;
  streak_broken: boolean;
  multiplier: number;
  milestone_reached: string | null;
  congrats_message: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: string;
  preview_url: string;
  owned: boolean;
  equipped: boolean;
}

export interface ShopCategory {
  id: string;
  name: string;
  description: string;
  items: ShopItem[];
}

export interface LevelDefinition {
  level: number;
  xp_required: number;
  cumulative_xp: number;
  title: string;
  unlocks: string[];
}

// ─── Constants ─────────────────────────────────────────────────

export const MASTERY_THRESHOLDS = {
  NEW: 0,
  LEARNING: 0.30,
  PRACTICING: 0.50,
  NEARLY_THERE: 0.70,
  MASTERED: 0.85,
} as const;

export const DIFFICULTY_NAMES = {
  1: 'Very Easy',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Expert',
} as const;

export const DIFFICULTY_COLORS = {
  1: 'text-green-400',
  2: 'text-blue-400',
  3: 'text-yellow-400',
  4: 'text-orange-400',
  5: 'text-red-400',
} as const;

export const XP_ACTIONS: Record<EconomyAction, number> = {
  daily_login: 10,
  game_complete: 20,
  perfect_score: 50,
  review_complete: 15,
  boss_defeated: 100,
  festival_complete: 200,
  help_classmate: 25,
  first_game_of_day: 10,
};

export const STREAK_MULTIPLIERS = [
  { min_days: 0, multiplier: 1.0, label: '' },
  { min_days: 3, multiplier: 1.2, label: '1.2× Streak Bonus!' },
  { min_days: 7, multiplier: 1.5, label: '1.5× Streak Bonus!' },
  { min_days: 14, multiplier: 2.0, label: '2× Streak Bonus!' },
  { min_days: 30, multiplier: 3.0, label: '3× Legend Bonus!' },
] as const;

export const LEVELS: LevelDefinition[] = [
  { level: 1, xp_required: 0, cumulative_xp: 0, title: 'Beginner', unlocks: ['Basic companion (Fox)'] },
  { level: 2, xp_required: 50, cumulative_xp: 50, title: 'Explorer', unlocks: ['Garden hat'] },
  { level: 3, xp_required: 150, cumulative_xp: 200, title: 'Adventurer', unlocks: ['Second companion (Owl)'] },
  { level: 5, xp_required: 500, cumulative_xp: 1050, title: 'Scholar', unlocks: ['Theme: Ocean'] },
  { level: 7, xp_required: 1200, cumulative_xp: 3050, title: 'Expert', unlocks: ['Third companion (Bunny)'] },
  { level: 10, xp_required: 5000, cumulative_xp: 12350, title: 'Master', unlocks: ['Theme: Space'] },
  { level: 15, xp_required: 15000, cumulative_xp: 47350, title: 'Champion', unlocks: ['Fourth companion (Bear)'] },
  { level: 20, xp_required: 35000, cumulative_xp: 122350, title: 'Legend', unlocks: ['Theme: Forest'] },
  { level: 25, xp_required: 65000, cumulative_xp: 247350, title: 'Hero', unlocks: ['Fifth companion (Cat)'] },
  { level: 30, xp_required: 100000, cumulative_xp: 447350, title: 'Grandmaster', unlocks: ['All themes + "Legend" title'] },
];

export const MASTERY_VISUALS: Record<MasteryState, { fill: string; color: string; glow: boolean }> = {
  new: { fill: '0%', color: 'text-gray-400', glow: false },
  learning: { fill: '25%', color: 'text-blue-400', glow: false },
  practicing: { fill: '50%', color: 'text-yellow-400', glow: false },
  nearly_there: { fill: '75%', color: 'text-orange-400', glow: false },
  mastered: { fill: '100%', color: 'text-green-400', glow: true },
};
