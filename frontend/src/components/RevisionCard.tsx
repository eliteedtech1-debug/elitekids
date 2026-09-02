/**
 * RevisionCard — gentle review suggestions, not blockers.
 *
 * Shows:
 *   - Failed items count + "Review these" button
 *   - Review nudges (topics getting rusty)
 *   - Weekly summary of weak areas
 *
 * Never blocks play — just suggests reviewing.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, AlertTriangle, BookOpen, CheckCircle2, Zap, Loader2, Target, Flame, Sparkles, ArrowRight } from 'lucide-react';
import { playTap } from '@/lib/game/sound-effects';
import { t, tN } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ────────────────────────────────────────────── */

interface Nudge {
  lesson_id: string | null;
  subject: string;
  topic: string;
  failed_count: number;
  days_since: number;
  reason: string;
  accuracy?: number;
}

interface StatusData {
  failed_items: number;
  nudges: number;
  weekly_completed: boolean;
}

/* ── Floating decoration for game feel ─────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-30 ${className}`} />
  );
}

/* ── Main Component ──────────────────────────────────── */

export default function RevisionCard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statusRes, nudgesRes] = await Promise.all([
        apiClient.get(ENDPOINTS.REVISION.STATUS).catch(() => ({ data: { data: null } })),
        apiClient.get(ENDPOINTS.REVISION.NUDGES).catch(() => ({ data: { data: [] } })),
      ]);
      setStatus(statusRes.data?.data || null);
      setNudges(nudgesRes.data?.data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleReviewLesson = (lessonId: string) => {
    playTap();
    navigate(`/student/game/${lessonId}?mode=practice`);
  };

  const handleStartWeekly = async () => {
    setStarting(true);
    try {
      const res = await apiClient.get(ENDPOINTS.REVISION.WEEKLY);
      const data = res.data?.data;
      if (data?.questions?.length > 0) {
        sessionStorage.setItem('revision-weekly', JSON.stringify(data));
        playTap();
        navigate('/student/game/revision-weekly?mode=test&revision=1');
      }
    } catch {
      // ignore
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-[#0d9488]" />
      </div>
    );
  }

  const failedCount = status?.failed_items || 0;
  const nudgeCount = nudges.length;

  // Don't show anything if there's nothing to review
  if (failedCount === 0 && nudgeCount === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Section header — game-style glassmorphism panel */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0F4D92]/5 via-[#0d9488]/5 to-amber-50/50 backdrop-blur-xl border border-white/60 p-5 shadow-xl shadow-[#0F4D92]/5">
        <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-amber-400 to-orange-400" />
        <FloatingDeco className="-left-6 -bottom-6 h-20 w-20 bg-gradient-to-br from-red-400 to-pink-400" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 shadow-xl shadow-orange-300/50 ring-2 ring-white/50">
            <RefreshCw className="h-6 w-6 text-white drop-shadow-lg" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-800">{t('revisionCard.title')}</h3>
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-600">
                <Flame className="h-2.5 w-2.5" />
                {tN('revisionCard.weakItems', failedCount)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Failed items summary */}
      {failedCount > 0 && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-amber-100 bg-gradient-to-br from-amber-50/80 via-orange-50/50 to-yellow-50/60 p-5 shadow-lg shadow-amber-200/20">
          <FloatingDeco className="-right-5 -top-5 h-24 w-24 bg-gradient-to-br from-amber-400 to-orange-400" />
          <FloatingDeco className="-left-3 -bottom-3 h-16 w-16 bg-gradient-to-br from-orange-400 to-red-400" />
          <div className="relative">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-300/40">
                <Target className="h-4 w-4 text-white drop-shadow" />
              </div>
              <span className="text-sm font-extrabold text-amber-800">{t('revisionCard.strengthen')}</span>
            </div>
            <p className="text-[11px] text-amber-700 mb-3">{tN('revisionCard.wrongRecent', failedCount)}</p>

            {/* Nudge items */}
            <div className="space-y-2">
              {nudges.slice(0, 3).map((nudge, i) => (
                <div
                  key={`${nudge.lesson_id || nudge.topic}-${i}`}
                  className="flex items-center justify-between rounded-2xl bg-white/80 backdrop-blur-sm px-4 py-3 shadow-sm border border-white/60 hover:shadow-md transition-shadow"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-800 truncate">
                      {nudge.topic || nudge.subject}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">
                      {t('revisionCard.nudgeMeta', { count: nudge.failed_count, meta: nudge.days_since > 0 ? t('revisionCard.daysAgo', { days: nudge.days_since }) : t('revisionCard.recent') })}
                    </span>
                  </div>
                  {nudge.lesson_id && (
                    <button
                      onClick={() => handleReviewLesson(nudge.lesson_id!)}
                      className="ml-2 shrink-0 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-[10px] font-bold text-white shadow-md shadow-amber-300/40 hover:shadow-lg hover:shadow-orange-400/50 hover:scale-105 active:scale-95 transition-all"
                    >
                      {t('revisionCard.review')}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {nudges.length > 3 && (
              <p className="mt-3 text-[10px] text-amber-500 font-semibold">
                {t('revisionCard.moreTopics', { count: nudges.length - 3 })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Weekly summary button — game-style */}
      <button
        onClick={handleStartWeekly}
        disabled={starting}
        className="w-full relative overflow-hidden rounded-3xl border-2 border-[#0F4D92]/10 bg-gradient-to-r from-[#0F4D92]/5 via-indigo-50 to-[#0d9488]/5 p-5 text-left transition-all hover:border-[#0F4D92]/20 hover:shadow-xl hover:shadow-[#0F4D92]/10 hover:scale-[1.01] active:scale-[0.99] group"
      >
        <FloatingDeco className="-right-5 -top-5 h-24 w-24 bg-gradient-to-br from-[#0F4D92] to-indigo-400" />
        <FloatingDeco className="-left-3 -bottom-3 h-16 w-16 bg-gradient-to-br from-[#0d9488] to-teal-400" />
        {starting ? (
          <div className="relative flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-[#0F4D92]" />
            <span className="text-sm font-bold text-[#0F4D92]">{t('revisionCard.loadingWeekly')}</span>
          </div>
        ) : (
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F4D92] to-indigo-500 shadow-md shadow-[#0F4D92]/30">
                  <Sparkles className="h-4 w-4 text-white drop-shadow" />
                </div>
                <span className="text-sm font-extrabold text-gray-800">{t('revisionCard.weekly')}</span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium">{t('revisionCard.weeklyDesc')}</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-5 py-2.5 text-[11px] font-bold text-white shadow-lg shadow-[#0F4D92]/30 group-hover:shadow-[#0F4D92]/40 group-hover:scale-105 transition-all">
              <Zap className="h-3.5 w-3.5" />
              {t('revisionCard.start')}
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        )}
      </button>
    </div>
  );
}
