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

/* ── Floating decoration for game feel ─────────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-25 ${className}`} />
  );
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
      <div className="relative flex min-h-[50vh] flex-col items-center justify-center px-8 text-center">
        <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-gray-300 to-gray-200" />
        <Swords className="mb-4 h-14 w-14 text-gray-300" />
        <p className="text-base font-bold text-gray-600">{t('studentFestival.none')}</p>
        <p className="mt-2 text-sm text-gray-400">{t('studentFestival.noneHint')}</p>
      </div>
    );
  }

  const currentGuardian = data.current_guardian;
  const hpPct = currentGuardian ? Math.max(0, (currentGuardian.hp / currentGuardian.max_hp) * 100) : 0;

  return (
    <div className="mx-auto max-w-md px-4 py-4 space-y-4">
      {/* Header — game-style glassmorphism */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#C90016] via-orange-500 to-amber-500 p-5 text-white shadow-xl shadow-red-300/30">
        <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-white/20 to-white/10" />
        <FloatingDeco className="-left-6 -bottom-6 h-20 w-20 bg-gradient-to-br from-white/15 to-white/5" />
        <div className="relative flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-lg font-extrabold">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Swords className="h-5 w-5" />
            </div>
            {data.title}
          </h2>
          <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-bold shadow-inner">
            {data.total_defeated}/{data.total_guardians}
          </span>
        </div>
        <p className="relative mt-2 text-sm opacity-90 font-medium">
          {data.all_defeated
            ? t('studentFestival.allDefeated')
            : t('studentFestival.defeatAll')}
        </p>
      </div>

      {/* Active Guardian Battle Card */}
      {currentGuardian && !data.all_defeated && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-white via-amber-50/30 to-orange-50/30 p-6 shadow-xl shadow-amber-200/20">
          <FloatingDeco className="-right-6 -top-6 h-24 w-24 bg-gradient-to-br from-amber-300 to-orange-300" />
          <FloatingDeco className="-left-4 -bottom-4 h-16 w-16 bg-gradient-to-br from-red-300 to-orange-300" />
          <div className="relative text-center">
            <div className="mb-3 text-6xl animate-bounce">{currentGuardian.emoji}</div>
            <h3 className="text-xl font-extrabold text-gray-800">{currentGuardian.name}</h3>
            <p className="text-xs text-gray-500 font-medium">{currentGuardian.title} · {currentGuardian.subject}</p>
          </div>

          {/* HP Bar */}
          <div className="relative mt-5">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-bold text-[#C90016]">
                <Shield className="h-3 w-3" /> {t('studentFestival.bossHp')}
              </span>
              <span className="font-extrabold text-gray-700">{currentGuardian.hp}/{currentGuardian.max_hp}</span>
            </div>
            <div className="h-5 overflow-hidden rounded-full bg-red-100 shadow-inner border border-red-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#C90016] to-orange-500 transition-all duration-1000 shadow-sm"
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-center text-[10px] font-bold text-gray-400">
              {hpPct > 60 ? t('studentFestival.hp.strong') : hpPct > 30 ? t('studentFestival.hp.weaker') : t('studentFestival.hp.almost')}
            </p>
          </div>

          <button
            onClick={() => { playTap(); onGoPlay?.(); }}
            className="relative mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#C90016] to-orange-500 py-4 text-lg font-extrabold text-white shadow-xl shadow-red-300/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Zap className="h-5 w-5" /> {t('studentFestival.fight')}
          </button>
        </div>
      )}

      {/* Mega Badge earned */}
      {data.all_defeated && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0F4D92] via-indigo-500 to-[#0d9488] p-7 text-center text-white shadow-xl shadow-[#0F4D92]/30">
          <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-white/20 to-white/10" />
          <Crown className="mx-auto mb-3 h-12 w-12 drop-shadow-lg" />
          <h3 className="text-xl font-extrabold">{t('studentFestival.megaBadge')}</h3>
          <p className="mt-2 text-sm opacity-90 font-medium">{t('studentFestival.megaBody')}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {data.guardians.filter(g => g.status === 'defeated').map(g => (
              <span key={g.slug} className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-bold shadow-inner">
                {g.emoji} {g.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Guardian Progress Map */}
      <div className="relative overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl p-5 shadow-lg shadow-[#0F4D92]/5 border border-white/60">
        <FloatingDeco className="-right-6 -top-6 h-20 w-20 bg-gradient-to-br from-[#0F4D92]/10 to-[#0d9488]/10" />
        <h3 className="relative mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">{t('studentFestival.progress')}</h3>
        <div className="relative space-y-2">
          {data.guardians.map((g, i) => (
            <div
              key={g.slug}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
                g.status === 'defeated'
                  ? 'bg-green-50/80 border border-green-200/40'
                  : g.status === 'active'
                  ? 'bg-amber-50/80 border-2 border-amber-300 shadow-md shadow-amber-200/20'
                  : 'bg-gray-50/60 border border-gray-100 opacity-50'
              }`}
            >
              <span className="text-xl">{g.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-gray-700">{g.name}</span>
                  {g.status === 'active' && <span className="text-[10px] font-bold text-amber-600">{t('studentFestival.active')}</span>}
                </div>
                <span className="text-[10px] text-gray-400 font-medium">{g.title}</span>
                {g.status === 'active' && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-[#C90016] transition-all"
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
