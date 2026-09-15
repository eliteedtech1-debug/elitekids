import { Play } from 'lucide-react';
import CompanionSelect, { CompanionBubble } from '@/components/CompanionSelect';
import GardenScene from '@/components/GardenScene';
import StreakReminder, { hasPlayedToday } from '@/components/StreakReminder';
import { SKIN_META, THEME_HEADER } from '@/components/Shop';
import { playTap } from '@/lib/utils/sound';
import { t } from '@/lib/i18n';
import type { TabProps } from './types';

interface HomeTabProps extends Pick<TabProps, 'companion' | 'equippedItems' | 'streak' | 'economy' | 'isReturningStudent' | 'showOnboarding' | 'showCompanionSelect' | 'pathData'> {
  skin: { name: string; emoji: string; ringClass: string } | null;
  headerTheme: string | null;
  showWelcomeSpotlight: boolean;
  /** Switch to the PLAY tab — the CTA on the first-time welcome card. */
  onPickGame?: () => void;
}

export default function HomeTab({
  companion,
  equippedItems,
  streak,
  economy,
  isReturningStudent,
  showOnboarding,
  showCompanionSelect,
  pathData,
  skin,
  headerTheme,
  showWelcomeSpotlight,
  onPickGame,
}: HomeTabProps) {
  const streakState = {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastPlayDate: streak.lastPlayDate,
    totalDaysPlayed: streak.totalDaysPlayed,
    milestones: streak.milestones,
  };
  const playedToday = hasPlayedToday(streakState);

  return (
    <>
      {/* First-time welcome — HOME must never be a blank screen for a brand-new
          student. (Opening the dashboard used to record a play day so the streak
          reminder stayed quiet; it does not any more — the streak follows real
          play, and a brand-new child gets StreakReminder's own first-session
          state instead of a write.) An empty garden renders nothing, which
          previously left this tab blank until the child found PLAY. */}
      {!isReturningStudent && (
        <div className="mb-4 relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-[#0F4D92] to-[#0d9488] p-5 text-white shadow-xl shadow-[#0F4D92]/25">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <p className="relative text-base font-extrabold drop-shadow-sm">
            {t('student.welcome.firstTitle', { defaultValue: 'Welcome to EliteKids! 🌟' })}
          </p>
          <p className="relative mt-1 text-sm font-medium text-white/85">
            {t('student.welcome.firstBody', {
              defaultValue: 'Pick your first lesson below to start earning XP.',
            })}
          </p>
          <button
            type="button"
            onClick={() => { playTap(); onPickGame?.(); }}
            className="relative mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-[#0F4D92] shadow-lg transition hover:scale-105 active:scale-95"
          >
            <Play className="h-4 w-4" />
            {t('student.home.firstCta', { defaultValue: 'Pick my first game' })}
          </button>
        </div>
      )}

      {/* Companion greeting */}
      {companion && !showOnboarding && !showCompanionSelect && (
        <div className="mb-4">
          <CompanionBubble companion={companion as any} context="returning" skin={skin} />
        </div>
      )}

      {/* Daily streak reminder */}
      <StreakReminder
        state={streakState}
        freezeCount={economy?.streak?.freeze_count ?? 0}
        playedToday={playedToday}
        isFirstSession={!isReturningStudent}
        firstLessonId={
          pathData?.path?.[0]?.units?.[0]?.lessons?.[0]?.lesson_id
            ? String(pathData.path[0].units[0].lessons[0].lesson_id)
            : null
        }
      />

      {/* Garden preview */}
      <div className="mb-4">
        <GardenScene compact equippedDecorations={equippedItems} />
      </div>
    </>
  );
}
