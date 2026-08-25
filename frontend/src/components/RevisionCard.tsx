/**
 * RevisionCard — dashboard component for daily & weekly revision.
 *
 * Shows:
 *   - Daily revision card (play / completed status)
 *   - Weekly revision card (play / completed status)
 *   - Quick stats (questions, XP earned)
 *
 * Auto-generates quizzes from recently played lessons.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CalendarDays, CheckCircle2, Star, Zap, Loader2, RefreshCw } from 'lucide-react';
import { playTap, playScore } from '@/lib/game/sound-effects';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ────────────────────────────────────────────── */

interface RevisionStatus {
  completed: boolean;
  score?: number;
  xp?: number;
}

interface RevisionData {
  completed: boolean;
  revision_id: string;
  type: 'daily' | 'weekly';
  questions: any[];
  lesson_count: number;
  reason?: string;
}

interface StatusData {
  daily: RevisionStatus;
  weekly: RevisionStatus;
}

/* ── Main Component ──────────────────────────────────── */

export default function RevisionCard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<'daily' | 'weekly' | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.REVISION.STATUS);
      setStatus(res.data?.data || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadStatus().finally(() => setLoading(false));
  }, [loadStatus]);

  const handleStart = async (type: 'daily' | 'weekly') => {
    setStarting(type);
    try {
      const endpoint = type === 'daily' ? ENDPOINTS.REVISION.DAILY : ENDPOINTS.REVISION.WEEKLY;
      const res = await apiClient.get(endpoint);
      const data: RevisionData = res.data?.data;

      if (data.completed) {
        // Already done
        playScore();
        setStatus((prev) => prev ? { ...prev, [type]: { completed: true, score: data.questions?.length || 0, xp: 20 } } : prev);
        return;
      }

      if (!data.questions || data.questions.length === 0) {
        // No questions available — still navigate to show the empty state
      }

      // Navigate to GamePlay with the revision quiz
      // We store the revision data in sessionStorage for GamePlay to pick up
      sessionStorage.setItem(`revision-${type}`, JSON.stringify(data));
      playTap();
      navigate(`/student/game/revision-${type}?mode=test&revision=1`);
    } catch (err: any) {
      console.error('Failed to start revision:', err);
    } finally {
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const dailyDone = status?.daily?.completed || false;
  const weeklyDone = status?.weekly?.completed || false;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <RefreshCw className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-gray-700">Revision</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Daily Revision */}
        <button
          onClick={() => handleStart('daily')}
          disabled={starting !== null}
          className={`relative rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
            dailyDone
              ? 'border-green-200 bg-green-50'
              : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          {starting === 'daily' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <div className={`grid h-8 w-8 place-items-center rounded-lg ${dailyDone ? 'bg-green-100' : 'bg-amber-100'}`}>
              {dailyDone ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Calendar className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <span className="text-xs font-bold text-gray-700">Daily Review</span>
          </div>
          {dailyDone ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-green-600 font-medium">✅ Done!</span>
              {status?.daily?.xp ? (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 ml-auto">
                  <Zap className="h-3 w-3" />{status.daily.xp} XP
                </span>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-gray-500">Quick 3-5 question quiz from today's games</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white">
                ▶ Start
              </span>
            </div>
          )}
        </button>

        {/* Weekly Revision */}
        <button
          onClick={() => handleStart('weekly')}
          disabled={starting !== null}
          className={`relative rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
            weeklyDone
              ? 'border-green-200 bg-green-50'
              : 'border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 hover:border-purple-300 hover:shadow-md'
          }`}
        >
          {starting === 'weekly' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <div className={`grid h-8 w-8 place-items-center rounded-lg ${weeklyDone ? 'bg-green-100' : 'bg-purple-100'}`}>
              {weeklyDone ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <CalendarDays className="h-4 w-4 text-purple-600" />
              )}
            </div>
            <span className="text-xs font-bold text-gray-700">Weekly Review</span>
          </div>
          {weeklyDone ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-green-600 font-medium">✅ Done!</span>
              {status?.weekly?.xp ? (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 ml-auto">
                  <Zap className="h-3 w-3" />{status.weekly.xp} XP
                </span>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-gray-500">Big review of everything this week (10-15 Qs)</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-purple-500 px-2.5 py-1 text-[10px] font-bold text-white">
                ▶ Start
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
