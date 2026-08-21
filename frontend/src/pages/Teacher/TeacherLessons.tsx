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
import AdminNav from '@/components/AdminNav';

/* ── Types ────────────────────────────────────────────── */

interface Lesson {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  content_state: string;
  created_at: string;
  is_global: number;
  has_games?: boolean;
}

interface GenerationJob {
  id: string;
  lesson_id: string;
  status: string;
  progress: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface Approval {
  id: string;
  content_type: string;
  content_id: string;
  status: string;
  school_id: string;
  branch_id: string;
  created_at: string;
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
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon}
      {state.replace(/_/g, ' ')}
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

  const loadLessons = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.LESSONS.LIST);
      setLessons(res.data?.data || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load lessons');
    }
  }, []);

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
      toast.error('Title and subject are required');
      return;
    }
    setCreating(true);
    try {
      await apiClient.post(ENDPOINTS.LESSONS.CREATE, form);
      toast.success('Lesson created! AI generation started.');
      setShowCreate(false);
      setForm({ title: '', subject: '', age_level: 'KG1', lesson_text: '', lesson_type: 'game' });
      await loadLessons();
      await loadJobs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create lesson');
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
        reason: decision === 'reject' ? 'Content needs revision' : undefined,
      });
      toast.success(decision === 'approve' ? '✅ Lesson published!' : '❌ Rejected');
      await loadLessons();
      await loadJobs();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || `Failed to ${decision}`);
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
            <p className="text-xs text-gray-500">Total Lessons</p>
            <p className="text-2xl font-bold text-[#0F4D92]">{lessons.length}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Pending Review</p>
            <p className="text-2xl font-bold text-amber-600">{pendingApprovals}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Generating</p>
            <p className="text-2xl font-bold text-purple-600">{activeJobs}</p>
          </div>
        </div>

        {/* Action bar */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-600">Lessons</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { loadLessons(); loadJobs(); }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
            <Link
              to="/teacher/create-game"
              className="inline-flex items-center gap-1 rounded-lg bg-[#0F4D92] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0b3d76]"
            >
              <Wand2 className="h-3 w-3" /> Create Game
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#0F4D92] bg-white px-3 py-1.5 text-xs font-medium text-[#0F4D92] hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" /> AI Generate
            </button>
            {pendingApprovals > 0 && (
              <Link
                to="/teacher/approvals"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              >
                <Eye className="h-3 w-3" /> Review ({pendingApprovals})
              </Link>
            )}
          </div>
        </div>

        {/* Create lesson form */}
        {showCreate && (
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">Create New Lesson</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Counting 1-10"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Subject *</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder="e.g. Mathematics"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Age Level</label>
                  <select
                    value={form.age_level}
                    onChange={(e) => setForm((p) => ({ ...p, age_level: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                  >
                    <option value="Creche">Creche (1-2 years)</option>
                    <option value="Nursery">Nursery (3-4 years)</option>
                    <option value="KG1">KG1 (4-5 years)</option>
                    <option value="KG2">KG2 (5-6 years)</option>
                    <option value="Primary">Primary (6-10 years)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Lesson Content (optional)</label>
                  <input
                    type="text"
                    value={form.lesson_text}
                    onChange={(e) => setForm((p) => ({ ...p, lesson_text: e.target.value }))}
                    placeholder="Additional content details..."
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
                  {creating ? 'Creating...' : 'Create & Generate Games'}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-gray-400">
              ✨ AI will automatically generate matching, tap, drag-sort, and quiz games for this lesson.
              Review the generated content before publishing to students.
            </p>
          </div>
        )}

        {/* Active generation jobs */}
        {activeJobs > 0 && (
          <div className="mb-4 rounded-xl bg-purple-50 border border-purple-200 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating games for {activeJobs} lesson{activeJobs > 1 ? 's' : ''}... (auto-refreshes every 5s)
            </div>
          </div>
        )}

        {/* Lessons list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#0F4D92]" />
          </div>
        ) : lessons.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No lessons yet. Create your first lesson to get started!</p>
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
                      <span className="text-gray-400">{new Date(lesson.created_at).toLocaleDateString()}</span>
                    </div>
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
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => handleInlineApprove(lesson.id, 'reject')}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 sm:py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors active:scale-95"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {lesson.content_state === 'published' && lesson.has_games && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-green-100 px-3 py-2 sm:py-1.5 text-xs font-medium text-green-700">
                        <Gamepad2 className="h-3.5 w-3.5" /> Live
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
