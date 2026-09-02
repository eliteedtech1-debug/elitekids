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
        <div className="animate-spin h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full" />
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
        <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border-2 border-amber-300">
          <div className="text-6xl mb-3">{avatar}</div>
          <h2 className="text-xl font-bold text-amber-800">{t('bossBattle.guardianDefeated')}</h2>
          <p className="text-sm text-amber-600 mt-1">{t('bossBattle.outwitted', { title })}</p>
          <div className="mt-4 bg-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 italic">
              "{GUARDIAN_WISDOM[raid.guardian?.slug || ''] || t('bossBattle.defaultWisdom')}"
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition">{t('bossBattle.collectRewards')}</button>
        </div>
      </div>
    );
  }

  /* ── Active Raid ─────────────────────────────────────────── */
  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl border-2 border-red-200 p-4 shadow-lg">
      {/* Boss Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="text-4xl animate-pulse">{avatar}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-red-500" />
            <span className="text-xs font-bold text-red-600 uppercase tracking-wide">{t('bossBattle.active')}</span>
          </div>
          <h3 className="text-lg font-bold text-red-800">{raid.title || title}</h3>
        </div>
      </div>

      {/* HP Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="flex items-center gap-1 text-red-600">
            <Heart className="h-3 w-3" /> {t('bossBattle.guardianHp')}
          </span>
          <span className="font-mono font-bold text-red-700">
            {raid.hp.current.toLocaleString()} / {raid.hp.max.toLocaleString()}
          </span>
        </div>
        <div className="h-4 bg-red-100 rounded-full overflow-hidden border border-red-200">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-700"
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" /> {t('bossBattle.yourDamage', { damage: raid.my_damage })}
        </span>
        {raid.games?.length > 0 && (
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" /> {tN('bossBattle.games', raid.games.length, { count: raid.games.length })}
          </span>
        )}
      </div>

      {/* Top fighters */}
      {raid.top_damage?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {raid.top_damage.slice(0, 5).map((m, i) => (
            <span
              key={m.name}
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                i === 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-white text-gray-600 border border-gray-200'
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
        className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold rounded-xl 
                   hover:from-red-600 hover:to-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed
                   flex items-center justify-center gap-2 shadow-lg"
      >
        <Swords className="h-5 w-5" />
        {joining ? t('bossBattle.joining') : isBossAlive ? t('bossBattle.goFight') : t('bossBattle.raidOver')}
      </button>
    </div>
  );
}
