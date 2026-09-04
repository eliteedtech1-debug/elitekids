import { Activity, BarChart3, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Population {
  learners: number;
  active_learners: number;
  average_score_pct: number;
  high_risk_learners: number;
  risk_rate_pct: number;
}

export default function PopulationInsights({ data }: { data: Population | null }) {
  if (!data) return <section className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-400">Population insights are not available yet.</section>;
  const cards: Array<[string, string | number, LucideIcon]> = [
    ['Learners', data.learners, Users],
    ['Active', data.active_learners, Activity],
    ['Avg score', `${data.average_score_pct}%`, BarChart3],
    ['High risk', `${data.high_risk_learners} (${data.risk_rate_pct}%)`, BarChart3],
  ];
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-extrabold text-gray-800"><BarChart3 className="h-5 w-5 text-[#0F4D92]" /> Population snapshot</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(([label, value, Icon]) => <div key={label} className="rounded-xl bg-gray-50 p-3"><Icon className="h-4 w-4 text-gray-400" /><p className="mt-1 text-lg font-extrabold text-gray-800">{value}</p><p className="text-[11px] text-gray-500">{label}</p></div>)}
      </div>
    </section>
  );
}
