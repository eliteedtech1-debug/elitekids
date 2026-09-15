import { useState } from 'react';
import { Gamepad2, Star, Zap, Flame, ChevronDown, TrendingUp, RotateCcw, Trophy, Sparkles } from 'lucide-react';
import XPBar from '@/components/XPBar';
import StreakCounter from '@/components/StreakCounter';
import GoalCard from '@/components/GoalCard';
import { playTap } from '@/lib/utils/sound';
import { getStreakEmoji } from '@/lib/utils/streak';
import { t, tN } from '@/lib/i18n';
import type { LearningPathData, WeeklyGoal } from '@/lib/utils/learningPath';
import type { LessonCard, GameStat, EconomyData, ProgressData } from './types';

function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-20 ${className}`} />
  );
}

interface StatsTabProps {
  progress: ProgressData | null;
  economy: EconomyData | null;
  bandLessons: LessonCard[];
  pathData: LearningPathData | null;
  isReturningStudent: boolean;
  showWelcomeSpotlight: boolean;
  loading: boolean;
  handleGoalUpdated: (goal: WeeklyGoal) => void;
}

export default function StatsTab({
  progress,
  economy,
  bandLessons,
  pathData,
  isReturningStudent,
  showWelcomeSpotlight,
  loading,
  handleGoalUpdated,
}: StatsTabProps) {
  const [showProgressDetail, setShowProgressDetail] = useState(false);
  const summary = progress || { total_xp: 0, total_stars: 0, games_completed: 0, game_stats: {} } as ProgressData;
  const gameStats = progress?.game_stats || {};

  const streak = economy?.streak || { current: 0, longest: 0, freeze_count: 0 };

  const playedLessons = bandLessons
    .map((lesson) => ({ lesson, stat: gameStats[lesson.id] }))
    .filter((x): x is { lesson: LessonCard; stat: GameStat } => !!x.stat && (x.stat.times_played || 0) > 0)
    .sort((a, b) => (b.stat.times_played || 0) - (a.stat.times_played || 0));

  return (
    <>
      {/* Progress summary */}
      <div className="relative mb-5 grid grid-cols-4 gap-2.5 overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl p-4 shadow-xl shadow-[#0F4D92]/5 border border-white/60">
        <FloatingDeco className="-right-6 -top-6 h-20 w-20 bg-gradient-to-br from-orange-400/20 to-amber-400/20" />
        <FloatingDeco className="-left-4 -bottom-4 h-16 w-16 bg-gradient-to-br from-[#0F4D92]/15 to-indigo-400/15" />
        <div className="relative text-center animate-game-zoom-in stagger-0 group">
          <div
            className={`flex items-center justify-center gap-1 text-2xl font-black bg-gradient-to-br from-orange-500 to-red-500 bg-clip-text text-transparent ${
              streak.current > 0 ? 'animate-game-pulse' : ''
            }`}
          >
            <span className="group-hover:animate-bounce">{getStreakEmoji(streak.current)}</span>
            {streak.current}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.dayStreak')}</p>
        </div>
        <div className="relative text-center animate-game-zoom-in stagger-1 group">
          <div className="flex items-center justify-center gap-1 text-2xl font-black bg-gradient-to-br from-amber-400 to-yellow-500 bg-clip-text text-transparent">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400 group-hover:animate-bounce" />
            {summary.total_stars}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.starsEarned')}</p>
        </div>
        <div className="relative text-center animate-game-zoom-in stagger-2 group">
          <div
            className={`flex items-center justify-center gap-1 text-2xl font-black bg-clip-text text-transparent ${
              summary.total_xp > 0
                ? 'bg-gradient-to-br from-blue-500 to-indigo-500'
                : 'bg-gradient-to-br from-blue-300 to-indigo-300'
            }`}
          >
            {summary.total_xp > 0 ? (
              <Zap className="h-5 w-5 text-blue-500 group-hover:animate-bounce" />
            ) : (
              <span className="text-base">💤</span>
            )}
            {summary.total_xp}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.xpPoints')}</p>
        </div>
        <div className="relative text-center animate-game-zoom-in stagger-3 group">
          <div className="flex items-center justify-center gap-1 text-2xl font-black bg-gradient-to-br from-purple-500 to-pink-500 bg-clip-text text-transparent">
            {summary.games_completed > 0 ? (
              <Gamepad2 className="h-5 w-5 text-purple-500 group-hover:animate-bounce" />
            ) : (
              <span className="text-base">🎮</span>
            )}
            {summary.games_completed}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('student.home.gamesPlayed')}</p>
        </div>
      </div>

      {/* Economy level chip */}
      {economy && (
        <div className="mb-5">
          <button
            onClick={() => { playTap(); setShowProgressDetail((v) => !v); }}
            aria-expanded={showProgressDetail}
            className="flex w-full items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2.5 shadow-lg shadow-[#0F4D92]/5 backdrop-blur-xl transition hover:bg-white/85 active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-sm font-extrabold text-gray-700">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Level {economy.level}{economy.level_name ? ` · ${economy.level_name}` : ''}
            </span>
            <span className="flex items-center gap-2 text-xs font-bold text-gray-400">
              <span className="flex items-center gap-0.5"><Flame className="h-3.5 w-3.5 text-orange-400" />{economy.streak.current}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showProgressDetail ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showProgressDetail && (
            <div className="mt-2 grid gap-3 md:grid-cols-2 animate-game-slide-down">
              <XPBar xpTotal={economy.xp_total} streakDays={economy.streak.current} />
              <StreakCounter
                current={economy.streak.current}
                longest={economy.streak.longest}
                freezeCount={economy.streak.freeze_count}
              />
            </div>
          )}
        </div>
      )}

      {/* Weekly goal / first-time hint */}
      {isReturningStudent ? (
        <div
          id="welcome-goal-card"
          className={`mb-4 ${showWelcomeSpotlight ? 'relative z-50' : ''}`}
        >
          <GoalCard
            admissionNo={''}
            goal={pathData?.goal || null}
            loading={loading}
            onUpdated={handleGoalUpdated}
            autoOpenPicker={showWelcomeSpotlight}
          />
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-3 rounded-3xl border border-[#0F4D92]/15 bg-white/80 p-4 shadow-lg backdrop-blur-xl animate-game-slide-up">
          <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-md">
            <Sparkles className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-gray-800">
              {t('student.welcome.firstTitle', { defaultValue: 'Welcome to EliteKids! 🌟' })}
            </p>
            <p className="text-xs font-medium text-gray-500">
              {t('student.welcome.firstBody', {
                defaultValue: "Pick your first lesson below to start earning XP. A weekly goal will unlock after your first game!",
              })}
            </p>
          </div>
        </div>
      )}

      {/* Per-game progress */}
      <div className="mb-4 rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg backdrop-blur-xl">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-700">
          <TrendingUp className="h-4 w-4 text-[#0d9488]" />
          {t('student.progress.perGame')}
        </h3>
        {playedLessons.length === 0 ? (
          <p className="text-xs font-medium text-gray-500">{t('student.progress.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {playedLessons.map(({ lesson, stat }) => (
              <li
                key={lesson.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-100/70 bg-white/70 px-3 py-2.5"
              >
                <Gamepad2 className="h-4 w-4 flex-shrink-0 text-[#0F4D92]" />
                <span className="flex-1 truncate text-sm font-bold text-gray-700">{lesson.title}</span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-gray-500">
                  <RotateCcw className="h-3 w-3" />
                  {tN('student.home.plays', stat.times_played || 0)}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
                  <Trophy className="h-3 w-3" />
                  {stat.best_score || 0}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-gray-600">
                  <Star className="h-3 w-3" />
                  {stat.total_stars || 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
