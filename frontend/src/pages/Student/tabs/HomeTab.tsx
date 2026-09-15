import CompanionSelect, { CompanionBubble } from '@/components/CompanionSelect';
import GardenScene from '@/components/GardenScene';
import StreakReminder, { hasPlayedToday } from '@/components/StreakReminder';
import { SKIN_META, THEME_HEADER } from '@/components/Shop';
import type { TabProps } from './types';

interface HomeTabProps extends Pick<TabProps, 'companion' | 'equippedItems' | 'streak' | 'economy' | 'isReturningStudent' | 'showOnboarding' | 'showCompanionSelect' | 'pathData'> {
  skin: { name: string; emoji: string; ringClass: string } | null;
  headerTheme: string | null;
  showWelcomeSpotlight: boolean;
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
}: HomeTabProps) {
  return (
    <>
      {/* Companion greeting */}
      {companion && !showOnboarding && !showCompanionSelect && (
        <div className="mb-4">
          <CompanionBubble companion={companion as any} context="returning" skin={skin} />
        </div>
      )}

      {/* Daily streak reminder */}
      <StreakReminder
        state={{
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastPlayDate: streak.lastPlayDate,
          totalDaysPlayed: streak.totalDaysPlayed,
          milestones: streak.milestones,
        }}
        freezeCount={economy?.streak?.freeze_count ?? 0}
        playedToday={hasPlayedToday({
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastPlayDate: streak.lastPlayDate,
          totalDaysPlayed: streak.totalDaysPlayed,
          milestones: streak.milestones,
        })}
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
