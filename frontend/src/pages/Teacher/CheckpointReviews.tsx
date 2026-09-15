/**
 * CheckpointReviews — the staff side of a jump-ahead ("test out") request.
 *
 * A learner who is blocked by the prerequisite chain may sit one assessment
 * covering every unfinished level of a subject up to their band ceiling. A pass
 * is only a recommendation: it becomes an unlock when a teacher or admin
 * confirms it here. The page shows exactly what was asked and what was got, so
 * the decision is evidence-based rather than a rubber stamp:
 *
 *   - the chain that would be skipped, unit by unit
 *   - the score against the threshold, and the per-unit breakdown
 *   - a `thin` warning when the assessment asked fewer than the preferred
 *     minimum (it is not a refusal, but it should not be approved blindly)
 *
 * Confirm is refused by the API when the score is below threshold or when a unit
 * was never demonstrated — the server owns the prerequisite rule; this page only
 * presents it. Unlocks are recorded as EXEMPT (tested out, never mastery), with
 * no stars and no XP for content the child did not play.
 */

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import toast from 'react-hot-toast';
import AdminNav from '@/components/AdminNav';
import CheckpointPolicyPanel from '@/components/CheckpointPolicyPanel';
import type { CheckpointQueueItem, CheckpointQueuePayload } from '@/lib/types/checkpoint';

export default function CheckpointReviews() {
  const [items, setItems] = useState<CheckpointQueueItem[]>([]);
  const [threshold, setThreshold] = useState(80);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.CHECKPOINTS.QUEUE);
      const payload = res.data?.data as CheckpointQueuePayload | undefined;
      setItems(payload?.items || []);
      if (payload?.threshold_pct) setThreshold(payload.threshold_pct);
    } catch {
      toast.error(t('checkpoint.loadError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Let this one child skip the queue in future, without loosening the school. */
  const grantAutoJump = useCallback(
    async (item: CheckpointQueueItem) => {
      setBusyId(item.id);
      try {
        await apiClient.put(ENDPOINTS.CHECKPOINTS.POLICY, {
          scope: 'child',
          scope_id: item.child_admission_no,
          auto_approve: true,
          note: t('checkpoint.policy.grantNote'),
        });
        toast.success(t('checkpoint.policy.granted'));
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        toast.error(message || t('checkpoint.policy.error'));
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  const decide = useCallback(
    async (item: CheckpointQueueItem, action: 'approve' | 'reject') => {
      setBusyId(item.id);
      try {
        const url = action === 'approve' ? ENDPOINTS.CHECKPOINTS.APPROVE(item.id) : ENDPOINTS.CHECKPOINTS.REJECT(item.id);
        const res = await apiClient.post(url, { note: notes[item.id] || undefined });
        if (res.data?.success) {
          toast.success(action === 'approve' ? t('checkpoint.approved') : t('checkpoint.declined'));
          setItems((prev) => prev.filter((row) => row.id !== item.id));
        } else {
          toast.error(res.data?.message || t('checkpoint.error'));
        }
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        toast.error(message || t('checkpoint.error'));
        // A refused confirm means the record is no longer eligible — re-read it.
        load();
      } finally {
        setBusyId(null);
      }
    },
    [notes, load]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-extrabold text-gray-900">{t('checkpoint.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('checkpoint.subtitle', { threshold: String(threshold) })}</p>

        <div className="mt-4">
          <CheckpointPolicyPanel />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            {t('checkpoint.refresh')}
          </button>
        </div>

        {loading && <p className="mt-6 text-sm text-gray-500">{t('checkpoint.loading')}</p>}

        {!loading && !items.length && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
            {t('checkpoint.empty')}
          </div>
        )}

        <ul className="mt-6 space-y-4">
          {items.map((item) => {
            const units = item.units || [];
            return (
              <li key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold text-gray-900">{item.child_admission_no}</span>
                  <span className="text-xs text-gray-500">{item.series_id}</span>
                  {item.band && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{item.band}</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      item.eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {t('checkpoint.score', { score: String(item.score_pct ?? 0), threshold: String(threshold) })}
                  </span>
                  {item.eligible ? (
                    <span className="text-xs font-semibold text-emerald-700">{t('checkpoint.eligible')}</span>
                  ) : (
                    <span className="text-xs font-semibold text-red-700">{t('checkpoint.notEligible')}</span>
                  )}
                  {item.thin && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {t('checkpoint.thin', { asked: String(item.asked_count ?? 0) })}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('checkpoint.units')}</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {units.map((unit) => (
                    <li key={unit.unit_id} className="rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-700">
                      {unit.unit_number != null ? `U${unit.unit_number} · ` : ''}
                      {unit.title || unit.unit_id}
                      {item.per_unit && item.per_unit[unit.unit_id]
                        ? ` — ${item.per_unit[unit.unit_id].correct}/${item.per_unit[unit.unit_id].asked}`
                        : ''}
                    </li>
                  ))}
                </ul>

                <textarea
                  value={notes[item.id] || ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder={t('checkpoint.notePlaceholder')}
                  rows={2}
                  className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id || !item.eligible}
                    onClick={() => decide(item, 'approve')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {t('checkpoint.approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => decide(item, 'reject')}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                  >
                    {t('checkpoint.decline')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => grantAutoJump(item)}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 disabled:opacity-50"
                  >
                    {t('checkpoint.policy.grantThisChild')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">{t('checkpoint.exemptNote')}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
