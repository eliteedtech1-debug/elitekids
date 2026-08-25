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
import { RefreshCw, AlertTriangle, BookOpen, CheckCircle2, Zap, Loader2, Target } from 'lucide-react';
import { playTap } from '@/lib/game/sound-effects';
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
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
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
      <div className="flex items-center gap-2 mb-1">
        <RefreshCw className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-gray-700">Review Time</h3>
        {failedCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
            {failedCount} weak item{failedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Failed items summary */}
      {failedCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-bold text-amber-800">Items to strengthen</span>
          </div>
          <p className="text-[11px] text-amber-700 mb-3">
            You got {failedCount} question{failedCount !== 1 ? 's' : ''} wrong recently. Reviewing them will help you remember better!
          </p>

          {/* Show top nudges */}
          <div className="space-y-1.5">
            {nudges.slice(0, 3).map((nudge, i) => (
              <div
                key={`${nudge.lesson_id || nudge.topic}-${i}`}
                className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-gray-700 truncate">
                    {nudge.topic || nudge.subject}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {nudge.failed_count} wrong · {nudge.days_since > 0 ? `${nudge.days_since}d ago` : 'recent'}
                  </span>
                </div>
                {nudge.lesson_id && (
                  <button
                    onClick={() => handleReviewLesson(nudge.lesson_id!)}
                    className="ml-2 shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-600 transition-colors"
                  >
                    ▶ Review
                  </button>
                )}
              </div>
            ))}
          </div>

          {nudges.length > 3 && (
            <p className="mt-2 text-[10px] text-amber-500">
              +{nudges.length - 3} more topics to review
            </p>
          )}
        </div>
      )}

      {/* Weekly summary button */}
      <button
        onClick={handleStartWeekly}
        disabled={starting}
        className="w-full rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-4 text-left transition-all hover:border-purple-300 hover:shadow-md active:scale-[0.98]"
      >
        {starting ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
            <span className="text-xs font-medium text-purple-600">Loading weekly review…</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-bold text-gray-700">Weekly Review</span>
              </div>
              <p className="text-[11px] text-gray-500">Comprehensive review of everything this week</p>
            </div>
            <span className="shrink-0 rounded-lg bg-purple-500 px-3 py-1.5 text-[10px] font-bold text-white">
              ▶ Start
            </span>
          </div>
        )}
      </button>
    </div>
  );
}
