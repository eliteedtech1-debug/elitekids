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

export interface HomeGridItem {
  kind: 'section' | 'lesson';
  key?: string;
  count?: number;
  seriesIds?: string[];
  lesson?: LessonCard;
  locked?: boolean;
  lockedReason?: string | null;
  passed?: boolean;
  exempt?: boolean;
  seriesId?: string | null;
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
