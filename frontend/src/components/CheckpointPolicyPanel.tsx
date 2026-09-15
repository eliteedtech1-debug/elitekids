/**
 * CheckpointPolicyPanel — who may confirm a jump-ahead, per scope.
 *
 * The assessment is identical for every learner: same games, same threshold,
 * same rule that every level must be answered correctly at least once. What this
 * panel steers is only WHO confirms a pass:
 *
 *   Require confirmation — a pass waits for a teacher/admin (close supervision)
 *   Allow (auto-unlock)  — a pass unlocks immediately (self-paced, or a learner
 *                          who already works ahead)
 *
 * Resolution is most-specific-wins: child → class → school → platform default,
 * so a school can leave everyone supervised and hand auto-jump to one child, or
 * vice versa. Grants are auditable: every auto-unlock records which policy did
 * it and who set that policy.
 */

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';
import toast from 'react-hot-toast';
import { getSchoolId } from '@/lib/utils/school';
import type { CheckpointPolicyOverride, CheckpointPolicyScope } from '@/lib/types/checkpoint';

type ScopeChoice = 'school' | 'class' | 'child';

export default function CheckpointPolicyPanel() {
  const [rows, setRows] = useState<CheckpointPolicyOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<ScopeChoice>('class');
  const [scopeId, setScopeId] = useState('');
  const [allow, setAllow] = useState(true);
  const [note, setNote] = useState('');
  // The signed-in admin's school, for the whole-school switch.
  const [schoolId] = useState(() => getSchoolId() || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.CHECKPOINTS.POLICY_LIST);
      setRows((res.data?.data as CheckpointPolicyOverride[]) || []);
    } catch {
      toast.error(t('checkpoint.policy.error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (payload: { scope: CheckpointPolicyScope; scope_id: string; auto_approve: boolean; note?: string }) => {
      if (!payload.scope_id) {
        toast.error(t('checkpoint.policy.needId'));
        return;
      }
      setBusy(true);
      try {
        const res = await apiClient.put(ENDPOINTS.CHECKPOINTS.POLICY, payload);
        if (res.data?.success) {
          toast.success(t('checkpoint.policy.saved'));
          setNote('');
          await load();
        } else {
          toast.error(res.data?.message || t('checkpoint.policy.error'));
        }
      } catch (err: unknown) {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        toast.error(message || t('checkpoint.policy.error'));
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const clear = useCallback(
    async (rowScope: CheckpointPolicyScope, rowScopeId: string) => {
      setBusy(true);
      try {
        const res = await apiClient.delete(ENDPOINTS.CHECKPOINTS.POLICY, { params: { scope: rowScope, scope_id: rowScopeId } });
        if (res.data?.success) {
          toast.success(t('checkpoint.policy.cleared'));
          await load();
        }
      } catch {
        toast.error(t('checkpoint.policy.error'));
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const schoolRow = rows.find((row) => row.scope === 'school');
  const others = rows.filter((row) => row.scope !== 'school');

  const scopeLabel = (row: CheckpointPolicyOverride) =>
    row.scope === 'school'
      ? t('checkpoint.policy.scopeSchool')
      : row.scope === 'class'
        ? t('checkpoint.policy.scopeClass')
        : t('checkpoint.policy.scopeChild');

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-extrabold text-gray-900">{t('checkpoint.policy.title')}</h2>
      <p className="mt-1 text-xs text-gray-600">{t('checkpoint.policy.blurb')}</p>

      {/* Whole-school switch */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3">
        <span className="text-xs font-bold text-gray-700">{t('checkpoint.policy.scopeSchool')}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
          schoolRow?.auto_approve ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
        }`}>
          {schoolRow
            ? schoolRow.auto_approve
              ? t('checkpoint.policy.allowShort')
              : t('checkpoint.policy.reviewShort')
            : t('checkpoint.policy.defaultShort')}
        </span>
        <button
          type="button"
          disabled={busy || !schoolId}
          onClick={() => save({ scope: 'school', scope_id: schoolId, auto_approve: !schoolRow?.auto_approve })}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
        >
          {schoolRow?.auto_approve ? t('checkpoint.policy.requireConfirmation') : t('checkpoint.policy.allow')}
        </button>
        {schoolRow && (
          <button
            type="button"
            disabled={busy}
            onClick={() => clear('school', schoolRow.scope_id)}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 underline"
          >
            {t('checkpoint.policy.clear')}
          </button>
        )}
      </div>

      {/* Targeted grant */}
      <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_150px_1fr_auto]">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as ScopeChoice)}
          className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
        >
          <option value="class">{t('checkpoint.policy.scopeClass')}</option>
          <option value="child">{t('checkpoint.policy.scopeChild')}</option>
        </select>
        <input
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          placeholder={t('checkpoint.policy.scopeIdPlaceholder')}
          className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
        />
        <select
          value={allow ? 'allow' : 'review'}
          onChange={(e) => setAllow(e.target.value === 'allow')}
          className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
        >
          <option value="allow">{t('checkpoint.policy.allow')}</option>
          <option value="review">{t('checkpoint.policy.requireConfirmation')}</option>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('checkpoint.policy.notePlaceholder')}
          className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => save({ scope, scope_id: scopeId.trim(), auto_approve: allow, note: note.trim() || undefined })}
          className="rounded-lg bg-[#0F4D92] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {t('checkpoint.policy.save')}
        </button>
      </div>

      {/* What is granted today */}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('checkpoint.policy.existing')}</p>
      {loading ? (
        <p className="mt-1 text-xs text-gray-500">{t('checkpoint.policy.loading')}</p>
      ) : !others.length && !schoolRow ? (
        <p className="mt-1 text-xs text-gray-500">{t('checkpoint.policy.none')}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-2">
          {[...(schoolRow ? [schoolRow] : []), ...others].map((row) => (
            <li
              key={`${row.scope}:${row.scope_id}`}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                row.auto_approve ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'
              }`}
            >
              <span className="font-semibold">{scopeLabel(row)}</span>
              <span>{row.scope_id}</span>
              <span className="font-bold">{row.auto_approve ? t('checkpoint.policy.allowShort') : t('checkpoint.policy.reviewShort')}</span>
              {row.set_by && <span className="text-gray-500">· {row.set_by}</span>}
              <button
                type="button"
                disabled={busy}
                onClick={() => clear(row.scope, row.scope_id)}
                className="underline disabled:opacity-50"
              >
                {t('checkpoint.policy.clear')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
