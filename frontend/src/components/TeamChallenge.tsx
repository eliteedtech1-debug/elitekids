/**
 * TeamChallenge — real-time team game UI (lobby + live + results).
 *
 * Renders the active team challenge for a student's team, listens to WS
 * events for live score ticks, and allows answer submission.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Zap, Trophy, Users, Send } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import { useCollabSocket, type CollabEvent } from '@/lib/live/useCollabSocket';

interface Challenge {
  id: number;
  team_id: number;
  lesson_id: string;
  status: 'lobby' | 'active' | 'ended';
  max_questions: number;
  current_index: number;
  scores: Record<string, number>;
  started_at?: string;
  ended_at?: string;
}

interface TeamChallengeProps {
  teamId: number;
  classId: string;
  childAdmissionNo: string;
}

export default function TeamChallenge({ teamId, classId, childAdmissionNo }: TeamChallengeProps) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerScore, setAnswerScore] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadChallenge = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.COLLAB.TEAMS_CHALLENGE(String(teamId)));
      setChallenge(res.data?.data || null);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { loadChallenge(); }, [loadChallenge]);

  const onWsEvent = useCallback((event: CollabEvent, payload: Record<string, any>) => {
    if (event === 'challenge:started' && payload.team_id === teamId) {
      loadChallenge();
      toast.success(t('collab.challengeStart', { defaultValue: 'Team Challenge is LIVE!' }));
    }
    if (event === 'challenge:tick' && payload.team_id === teamId) {
      loadChallenge();
    }
    if (event === 'challenge:answer' && payload.team_id === teamId) {
      loadChallenge();
    }
    if (event === 'challenge:ended' && payload.team_id === teamId) {
      loadChallenge();
      toast.success(t('collab.challengeEnded', { defaultValue: 'Challenge ended' }));
    }
  }, [teamId, loadChallenge]);

  useCollabSocket({
    rooms: [`team:${teamId}`, `class:${classId}`],
    onEvent: onWsEvent,
  });

  const submit = async () => {
    const score = Number(answerScore);
    if (!Number.isFinite(score) || score < 0) {
      toast.error(t('collab.challengeSubmit', { defaultValue: 'Submit' }));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.COLLAB.TEAMS_CHALLENGE_SUBMIT(String(teamId)), {
        answer_score: score,
        lesson_id: challenge?.lesson_id || '',
      });
      setAnswerScore('');
      loadChallenge();
      toast.success(t('collab.challengeAnswer', { defaultValue: 'Your answer saved! Keep going!' }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading challenge...
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-center shadow-sm backdrop-blur-xl">
        <Zap className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm font-bold text-gray-600">{t('collab.noTeam', { defaultValue: 'No active challenge' })}</p>
        <p className="mt-1 text-xs text-gray-400">{t('collab.challengeJoin', { defaultValue: 'Join the challenge and score for your team!' })}</p>
      </div>
    );
  }

  const myScore = challenge.scores?.[childAdmissionNo] || 0;
  const totalQuestions = challenge.max_questions || 5;
  const current = challenge.current_index || 0;
  const isEnded = challenge.status === 'ended';
  const progress = Math.min(100, Math.round((current / totalQuestions) * 100));

  const sortedScores = Object.entries(challenge.scores || {})
    .sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-lg backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-gray-800">
              {isEnded ? t('collab.challengeEnded', { defaultValue: 'Challenge ended' }) : t('collab.challengeStart', { defaultValue: 'Team Challenge is LIVE!' })}
            </p>
            <p className="text-[11px] text-gray-500">
              {t('collab.teamProgress', { name: `Team #${teamId}`, defaultValue: `Team #${teamId}` })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-amber-600">{myScore}</p>
          <p className="text-[10px] font-bold text-gray-400">YOUR PTS</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-200/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mb-3 text-[11px] text-gray-500">
        Question {Math.min(current + 1, totalQuestions)} of {totalQuestions}
      </p>

      {/* Answer input */}
      {!isEnded && (
        <div className="mb-3 flex gap-2">
          <input
            type="number"
            value={answerScore}
            onChange={(e) => setAnswerScore(e.target.value)}
            placeholder="Score"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            min={0}
          />
          <button
            onClick={submit}
            disabled={submitting || !answerScore}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {t('collab.challengeSubmit', { defaultValue: 'Submit' })}
          </button>
        </div>
      )}

      {/* Scoreboard */}
      {sortedScores.length > 0 && (
        <div className="rounded-xl bg-gray-50/80 p-3">
          <p className="mb-2 flex items-center gap-1 text-[11px] font-bold text-gray-500">
            <Trophy className="h-3 w-3" /> Scoreboard
          </p>
          {sortedScores.map(([adm, pts], i) => (
            <div key={adm} className="flex items-center justify-between py-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'text-gray-400'
                }`}>
                  {i + 1}
                </span>
                <span className={adm === childAdmissionNo ? 'font-bold text-[#0F4D92]' : 'text-gray-700'}>
                  {adm === childAdmissionNo ? 'You' : adm}
                </span>
              </span>
              <span className="font-bold text-gray-700">{pts as number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
