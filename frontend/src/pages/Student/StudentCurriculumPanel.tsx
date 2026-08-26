import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckCircle2, Lock, PlayCircle, CalendarDays } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';

/**
 * E3 — My Subjects (curriculum ladder) panel.
 * Subject → series → weekly units with sequential gating:
 *   ✅ done · ▶️ open (next up) · 🔒 locked until every earlier unit is done.
 */

const SUBJECT_META: Record<string, { labelKey: string; emoji: string; ring: string }> = {
  'Eng-Phonics': { labelKey: 'student.curriculum.subject.engPhonics', emoji: '📖', ring: 'border-sky-200 bg-sky-50' },
  'Eng-Phonics-Bank': { labelKey: 'student.curriculum.subject.engPhonicsBank', emoji: "🎷", ring: 'border-cyan-200 bg-cyan-50' },
  'Eng-Language': { labelKey: 'student.curriculum.subject.engLanguage', emoji: '📖', ring: 'border-sky-200 bg-sky-50' },
  'Math-Numbers': { labelKey: 'student.curriculum.subject.mathNumbers', emoji: '🔢', ring: 'border-violet-200 bg-violet-50' },
  'Sci-Animals': { labelKey: 'student.curriculum.subject.sciAnimals', emoji: '🐘', ring: 'border-emerald-200 bg-emerald-50' },
  GENERAL: { labelKey: 'student.curriculum.subject.general', emoji: '🎒', ring: 'border-amber-200 bg-amber-50' },
};

function UnitRow({ unit, onPlay }: { unit: any; onPlay: (lessonId: string) => void }) {
  const state = unit.locked ? 'locked' : unit.done ? 'done' : 'open';
  return (
    <button
      onClick={() => !unit.locked && unit.next_lesson_id && onPlay(unit.next_lesson_id)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
        state === 'locked'
          ? 'border-gray-200 bg-gray-50 opacity-70'
          : state === 'done'
            ? 'border-green-200 bg-green-50'
            : 'border-indigo-200 bg-white shadow-sm hover:border-indigo-300'
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${
          state === 'done'
            ? 'bg-green-500 text-white'
            : state === 'locked'
              ? 'bg-gray-200 text-gray-500'
              : 'bg-indigo-500 text-white'
        }`}
      >
        {unit.unit_number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-gray-800">{unit.title || t('student.curriculum.unit', { n: unit.unit_number })}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          <CalendarDays className="h-3 w-3" /> {t('student.curriculum.week', { n: unit.week_number ?? unit.unit_number })}
          <span>·</span>
          {t('student.curriculum.games', { done: unit.completed_lessons, total: unit.total_lessons })}
        </span>
      </span>
      {state === 'done' && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />}
      {state === 'open' && <PlayCircle className="h-5 w-5 shrink-0 text-indigo-500" />}
      {state === 'locked' && <Lock className="h-4 w-4 shrink-0 text-gray-400" />}
    </button>
  );
}

export default function StudentCurriculumPanel() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get(ENDPOINTS.CURRICULUM.LIST)
      .then((r) => setSubjects(r.data?.data?.subjects || []))
      .catch(() => setSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  const play = (lessonId: string) => navigate(`/student/game/${lessonId}`);
  const deny = () => {
    setToast(t('student.curriculum.lockedToast'));
    setTimeout(() => setToast(null), 2500);
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16 text-sm text-gray-500">
        <BookOpen className="mb-2 h-6 w-6 animate-pulse" /> {t('student.curriculum.loading')}
      </div>
    );
  }

  return (
    <div className="relative space-y-5 pb-8">
      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900/90 px-4 py-2 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {subjects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">{t('student.curriculum.empty')}</p>
          <p className="text-xs text-gray-400">{t('student.curriculum.emptyHint')}</p>
        </div>
      )}

      {subjects.map((subj) => {
        const meta = SUBJECT_META[subj.subject_code] || SUBJECT_META.GENERAL;
        return (
          <section key={subj.subject_code}>
            <h3 className={`mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold ${meta.ring}`}>
              <span className="text-lg">{meta.emoji}</span> {t(meta.labelKey)}
            </h3>
            <div className="space-y-3">
              {subj.series.map((sr: any) => {
                const doneCount = sr.units.filter((u: any) => u.done).length;
                return (
                  <div key={sr.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <p className="truncate text-sm font-bold text-gray-800">{sr.name}</p>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        {t('student.curriculum.weeks', { done: doneCount, total: sr.units.length })}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {sr.units.map((u: any) =>
                        u.locked ? (
                          <div key={u.id} onClick={deny} role="button">
                            <UnitRow unit={u} onPlay={play} />
                          </div>
                        ) : (
                          <UnitRow key={u.id} unit={u} onPlay={play} />
                        ),
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="px-2 text-center text-xs text-gray-400">{t('student.curriculum.footer')}</p>
    </div>
  );
}
