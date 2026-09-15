/**
 * CheckpointTestOut — "I already know this, let me start higher".
 *
 * Shown next to a locked group on the student's Home. An advanced learner who is
 * blocked by the prerequisite chain can sit ONE assessment covering every
 * unfinished level of that subject up to their band ceiling.
 *
 * The card is deliberately honest about what happens next: a pass is a
 * RECOMMENDATION. In a school with teachers it waits for a grown-up to confirm;
 * in a self-paced flagship school (no active teacher by design) the server
 * confirms it immediately and the levels unlock on the spot. The card renders
 * whichever the API reports — it never decides that itself.
 */

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import toast from 'react-hot-toast';
import type { CheckpointExam, CheckpointStatusPayload } from '@/lib/types/checkpoint';

interface Props {
  studentId: string;
  seriesId: string;
  seriesName?: string;
  /** Called once levels unlock, so the parent can refresh the path. */
  onUnlocked?: () => void;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CheckpointTestOut({ studentId, seriesId, seriesName, onUnlocked }: Props) {
  const [exam, setExam] = useState<CheckpointExam | null>(null);
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [result, setResult] = useState<CheckpointExam | null>(null);

  const loadStatus = useCallback(async () => {
    if (!studentId) return;
    try {
      const res = await apiClient.get(ENDPOINTS.CHECKPOINTS.STATUS, { params: { student_id: studentId } });
      const payload = res.data?.data as CheckpointStatusPayload | undefined;
      const mine = payload?.exams?.find((e) => e.series_id === seriesId) || null;
      setExam(mine);
      if (mine?.can_retry_at) setCooldownUntil(mine.can_retry_at);
    } catch {
      /* a checkpoint card is optional furniture — never break Home for it */
    }
  }, [studentId, seriesId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiClient.get(ENDPOINTS.CHECKPOINTS.ISSUE, {
        params: { student_id: studentId, series_id: seriesId },
      });
      const data = res.data?.data as CheckpointExam;
      setExam(data);
      setAnswers({});
      if (Array.isArray(data.questions) && data.questions.length && data.status === 'issued') {
        setOpen(true);
      } else if (data.status === 'submitted') {
        setResult(data);
      }
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string; data?: { retry_after?: string } } } })?.response;
      if (response?.status === 429) {
        setCooldownUntil(response.data?.data?.retry_after || null);
        toast.error(t('student.checkpoint.cooldown'));
      } else {
        toast.error(response?.data?.message || t('student.checkpoint.error'));
      }
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }, [studentId, seriesId, loadStatus]);

  const submit = useCallback(async () => {
    if (!exam) return;
    setBusy(true);
    try {
      const res = await apiClient.post(ENDPOINTS.CHECKPOINTS.SUBMIT(exam.id), { answers });
      const data = res.data?.data as CheckpointExam;
      setResult(data);
      setExam(data);
      setOpen(false);
      if (data.status === 'approved') {
        toast.success(t('student.checkpoint.approvedToast'));
        onUnlocked?.();
      } else if (data.status === 'submitted') {
        toast.success(t('student.checkpoint.sentToast'));
      } else {
        toast.error(t('student.checkpoint.declinedToast'));
      }
      await loadStatus();
    } catch {
      toast.error(t('student.checkpoint.error'));
    } finally {
      setBusy(false);
    }
  }, [exam, answers, loadStatus, onUnlocked]);

  if (!studentId || !seriesId) return null;

  // Locked group with an open attempt → the questions.
  if (open && exam?.questions?.length) {
    const answered = Object.keys(answers).length;
    return (
      <div className="col-span-full rounded-2xl border-2 border-violet-200 bg-violet-50/70 p-4">
        <p className="text-sm font-extrabold text-violet-900">
          {t('student.checkpoint.title')}{seriesName ? ` — ${seriesName}` : ''}
        </p>
        <p className="mt-1 text-xs text-violet-800">{t('student.checkpoint.blurb')}</p>

        <ol className="mt-3 space-y-3">
          {exam.questions.map((question, index) => (
            <li key={question.id}>
              <p className="text-sm font-semibold text-gray-800">
                {index + 1}. {question.question}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {question.options.map((option) => {
                  const picked = answers[question.id] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                      className={`flex min-w-[88px] items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                        picked
                          ? 'border-violet-500 bg-violet-600 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
                      }`}
                    >
                      {option.emoji && <span aria-hidden>{option.emoji}</span>}
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || answered < exam.questions.length}
            onClick={submit}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? t('student.checkpoint.submitting') : t('student.checkpoint.submit')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-600"
          >
            {t('student.checkpoint.later')}
          </button>
          <span className="text-xs text-gray-500">
            {answered}/{exam.questions.length}
          </span>
        </div>
      </div>
    );
  }

  // Submitted → waiting on a grown-up.
  if ((result || exam)?.status === 'submitted') {
    const current = result || exam;
    return (
      <div className="col-span-full rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-bold text-amber-900">{t('student.checkpoint.pendingTitle')}</p>
        <p className="mt-1 text-xs text-amber-800">
          {t('student.checkpoint.pendingBlurb', {
            score: String(current?.score_pct ?? 0),
            threshold: String(current?.threshold_pct ?? 80),
          })}
        </p>
      </div>
    );
  }

  // Tested out (by a teacher, or by the platform in a self-paced school).
  if ((result || exam)?.status === 'approved') {
    const current = result || exam;
    return (
      <div className="col-span-full rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-sm font-bold text-emerald-900">{t('student.checkpoint.approvedTitle')}</p>
        <p className="mt-1 text-xs text-emerald-800">
          {current?.self_approved
            ? t('student.checkpoint.approvedSelfBlurb', { score: String(current?.score_pct ?? 0) })
            : t('student.checkpoint.approvedBlurb', { score: String(current?.score_pct ?? 0) })}
        </p>
      </div>
    );
  }

  // Declined, or still in the cool-down.
  const cooldown = (result || exam)?.retry_after || cooldownUntil;
  if (cooldown && new Date(cooldown).getTime() > Date.now()) {
    return (
      <div className="col-span-full rounded-2xl border border-orange-200 bg-orange-50 p-3">
        <p className="text-sm font-bold text-orange-900">{t('student.checkpoint.declinedTitle')}</p>
        <p className="mt-1 text-xs text-orange-800">
          {t('student.checkpoint.declinedBlurb', { when: formatWhen(cooldown) })}
        </p>
      </div>
    );
  }

  return (
    <div className="col-span-full">
      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="rounded-xl border-2 border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
      >
        {busy ? t('student.checkpoint.starting') : t('student.checkpoint.start')}
      </button>
      <p className="mt-1 text-xs text-gray-500">{t('student.checkpoint.startHint')}</p>
    </div>
  );
}
