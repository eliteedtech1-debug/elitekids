import type { LearningPathData, WeeklyGoal, GameMode } from '@/lib/utils/learningPath';

export interface LessonCard {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  created_at: string;
  has_games: boolean;
  nerdc_code?: string;
  nerdc_strand?: string;
  nerdc_sub_strand?: string;
}

export interface GameStat {
  times_played: number;
  best_score: number;
  avg_score: number;
  total_stars: number;
}

export interface ProgressData {
  total_xp: number;
  total_stars: number;
  games_completed: number;
  game_stats: Record<string, GameStat>;
  games: any[];
}

/**
 * A SUBJECT section of the PLAY grid.
 *
 * PLAY is sectioned by subject rather than by unit: live content ships roughly
 * one game per unit in the early years, so a per-unit section would be a header
 * per card. See `groupBySeries` in lib/utils/learningPath.ts.
 */
export interface HomeSeriesGroup {
  seriesId: string;
  name: string;
  category: string | null;
  /** Cards of this subject, after the subject chip filter. */
  count: number;
  /** Units of this subject that carry a visible card. */
  unitsTotal: number;
  /** Of those units, how many the child has finished. */
  unitsDone: number;
  /** Lessons passed vs the subject's lessons on screen. */
  lessonsDone: number;
  lessonsTotal: number;
  /** True while the subject still has a locked unit — where the jump-ahead
   *  offer belongs (one assessment covers every unfinished unit of a subject). */
  locked: boolean;
  lockedReason: string | null;
}

export interface HomeGridItem {
  kind: 'section' | 'series' | 'lesson';
  key?: string;
  count?: number;
  series?: HomeSeriesGroup;
  lesson?: LessonCard;
  locked?: boolean;
  lockedReason?: string | null;
  passed?: boolean;
  exempt?: boolean;
  isNext?: boolean;
}

export interface StudentData {
  admission_no?: string;
  id?: string;
  user_type?: string;
  class_name?: string;
  class_code?: string;
  team_id?: number | string;
  student_name?: string;
  name?: string;
}

export interface EconomyData {
  xp_total: number;
  level: number;
  level_name: string | null;
  streak: { current: number; longest: number; freeze_count: number };
  multiplier: number;
  title: string | null;
}

export interface CompanionData {
  id?: string;
  name?: string;
  emoji?: string;
  [key: string]: any;
}

export interface TabProps {
  student: StudentData | null;
  lessons: LessonCard[];
  progress: ProgressData | null;
  pathData: LearningPathData | null;
  economy: EconomyData | null;
  companion: CompanionData | null;
  equippedItems: Record<string, any>;
  bandLessons: LessonCard[];
  studentBand: string;
  loading: boolean;
  offlineMode: boolean;
  catalogEmpty: boolean;
  isReturningStudent: boolean;
  isFlagshipStudent: boolean;
  colorblindMode: boolean;
  streak: {
    currentStreak: number;
    longestStreak: number;
    lastPlayDate: string;
    totalDaysPlayed: number;
    milestones: any[];
  };
  showOnboarding: boolean;
  showCompanionSelect: boolean;
  showWelcomeSpotlight: boolean;
  loadData: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  setSubjectFilter: (filter: string) => void;
  setShowPlacementQuiz: (show: boolean) => void;
  setShowShop: (show: boolean) => void;
}
