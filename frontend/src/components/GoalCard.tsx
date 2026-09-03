/**
 * GoalCard — weekly learning goal (G7).
 *
 * Renders the child's current week target from GET /kids/goals (same shape the
 * learning-path endpoint embeds) and lets the child pick their own target
 * (POST /kids/goals/:admissionNo { target_count, set_by: 'child' }). Teacher-set
 * goals are shown with a note; the backend protects teacher targets from being
 * lowered by a child.
 */
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, RotateCcw, Target } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import { GOAL_CHOICES, goalPercent, type WeeklyGoal } from '@/lib/utils/learningPath';

interface GoalCardProps {
  admissionNo: string;
  goal: WeeklyGoal | null;
  loading?: boolean;
  /** Parent keeps the goal in sync (learning-path payload embeds it too). */
  onUpdated: (goal: WeeklyGoal) => void;
  /** Open the picker automatically (used by the post-login welcome spotlight). */
  autoOpenPicker?: boolean;
}

export default function GoalCard({ admissionNo, goal, loading, onUpdated, autoOpenPicker }: GoalCardProps) {
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // The learning-path payload usually carries the goal, but it CAN be absent
  // (path fetch failed/offline) — the card then showed a fake "0/1" and, worse,
  // a successful save was dropped because the result was only merged into the
  // (null) path state — which read as "save goal not submitting". Keep our own
  // copy: seed it from the prop, fetch the real goal when the prop is null,
  // and always keep the save result locally.
  const [localGoal, setLocalGoal] = useState<WeeklyGoal | null>(goal);
  useEffect(() => {
    if (goal) setLocalGoal(goal);
  }, [goal]);
  useEffect(() => {
    if (goal || !admissionNo) return;
    let dead = false;
    apiClient
      .get(ENDPOINTS.GOALS.GET(admissionNo))
      .then((r) => {
        if (!dead && r.data?.data) setLocalGoal(r.data.data);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionNo]);

  // Auto-open the picker when the welcome spotlight asks for it AND the
  // current goal is still the lazy default (auto-init, never set by the
  // child or teacher) so the first post-login interaction lands on the
  // goal setup.
  useEffect(() => {
    if (autoOpenPicker && goal && (goal.set_by === 'auto' || !goal.set_by) && goal.done === 0) {
      setPicking(true);
    }
  }, [autoOpenPicker, goal]);

  // Mobile: when the picker opens, bring it fully into view — on small
  // screens the number row used to render BELOW the fold (unreachable),
  // which read as "submit not working" because taps hit nothing.
  useEffect(() => {
    if (picking && pickerRef.current) {
      const t = window.setTimeout(
        () => pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
        80,
      );
      return () => window.clearTimeout(t);
    }
  }, [picking]);

  const setTarget = async (target: number) => {
    if (!admissionNo) {
      const msg = t('student.goal.saveError', { defaultValue: 'Could not save your goal. Please reload and try again.' });
      toast.error(msg);
      setLastError(msg);
      return;
    }
    playTap();
    setSaving(true);
    setLastError(null);
    try {
      const res = await apiClient.post(ENDPOINTS.GOALS.POST(admissionNo), {
        target_count: target,
        set_by: 'child',
      });
      const data = res.data?.data;
      if (data) {
        setLocalGoal(data); // survive even when path data (and prop sync) is absent
        onUpdated(data);
        setPicking(false);
        toast.success(t('student.goal.saved', { defaultValue: 'Goal saved! Go play! 🎯' }));
      } else {
        throw new Error('No goal data in response');
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t('student.goal.saveError', { defaultValue: 'Could not save your goal. Please try again.' });
      toast.error(msg);
      setLastError(msg);
    } finally {
      setSaving(false);
    }
  };

  const g = localGoal;
  const target = g?.target ?? 1;
  const done = g?.done ?? 0;
  const pct = goalPercent(g);
  const reached = g?.status === 'done' || done >= target;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-4 shadow-lg backdrop-blur-xl transition-all animate-game-slide-up ${
        reached
          ? 'border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/60 to-emerald-100/50'
          : 'border-white/70 bg-white/80'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl shadow-md ${
              reached
                ? 'bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-emerald-300/40'
                : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-300/40'
            }`}
          >
            {reached ? '🎉' : <Target className="h-6 w-6" />}
          </span>
          <div>
            <p className="text-sm font-extrabold text-gray-800">
              {g?.set_by === 'auto' && done === 0 ? (
                <span className="inline-flex items-center gap-1">
                  <span>🌱</span> {t('student.goal.title')}
                </span>
              ) : (
                t('student.goal.title')
              )}
            </p>
            <p className="text-xs font-medium text-gray-500">
              {g?.set_by === 'teacher'
                ? t('student.goal.teacherNote')
                : g?.set_by === 'auto' && done === 0
                ? t('student.goal.childNote')
                : t('student.goal.childNote')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-black leading-none tracking-tight text-gray-800">
              {done}
              <span className="text-gray-300">/{target}</span>
            </p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {reached ? t('student.goal.doneLabel') : t('student.goal.todoLabel')}
            </p>
          </div>
          {!reached && (
            <button
              onClick={() => { playTap(); setPicking((v) => !v); }}
              disabled={saving || loading}
              className="rounded-xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-3 py-2 text-xs font-bold text-white shadow-md shadow-[#0F4D92]/25 transition hover:shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {picking ? t('common.cancel') : t('student.goal.set')}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200/70" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('student.goal.title')}>
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            reached
              ? 'bg-gradient-to-r from-emerald-400 to-green-500'
              : 'bg-gradient-to-r from-amber-400 to-orange-500'
          }`}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>

      {reached && (
        <p className="mt-2 text-xs font-bold text-emerald-600 animate-game-pop">{t('student.goal.reached')}</p>
      )}

      {/* Child goal setter */}
      {picking && (
        <div
          ref={pickerRef}
          className="mt-3 rounded-2xl border border-[#0F4D92]/10 bg-white/90 p-3 animate-game-slide-down"
        >
          <p className="mb-2 text-xs font-bold text-gray-600">{t('student.goal.choose')}</p>
          <div className="flex flex-wrap gap-1.5">
            {GOAL_CHOICES.map((n) => {
              const active = !g || n === g.target;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTarget(n)}
                  disabled={saving}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl text-base font-black transition-all active:scale-90 disabled:opacity-50 ${
                    active
                      ? 'bg-gradient-to-br from-[#0F4D92] to-[#0d9488] text-white shadow-md shadow-[#0F4D92]/25'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:shadow-sm'
                  }`}
                  aria-label={t('student.goal.targetGames', { count: n })}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {g?.set_by === 'teacher' && (
            <p className="mt-2 text-[11px] font-medium text-amber-600">👩‍🏫 {t('student.goal.teacherHint')}</p>
          )}
          {/* Inline error + retry so save failures are visible, not just a fading toast. */}
          {lastError && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">{lastError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLastError(null);
                    setPicking(true);
                  }}
                  className="mt-1 inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('common.retry', { defaultValue: 'Try again' })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
