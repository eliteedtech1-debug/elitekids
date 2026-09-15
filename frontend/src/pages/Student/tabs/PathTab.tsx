import { RefreshCw } from 'lucide-react';
import LearningPath from '@/components/LearningPath';
import { t } from '@/lib/i18n';
import type { LearningPathData, GameMode } from '@/lib/utils/learningPath';

interface PathTabProps {
  pathData: LearningPathData | null;
  loading: boolean;
  offlineMode: boolean;
  catalogEmpty: boolean;
  loadData: () => Promise<void>;
  setSubjectFilter: (filter: string) => void;
  setActiveTab: (tab: string) => void;
  openLesson: (lessonId: string, mode: GameMode) => void;
}

export default function PathTab({
  pathData,
  loading,
  offlineMode,
  catalogEmpty,
  loadData,
  setSubjectFilter,
  setActiveTab,
  openLesson,
}: PathTabProps) {
  return (
    <>
      {/* Path header + refresh */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">{t('student.tab.path')}</h2>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 backdrop-blur-sm border border-[#0F4D92]/15 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 hover:shadow-md disabled:opacity-50 active:scale-95"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* The journey */}
      <div id="welcome-learning-path">
        <LearningPath
          data={pathData}
          loading={loading}
          offline={offlineMode}
          onOpenLesson={openLesson}
          // "Explore subjects" means "look for a game" — that is the PLAY tab
          // now that the grid no longer shares HOME.
          onExploreSubjects={() => { setSubjectFilter('all'); setActiveTab('play'); }}
          onRefresh={loadData}
          catalogEmpty={catalogEmpty}
        />
      </div>
    </>
  );
}
