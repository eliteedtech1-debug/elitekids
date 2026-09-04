/**
 * InsightCard — single insight display (icon + headline + body + severity).
 *
 * Renders one insight from the parent intelligence engine with warm,
 * child-safe copy and visual severity cues.
 */
import { AlertTriangle, TrendingUp, Star, Eye, CheckCircle2 } from 'lucide-react';
import { t } from '@/lib/i18n';

interface Insight {
  id?: number;
  rule_key: string;
  title: string;
  body: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  kind: 'alert' | 'positive' | 'watch';
  meta?: Record<string, any>;
}

interface InsightCardProps {
  insight: Insight;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  high: { bg: 'bg-red-50/80', border: 'border-red-200', icon: 'text-red-500' },
  medium: { bg: 'bg-amber-50/80', border: 'border-amber-200', icon: 'text-amber-500' },
  low: { bg: 'bg-green-50/80', border: 'border-green-200', icon: 'text-green-500' },
  info: { bg: 'bg-blue-50/80', border: 'border-blue-200', icon: 'text-blue-500' },
};

function InsightIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'alert': return <AlertTriangle className="h-4 w-4" />;
    case 'positive': return <Star className="h-4 w-4" />;
    case 'watch': return <Eye className="h-4 w-4" />;
    default: return <CheckCircle2 className="h-4 w-4" />;
  }
}

export default function InsightCard({ insight }: InsightCardProps) {
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;

  return (
    <div className={`rounded-2xl border ${style.bg} ${style.border} p-4 shadow-sm`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ${style.icon}`}>
          <InsightIcon kind={insight.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-gray-800">{insight.title}</p>
          <p className="mt-0.5 text-xs text-gray-600">{insight.body}</p>
          {insight.rule_key === 'streak-at-risk' && insight.meta?.current && (
            <p className="mt-1 text-[11px] font-bold text-red-600">
              {insight.meta.current}-day streak
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
