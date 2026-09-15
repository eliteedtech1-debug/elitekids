import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Lock, BookOpen, Flag, RefreshCw } from 'lucide-react';
import CheckpointTestOut from '@/components/CheckpointTestOut';
import { playTap } from '@/lib/utils/sound';
import { ageLevelLabel } from '@/lib/utils/learningPath';
import { t } from '@/lib/i18n';
import { FloatingDeco, getAgeColor, HOME_SECTION_LABEL, SUBJECT_FILTERS } from '../utils/helpers';
import type { LessonCard, HomeGridItem } from './types';

interface PlayTabProps {
  bandLessons: LessonCard[];
  gridLessons: LessonCard[];
  homeItems: HomeGridItem[];
  gameStats: Record<string, any>;
  subjectFilter: string;
  studentBand: string | null;
  loading: boolean;
  offlineMode: boolean;
  catalogEmpty: boolean;
  isFlagshipStudent: boolean;
  colorblindMode: boolean;
  studentId: string;
  refreshPath: () => Promise<void>;
  loadData: () => Promise<void>;
  setSubjectFilter: (filter: string) => void;
  setShowPlacementQuiz: (show: boolean) => void;
  /** Seasonal festival banner slot (merged in from the old FESTIVAL tab). */
  festivalBanner?: React.ReactNode;
}

