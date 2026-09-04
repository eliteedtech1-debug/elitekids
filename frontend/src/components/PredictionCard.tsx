import { Brain, ShieldAlert, TrendingUp } from 'lucide-react';

export interface ChildPrediction {
  child_admission_no: string;
  dropout_risk: { score: number; band: string; reasons: string[] };
  mastery: { probability: number; confidence: number; band: string; skill_key?: string | null };
  explanation?: string;
}

export default function PredictionCard({ prediction }: { prediction: ChildPrediction }) {
  const risk = Math.round((prediction.dropout_risk?.score || 0) * 100);
  const mastery = Math.round((prediction.mastery?.probability || 0) * 100);
  const riskColor = prediction.dropout_risk?.band === 'high' ? 'text-red-600 bg-red-50' : prediction.dropout_risk?.band === 'medium' ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50';
  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Brain className="h-5 w-5 text-purple-500" /><div><h3 className="text-sm font-extrabold text-gray-800">{prediction.child_admission_no}</h3><p className="text-[11px] text-gray-400">Explainable v1 estimate</p></div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${riskColor}`}>{prediction.dropout_risk?.band || 'low'} risk</span></div>
      <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3"><p className="flex items-center gap-1 text-[11px] text-gray-500"><ShieldAlert className="h-3 w-3" /> Dropout risk</p><p className="mt-1 text-xl font-extrabold text-gray-800">{risk}%</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="flex items-center gap-1 text-[11px] text-gray-500"><TrendingUp className="h-3 w-3" /> Mastery</p><p className="mt-1 text-xl font-extrabold text-gray-800">{mastery}%</p></div></div>
      {prediction.dropout_risk?.reasons?.length > 0 && <div className="mt-3"><p className="text-xs font-bold text-gray-600">Signals considered</p><ul className="mt-1 list-disc pl-4 text-[11px] text-gray-500">{prediction.dropout_risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
      <p className="mt-3 text-[10px] leading-4 text-gray-400">{prediction.explanation || 'Review this estimate with the learner context before taking action.'}</p>
    </article>
  );
}
