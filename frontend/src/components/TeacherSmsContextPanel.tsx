import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { SmsLessonContext, SmsLessonContextQuery } from '@/lib/types/ecceBridge';

interface Props {
  value: SmsLessonContextQuery;
  onChange: (value: SmsLessonContextQuery) => void;
  onResolved?: (context: SmsLessonContext) => void;
}

export default function TeacherSmsContextPanel({ value, onChange, onResolved }: Props) {
  const [context, setContext] = useState<SmsLessonContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState('');

  const resolve = async () => {
    if (!value.class_code.trim()) {
      setError('Enter a class code to load the school context.');
      return;
    }
    setLoading(true);
    setRequested(true);
    setError('');
    try {
      const response = await apiClient.get(ENDPOINTS.SMS_CONTEXT.LESSON_CONTEXT, { params: value });
      const next = response.data?.data as SmsLessonContext;
      setContext(next);
      onResolved?.(next);
    } catch (err: any) {
      const message = err?.message || 'The school context is unavailable. Try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setContext(null);
    setError('');
    setRequested(false);
  }, [value.class_code]);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">School context</p>
          <p className="mt-1 text-xs text-blue-700">Class, subject, term and week are checked against EliteSMS.</p>
        </div>
        {context && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Context loaded" />}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={value.class_code}
          onChange={(event) => onChange({ ...value, class_code: event.target.value })}
          placeholder="Class code, e.g. NUR2-A"
          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
        />
        <input
          value={value.subject_code || ''}
          onChange={(event) => onChange({ ...value, subject_code: event.target.value || undefined })}
          placeholder="Subject code, e.g. SBJ0001"
          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
        />
        <input
          value={value.academic_year || ''}
          onChange={(event) => onChange({ ...value, academic_year: event.target.value || undefined })}
          placeholder="Academic year, optional"
          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
        />
        <select
          value={value.term || ''}
          onChange={(event) => onChange({ ...value, term: event.target.value || undefined })}
          className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Active term</option>
          <option value="First Term">First Term</option>
          <option value="Second Term">Second Term</option>
          <option value="Third Term">Third Term</option>
        </select>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={10}
          value={value.week_number || ''}
          onChange={(event) => onChange({ ...value, week_number: event.target.value ? Number(event.target.value) : undefined })}
          placeholder="Week"
          className="w-24 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={resolve}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F4D92] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {loading ? 'Checking…' : 'Check school context'}
        </button>
      </div>
      {context && (
        <p className="mt-3 text-xs text-green-700">
          Verified: {context.class_label || context.class_code} · {context.term_name || 'term'} · Week {context.week_number || '—'} · {context.subject_code || 'subject'} ({context.context_source}).
        </p>
      )}
      {requested && error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>
      )}
    </div>
  );
}
