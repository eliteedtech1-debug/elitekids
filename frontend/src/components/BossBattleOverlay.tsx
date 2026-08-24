import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, Heart, Clock, Users, Zap, Shield } from 'lucide-react';
import { playBossAttack, playVictory, playDefeatEncourage } from '@/lib/game/sound-effects';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ──────────────────────────────────────────────────── */

interface Guardian {
  key: string;
  name: string;
  title: string;
  hp: number;
  weakness: string;
  aura: string;
}

interface RaidMember {
  admission_no: string;
  display_name: string;
  total_damage: number;
  correct: number;
  wrong: number;
}

interface RaidData {
  raid_id: string;
  boss_key: string;
  status: 'active' | 'defeated' | 'failed';
  current_hp: number;
  max_hp: number;
  members: RaidMember[];
  member_count: number;
  total_damage: number;
  game_ids: string[];
  tier: string;
  created_at: string;
}

interface Props {
  onDismiss?: () => void;
}

/* ── Guardian avatars (Nigerian mythology) ──────────────────── */

const GUARDIAN_AVATARS: Record<string, string> = {
  mama_water: '🐍',
  alajobi: '🦅',
  efun_spirit: '👻',
  agwu: '👹',
  jungle_spirit: '🌿',
  storm_guardian: '⚡',
};

const GUARDIAN_TITLES: Record<string, string> = {
  mama_water: 'Guardian of the Waters',
  alajobi: 'The Three-Headed Eagle',
  efun_spirit: 'Spirit of the Ancient Forest',
  agwu: 'The Wild One',
  jungle_spirit: 'Voice of the Green',
  storm_guardian: 'Keeper of Thunder',
};

export default function BossBattleOverlay({ onDismiss }: Props) {
  const navigate = useNavigate();
  const [raid, setRaid] = useState<RaidData | null>(null);
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [defeated, setDefeated] = useState(false);

  const loadRaid = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.BOSS.RAID_ACTIVE);
      const data = res.data?.data;
      if (data?.active) {
        setRaid(data.raid);
        if (data.guardian) setGuardian(data.guardian);
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
    const t = setInterval(loadRaid, 15000); // poll every 15s
    return () => clearInterval(t);
  }, [loadRaid]);

  useEffect(() => {
    if (raid?.status === 'defeated' && !showVictory) {
      playVictory();
      setShowVictory(true);
    }
    if (raid?.status === 'failed' && !defeated) {
      playDefeatEncourage();
      setDefeated(true);
    }
  }, [raid?.status, showVictory, defeated]);

  const handleGoFight = async () => {
    if (!raid) return;
    setJoining(true);
    try {
      // Navigate to GamePlay in boss raid mode
      navigate(`/student/play?boss_mode=raid&raid_id=${raid.raid_id}`);
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

  const hpPct = Math.max(0, Math.round((raid.current_hp / raid.max_hp) * 100));
  const isBossAlive = raid.status === 'active';
  const avatar = GUARDIAN_AVATARS[raid.boss_key] || '👹';
  const title = GUARDIAN_TITLES[raid.boss_key] || 'Ancient Guardian';

  /* ── Victory Screen ──────────────────────────────────────── */
  if (showVictory) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border-2 border-amber-300">
          <div className="text-6xl mb-3">{avatar}</div>
          <h2 className="text-xl font-bold text-amber-800">Guardian Defeated!</h2>
          <p className="text-sm text-amber-600 mt-1">{title} has been outwitted</p>
          <div className="mt-4 bg-amber-100 rounded-xl p-3">
            <p className="text-xs text-amber-700 italic">
              "{raid.boss_key === 'mama_water'
                ? 'The waters remember your courage, young one.'
                : raid.boss_key === 'alajobi'
                ? 'Three heads bowed to your wisdom.'
                : 'The ancient forest bows to your strength.'}"
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition"
          >
            Collect Rewards
          </button>
        </div>
      </div>
    );
  }

  /* ── Defeated Screen ─────────────────────────────────────── */
  if (defeated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-gradient-to-br from-gray-100 to-slate-200 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border-2 border-gray-300">
          <div className="text-6xl mb-3 opacity-60">{avatar}</div>
          <h2 className="text-xl font-bold text-gray-700">Not This Time...</h2>
          <p className="text-sm text-gray-500 mt-1">{title} held strong</p>
          <p className="text-xs text-gray-400 mt-2">Practice more and try again — you can do it!</p>
          <button
            onClick={onDismiss}
            className="mt-4 px-6 py-2 bg-gray-500 text-white rounded-xl font-bold hover:bg-gray-600 transition"
          >
            Keep Practicing
          </button>
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
            <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Boss Raid Active</span>
          </div>
          <h3 className="text-lg font-bold text-red-800">{title}</h3>
        </div>
        {raid.tier && (
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-600 uppercase">
            {raid.tier}
          </span>
        )}
      </div>

      {/* HP Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="flex items-center gap-1 text-red-600">
            <Heart className="h-3 w-3" /> Guardian HP
          </span>
          <span className="font-mono font-bold text-red-700">
            {raid.current_hp.toLocaleString()} / {raid.max_hp.toLocaleString()}
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
          <Users className="h-3 w-3" /> {raid.member_count} fighter{raid.member_count !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3" /> {raid.total_damage.toLocaleString()} total damage
        </span>
        {raid.game_ids?.length > 0 && (
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" /> {raid.game_ids.length} game{raid.game_ids.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Top fighters */}
      {raid.members.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {raid.members.slice(0, 5).map((m, i) => (
            <span
              key={m.admission_no}
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                i === 0
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {i === 0 ? '🏆 ' : ''}{m.display_name} ({m.total_damage})
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
        {joining ? 'Joining...' : isBossAlive ? 'Go Fight the Guardian!' : 'Raid Over'}
      </button>
    </div>
  );
}
