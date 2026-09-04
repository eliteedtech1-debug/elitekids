/**
 * LearningPath — Duolingo-style vertical journey (G5/G6).
 *
 * Renders the child's whole journey from GET /kids/learning-path as a snake
 * path of unit "phase" nodes with lesson dots, per-state colors, visual
 * halting points (locked unit gates), spill-over recovery segments and a
 * pulsing "you are here" marker on the current position.
 *
 * The backend already enforces the hard age ceiling, lock chain and spill-over
 * ordering — this component only PRESENTS it. Locked units (and their lessons)
 * are never clickable; passed lessons stay replayable in practice mode.
 */
import {
  Check,
  Flag,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import {
  currentPositionIndex,
  defaultModeFor,
  flattenUnits,
  isBandStart,
  unitStats,
  type GameMode,
  type LearningPathData,
  type PathLesson,
  type PathUnit,
} from '@/lib/utils/learningPath';

interface LearningPathProps {
  data: LearningPathData | null;
  loading?: boolean;
  offline?: boolean;
  /** Parent navigates to /student/game/:lessonId?mode=… */
  onOpenLesson: (lessonId: string, mode: GameMode) => void;
  /** Empty state: jump to the subject browse tabs (fallback games). */
  onExploreSubjects?: () => void;
  /** Empty state: parent re-fetches the path in realtime (countdown loop). */
  onRefresh?: () => void;
  /** True when the lessons catalog itself has NO data (not an age-band
   *  filter). Truly-empty catalog → static "check back soon" (no countdown,
   *  no explore shortcut — those are dead ends when nothing exists). */
  catalogEmpty?: boolean;
}

/* ── Small bits ──────────────────────────────────────────────────── */

function relationLabel(unit: PathUnit): { text: string; cls: string } {
  if (unit.relation === 'passed_below') {
    return { text: t('student.path.relation.passedBelow'), cls: 'bg-emerald-100 text-emerald-700' };
  }
  if (unit.relation === 'spillover') {
    return { text: t('student.path.relation.spillover'), cls: 'bg-amber-100 text-amber-700' };
  }
  return { text: t('student.path.relation.current'), cls: 'bg-[#0F4D92]/10 text-[#0F4D92]' };
}

function stateSub(lesson: PathLesson): string {
  if (lesson.state === 'passed') return t('student.path.state.passed');
  if (lesson.state === 'practice_done') return t('student.path.state.practiceDone');
  return t('student.path.state.none');
}

function stateAction(lesson: PathLesson): { label: string; cls: string } {
  if (lesson.state === 'passed') {
    return { label: t('student.path.action.replay'), cls: 'text-gray-400' };
  }
  if (lesson.state === 'practice_done') {
    return { label: t('student.path.action.test'), cls: 'text-blue-500' };
  }
  return { label: t('student.path.action.practice'), cls: 'text-green-500' };
}

function UnitNode({ unit, isMarker }: { unit: PathUnit; isMarker: boolean }) {
  const ring = isMarker
    ? 'ring-4 ring-amber-300 animate-pulse scale-110 shadow-lg shadow-amber-400/40'
    : 'ring-4 ring-white shadow-md';
  let inner: React.ReactNode = <Play className="h-5 w-5" />;
  let bg = 'bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white';

  if (unit.done || unit.relation === 'passed_below') {
    bg = 'bg-gradient-to-br from-emerald-400 to-green-500 text-white';
    inner = <Check className="h-6 w-6" strokeWidth={3.5} />;
  } else if (unit.locked) {
    bg = 'bg-gray-200 text-gray-400';
    inner = <Lock className="h-5 w-5" />;
  } else if (unit.relation === 'spillover') {
    bg = 'bg-gradient-to-br from-amber-400 to-orange-500 text-white';
    inner = <RotateCcw className="h-5 w-5" />;
  }

  return (
    <div
      aria-hidden
      className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${bg} ${ring}`}
    >
      {inner}
    </div>
  );
}

function LessonRow({
  lesson,
  unitOpen,
  onOpen,
  index,
}: {
  lesson: PathLesson;
  unitOpen: boolean;
  onOpen: (lessonId: string, mode: GameMode) => void;
  index: number;
}) {
  const action = stateAction(lesson);
  const open = unitOpen;
  return (
    <button
      onClick={() => { if (!open) return; playTap(); onOpen(lesson.lesson_id, defaultModeFor(lesson.state)); }}
      disabled={!open}
      className={`group flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition-all ${
        open
          ? 'border-transparent bg-gray-50/80 hover:bg-white hover:shadow-md hover:border-[#0F4D92]/15 active:scale-[0.99]'
          : 'cursor-not-allowed border-transparent bg-gray-50/40 opacity-60'
      }`}
      aria-label={`${lesson.title} — ${stateSub(lesson)}`}
    >
      {/* State dot */}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
          lesson.state === 'passed'
            ? 'bg-emerald-100 text-emerald-600'
            : lesson.state === 'practice_done'
              ? 'bg-amber-100 text-amber-500'
              : open
                ? 'bg-white text-[#0F4D92] shadow-sm ring-1 ring-[#0F4D92]/20'
                : 'bg-white text-gray-300 ring-1 ring-gray-200'
        }`}
      >
        {lesson.state === 'passed' ? '✓' : lesson.state === 'practice_done' ? '⭐' : index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-gray-700 group-hover:text-gray-900">
          {lesson.title}
        </span>
        <span className="block text-[11px] font-medium text-gray-400">{stateSub(lesson)}</span>
      </span>
      {open && (
        <span className={`shrink-0 text-[11px] font-extrabold ${action.cls}`}>
          {lesson.state === 'passed' ? '↻' : ''} {action.label}
        </span>
      )}
    </button>
  );
}

/* ── Main component ──────────────────────────────────────────────── */export default function LearningPath({ data, loading, offline, onOpenLesson, onExploreSubjects, onRefresh, catalogEmpty }: LearningPathProps) {
  // Realtime empty-state countdown: when data exists but nothing has landed in
  // this child's band yet, the engine is generating a personalized assessment
  // to place them on the right track — so instead of "check back soon" we
  // auto-refresh on a short loop with a visible counter and a caution that it
  // may run longer than estimated. A genuinely empty catalog (no lessons at
  // all = absence of data) stays static with "check back soon".
  const REFRESH_SECONDS = 20;
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_SECONDS);

  const flat = flattenUnits(data);
  const markerIndex = currentPositionIndex(data);
  const allDone = flat.length > 0 && markerIndex === null;

  useEffect(() => {
    if (flat.length > 0 || !onRefresh || catalogEmpty) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          onRefresh();
          return REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [flat.length, onRefresh]);

  if (loading) return null;

  if (flat.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-[#0F4D92]/20 bg-gradient-to-br from-white via-[#E7EEF6]/40 to-emerald-50/40 p-10 text-center shadow-lg backdrop-blur-xl animate-game-slide-up">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#0F4D92]/10 blur-2xl" />
        <div className="absolute -left-6 -bottom-6 h-20 w-20 rounded-full bg-emerald-300/20 blur-xl" />
        <button
          type="button"
          onClick={() => { playTap(); onExploreSubjects?.(); }}
          disabled={!onExploreSubjects}
          aria-label={t('student.path.emptyExplore', { defaultValue: 'Explore subject games' })}
          className={`relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-xl shadow-[#0F4D92]/30 ring-2 ring-white/60 animate-game-float transition hover:brightness-110 active:scale-95 ${onExploreSubjects ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <Sparkles className="h-8 w-8 drop-shadow" />
        </button>
        <h3 className="relative text-lg font-extrabold text-gray-800">
          {t('student.path.empty', { defaultValue: 'Your learning path is still growing 🌱' })}
        </h3>
        <p className="relative mx-auto mt-2 max-w-sm text-sm text-gray-500">
          {offline
            ? t('student.path.offlineBody', {
                defaultValue: "You're offline — your path will appear when you are back online.",
              })
            : catalogEmpty
              ? t('student.path.emptyBodySoon', {
                  defaultValue: 'Your teacher is building your adventure — check back soon!',
                })
              : t('student.path.emptyBody', {
                  defaultValue: 'The engine is generating a personalized assessment to place you in the right track — refreshing automatically.',
                })}
        </p>
        {!offline && !catalogEmpty && onRefresh && (
          <p className="relative mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-100">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            {t('student.path.emptyCountdown', { seconds: secondsLeft, defaultValue: 'Placing you on the right track — refreshing in {seconds}s. May take more than estimated time' })}
          </p>
        )}
        {!offline && !catalogEmpty && onExploreSubjects && (
          <button
            type="button"
            onClick={() => { playTap(); onExploreSubjects(); }}
            className="relative mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100 active:scale-95"
          >
            <span>🌟</span>
            {t('student.path.emptyExplore', { defaultValue: 'Tap a subject tab above to explore games while you wait!' })}
          </button>
        )}
      </div>
    );
  }

  let renderedIndex = -1;

  return (
    <div className="relative rounded-3xl border border-white/70 bg-white/60 p-4 shadow-lg backdrop-blur-xl animate-game-slide-up sm:p-5">
      {/* Continuous spine behind the unit nodes */}
      <div aria-hidden className="absolute bottom-10 left-[41px] top-6 w-[3px] rounded-full bg-gradient-to-b from-[#0F4D92]/20 via-teal-300/50 to-emerald-300/40 sm:left-[45px]" />

      {data?.path.map((series, seriesIdx) => (
        <div key={series.series_id} className={seriesIdx > 0 ? 'mt-2' : ''}>
          {/* Series header */}
          <div className="mb-2 ml-2 flex items-center gap-2">
            <Flag className="h-3.5 w-3.5 text-[#0d9488]/70" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0d9488]">
              {series.name}
            </span>
            {series.category && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                {series.category}
              </span>
            )}
          </div>

          <ol className="space-y-3">
            {series.units.map((unit) => {
              renderedIndex += 1;
              const isMarker = renderedIndex === markerIndex;
              const bandStart = isBandStart(data, unit);
              const rel = relationLabel(unit);
              const stats = unitStats(unit);
              return (
                <li key={unit.unit_id} className="relative">
                  {/* Divider: the child's own band begins here */}
                  {bandStart && (
                    <div className="mb-3 ml-1 flex items-center gap-2">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/70" />
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-3 py-1 text-[11px] font-extrabold text-amber-700 shadow-sm">
                        {t('student.path.bandStart')}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-300/70" />
                    </div>
                  )}

                  <div className="flex items-start gap-3 sm:gap-4">
                    <UnitNode unit={unit} isMarker={isMarker} />
                    <div className="relative min-w-0 flex-1 rounded-3xl border bg-white/85 p-3 shadow-sm sm:p-3.5">
                      {/* Header row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${rel.cls}`}>
                          {rel.text}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                          {t('student.path.unitShort', { n: unit.unit_number })}
                        </span>
                        {isMarker && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow-md animate-pulse">
                            {t('student.path.youAreHere')}
                          </span>
                        )}
                        {unit.done && !unit.locked && (
                          <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-extrabold text-emerald-500">
                            ✓ {stats.done}/{stats.total}
                          </span>
                        )}
                      </div>

                      <h4 className="mt-1.5 text-[15px] font-extrabold leading-snug text-gray-800">
                        {unit.title || t('student.path.untitledUnit', { n: unit.unit_number })}
                      </h4>
                      {unit.topic && (
                        <p className="mt-0.5 text-xs font-medium text-gray-400">📚 {unit.topic}</p>
                      )}

                      {/* Lessons */}
                      <div className="mt-2.5 space-y-1.5">
                        {unit.lessons.map((lesson, i) => (
                          <LessonRow
                            key={lesson.lesson_id}
                            lesson={lesson}
                            index={i}
                            unitOpen={!unit.locked}
                            onOpen={onOpenLesson}
                          />
                        ))}
                      </div>

                      {/* Locked gate (visual halting point) */}
                      {unit.locked && (
                        <div className="mt-2.5 flex items-center gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/80 px-3 py-2">
                          <Lock className="h-4 w-4 shrink-0 text-amber-500" />
                          <p className="text-[11px] font-bold text-amber-700">
                            {unit.locked_reason || t('student.path.lockedReason')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {/* Finish celebration when the visible journey is complete */}
      {allDone && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-3xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 text-center shadow-sm animate-game-pop">
          <span className="text-2xl">🏆</span>
          <p className="text-sm font-extrabold text-emerald-700">{t('student.path.finished')}</p>
        </div>
      )}
    </div>
  );
}
