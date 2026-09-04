/**
 * ComparisonChart — opt-in anonymous bar chart (age-band percentile).
 *
 * Shows a simple horizontal bar for where the child sits among same-age
 * peers. Opt-in only; shows opt-out message when not opted in.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, BarChart3, Users } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';

interface ComparisonData {
  opted_in: boolean;
  age_band?: string;
  percentile?: number;
  metric?: string;
  message?: string;
}

interface ComparisonChartProps {
  childId: string;
  onOptIn?: () => void;
}

export default function ComparisonChart({ childId, onOptIn }: ComparisonChartProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let dead = false;
    apiClient
      .get(ENDPOINTS.PARENT_INTEL.COMPARISON(childId))
      .then((res) => { if (!dead) setData(res.data?.data || null); })
      .catch(() => {})
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [childId]);

  const toggleOptIn = async (allow: boolean) => {
    setToggling(true);
    try {
      await apiClient.post(ENDPOINTS.PARENT_INTEL.OPT_IN, {
        child_admission_no: childId,
        allow,
      });
      setData((prev) => prev ? { ...prev, opted_in: allow } : prev);
      toast.success(allow ? 'Comparison enabled' : 'Comparison disabled');
      onOptIn?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Toggle failed');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!data?.opted_in) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 p-4 text-center">
        <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm font-bold text-gray-600">
          {t('parentIntel.comparison', { defaultValue: 'Class Comparison' })}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {t('parentIntel.comparisonOptedOut', { defaultValue: 'Anonymous comparison is off. Turn it on to see how your child compares.' })}
        </p>
        <button
          onClick={() => toggleOptIn(true)}
          disabled={toggling}
          className="mt-3 rounded-xl bg-[#0F4D92] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#0d4280] disabled:opacity-50"
        >
          {toggling ? '...' : t('parentIntel.anonymousOpt', { defaultValue: 'Allow anonymous comparison' })}
        </button>
      </div>
    );
  }

  const percentile = data.percentile || 0;

  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-gray-800">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          {t('parentIntel.comparison', { defaultValue: 'Class Comparison' })}
        </h3>
        <button
          onClick={() => toggleOptIn(false)}
          disabled={toggling}
          className="text-[10px] font-bold text-gray-400 hover:text-gray-600"
        >
          Turn off
        </button>
      </div>

      <div className="mb-3 rounded-xl bg-indigo-50/80 p-4 text-center">
        <p className="text-3xl font-black text-indigo-700">{percentile}%</p>
        <p className="text-xs text-gray-500">
          among {data.age_band || 'same-age peers'}
        </p>
      </div>

      {/* Simple horizontal bar */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 transition-all duration-700"
          style={{ width: `${percentile}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>Lower</span>
        <span>{t('parentIntel.seniorBadge', { defaultValue: 'Stronger than average' })}</span>
        <span>Higher</span>
      </div>
    </div>
  );
}