export default function PlayTab({
  bandLessons,
  gridLessons,
  homeItems,
  gameStats,
  subjectFilter,
  loading,
  offlineMode,
  catalogEmpty,
  isFlagshipStudent,
  colorblindMode,
  studentId,
  refreshPath,
  loadData,
  setSubjectFilter,
  setShowPlacementQuiz,
  festivalBanner,
}: PlayTabProps) {
  return (
    <>
      {/* Seasonal festival banner — only renders while a festival is live */}
      {festivalBanner}

      {/* Quick-nav scroll anchor (below the banner so "Jump to Games"
          lands on the subject chips / grid, not on the seasonal banner) */}
      <div id="games-grid-anchor" className="scroll-mt-4" />


      {/* Subject chips */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {SUBJECT_FILTERS.map((f) => {
          const count = bandLessons.filter(f.test).length;
          if (count === 0 && f.key !== 'all') return null;
          const on = subjectFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => { playTap(); setSubjectFilter(f.key); }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-3.5 py-2 text-xs font-bold transition-all ${
                on
                  ? 'bg-[#0F4D92] text-white shadow-md shadow-[#0F4D92]/20'
                  : 'bg-white/80 text-gray-600 border border-gray-100 hover:bg-white hover:shadow-md backdrop-blur-sm'
              }`}
            >
              {t(f.labelKey)}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-white/20' : 'bg-gray-100'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">
          {t('student.home.gamesTitle', { defaultValue: 'Games' })}
          <span className="ml-2 text-sm font-normal text-gray-400">({gridLessons.length})</span>
        </h2>
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 backdrop-blur-sm border border-[#0F4D92]/15 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 hover:shadow-md disabled:opacity-50 active:scale-95"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Game cards grid */}
      {gridLessons.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-[#0F4D92]/20 bg-white/80 backdrop-blur-xl p-10 text-center shadow-lg">
          <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-[#0F4D92]/15 to-[#0d9488]/15" />
          <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-[#0F4D92]/40" />
          <h3 className="font-bold text-gray-700">
            {offlineMode ? t('offline.mode.noGamesTitle') : t('student.home.noGamesTitle')}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            {offlineMode
              ? t('offline.mode.noGamesDesc')
              : catalogEmpty
                ? t('student.home.noGamesBodySoon', {
                    defaultValue: 'Check back soon — your teacher is preparing fun games!',
                  })
                : t('student.home.noGamesBody')}
          </p>
          {!offlineMode && isFlagshipStudent && (
            <button
              onClick={() => { playTap(); setShowPlacementQuiz(true); }}
              className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-[#0F4D92] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-[#0D3F7A] active:scale-95"
            >
              🎯 {t('placement.cta')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {homeItems.map((item, cardIdx) => {
            // A SUBJECT section — the child's games for one subject, in
            // teaching order. The jump-ahead offer hangs here, on a subject that
            // still has a locked unit: one assessment covers every unfinished
            // unit of that subject, so it belongs to the subject, not the unit.
            if (item.kind === 'series' && item.series) {
              const s = item.series;
              return (
                <Fragment key={`series-${s.seriesId}`}>
                  <div className="col-span-full mt-3 flex flex-wrap items-center gap-2">
                    <Flag className="h-4 w-4 shrink-0 text-[#0d9488]/70" />
                    <h3 className="text-sm font-extrabold text-gray-800">{s.name}</h3>
                    {s.category && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        {s.category}
                      </span>
                    )}
                    <span className="text-xs font-bold text-gray-400">
                      {t('student.home.subjectUnits', {
                        done: s.unitsDone,
                        total: s.unitsTotal,
                      })}
                    </span>
                    <span className="text-xs font-medium text-gray-400">({s.count})</span>
                    {s.locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-200/80 px-2.5 py-1 text-[10px] font-bold text-gray-600">
                        <Lock className="h-3 w-3" />
                        {t('student.home.sectionLocked')}
                      </span>
                    ) : (
                      s.unitsTotal > 0 &&
                      s.unitsDone === s.unitsTotal && (
                        <span className="inline-flex items-center rounded-full bg-green-100/80 px-2.5 py-1 text-[10px] font-bold text-green-700">
                          ✓ {t('student.home.passed')}
                        </span>
                      )
                    )}
                    <span className="h-px flex-1 bg-gray-200/70" />
                  </div>
                  {s.locked && (
                    <CheckpointTestOut
                      studentId={studentId}
                      seriesId={s.seriesId}
                      seriesName={s.name}
                      onUnlocked={refreshPath}
                    />
                  )}
                </Fragment>
              );
            }

            // Games the path does not cover (the global catalog floor, or an
            // offline list) — they keep a plain group so they stay reachable.
            if (item.kind === 'section') {
              return (
                <Fragment key={`section-${item.key}`}>
                  <div className="col-span-full mt-1 flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-gray-700">{t(HOME_SECTION_LABEL[item.key!])}</h3>
                    <span className="text-xs font-medium text-gray-400">({item.count})</span>
                    <span className="h-px flex-1 bg-gray-200/70" />
                  </div>
                </Fragment>
              );
            }
            const { lesson, locked, lockedReason, passed, exempt, isNext } = item as any;
            const ageColor = getAgeColor(lesson.age_level, colorblindMode);
            const stat = gameStats[lesson.id];
            const played = stat?.times_played || 0;
            return (
              <div
                key={lesson.id}
                className={`game-card-hover relative overflow-hidden rounded-3xl border p-5 shadow-lg animate-game-slide-up stagger-${Math.min(cardIdx + 1, 12)} transition-all ${
                  locked
                    ? 'border-gray-200 bg-gray-50/70'
                    : isNext
                      ? 'border-[#0d9488]/40 bg-white shadow-xl ring-2 ring-[#0d9488]/25 hover:shadow-2xl hover:scale-[1.02]'
                      : played > 0
                        ? 'border-green-200/60 bg-gradient-to-br from-white via-green-50/30 to-emerald-50/40 hover:shadow-xl hover:scale-[1.02]'
                        : 'border-white/60 bg-white/80 backdrop-blur-xl hover:shadow-xl hover:scale-[1.02]'
                }`}
              >
                {played > 0 && (
                  <>
                    <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-green-300/20 to-emerald-300/20" />
                    <FloatingDeco className="-left-3 -bottom-3 h-12 w-12 bg-gradient-to-br from-green-200/15 to-teal-200/15" />
                  </>
                )}
                {!played && (
                  <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-[#0F4D92]/10 to-[#0d9488]/10" />
                )}
                {/* Card top: icon + badge */}
                <div className="relative mb-3 flex items-center justify-between">
                  <div className="relative">
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-md ${
                      played > 0
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-green-300/30'
                        : 'bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-[#0F4D92]/20'
                    }`}>
                      {lesson.lesson_type === 'game' ? (
                        <Gamepad2 className="h-6 w-6 drop-shadow" />
                      ) : (
                        <BookOpen className="h-6 w-6 drop-shadow" />
                      )}
                    </span>
                    {played > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white shadow-md animate-game-pop ring-2 ring-white">
                        ✓
                      </span>
                    )}
                  </div>
                  {locked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-200/80 px-2.5 py-1 text-[11px] font-bold text-gray-600 shadow-sm">
                      <Lock className="h-3 w-3" />
                      {t('student.home.locked')}
                    </span>
                  ) : isNext ? (
                    <span className="inline-flex items-center rounded-full bg-[#0d9488] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                      {t('student.home.nextUp')}
                    </span>
                  ) : passed ? (
                    <span className="inline-flex items-center rounded-full bg-green-100/80 px-2.5 py-1 text-[11px] font-bold text-green-700 shadow-sm">
                      {t('student.home.passed')}
                    </span>
                  ) : exempt ? (
                    <span className="inline-flex items-center rounded-full bg-teal-100/80 px-2.5 py-1 text-[11px] font-bold text-teal-700 shadow-sm">
                      {t('student.home.testedOut')}
                    </span>
                  ) : played > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100/80 px-2.5 py-1 text-[11px] font-bold text-green-700 shadow-sm">
                      {t('student.home.playedCount', { count: played })}
                    </span>
                  ) : lesson.has_games ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#0d9488]/10 px-2.5 py-1 text-[11px] font-bold text-[#0d9488] shadow-sm">
                      {t('student.home.playNow')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100/80 px-2.5 py-1 text-[11px] font-bold text-gray-500 shadow-sm">
                      {t('student.home.comingSoon')}
                    </span>
                  )}
                </div>
                <h3 className="relative font-bold text-gray-800">{lesson.title}</h3>
                {locked && (
                  <p className="relative mt-1 text-[11px] font-medium text-gray-500">
                    {lockedReason || t('student.home.lockedHint')}
                  </p>
                )}
                <div className="relative mt-2 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ageColor}`}>
                    {ageLevelLabel(lesson.age_level)}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">{lesson.subject}</span>
                </div>
                {(lesson.nerdc_code || lesson.nerdc_strand) && (
                  <div className="relative mt-1.5 flex flex-wrap items-center gap-1.5">
                    {lesson.nerdc_code && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#0F4D92]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#0F4D92]">
                        📘 {lesson.nerdc_code}
                      </span>
                    )}
                    {lesson.nerdc_strand && (
                      <span className="inline-flex items-center rounded-md bg-[#0d9488]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#0d9488]">
                        {lesson.nerdc_strand}{lesson.nerdc_sub_strand ? ` · ${lesson.nerdc_sub_strand}` : ''}
                      </span>
                    )}
                  </div>
                )}
                {/* Quick mode select */}
                {lesson.has_games && !locked && (
                  <div className="relative mt-3 flex gap-1.5 border-t border-gray-100/60 pt-3">
                    <Link
                      to={`/student/game/${lesson.id}?mode=learning`}
                      onClick={(e) => { e.stopPropagation(); playTap(); }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 py-2.5 text-xs font-bold text-purple-600 border border-purple-100/60 hover:bg-purple-100 hover:shadow-md active:scale-95 transition-all"
                    >
                      {t('student.home.learn')}
                    </Link>
                    <Link
                      to={`/student/game/${lesson.id}?mode=practice`}
                      onClick={(e) => { e.stopPropagation(); playTap(); }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 py-2.5 text-xs font-bold text-green-600 border border-green-100/60 hover:bg-green-100 hover:shadow-md active:scale-95 transition-all"
                    >
                      {t('student.home.practice')}
                    </Link>
                    <Link
                      to={`/student/game/${lesson.id}?mode=test`}
                      onClick={(e) => { e.stopPropagation(); playTap(); }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 py-2.5 text-xs font-bold text-blue-600 border border-blue-100/60 hover:bg-blue-100 hover:shadow-md active:scale-95 transition-all"
                    >
                      {t('student.home.test')}
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
