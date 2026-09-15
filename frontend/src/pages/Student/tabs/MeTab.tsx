import { TrendingUp, Trophy, Users } from 'lucide-react';
import StatsTab from './StatsTab';
import TeamsTab from './TeamsTab';
import StudentLeaderboardPanel from '../StudentLeaderboardPanel';
import { t } from '@/lib/i18n';
import type { LearningPathData, WeeklyGoal } from '@/lib/utils/learningPath';
import type { LessonCard, EconomyData, ProgressData, StudentData } from './types';

/**
 * ME tab — everything about *me*: progress, economy, goals, per-game scores,
 * the weekly trophy board and my class/team social board. These used to be
 * three separate top-level tabs (STATS, LEADERBOARD, TEAMS); they are sections
 * of one screen now so a child has a single place to check "how am I doing".
 */
interface MeTabProps {
  /** Progress section (StatsTab) */
  progress: ProgressData | null;
  economy: EconomyData | null;
  bandLessons: LessonCard[];
  pathData: LearningPathData | null;
  isReturningStudent: boolean;
  showWelcomeSpotlight: boolean;
  loading: boolean;
  handleGoalUpdated: (goal: WeeklyGoal) => void;
  /** Social section */
  student: StudentData | null;
}

function SectionHeading({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-500">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-md">
        {icon}
      </span>
      {label}
    </h3>
  );
}

export default function MeTab({
  progress,
  economy,
  bandLessons,
  pathData,
  isReturningStudent,
  showWelcomeSpotlight,
  loading,
  handleGoalUpdated,
  student,
}: MeTabProps) {
  // Class quests / team challenge / peer teaching all hang off the child's
  // class or team. Without either, TeamsTab renders an empty box — and the
  // section heading would promise content that cannot exist. Hide the pair.
  const hasSocial = Boolean(student?.class_code || student?.team_id);

  return (
    <div className="animate-game-slide-up space-y-6">
      {/* Progress — streak/stars/XP stats, level, weekly goal, per-game scores */}
      <section>
        <SectionHeading icon={<TrendingUp className="h-4 w-4" />} label={t('student.tab.progress')} />
        <StatsTab
          progress={progress}
          economy={economy}
          bandLessons={bandLessons}
          pathData={pathData}
          isReturningStudent={isReturningStudent}
          showWelcomeSpotlight={showWelcomeSpotlight}
          loading={loading}
          handleGoalUpdated={handleGoalUpdated}
        />
      </section>

      {/* Weekly trophy board (was its own LEADERBOARD tab) */}
      <section>
        <SectionHeading icon={<Trophy className="h-4 w-4" />} label={t('student.tab.leaderboard')} />
        <StudentLeaderboardPanel />
      </section>

      {/* Class quests, team challenge, peer teaching (was its own TEAMS tab) */}
      {hasSocial && (
        <section>
          <SectionHeading icon={<Users className="h-4 w-4" />} label={t('collab.myTeam', { defaultValue: 'Teams' })} />
          <TeamsTab student={student} />
        </section>
      )}
    </div>
  );
}
