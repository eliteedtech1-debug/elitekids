/**
 * RevisionCard — dashboard component for gate + weekly revision.
 *
 * Gate Revision: shown when child has studied enough items (5+).
 *   Acts as a checkpoint — must complete before continuing.
 *   Shows progress bar towards threshold.
 *
 * Weekly Revision: comprehensive review of everything learned this week.
 *   Shown on the dashboard, independent of gate.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, CalendarDays, CheckCircle2, Zap, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { playTap, playScore } from '@/lib/game/sound-effects';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ────────────────────────────────────────────── */

interface GateStatus {
  active: boolean;
  games_since_revision: number;
  threshold: number;
  games_remaining: number;
}

interface WeeklyStatus {
  completed: boolean;
  score?: number;
  xp?: number;
}

interface StatusData {
  gate: GateStatus;
  weekly: WeeklyStatus;
}

interface RevisionData {
  completed: boolean;
  revision_id: string;
  type: 'gate' | 'weekly';
  questions: any[];
  lesson_count: number;
  reason?: string;
}

/* ── Main Component ──────────────────────────────────── */

export default function RevisionCard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<'gate' | 'weekly' | null>(null);

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

  const handleStart = async (type: 'gate' | 'weekly') => {
    setStarting(type);
    try {
      const endpoint = type === 'gate' ? ENDPOINTS.REVISION.GATE : ENDPOINTS.REVISION.WEEKLY;
      const res = await apiClient.get(endpoint);
      const data: RevisionData = res.data?.data;

      if (data.completed) {
        playScore();
        return;
      }

      if (!data.questions || data.questions.length === 0) {
        return;
      }

      // Store revision data and navigate to GamePlay
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

  const gate = status?.gate;
  const weeklyDone = status?.weekly?.completed || false;
  const gateActive = gate?.active || false;
  const gateThreshold = gate?.threshold || 3;
  const gateGames = gate?.games_since_revision || 0;
  const gateProgress = Math.min(100, Math.round((gateGames / gateThreshold) * 100));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-gray-700">Revision</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Gate Revision */}
        <button
          onClick={() => handleStart('gate')}
          disabled={starting !== null || !gateActive}
          className={`relative rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
            gateActive
              ? 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50 hover:border-red-400 hover:shadow-md ring-2 ring-red-200'
              : weeklyDone
                ? 'border-green-200 bg-green-50'
                : 'border-gray-200 bg-gray-50 opacity-70'
          } ${!gateActive && !weeklyDone ? 'cursor-not-allowed' : ''}`}
        >
          {starting === 'gate' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80">
              <Loader2 className="h-5 w-5 animate-spin text-red-500" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <div className={`grid h-8 w-8 place-items-center rounded-lg ${gateActive ? 'bg-red-100' : 'bg-gray-100'}`}>
              {gateActive ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
            </div>
            <span className="text-xs font-bold text-gray-700">Review Gate</span>
          </div>

          {gateActive ? (
            <div>
              <p className="text-[11px] text-red-600 font-medium mb-1.5">
                ⚠️ Review required! {gate?.games_remaining || 0} more game{(gate?.games_remaining || 0) !== 1 ? 's' : ''} to unlock.
              </p>
              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-red-100 mb-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-400 to-orange-500 transition-all"
                  style={{ width: `${gateProgress}%` }}
                />
              </div>
              <span className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1 text-[10px] font-bold text-white">
                ▶ Review Now
              </span>
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-gray-500">
                {gate ? `${gate.games_remaining} more game${gate.games_remaining !== 1 ? 's' : ''} until next review` : 'Keep studying!'}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-gray-300 px-2.5 py-1 text-[10px] font-bold text-white">
                <Lock className="h-3 w-3" /> Locked
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
              <p className="text-[11px] text-gray-500">Comprehensive review of everything this week</p>
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
