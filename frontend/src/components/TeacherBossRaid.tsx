import { useEffect, useState, useCallback } from 'react';
import { Swords, Plus, Trophy, Users, Clock, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { playTap } from '@/lib/game/sound-effects';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ──────────────────────────────────────────────────── */

interface GameOption {
  id: string;
  title: string;
  subject: string;
}

interface RaidInfo {
  raid_id: string;
  boss_key: string;
  status: string;
  current_hp: number;
  max_hp: number;
  member_count: number;
  tier: string;
  created_at: string;
}

const TIERS = [
  { value: 'easy', labelKey: 'bossRaid.tier.easy.label', hp: 500, descKey: 'bossRaid.tier.easy.desc' },
  { value: 'medium', labelKey: 'bossRaid.tier.medium.label', hp: 1000, descKey: 'bossRaid.tier.medium.desc' },
  { value: 'hard', labelKey: 'bossRaid.tier.hard.label', hp: 2000, descKey: 'bossRaid.tier.hard.desc' },
  { value: 'legendary', labelKey: 'bossRaid.tier.legendary.label', hp: 5000, descKey: 'bossRaid.tier.legendary.desc' },
];

export default function TeacherBossRaid() {
  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [tier, setTier] = useState('medium');
  const [showCreate, setShowCreate] = useState(false);
  const [activeRaids, setActiveRaids] = useState<RaidInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedRaid, setExpandedRaid] = useState<string | null>(null);
  const [raidDashboard, setRaidDashboard] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [gamesRes, raidsRes] = await Promise.all([
        apiClient.get(ENDPOINTS.LESSONS.LIST).catch(() => ({ data: { data: [] } })),
        apiClient.get(ENDPOINTS.BOSS.RAIDS).catch(() => ({ data: { data: [] } })),
      ]);
      const gameList = (gamesRes.data?.data || []).map((g: any) => ({
        id: g.id,
        title: g.title,
        subject: g.subject,
      }));
      setGames(gameList);
      setActiveRaids(raidsRes.data?.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleGame = (id: string) => {
    playTap();
    setSelectedGames((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    if (selectedGames.length === 0) return;
    setCreating(true);
    try {
      await apiClient.post(ENDPOINTS.BOSS.RAID_CREATE, {
        game_ids: selectedGames,
        tier,
      });
      setShowCreate(false);
      setSelectedGames([]);
      await loadData();
    } catch (err) {
      console.error('Failed to create raid:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleViewDashboard = async (raidId: string) => {
    if (expandedRaid === raidId) {
      setExpandedRaid(null);
      setRaidDashboard(null);
      return;
    }
    try {
      const res = await apiClient.get(ENDPOINTS.BOSS.RAID_DASHBOARD(raidId));
      setRaidDashboard(res.data?.data || null);
      setExpandedRaid(raidId);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-5 w-5 border-2 border-red-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-red-500" />
          <h3 className="text-lg font-bold text-gray-800">{t('bossRaid.title')}</h3>
        </div>
        <button
          onClick={() => { playTap(); setShowCreate(!showCreate); }}
          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-bold
                     hover:bg-red-600 transition"
        >
          <Plus className="h-4 w-4" />
          {t('bossRaid.new')}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-red-800">{t('bossRaid.createTitle')}</h4>
          
          {/* Tier Selection */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{t('bossRaid.tier')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIERS.map((tp) => (
                <button
                  key={tp.value}
                  onClick={() => { playTap(); setTier(tp.value); }}
                  className={`p-2 rounded-lg text-center transition border-2 ${
                    tier === tp.value
                      ? 'border-red-500 bg-red-100 text-red-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-red-300'
                  }`}
                >
                  <div className="text-sm font-bold">{t(tp.labelKey)}</div>
                  <div className="text-xs opacity-70">{t('bossRaid.hp', { hp: tp.hp })}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Game Selection */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              {t('bossRaid.selectGames', { count: selectedGames.length })}
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {games.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleToggleGame(game.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition text-sm ${
                    selectedGames.includes(game.id)
                      ? 'bg-red-100 border border-red-300 text-red-800'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-red-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    selectedGames.includes(game.id) ? 'border-red-500 bg-red-500' : 'border-gray-300'
                  }`}>
                    {selectedGames.includes(game.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="truncate">{game.title}</span>
                  <span className="text-xs opacity-50 capitalize">{game.subject}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={selectedGames.length === 0 || creating}
            className="w-full py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? t('bossRaid.summoning') : t('bossRaid.summon')}
          </button>
        </div>
      )}

      {/* Active Raids */}
      {activeRaids.length === 0 ? (
        <div className="text-center py-6">
          <Swords className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{t('bossRaid.empty')}</p>
          <p className="text-xs text-gray-400">{t('bossRaid.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeRaids.map((raid) => (
            <div key={raid.raid_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => handleViewDashboard(raid.raid_id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition"
              >
                <div className="text-2xl">
                  {raid.boss_key === 'mama_water' ? '🐍' :
                   raid.boss_key === 'alajobi' ? '🦅' :
                   raid.boss_key === 'efun_spirit' ? '👻' :
                   raid.boss_key === 'agwu' ? '👹' :
                   raid.boss_key === 'jungle_spirit' ? '🌿' : '⚡'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800 capitalize">{raid.boss_key.replace(/_/g, ' ')}</span>
                    <span className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                      raid.status === 'active' ? 'bg-green-100 text-green-700' :
                      raid.status === 'defeated' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {raid.status}
                    </span>
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded capitalize">
                      {raid.tier}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {raid.member_count}
                    </span>
                    <span>HP: {raid.current_hp.toLocaleString()}</span>
                  </div>
                </div>
                {expandedRaid === raid.raid_id ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {/* Dashboard */}
              {expandedRaid === raid.raid_id && raidDashboard && (
                <div className="border-t border-gray-100 p-3 bg-gray-50">
                  <div className="text-xs font-bold text-gray-600 mb-2">{t('bossRaid.leaderboard')}</div>
                  {raidDashboard.members?.length > 0 ? (
                    <div className="space-y-1">
                      {raidDashboard.members.slice(0, 10).map((m: any, i: number) => (
                        <div key={m.admission_no} className="flex items-center gap-2 text-sm">
                          <span className="w-5 text-center text-xs font-bold text-gray-400">{i + 1}</span>
                          <span className="flex-1 truncate">{m.display_name}</span>
                          <span className="font-mono text-xs">{m.total_damage}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">{t('bossRaid.noDamage')}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
