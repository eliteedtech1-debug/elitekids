/**
 * TeacherInsightsPanel — sidebar with class-level insights.
 *
 * Shows struggling students, mastery deltas, and engagement signals
 * for a teacher's class.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Brain, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';

interface Insight {
  id: number;
  class_id: string;
  insight_type: string;
  headline: string;
  body: string;
  severity: string;
  meta?: Record<string, any>;
  week_start: string;
}

interface TeacherInsightsPanelProps {
  classId: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'border-red-200 bg-red-50/80 text-red-700',
  medium: 'border-amber-200 bg-amber-50/80 text-amber-700',
  info: 'border-blue-200 bg-blue-50/80 text-blue-700',
};

function InsightIcon({ type }: { type: string }) {
  switch (type) {
    case 'struggling': return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case 'mastery-delta': return <TrendingUp className="h-4 w-4 text-blue-500" />;
    case 'engagement': return <Users className="h-4 w-4 text-green-500" />;
    default: return <Brain className="h-4 w-4 text-purple-500" />;
  }
}

export default function TeacherInsightsPanel({ classId }: TeacherInsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInsights = useCallback(async () => {
    try {
      const res = await apiClient.get(`${ENDPOINTS.TEACHER_AI.INSIGHTS}?class_id=${encodeURIComponent(classId)}`);
      setInsights(res.data?.data || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading insights...
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-center shadow-sm backdrop-blur-xl">
        <Brain className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm font-bold text-gray-600">No insights yet</p>
        <p className="mt-1 text-xs text-gray-400">Insights appear as students play more games</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-gray-800">
        <Brain className="h-4 w-4 text-purple-500" />
        Class Insights
      </h3>
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={`rounded-2xl border p-3 shadow-sm ${SEVERITY_COLORS[insight.severity] || SEVERITY_COLORS.info}`}
        >
          <div className="flex items-start gap-2">
            <InsightIcon type={insight.insight_type} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{insight.headline}</p>
              <p className="mt-0.5 text-xs opacity-80">{insight.body}</p>
              {insight.meta?.students && Array.isArray(insight.meta.students) && (
                <p className="mt-1 text-[11px] font-semibold">
                  Students: {insight.meta.students.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
