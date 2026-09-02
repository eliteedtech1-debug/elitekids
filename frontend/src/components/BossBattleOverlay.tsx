import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, Heart, Zap, Shield } from 'lucide-react';
import { playVictory } from '@/lib/game/sound-effects';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { liveEvents } from '@/lib/live/events';
import { t, tN } from '@/lib/i18n';

/* ── Types ──────────────────────────────────────────────────── */

interface GuardianInfo {
  slug: string;
  name: string;
  emoji: string;
  title: string;
}

interface HpInfo {
  current: number;
  max: number;
  pct: number;
}

interface TopDamage {
  name: string;
  damage: number;
}

interface RaidData {
  active: boolean;
  id: string;
  title: string;
  guardian: GuardianInfo;
  hp: HpInfo;
  games: { lesson_id: string; config_id: string | null; order_index: number }[];
  my_damage: number;
  my_status: string;
  top_damage: TopDamage[];
  ends_at: string;
}

interface Props {
  onDismiss?: () => void;
}

/* ── Guardian wisdom quotes on defeat (Nigerian mythology) ──── */
const GUARDIAN_WISDOM: Record<string, string> = {
  sango: 'The thunder remembers your courage, young one.',
  anansi: 'Three heads bowed to your wisdom.',
  amina: 'The fortress walls bow to your strength.',
  baobab: 'The ancient tree bows to your knowledge.',
  mami: 'The waters remember your courage, young one.',
  elena: 'Every path leads to those who seek wisely.',
};

