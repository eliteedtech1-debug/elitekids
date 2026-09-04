/**
 * ClassQuest — class-wide progress bar + leaderboard strip.
 *
 * Shows the active class quest with a big progress bar and a mini
 * leaderboard of top contributors.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Target, Trophy, Users } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import { useCollabSocket, type CollabEvent } from '@/lib/live/useCollabSocket';

interface ClassQuestData {
  id: number;
  class_id: string;
  title: string;
  target_metric: string;
  target_value: number;
  current_value: number;
  status: 'active' | 'completed';
  progress_pct: number;
  total_progress: number;
  leaderboard: { child_admission_no: string; amount: number; share_pct: number }[];
}

interface ClassQuestProps {
  classId: string;
  childAdmissionNo: string;
}

export default function ClassQuest({ classId, childAdmissionNo }: ClassQuestProps) {
  const [quest, setQuest] = useState<ClassQuestData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadQuest = useCallback(async () => {
    try {
      const res = await apiClient.get(`${ENDPOINTS.COLLAB.CLASS_QUEST_ACTIVE}?class_id=${encodeURIComponent(classId)}`);
      setQuest(res.data?.data || null);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { loadQuest(); }, [loadQuest]);

  const onWsEvent = useCallback((event: CollabEvent, payload: Record<string, any>) => {
    if (event === 'class-quest:progress' && payload.quest_id === quest?.id) {
      loadQuest();
    }
    if (event === 'class-quest:completed' && payload.quest_id === quest?.id) {
      loadQuest();
      toast.success(t('collab.classQuestCompleted', { defaultValue: 'Class Quest Complete! Great teamwork!' }));
    }
  }, [quest?.id, loadQuest]);

  useCollabSocket({
    rooms: [`class:${classId}`, quest ? `quest:${quest.id}` : ''].filter(Boolean),
    onEvent: onWsEvent,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading quest...
      </div>
    );
  }

  if (!quest) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-center shadow-sm backdrop-blur-xl">
        <Target className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm font-bold text-gray-600">{t('collab.classQuest', { defaultValue: 'Class Quest' })}</p>
        <p className="mt-1 text-xs text-gray-400">No active quest right now</p>
      </div>
    );
  }

  const isComplete = quest.status === 'completed';

  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-white ${
          isComplete ? 'bg-gradient-to-br from-emerald-400 to-green-500' : 'bg-gradient-to-br from-purple-400 to-indigo-500'
        }`}>
          <Target className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-gray-800">{quest.title || t('collab.classQuest', { defaultValue: 'Class Quest' })}</p>
          <p className="text-[11px] text-gray-500">
            {isComplete ? 'Completed!' : `${quest.total_progress || 0} / ${quest.target_value} ${quest.target_metric || 'points'}`}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2 h-4 w-full overflow-hidden rounded-full bg-gray-200/70">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            isComplete ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-purple-400 to-indigo-500'
          }`}
          style={{ width: `${Math.min(100, quest.progress_pct || 0)}%` }}
        />
      </div>
      <p className="mb-3 text-center text-xs font-bold text-gray-500">{quest.progress_pct || 0}%</p>

      {isComplete && (
        <p className="mb-3 text-center text-xs font-bold text-emerald-600 animate-game-pop">
          {t('collab.classQuestCompleted', { defaultValue: 'Class Quest Complete! Great teamwork!' })}
        </p>
      )}

      {/* Mini leaderboard */}
      {quest.leaderboard && quest.leaderboard.length > 0 && (
        <div className="rounded-xl bg-gray-50/80 p-3">
          <p className="mb-2 flex items-center gap-1 text-[11px] font-bold text-gray-500">
            <Trophy className="h-3 w-3" /> Top contributors
          </p>
          {quest.leaderboard.slice(0, 5).map((entry, i) => (
            <div key={entry.child_admission_no} className="flex items-center justify-between py-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'text-gray-400'
                }`}>
                  {i + 1}
                </span>
                <span className={entry.child_admission_no === childAdmissionNo ? 'font-bold text-[#0F4D92]' : 'text-gray-700'}>
                  {entry.child_admission_no === childAdmissionNo ? 'You' : entry.child_admission_no}
                </span>
              </span>
              <span className="font-bold text-gray-700">{entry.amount} ({entry.share_pct}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
