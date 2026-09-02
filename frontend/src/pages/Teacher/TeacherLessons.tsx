import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Plus,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  Gamepad2,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  Wand2,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t, tN } from '@/lib/i18n';
import AdminNav from '@/components/AdminNav';

/* ── Types ────────────────────────────────────────────── */

interface Lesson {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  content_state: string;
  created_at?: string;
  createdAt?: string;
  is_global: number;
  has_games?: boolean;
  nerdc_code?: string;
  nerdc_strand?: string;
  nerdc_sub_strand?: string;
}

interface GenerationJob {
  id: string;
  lesson_id: string;
  status: string;
  progress: number;
  error_message?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

interface Approval {
  id: string;
  content_type: string;
  content_id: string;
  status: string;
  school_id: string;
  branch_id: string;
  created_at?: string;
  createdAt?: string;
}

/* ── Safe date formatting (backend may send created_at or createdAt) ── */

/** Normalize MySQL dateStrings format ('2026-08-23 09:10:00') — Safari/Firefox
 *  can't parse the space-separated form, so swap it to ISO 'T'. */
function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') : value;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(normalizeDate(value));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function formatDateTime(value?: string | null): string {
  if (!value) return '';
  const d = new Date(normalizeDate(value));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

/* ── Lesson state badge ──────────────────────────────── */

function StateBadge({ state }: { state: string }) {
  const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    generated: { bg: 'bg-purple-50', text: 'text-purple-700', icon: <Sparkles className="h-3 w-3" /> },
    pending_human_review: { bg: 'bg-amber-50', text: 'text-amber-700', icon: <Clock className="h-3 w-3" /> },
    published: { bg: 'bg-green-50', text: 'text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected: { bg: 'bg-red-50', text: 'text-red-700', icon: <XCircle className="h-3 w-3" /> },
  };
  const s = styles[state] || { bg: 'bg-gray-50', text: 'text-gray-600', icon: null };
  const STATE_LABELS: Record<string, string> = {
    generated: t('teacher.state.generated'),
    pending_human_review: t('teacher.state.pending_human_review'),
    published: t('teacher.state.published'),
    rejected: t('teacher.state.rejected'),
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon}
      {STATE_LABELS[state] || state.replace(/_/g, ' ')}
    </span>
  );
}

/* ── Age level colors ──────────────────────────────── */

const AGE_COLORS: Record<string, string> = {
  Creche: 'bg-pink-100 text-pink-700',
  Nursery: 'bg-purple-100 text-purple-700',
  KG1: 'bg-blue-100 text-blue-700',
  KG2: 'bg-indigo-100 text-indigo-700',
  Primary: 'bg-green-100 text-green-700',
};

/* ── Main Component ──────────────────────────────────── */

const NERDC_STRANDS = ['Literacy', 'Numeracy', 'Science', 'Social Studies', 'Creative Arts', 'Physical Development', 'Language Development', 'Civic Education'];