/* ── Floating decoration for game feel ─────────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-30 ${className}`} />
  );
}

export default function BossBattleOverlay({ onDismiss }: Props) {
  const navigate = useNavigate();
  const [raid, setRaid] = useState<RaidData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showVictory, setShowVictory] = useState(false);

  const loadRaid = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.BOSS.RAID_ACTIVE);
      const data = res.data?.data;
      if (data?.active) {
        setRaid(data);
      } else {
        setRaid(null);
      }
    } catch {
      setRaid(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadRaid();
    // Real-time: subscribe to boss HP updates via WebSocket
    const unsub = liveEvents.on('raid-hp', (d: any) => {
      setRaid((prev) => {
        if (!prev || prev.id !== d.raidId) return prev;
        return {
          ...prev,
          hp: { current: d.currentHp, max: d.maxHp, pct: d.maxHp > 0 ? (d.currentHp / d.maxHp) * 100 : 0 },
        };
      });
    });
    return unsub;
  }, [loadRaid]);

  useEffect(() => {
    if (raid && raid.hp.current <= 0 && !showVictory) {
      playVictory();
      setShowVictory(true);
    }
  }, [raid, showVictory]);

  const handleGoFight = async () => {
    if (!raid) return;
    setJoining(true);
    try {
      // Navigate to first game in the raid
      const firstGame = raid.games?.[0];
      if (firstGame?.lesson_id) {
        navigate(`/student/game/${firstGame.lesson_id}?boss_mode=raid&raid_id=${raid.id}`);
      }
    } finally {
      setJoining(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin h-5 w-5 border-2 border-[#C90016] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!raid) return null;

  const hpPct = raid.hp.pct;
  const isBossAlive = raid.hp.current > 0;
  const avatar = raid.guardian?.emoji || '⚔️';
  const title = raid.guardian?.title || 'Ancient Guardian';

  /* ── Victory Screen ──────────────────────────────────────── */
  if (showVictory) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-8 max-w-sm w-full text-center shadow-2xl border-2 border-amber-300">
          <FloatingDeco className="-right-8 -top-8 h-32 w-32 bg-gradient-to-br from-amber-400 to-yellow-400" />
          <FloatingDeco className="-left-6 -bottom-6 h-24 w-24 bg-gradient-to-br from-orange-400 to-red-400" />
          <div className="relative">
            <div className="text-7xl mb-4 animate-bounce">{avatar}</div>
            <h2 className="text-2xl font-extrabold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{t('bossBattle.guardianDefeated')}</h2>
            <p className="text-sm text-amber-700 mt-1 font-medium">{t('bossBattle.outwitted', { title })}</p>
            <div className="mt-5 bg-amber-100/80 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/60">
              <p className="text-xs text-amber-700 italic font-medium">
                "{GUARDIAN_WISDOM[raid.guardian?.slug || ''] || t('bossBattle.defaultWisdom')}"
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="mt-6 px-8 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold hover:from-amber-600 hover:to-orange-600 transition shadow-lg shadow-amber-300/40 active:scale-95"
            >
              {t('bossBattle.collectRewards')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Active Raid ─────────────────────────────────────────── */
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-[#C90016]/20 bg-gradient-to-br from-red-50/80 via-orange-50/50 to-amber-50/60 p-5 shadow-xl shadow-red-200/30">
      <FloatingDeco className="-right-8 -top-8 h-28 w-28 bg-gradient-to-br from-red-400 to-orange-400" />
      <FloatingDeco className="-left-6 -bottom-6 h-20 w-20 bg-gradient-to-br from-[#C90016] to-red-600" />
      {/* Boss Header */}
      <div className="relative flex items-center gap-4 mb-4">
        <div className="text-5xl animate-pulse">{avatar}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-[#C90016]" />
            <span className="text-xs font-bold text-[#C90016] uppercase tracking-wide">{t('bossBattle.active')}</span>
          </div>
          <h3 className="text-lg font-extrabold text-gray-800">{raid.title || title}</h3>
        </div>
      </div>

      {/* HP Bar */}
      <div className="relative mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="flex items-center gap-1 font-bold text-[#C90016]">
            <Heart className="h-3 w-3 fill-[#C90016]" /> {t('bossBattle.guardianHp')}
          </span>
          <span className="font-mono font-bold text-[#C90016]">
            {raid.hp.current.toLocaleString()} / {raid.hp.max.toLocaleString()}
          </span>
        </div>
        <div className="h-5 bg-red-100 rounded-full overflow-hidden border border-red-200 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-[#C90016] to-orange-500 rounded-full transition-all duration-700 shadow-sm"
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="relative flex items-center justify-between text-xs text-gray-500 mb-4">
        <span className="flex items-center gap-1 font-semibold">
          <Zap className="h-3 w-3 text-amber-500" /> {t('bossBattle.yourDamage', { damage: raid.my_damage })}
        </span>
        {raid.games?.length > 0 && (
          <span className="flex items-center gap-1 font-semibold">
            <Shield className="h-3 w-3 text-blue-500" /> {tN('bossBattle.games', raid.games.length, { count: raid.games.length })}
          </span>
        )}
      </div>

      {/* Top fighters */}
      {raid.top_damage?.length > 0 && (
        <div className="relative mb-4 flex flex-wrap gap-1.5">
          {raid.top_damage.slice(0, 5).map((m, i) => (
            <span
              key={m.name}
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                i === 0
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-md shadow-amber-200/40'
                  : 'bg-white/80 backdrop-blur-sm text-gray-600 border border-gray-200'
              }`}
            >
              {i === 0 ? '🏆 ' : ''}{m.name} ({m.damage})
            </span>
          ))}
        </div>
      )}

      {/* Go Fight Button */}
      <button
        onClick={handleGoFight}
        disabled={joining || !isBossAlive}
        className="relative w-full py-3.5 bg-gradient-to-r from-[#C90016] to-orange-500 text-white font-extrabold rounded-2xl 
                   hover:from-red-700 hover:to-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center gap-2 shadow-xl shadow-red-300/40 active:scale-[0.98] hover:scale-[1.02]"
      >
        <Swords className="h-5 w-5" />
        {joining ? t('bossBattle.joining') : isBossAlive ? t('bossBattle.goFight') : t('bossBattle.raidOver')}
      </button>
    </div>
  );
}
