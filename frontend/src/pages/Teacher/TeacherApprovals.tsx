import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Gamepad2,
  BookOpen,
  Eye,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';
import AdminNav from '@/components/AdminNav';

/* ── Types ────────────────────────────────────────────── */

interface Approval {
  id: string;
  content_type: string;
  content_id: string;
  status: string;
  school_id: string;
  branch_id: string;
  lesson_id?: string;
  rejection_reason?: string;
  created_at?: string;
  createdAt?: string;
}

/** Safe date formatting — handles created_at/createdAt + MySQL dateStrings form.
 *  Returns '' instead of "Invalid Date" for missing/unparseable values. */
function formatApprovalDate(value?: string | null): string {
  if (!value) return '';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/* ── Content type display ────────────────────────────── */

function ContentTypeBadge({ type }: { type: string }) {
  const labels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    game_config: { label: t('teacher.approvals.type.game_config'), color: 'bg-blue-100 text-blue-700', icon: <Gamepad2 className="h-3 w-3" /> },
    scene_script: { label: t('teacher.approvals.type.scene_script'), color: 'bg-purple-100 text-purple-700', icon: <BookOpen className="h-3 w-3" /> },
    lesson: { label: t('teacher.approvals.type.lesson'), color: 'bg-green-100 text-green-700', icon: <BookOpen className="h-3 w-3" /> },
  };
  const info = labels[type] || { label: type, color: 'bg-gray-100 text-gray-600', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
      {info.icon}
      {info.label}
    </span>
  );
}

/* ── Main Component ──────────────────────────────────── */

export default function TeacherApprovals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.APPROVALS.LIST);
      setApprovals(res.data?.data || []);
    } catch (err: any) {
      toast.error(err?.message || t('teacher.approvals.loadFailed'));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadApprovals().finally(() => setLoading(false));
  }, [loadApprovals]);

  const handleDecide = async (id: string, decision: 'approve' | 'reject') => {
    setProcessing(id);
    try {
      await apiClient.post(ENDPOINTS.APPROVALS.DECIDE(id), {
        decision,
        reason: decision === 'reject' ? t('teacher.approvals.rejectReason') : undefined,
      });
      toast.success(decision === 'approve' ? t('teacher.approvals.approved') : t('teacher.approvals.rejected'));
      await loadApprovals();
    } catch (err: any) {
      toast.error(err?.message || t('teacher.lessons.actionFailed', { decision }));
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      <AdminNav pendingCount={approvals.length} />

      <main className="mx-auto max-w-5xl px-4 py-6">

        {/* Info */}
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">{t('teacher.approvals.reviewQueue')}</p>
              <p className="text-xs text-amber-600">{t('teacher.approvals.info')}</p>
            </div>
          </div>
        </div>

        {/* Approvals list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#0F4D92]" />
          </div>
        ) : approvals.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-300" />
            <p className="text-gray-500">{t('teacher.approvals.empty')}</p>
            <Link
              to="/teacher/lessons"
              className="mt-4 inline-flex items-center gap-1 text-sm text-[#0F4D92] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> {t('teacher.approvals.backToLessons')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <ContentTypeBadge type={approval.content_type} />
                      <span className="text-xs text-gray-400">
                        {formatApprovalDate(approval.created_at || approval.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {approval.content_type === 'game_config'
                        ? t('teacher.approvals.desc.game_config')
                        : approval.content_type === 'scene_script'
                        ? t('teacher.approvals.desc.scene_script')
                        : t('teacher.approvals.desc.other')}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {t('teacher.approvals.id', { id: approval.content_id?.slice(0, 8) || '' })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {processing === approval.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    ) : (
                      <>
                        {(() => {
                          // Resolve which lesson to play-test. game_config → content_id is the
                          // config id (enriched lesson_id); scene_script/lesson → content_id is the lesson id.
                          const previewLessonId = approval.content_type === 'game_config'
                            ? approval.lesson_id
                            : approval.content_id;
                          return previewLessonId ? (
                            <Link
                              to={`/teacher/preview/${previewLessonId}?preview=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                              {t('teacher.lessons.preview')}
                            </Link>
                          ) : null;
                        })()}
                        <button
                          onClick={() => handleDecide(approval.id, 'approve')}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {t('teacher.lessons.approve')}
                        </button>
                        <button
                          onClick={() => handleDecide(approval.id, 'reject')}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <XCircle className="h-4 w-4" />
                          {t('teacher.lessons.reject')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Refresh button */}
        {approvals.length > 0 && (
          <div className="mt-6 text-center">
            <button
              onClick={loadApprovals}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" /> {t('common.refresh')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
