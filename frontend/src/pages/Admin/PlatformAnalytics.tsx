import { useCallback, useEffect, useState } from 'react';
import { Brain, RefreshCw, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminNav from '@/components/AdminNav';
import OfflineProgress from '@/components/OfflineProgress';
import PredictionCard, { type ChildPrediction } from '@/components/PredictionCard';
import EarlyWarningPanel from '@/components/EarlyWarningPanel';
import PopulationInsights from '@/components/PopulationInsights';
import ContentScoreboard from '@/components/ContentScoreboard';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

interface Population { learners: number; active_learners: number; average_score_pct: number; high_risk_learners: number; risk_rate_pct: number; }
interface ContentScore { lesson_id: string; title: string; attempts: number; unique_students: number; average_score_pct: number; completion_rate_pct: number; effectiveness: number; }

export default function PlatformAnalytics() {
  const [classId, setClassId] = useState('');
  const [draftClass, setDraftClass] = useState('');
  const [warnings, setWarnings] = useState<ChildPrediction[]>([]);
  const [population, setPopulation] = useState<Population | null>(null);
  const [content, setContent] = useState<ContentScore[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (requestedClass = classId) => {
    if (!requestedClass.trim()) return;
    setLoading(true);
    try {
      const q = encodeURIComponent(requestedClass.trim());
      const [warningRes, populationRes, contentRes] = await Promise.all([
        apiClient.get(`${ENDPOINTS.PREDICTIVE.EARLY_WARNINGS(requestedClass)}`),
        apiClient.get(`${ENDPOINTS.PREDICTIVE.POPULATION(requestedClass)}`),
        apiClient.get(`${ENDPOINTS.PREDICTIVE.CONTENT_EFFECTIVENESS(requestedClass)}`),
      ]);
      setWarnings(warningRes.data?.data || []);
      setPopulation(populationRes.data?.data || null);
      setContent(contentRes.data?.data || []);
      setClassId(requestedClass.trim());
    } catch (err: any) {
      toast.error(err?.message || 'Could not load predictive analytics.');
    } finally { setLoading(false); }
  }, [classId]);

  return (
    <div className="min-h-screen bg-[#E7EEF6]"><AdminNav />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-extrabold text-gray-800"><Brain className="h-6 w-6 text-purple-600" /> Analytics intelligence</h1><p className="mt-1 text-sm text-gray-500">Explainable estimates to support human decisions — never diagnoses.</p></div><OfflineProgress compact /></div>
        <form onSubmit={(e) => { e.preventDefault(); void load(draftClass); }} className="flex gap-2 rounded-2xl bg-white p-4 shadow-sm"><input required value={draftClass} onChange={(e) => setDraftClass(e.target.value)} placeholder="Enter class code" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none" /><button disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F4D92] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Load</button></form>
        {classId && <p className="text-xs font-semibold text-gray-500">Showing class: <span className="text-[#0F4D92]">{classId}</span></p>}
        <PopulationInsights data={population} />
        <EarlyWarningPanel warnings={warnings} loading={loading} />
        <ContentScoreboard rows={content} />
        {warnings.length > 0 && <section className="space-y-3"><h2 className="font-extrabold text-gray-800">Review individual signals</h2>{warnings.slice(0, 10).map((prediction) => <PredictionCard key={prediction.child_admission_no} prediction={prediction} />)}</section>}
      </main>
    </div>
  );
}