export default function TeacherLessons() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    subject: '',
    age_level: 'KG1',
    lesson_text: '',
    lesson_type: 'game',
  });

  // NERDC curriculum filters
  const [filterStrand, setFilterStrand] = useState('');
  const [filterSubStrand, setFilterSubStrand] = useState('');
  const [filterCode, setFilterCode] = useState('');

  const loadLessons = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterStrand) params.nerdc_strand = filterStrand;
      if (filterSubStrand) params.nerdc_sub_strand = filterSubStrand;
      if (filterCode) params.nerdc_code = filterCode;
      const res = await apiClient.get(ENDPOINTS.LESSONS.LIST, { params });
      setLessons(res.data?.data || []);
    } catch (err: any) {
      toast.error(err?.message || t('teacher.lessons.loadFailed'));
    }
  }, [filterStrand, filterSubStrand, filterCode]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.GENERATION_JOBS.LIST);
      setJobs(res.data?.data || []);
    } catch {
      // Jobs endpoint may not exist yet
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLessons(), loadJobs()]).finally(() => setLoading(false));
  }, [loadLessons, loadJobs]);

  // Auto-refresh pending jobs
  useEffect(() => {
    const pendingJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'processing');
    if (pendingJobs.length === 0) return;
    const interval = setInterval(() => {
      loadJobs();
      loadLessons();
    }, 5000);
    return () => clearInterval(interval);
  }, [jobs, loadJobs, loadLessons]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.subject) {
      toast.error(t('teacher.lessons.titleSubjectRequired'));
      return;
    }
    setCreating(true);
    try {
      await apiClient.post(ENDPOINTS.LESSONS.CREATE, form);
      toast.success(t('teacher.lessons.createdStarted'));
      setShowCreate(false);
      setForm({ title: '', subject: '', age_level: 'KG1', lesson_text: '', lesson_type: 'game' });
      await loadLessons();
      await loadJobs();
    } catch (err: any) {
      toast.error(err?.message || t('teacher.lessons.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const pendingApprovals = lessons.filter((l) => l.content_state === 'pending_human_review').length;
  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;

  // Inline approve/reject — approve ALL pending approvals for a lesson at once
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const handleInlineApprove = async (lessonId: string, decision: 'approve' | 'reject') => {
    setProcessingApproval(lessonId);
    try {
      await apiClient.post(ENDPOINTS.LESSONS.APPROVE(lessonId), {
        decision,
        reason: decision === 'reject' ? t('teacher.lessons.rejectReason') : undefined,
      });
      toast.success(decision === 'approve' ? t('teacher.lessons.approved') : t('teacher.lessons.rejected'));
      await loadLessons();
      await loadJobs();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || t('teacher.lessons.actionFailed', { decision }));
    } finally {
      setProcessingApproval(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      <AdminNav pendingCount={pendingApprovals} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Status cards */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t('teacher.lessons.total')}</p>
            <p className="text-2xl font-bold text-[#0F4D92]">{lessons.length}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t('teacher.lessons.pendingReview')}</p>
            <p className="text-2xl font-bold text-amber-600">{pendingApprovals}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{t('teacher.lessons.generating')}</p>
            <p className="text-2xl font-bold text-purple-600">{activeJobs}</p>
          </div>
        </div>

        {/* Action bar */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600">{t('teacher.lessons.title')}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { loadLessons(); loadJobs(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className="h-3 w-3" /> {t('common.refresh')}
            </button>
            <Link
              to="/teacher/nerdc-report"
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {t('teacher.lessons.nerdcReport')}
            </Link>
            <Link
              to="/teacher/create-game"
              className="inline-flex items-center gap-1 rounded-lg bg-[#0F4D92] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0b3d76]"
            >
              <Wand2 className="h-3 w-3" /> {t('teacher.lessons.createGame')}
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#0F4D92] bg-white px-3 py-1.5 text-xs font-medium text-[#0F4D92] hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" /> {t('teacher.lessons.aiGenerate')}
            </button>
            {pendingApprovals > 0 && (
              <Link
                to="/teacher/approvals"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              >
                <Eye className="h-3 w-3" /> {t('teacher.lessons.reviewCount', { count: pendingApprovals })}
              </Link>
            )}
          </div>
        </div>

        {/* Create lesson form */}
        {showCreate && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">{t('teacher.lessons.createNew')}</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('teacher.lessons.titleField')}</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder={t('teacher.lessons.titlePlaceholder')}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('teacher.lessons.subjectField')}</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder={t('teacher.lessons.subjectPlaceholder')}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('teacher.lessons.ageLevel')}</label>
                  <select
                    value={form.age_level}
                    onChange={(e) => setForm((p) => ({ ...p, age_level: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                  >
                    <option value="Creche">{t('teacher.lessons.age.Creche')}</option>
                    <option value="Nursery">{t('teacher.lessons.age.Nursery')}</option>
                    <option value="KG1">{t('teacher.lessons.age.KG1')}</option>
                    <option value="KG2">{t('teacher.lessons.age.KG2')}</option>
                    <option value="Primary">{t('teacher.lessons.age.Primary')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('teacher.lessons.contentOptional')}</label>
                  <input
                    type="text"
                    value={form.lesson_text}
                    onChange={(e) => setForm((p) => ({ ...p, lesson_text: e.target.value }))}
                    placeholder={t('teacher.lessons.contentPlaceholder')}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0b3d76] disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {creating ? t('teacher.lessons.creating') : t('teacher.lessons.createAndGenerate')}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-gray-400">{t('teacher.lessons.aiHelp')}</p>
          </div>
        )}

        {/* Active generation jobs */}
        {activeJobs > 0 && (
          <div className="mb-4 rounded-xl bg-purple-50 border border-purple-200 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tN('teacher.lessons.generatingFor', activeJobs)}
            </div>
          </div>
        )}

        {/* NERDC curriculum filter bar */}
        <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">{t('teacher.lessons.filterNerdc')}</span>
            <select
              value={filterStrand}
              onChange={(e) => setFilterStrand(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
            >
              <option value="">{t('teacher.lessons.allStrands')}</option>
              {NERDC_STRANDS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input
              type="text"
              value={filterSubStrand}
              onChange={(e) => setFilterSubStrand(e.target.value)}
              placeholder={t('teacher.lessons.subStrandPlaceholder')}
              className="w-36 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
            />
            <input
              type="text"
              value={filterCode}
              onChange={(e) => setFilterCode(e.target.value)}
              placeholder={t('teacher.lessons.codePlaceholder')}
              className="w-36 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
            />
            {(filterStrand || filterSubStrand || filterCode) && (
              <button
                onClick={() => { setFilterStrand(''); setFilterSubStrand(''); setFilterCode(''); }}
                className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {t('teacher.lessons.clearFilters')}
              </button>
            )}
          </div>
        </div>

        {/* Lessons list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#0F4D92]" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">{t('teacher.lessons.empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-semibold text-gray-800 text-sm truncate">{lesson.title}</h3>
                      <StateBadge state={lesson.content_state} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{lesson.subject}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AGE_COLORS[lesson.age_level] || 'bg-gray-100 text-gray-600'}`}>
                        {lesson.age_level}
                      </span>
                      <span className="text-gray-400">{formatDate(lesson.created_at || lesson.createdAt)}</span>
                    </div>
                    {(lesson.nerdc_code || lesson.nerdc_strand) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {lesson.nerdc_code && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 border border-indigo-100">
                            📘 {lesson.nerdc_code}
                          </span>
                        )}
                        {lesson.nerdc_strand && (
                          <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600 border border-purple-100">
                            {lesson.nerdc_strand}{lesson.nerdc_sub_strand ? ` · ${lesson.nerdc_sub_strand}` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lesson.content_state === 'pending_human_review' && (
                      <>
                        {processingApproval === lesson.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleInlineApprove(lesson.id, 'approve')}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-500 px-3 py-2 sm:py-1.5 text-xs font-medium text-white hover:bg-green-600 transition-colors active:scale-95"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t('teacher.lessons.approve')}
                            </button>
                            <button
                              onClick={() => handleInlineApprove(lesson.id, 'reject')}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 sm:py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors active:scale-95"
                            >
                              <XCircle className="h-3.5 w-3.5" /> {t('teacher.lessons.reject')}
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {lesson.content_state === 'published' && lesson.has_games && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-3 py-2 sm:py-1.5 text-xs font-medium text-green-700">
                        <Gamepad2 className="h-3.5 w-3.5" /> {t('teacher.lessons.live')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
