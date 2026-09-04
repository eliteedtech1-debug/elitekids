/**
 * WeeklyDigest — last 7 days summary view for parent dashboard.
 *
 * Shows games played, XP earned, avg score, and days active in a compact card.
 */
import { useEffect, useState } from 'react';
import { Loader2, Gamepad2, TrendingUp, Star, Calendar } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { t } from '@/lib/i18n';

interface DigestData {
  child_admission_no: string;
  games_played: number;
  total_xp: number;
  avg_score_pct: number;
  days_active: number;
  insight_count: number;
  week_start: string;
}

interface WeeklyDigestProps {
  childId: string;
}

export default function WeeklyDigest({ childId }: WeeklyDigestProps) {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    apiClient
      .get(ENDPOINTS.PARENT_INTEL.WEEKLY_DIGEST(childId))
      .then((res) => { if (!dead) setDigest(res.data?.data || null); })
      .catch(() => {})
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [childId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading digest...
      </div>
    );
  }

  if (!digest) return null;

  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur-xl">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-gray-800">
        <Calendar className="h-4 w-4 text-purple-500" />
        {t('parentIntel.digest', { defaultValue: 'Weekly Digest' })}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-center">
          <Gamepad2 className="mx-auto mb-1 h-5 w-5 text-blue-500" />
          <p className="text-lg font-black text-blue-700">{digest.games_played}</p>
          <p className="text-[10px] font-semibold text-gray-500">Games</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3 text-center">
          <Star className="mx-auto mb-1 h-5 w-5 text-amber-500" />
          <p className="text-lg font-black text-amber-700">{digest.total_xp}</p>
          <p className="text-[10px] font-semibold text-gray-500">XP earned</p>
        </div>
        <div className="rounded-xl bg-green-50 p-3 text-center">
          <TrendingUp className="mx-auto mb-1 h-5 w-5 text-green-500" />
          <p className="text-lg font-black text-green-700">{digest.avg_score_pct}%</p>
          <p className="text-[10px] font-semibold text-gray-500">Avg score</p>
        </div>
        <div className="rounded-xl bg-purple-50 p-3 text-center">
          <Calendar className="mx-auto mb-1 h-5 w-5 text-purple-500" />
          <p className="text-lg font-black text-purple-700">{digest.days_active}</p>
          <p className="text-[10px] font-semibold text-gray-500">Days active</p>
        </div>
      </div>
    </div>
  );
}
