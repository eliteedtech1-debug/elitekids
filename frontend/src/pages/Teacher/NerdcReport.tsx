/**
 * NERDC Curriculum Mapping Report — Ministry compliance.
 *
 * Shows:
 *   - Summary stats (total, assigned, unassigned)
 *   - Strand → sub-strand breakdown with lesson counts
 *   - Full lesson list grouped by strand
 *   - CSV download button
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Download,
  Loader2,
  BookOpen,
  BarChart3,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import AdminNav from '@/components/AdminNav';

/* ── Types ────────────────────────────────────────────── */

interface LessonRow {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  content_state: string;
  nerdc_code: string | null;
  nerdc_strand: string | null;
  nerdc_sub_strand: string | null;
  created_at: string;
}

interface SubStrandGroup {
  name: string;
  count: number;
  lessons: LessonRow[];
}

interface StrandGroup {
  strand: string;
  total: number;
  subStrands: SubStrandGroup[];
}

interface ReportData {
  summary: StrandGroup[];
  stats: {
    total_lessons: number;
    assigned: number;
    unassigned: number;
    strands: number;
  };
  lessons: LessonRow[];
}

/* ── Stat Card ──────────────────────────────────────── */

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────── */

export default function NerdcReport() {
  const navigate = useNavigate();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStrands, setExpandedStrands] = useState<Set<string>>(new Set());

  const loadReport = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.NERDC.REPORT);
      setData(res.data?.data || null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load NERDC report');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadReport().finally(() => setLoading(false));
  }, [loadReport]);

  const toggleStrand = (strand: string) => {
    setExpandedStrands((prev) => {
      const next = new Set(prev);
      if (next.has(strand)) next.delete(strand);
      else next.add(strand);
      return next;
    });
  };

  const handleDownloadCSV = () => {
    const url = `${apiClient.defaults.baseURL || ''}${ENDPOINTS.NERDC.REPORT_CSV}`;
    const token = localStorage.getItem('auth_token') || '';
    // Open in new tab with auth header via fetch
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'nerdc-curriculum-mapping.csv';
        a.click();
        URL.revokeObjectURL(blobUrl);
        toast.success('CSV downloaded!');
      })
      .catch(() => toast.error('Download failed'));
  };

  const pct = data ? Math.round((data.stats.assigned / data.stats.total_lessons) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      <AdminNav />
      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">📚 NERDC Curriculum Mapping</h1>
            <p className="text-sm text-gray-500">Ministry compliance report — lesson curriculum alignment</p>
          </div>
          <button
            onClick={handleDownloadCSV}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F4D92] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b3d76] disabled:opacity-40 active:scale-95 transition-all"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#0F4D92]" />
          </div>
        ) : !data ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
            <XCircle className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">Failed to load report data.</p>
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total Lessons"
                value={data.stats.total_lessons}
                color="border-blue-200 bg-blue-50 text-blue-700"
                icon={<BookOpen className="h-4 w-4" />}
              />
              <StatCard
                label="NERDC Aligned"
                value={data.stats.assigned}
                color="border-green-200 bg-green-50 text-green-700"
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
              <StatCard
                label="Unassigned"
                value={data.stats.unassigned}
                color="border-amber-200 bg-amber-50 text-amber-700"
                icon={<XCircle className="h-4 w-4" />}
              />
              <StatCard
                label="NERDC Strands"
                value={data.stats.strands}
                color="border-purple-200 bg-purple-50 text-purple-700"
                icon={<BarChart3 className="h-4 w-4" />}
              />
            </div>

            {/* Completion bar */}
            <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Curriculum Alignment</span>
                <span className="text-sm font-bold text-[#0F4D92]">{pct}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {data.stats.assigned} of {data.stats.total_lessons} lessons have NERDC curriculum codes
              </p>
            </div>

            {/* Strand breakdown */}
            <div className="space-y-3">
              {data.summary.length === 0 && (
                <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
                  <BookOpen className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                  <p className="text-gray-500">No NERDC curriculum data yet. Assign codes when creating lessons.</p>
                </div>
              )}

              {data.summary.map((strand) => {
                const isExpanded = expandedStrands.has(strand.strand);
                return (
                  <div key={strand.strand} className="rounded-xl bg-white shadow-sm overflow-hidden">
                    {/* Strand header */}
                    <button
                      onClick={() => toggleStrand(strand.strand)}
                      className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="font-semibold text-gray-800">{strand.strand}</span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {strand.total} lesson{strand.total !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>

                    {/* Sub-strands (collapsible) */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-4">
                        {strand.subStrands.map((sub) => (
                          <div key={sub.name} className="mt-3">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                {sub.name}
                              </span>
                              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                                {sub.count}
                              </span>
                            </div>
                            <div className="space-y-1.5 pl-4">
                              {sub.lessons.map((l) => (
                                <div
                                  key={l.id}
                                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-gray-700">{l.title}</span>
                                    <span className="text-[11px] text-gray-400">
                                      {l.subject} · {l.age_level}
                                      {l.nerdc_code && <span className="ml-2 font-mono text-indigo-500">{l.nerdc_code}</span>}
                                    </span>
                                  </div>
                                  <span
                                    className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      l.content_state === 'published'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {l.content_state}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
