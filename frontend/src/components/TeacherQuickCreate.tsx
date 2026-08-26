import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Send, Eye, Edit3, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { t, tN } from '@/lib/i18n';
import apiClient from '@/lib/api/client';

interface Quiz {
  id: string;
  title: string;
  subject: string;
  class_code: string;
  status: 'draft' | 'published';
  question_count: number;
  actual_questions: number;
  created_at: string;
  published_at: string | null;
}

interface Question {
  id?: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
  image_url?: string;
}

const EMPTY_Q: Question = { question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A' };

export default function TeacherQuickCreate() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', subject: '', class_code: '' });
  const [editingQuiz, setEditingQuiz] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([{ ...EMPTY_Q }]);
  const [expandedQ, setExpandedQ] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/kids/teacher/quizzes');
      setQuizzes(res.data?.data || []);
    } catch {
      toast.error(t('quickCreate.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createQuiz = async () => {
    if (!form.title.trim()) return toast.error(t('quickCreate.titleRequired'));
    if (!form.class_code.trim()) return toast.error(t('quickCreate.codeRequired'));
    setCreating(true);
    try {
      const res = await apiClient.post('/kids/teacher/quizzes', {
        title: form.title.trim(),
        subject: form.subject.trim() || undefined,
        class_code: form.class_code.trim(),
      });
      toast.success(t('quickCreate.created'));
      setEditingQuiz(res.data?.data?.id || null);
      setQuestions([{ ...EMPTY_Q }]);
      setForm({ title: '', subject: '', class_code: form.class_code });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('quickCreate.failed');
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const saveQuestions = async () => {
    if (!editingQuiz) return;
    const valid = questions.filter(q => q.question_text.trim() && q.option_a.trim() && q.option_b.trim() && q.option_c.trim() && q.option_d.trim());
    if (valid.length === 0) return toast.error(t('quickCreate.noQuestions'));
    setSaving(true);
    try {
      await apiClient.post(`/kids/teacher/quizzes/${editingQuiz}/questions`, { questions: valid });
      toast.success(tN('quickCreate.saved', valid.length));
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('quickCreate.failed');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const publish = async (id: string) => {
    try {
      await apiClient.post(`/kids/teacher/quizzes/${id}/publish`);
      toast.success(t('quickCreate.published'));
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('quickCreate.failed');
      toast.error(msg);
    }
  };

  const unpublish = async (id: string) => {
    try {
      await apiClient.post(`/kids/teacher/quizzes/${id}/unpublish`);
      toast.success(t('quickCreate.unpublished'));
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('quickCreate.failed');
      toast.error(msg);
    }
  };

  const deleteQuiz = async (id: string) => {
    if (!confirm(t('quickCreate.confirmDelete'))) return;
    try {
      await apiClient.delete(`/kids/teacher/quizzes/${id}`);
      toast.success(t('quickCreate.deleted'));
      if (editingQuiz === id) setEditingQuiz(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('quickCreate.failed');
      toast.error(msg);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { ...EMPTY_Q }]);
    setExpandedQ(questions.length);
  };

  const updateQuestion = (idx: number, field: keyof Question, value: string) => {
    const updated = [...questions];
    // @ts-ignore
    updated[idx][field] = value;
    setQuestions(updated);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
    if (expandedQ >= questions.length - 1) setExpandedQ(Math.max(0, questions.length - 2));
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-gray-800">
        <Edit3 className="h-6 w-6 text-blue-500" /> {t('quickCreate.title')}
      </h1>
      <p className="mb-5 text-sm text-gray-500">{t('quickCreate.subtitle')}</p>

      {/* Create Form */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-extrabold text-gray-700">{t('quickCreate.newQuiz')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-bold text-gray-600">
            {t('quickCreate.titleField')}
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('quickCreate.titlePlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-gray-600">
            {t('quickCreate.subject')}
            <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder={t('quickCreate.subjectPlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-bold text-gray-600">
            {t('quickCreate.classCode')}
            <input value={form.class_code} onChange={e => setForm({ ...form, class_code: e.target.value })} placeholder={t('teacher.live.codePlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <button onClick={createQuiz} disabled={creating} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-extrabold text-white shadow hover:bg-blue-600 disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('quickCreate.create')}
        </button>
      </div>

      {/* Question Editor (when editing) */}
      {editingQuiz && (
        <div className="mb-6 rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-blue-700">{t('quickCreate.addQuestions')}</h3>
            <button onClick={() => setEditingQuiz(null)} className="text-xs font-semibold text-gray-400 hover:text-gray-600">{t('quickCreate.close')}</button>
          </div>

          {questions.map((q, idx) => (
            <div key={idx} className="mb-3 rounded-xl bg-white p-3 shadow-sm">
              <button onClick={() => setExpandedQ(expandedQ === idx ? -1 : idx)} className="flex w-full items-center justify-between text-left">
                <span className="text-xs font-bold text-gray-600">Q{idx + 1}. {q.question_text ? q.question_text.slice(0, 40) + (q.question_text.length > 40 ? '...' : '') : t('quickCreate.qEmpty')}</span>
                {expandedQ === idx ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </button>

              {expandedQ === idx && (
                <div className="mt-3 space-y-2">
                  <textarea value={q.question_text} onChange={e => updateQuestion(idx, 'question_text', e.target.value)} placeholder={t('quickCreate.questionPlaceholder')} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} />

                  {(['A', 'B', 'C', 'D'] as const).map(opt => (
                    <div key={opt} className="flex items-center gap-2">
                      <button onClick={() => updateQuestion(idx, 'correct_option', opt)} className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${q.correct_option === opt ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {opt}
                      </button>
                      <input value={q[`option_${opt.toLowerCase()}` as keyof Question] as string} onChange={e => updateQuestion(idx, `option_${opt.toLowerCase()}` as keyof Question, e.target.value)} placeholder={t('quickCreate.option', { opt })} className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
                    </div>
                  ))}

                  <button onClick={() => removeQuestion(idx)} disabled={questions.length <= 1} className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-600 disabled:opacity-30">
                    <Trash2 className="h-3 w-3" /> {t('quickCreate.remove')}
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="mt-3 flex gap-2">
            <button onClick={addQuestion} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-bold text-blue-600 shadow-sm hover:bg-blue-50">
              <Plus className="h-3.5 w-3.5" /> {t('quickCreate.addQuestion')}
            </button>
            <button onClick={saveQuestions} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-600 disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />} {t('quickCreate.saveQuestions')}
            </button>
          </div>
        </div>
      )}

      {/* Quiz List */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-400">{t('quickCreate.yourQuizzes')}</h2>
        <button onClick={load} className="text-xs font-semibold text-blue-500 hover:underline">{t('common.refresh')}</button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
      ) : quizzes.length === 0 ? (
        <p className="mt-8 text-center text-sm text-gray-400">{t('quickCreate.empty')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {quizzes.map(q => (
            <div key={q.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${q.status === 'published' ? 'border-green-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className="mr-2 text-sm">📝</span>
                  <span className="font-extrabold text-gray-800">{q.title}</span>
                  {q.subject && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{q.subject}</span>}
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{q.class_code}</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${q.status === 'published' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                  {q.status === 'published' ? t('quickCreate.publishedBadge') : t('quickCreate.draftBadge')}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                <span>📝 {tN('quickCreate.questionCount', q.actual_questions || q.question_count)}</span>
                <span>{t('quickCreate.createdAt', { date: new Date(q.created_at).toLocaleDateString() })}</span>
                {q.published_at && <span>{t('quickCreate.publishedAt', { date: new Date(q.published_at).toLocaleDateString() })}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {q.status === 'draft' ? (
                  <>
                    <button onClick={() => { setEditingQuiz(q.id); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100">
                      <Edit3 className="h-3 w-3" /> {t('quickCreate.edit')}
                    </button>
                    <button onClick={() => publish(q.id)} className="inline-flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-600">
                      <Send className="h-3 w-3" /> {t('quickCreate.publish')}
                    </button>
                    <button onClick={() => deleteQuiz(q.id)} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-100">
                      <Trash2 className="h-3 w-3" /> {t('common.delete')}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => unpublish(q.id)} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-100">
                      {t('quickCreate.unpublish')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
