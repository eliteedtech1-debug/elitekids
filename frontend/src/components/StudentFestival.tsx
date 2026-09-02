import { useEffect, useState } from 'react';
import { Swords, Shield, Zap, Crown, Loader2 } from 'lucide-react';
import { playTap } from '@/lib/utils/sound';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { liveEvents } from '@/lib/live/events';

interface Guardian {
  slug: string;
  name: string;
  title: string;
  emoji: string;
  subject: string;
  base_hp: number;
  status: 'defeated' | 'active' | 'upcoming';
  hp: number;
  max_hp: number;
}

interface FestivalData {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  guardians: Guardian[];
  total_defeated: number;
  total_guardians: number;
  all_defeated: boolean;
  mega_badge_earned: boolean;
  current_guardian: Guardian | null;
}

export default function StudentFestival({ onGoPlay }: { onGoPlay?: () => void }) {
  const [data, setData] = useState<FestivalData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let dead = false;
    const load = () =>
      apiClient
        .get('/kids/festival/active')
        .then((res) => {
          if (!dead) setData(res.data?.data || null);
        })
        .catch(() => {})
        .finally(() => { if (!dead) setLoaded(true); });
    load();
    // Real-time: subscribe to festival HP updates via WebSocket
    const unsub = liveEvents.on('festival-hp', (d: any) => {
      if (dead) return;
      setData((prev) => {
        if (!prev || prev.id !== d.festivalId) return prev;
        const guardians = prev.guardians.map((g) =>
          g.slug === d.guardianSlug
            ? { ...g, hp: d.currentHp, max_hp: d.maxHp, status: d.defeated ? 'defeated' as const : 'active' as const }
            : g
        );
        return {
          ...prev,
          guardians,
          current_guardian: d.defeated ? null : guardians.find((g) => g.slug === d.guardianSlug) || prev.current_guardian,
          all_defeated: d.allDefeated,
          total_defeated: guardians.filter((g) => g.status === 'defeated').length,
        };
      });
    });
    return () => { dead = true; unsub(); };
  }, []);

  if (!loaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!data || data.status !== 'active') {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-8 text-center">
        <Swords className="mb-4 h-14 w-14 text-gray-300" />
        <p className="text-base font-bold text-gray-600">{t('studentFestival.none')}</p>
        <p className="mt-2 text-sm text-gray-400">{t('studentFestival.noneHint')}</p>
      </div>
    );
  }

  const currentGuardian = data.current_guardian;
  const hpPct = currentGuardian ? Math.max(0, (currentGuardian.hp / currentGuardian.max_hp) * 100) : 0;

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      {/* Header */}
      <div className="mb-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Swords className="h-5 w-5" /> {data.title}
          </h2>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
            {data.total_defeated}/{data.total_guardians}
          </span>
        </div>
        <p className="mt-1 text-sm opacity-90">
          {data.all_defeated
            ? t('studentFestival.allDefeated')
            : t('studentFestival.defeatAll')}
        </p>
      </div>

      {/* Active Guardian Battle Card */}
      {currentGuardian && !data.all_defeated && (
        <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-lg">
          <div className="text-center">
            <div className="mb-2 text-5xl">{currentGuardian.emoji}</div>
            <h3 className="text-lg font-extrabold text-gray-800">{currentGuardian.name}</h3>
            <p className="text-xs text-gray-500">{currentGuardian.title} · {currentGuardian.subject}</p>
          </div>

          {/* HP Bar */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-bold text-red-600">
                <Shield className="h-3 w-3" /> {t('studentFestival.bossHp')}
              </span>
              <span className="font-extrabold text-gray-700">{currentGuardian.hp}/{currentGuardian.max_hp}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-red-100 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-1000"
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[10px] font-semibold text-gray-400">
              {hpPct > 60 ? t('studentFestival.hp.strong') : hpPct > 30 ? t('studentFestival.hp.weaker') : t('studentFestival.hp.almost')}
            </p>
          </div>

          <button
            onClick={() => { playTap(); onGoPlay?.(); }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Zap className="h-5 w-5" /> {t('studentFestival.fight')}
          </button>
        </div>
      )}

      {/* Mega Badge earned */}
      {data.all_defeated && (
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-600 p-6 text-center text-white shadow-lg">
          <Crown className="mx-auto mb-2 h-10 w-10" />
          <h3 className="text-xl font-extrabold">{t('studentFestival.megaBadge')}</h3>
          <p className="mt-2 text-sm opacity-90">{t('studentFestival.megaBody')}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {data.guardians.filter(g => g.status === 'defeated').map(g => (
              <span key={g.slug} className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                {g.emoji} {g.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Guardian Progress Map */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">{t('studentFestival.progress')}</h3>
        <div className="space-y-2">
          {data.guardians.map((g, i) => (
            <div
              key={g.slug}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                g.status === 'defeated'
                  ? 'bg-green-50'
                  : g.status === 'active'
                  ? 'bg-amber-50 ring-2 ring-amber-300'
                  : 'bg-gray-50 opacity-50'
              }`}
            >
              <span className="text-lg">{g.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-gray-700">{g.name}</span>
                  {g.status === 'active' && <span className="text-[10px] font-bold text-amber-600">{t('studentFestival.active')}</span>}
                </div>
                <span className="text-[10px] text-gray-400">{g.title}</span>
                {g.status === 'active' && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-amber-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all"
                      style={{ width: `${(g.hp / g.max_hp) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <span className={`text-xs font-bold ${g.status === 'defeated' ? 'text-green-600' : g.status === 'active' ? 'text-amber-600' : 'text-gray-400'}`}>
                {g.status === 'defeated' ? '✅' : g.status === 'active' ? t('studentFestival.hpShort', { hp: g.hp }) : '🔒'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
