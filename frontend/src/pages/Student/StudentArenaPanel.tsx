import { useEffect, useState, useRef, useCallback } from 'react';
import { Swords, Trophy, Users, Zap, Crown, Medal, MessageCircle } from 'lucide-react';
import { playTap } from '@/lib/utils/sound';
import { playMilestone, playRopePull, playVictory } from '@/lib/game/sound-effects';
import { createMilestoneState, checkMilestone, getMilestoneEmoji, getMilestoneText, type MilestoneState } from '@/lib/game/milestones';
import { sendReaction, getActiveReactions, onReactions, COMPETITION_REACTIONS, type Reaction, type ReactionEmoji } from '@/lib/game/reactions';
import { deterministicAssign, type DiceRollResult } from '@/lib/game/dice-roll';
import { launchConfetti } from '@/lib/game/victory';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* ── Types ──────────────────────────────────────────────────── */

interface ArenaRow {
  adm: string;
  team: number | null;
  pts: number;
  plays: number;
  name: string;
  me: boolean;
}
interface TugData {
  active: true; comp_type: 'tug'; title: string;
  team_a: { name: string; pts: number; players: number; top: ArenaRow[] };
  team_b: { name: string; pts: number; players: number; top: ArenaRow[] };
  rope_pct: number; my_team: number | null; my_pts: number;
  enrolled: number; playing: number; ends_at: string; id?: string;
}
interface TrophyData {
  active: true; comp_type: 'trophy'; title: string;
  ranking: ArenaRow[]; my_rank: number | null; my_pts: number;
  enrolled: number; playing: number; ends_at: string; id?: string;
}

const PODIUM = ['🥇', '🥈', '🥉'];

/* ── Milestone Toast ────────────────────────────────────────── */

function MilestoneToast({ milestone, team }: { milestone: number; team: 'a' | 'b' }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce">
      <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-3 rounded-2xl shadow-2xl font-extrabold text-lg flex items-center gap-2">
        <span className="text-2xl">{getMilestoneEmoji(milestone as any)}</span>
        <span>{getMilestoneText(milestone as any, team === 'a' ? t('arena.teamA') : t('arena.teamB'))}</span>
      </div>
    </div>
  );
}

/* ── Reaction Bar ────────────────────────────────────────────── */

function ReactionBar({ compId }: { compId: string }) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    const unsub = onReactions((all) => setReactions(all));
    return unsub;
  }, []);

  const handleReact = (emoji: ReactionEmoji) => {
    playTap();
    sendReaction(compId, 'You', '', emoji);
  };

  return (
    <div className="flex items-center gap-1 mt-2">
      <MessageCircle className="h-3 w-3 text-gray-400" />
      {COMPETITION_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleReact(emoji)}
          className="text-lg hover:scale-125 transition-transform active:scale-90"
          title={t('arena.reactWith', { emoji })}
        >
          {emoji}
        </button>
      ))}
      {/* Floating reactions */}
      {reactions.slice(-5).map((r) => (
        <span
          key={r.id}
          className="absolute text-2xl animate-float-up pointer-events-none"
          style={{ left: `${30 + Math.random() * 40}%`, animation: 'float-up 2s ease-out forwards' }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

/* ── Dice Roll Animation ─────────────────────────────────────── */

function DiceRollOverlay({ result, onDone }: { result: DiceRollResult | null; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [assignments, setAssignments] = useState<{ adm: string; team: 'A' | 'B' }[]>([]);

  useEffect(() => {
    if (!result) return;
    const entries = Array.from(result.assignments.entries());
    let i = 0;
    const interval = setInterval(() => {
      if (i < entries.length) {
        setAssignments((prev) => [...prev, { adm: entries[i][0], team: entries[i][1] }]);
        playTap();
        i++;
      } else {
        clearInterval(interval);
        setTimeout(onDone, 1500);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [result, onDone]);

  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-xl font-extrabold text-center mb-4">{t('arena.rollingTeams')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-purple-700">{result.teamA}</div>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-green-700">{result.teamB}</div>
          </div>
        </div>
        <div className="mt-4 max-h-40 overflow-y-auto space-y-1">
          {assignments.map((a, i) => (
            <div
              key={a.adm}
              className={`flex items-center justify-between px-3 py-1 rounded-lg text-sm font-medium animate-slide-in ${
                a.team === 'A' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span>{a.adm.slice(0, 3)}***</span>
              <span className="text-xs font-bold">{a.team === 'A' ? result.teamA : result.teamB}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */

export default function StudentArenaPanel({ onGoPlay }: { onGoPlay?: () => void }) {
  const [data, setData] = useState<TugData | TrophyData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [milestoneState, setMilestoneState] = useState<MilestoneState>(createMilestoneState());
  const [firedMilestone, setFiredMilestone] = useState<{ milestone: number; team: 'a' | 'b' } | null>(null);
  const [diceResult, setDiceResult] = useState<DiceRollResult | null>(null);
  const prevRopePct = useRef<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await apiClient.get(ENDPOINTS.ARENA.ACTIVE);
      const newData = res.data?.data || null;
      setData(newData);

      // Check milestones for tug-of-war
      if (newData?.comp_type === 'tug' && newData.rope_pct !== undefined) {
        const prev = prevRopePct.current;
        if (prev !== null && prev !== newData.rope_pct) {
          const hit = checkMilestone(newData.rope_pct, milestoneState);
          if (hit) {
            setFiredMilestone(hit);
            playMilestone();
            // Victory if rope reaches 0% or 100%
            if (newData.rope_pct <= 0 || newData.rope_pct >= 100) {
              playVictory();
              try { launchConfetti(document.body, 4000); } catch {}
            }
          }
        }
        prevRopePct.current = newData.rope_pct;
      }
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, [milestoneState]);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  // Clear milestone toast after 3s
  useEffect(() => {
    if (firedMilestone) {
      const t = setTimeout(() => setFiredMilestone(null), 3000);
      return () => clearTimeout(t);
    }
  }, [firedMilestone]);

  if (!loaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="animate-game-pulse text-sm text-gray-400">{t('arena.warmingUp')}</div>
      </div>
    );
  }

  if (!data || !data.active) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-8 text-center">
        <Swords className="mb-4 h-14 w-14 text-gray-300" />
        <p className="text-base font-bold text-gray-600">{t('arena.none')}</p>
        <p className="mt-2 text-sm text-gray-400">{t('arena.noneHint')}</p>
      </div>
    );
  }

  const hoursLeft = Math.max(0, Math.round((new Date(data.ends_at).getTime() - Date.now()) / 3600000));
  const compId = (data as any).id || 'arena';

  /* ── TUG-OF-WAR ─────────────────────────────────────────── */
  if (data.comp_type === 'tug') {
    const d = data as TugData;
    const behind = d.my_team !== null && ((d.my_team === 0 && d.rope_pct < 50) || (d.my_team === 1 && d.rope_pct > 50));
    const tied = d.rope_pct === 50;
    return (
      <div className="mx-auto max-w-md px-4 py-4 relative">
        {firedMilestone && <MilestoneToast milestone={firedMilestone.milestone} team={firedMilestone.team} />}
        {diceResult && <DiceRollOverlay result={diceResult} onDone={() => setDiceResult(null)} />}

        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-gray-800">
            <Swords className="h-5 w-5 text-orange-500" /> {d.title}
          </h2>
          <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-600">{t('arena.hoursLeft', { hours: hoursLeft })}</span>
        </div>

        {/* Scoreboard */}
        <div className="mb-2 flex items-end justify-between px-1">
          <TeamBadge team={d.team_a} side="a" mine={d.my_team === 0} />
          <div className="pb-1 text-center text-[11px] font-semibold text-gray-400">
            <Users className="mr-0.5 inline h-3 w-3" />
            {t('arena.pulling', { playing: d.playing, enrolled: d.enrolled })}
          </div>
          <TeamBadge team={d.team_b} side="b" mine={d.my_team === 1} />
        </div>

        {/* The rope — enhanced with gradient animation */}
        <div className="relative mb-4 h-12 overflow-hidden rounded-full border-4 border-white bg-gradient-to-r from-purple-400 via-red-300 to-green-400 shadow-inner">
          {/* knot slides toward the stronger team */}
          <div
            className="absolute inset-y-0 z-10 w-2 -translate-x-1/2 bg-[#5B3A1E] shadow-md transition-all duration-1000 ease-out"
            style={{ left: `${d.rope_pct}%` }}
          >
            <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#7A4F28] bg-[#C68B59]" />
          </div>
          {/* Milestone markers */}
          {[25, 50, 75].map((m) => (
            <div
              key={m}
              className="absolute top-0 bottom-0 w-0.5 bg-white/50"
              style={{ left: `${m}%` }}
            >
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-white/70 font-bold">{m}%</span>
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 left-0 flex w-1/2 flex-col justify-center pl-3">
            <span className="text-xl">{d.team_a.name.split(' ')[0] === '🦁' ? '🦁' : '💪'}</span>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1/2 flex-col items-end justify-center pr-3">
            <span className="text-xl">{d.team_b.name.startsWith('🦅') ? '🦅' : '🔥'}</span>
          </div>
        </div>

        {/* Motivation */}
        <div className={`mb-4 rounded-2xl p-4 text-center font-extrabold ${behind ? 'bg-red-50 text-red-600' : tied ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>
          {d.my_team === null ? (
            <>{t('arena.motivation.notInTeam')}</>
          ) : behind ? (
            <>{t('arena.motivation.behind')}</>
          ) : tied ? (
            <>{t('arena.motivation.tied')}</>
          ) : (
            <>{t('arena.motivation.winning')}</>
          )}
        </div>

        {/* Reactions */}
        <ReactionBar compId={compId} />

        {/* Top pullers each side */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <PullerList rows={d.team_a.top} color="purple" />
          <PullerList rows={d.team_b.top} color="green" />
        </div>

        <button
          onClick={() => { playTap(); onGoPlay?.(); }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 to-orange-500 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <Zap className="h-5 w-5" /> {t('arena.playPull')}
        </button>
        {d.my_pts > 0 && (
          <p className="mt-2 text-center text-xs font-semibold text-gray-500">{t('arena.pulledPts', { pts: d.my_pts })}</p>
        )}
      </div>
    );
  }

  /* ── TROPHY RACE ────────────────────────────────────────── */
  const trophy = data as TrophyData;
  const top3 = trophy.ranking.slice(0, 3);
  const rest = trophy.ranking.slice(3);
  return (
    <div className="mx-auto max-w-md px-4 py-4 relative">
      {diceResult && <DiceRollOverlay result={diceResult} onDone={() => setDiceResult(null)} />}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-gray-800">
          <Trophy className="h-5 w-5 text-amber-500" /> {trophy.title}
        </h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-600">{t('arena.hoursLeft', { hours: hoursLeft })}</span>
      </div>

      {/* Podium */}
      <div className="mb-4 grid grid-cols-3 items-end gap-2">
        {[1, 0, 2].map((slot) => {
          const r = top3[slot];
          const h = slot === 0 ? 'h-24' : slot === 1 ? 'h-20' : 'h-16';
          return (
            <div key={slot} className={`flex ${h} flex-col items-center justify-end rounded-t-2xl ${r?.me ? 'bg-gradient-to-b from-amber-200 to-amber-100 ring-4 ring-amber-400' : 'bg-gradient-to-b from-blue-50 to-blue-100'} pb-2`}>
              <span className="text-2xl">{PODIUM[slot]}</span>
              <span className="max-w-full truncate px-1 text-[11px] font-bold text-gray-700">{r ? r.name : '—'}</span>
              <span className="text-[10px] font-semibold text-gray-500">{r ? t('arena.pts', { pts: r.pts }) : ''}</span>
            </div>
          );
        })}
      </div>

      {/* Rest of ranking */}
      {rest.length > 0 && (
        <div className="mb-4 divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {rest.map((r, i) => (
            <div key={r.adm} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${r.me ? 'bg-amber-50/70 font-bold' : ''}`}>
              <span className="w-6 text-center text-xs font-extrabold text-gray-400">{i + 4}</span>
              <Medal className="h-3.5 w-3.5 text-gray-300" />
              <span className="min-w-0 flex-1 truncate">{r.name}{r.me ? t('student.leaderboard.you') : ''}</span>
              <span className="font-bold text-[#0F4D92]">{r.pts}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 rounded-2xl bg-white p-4 text-center shadow-sm">
        {trophy.my_rank ? (
          <p className="text-sm font-bold text-gray-700">
            <Crown className="mr-1 inline h-4 w-4 text-amber-500" />
            {t('arena.myRank', { rank: trophy.my_rank, pts: trophy.my_pts })}
          </p>
        ) : (
          <p className="text-sm font-bold text-gray-600">{t('arena.raceOn')}</p>
        )}
        <p className="mt-1 text-[11px] text-gray-400"><Users className="mr-0.5 inline h-3 w-3" />{t('arena.racing', { playing: trophy.playing, enrolled: trophy.enrolled })}</p>
      </div>

      {/* Reactions */}
      <ReactionBar compId={compId} />

      <button
        onClick={() => { playTap(); onGoPlay?.(); }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <Zap className="h-5 w-5" /> {t('arena.playClimb')}
      </button>
    </div>
  );
}

function TeamBadge({ team, side, mine }: { team: { name: string; pts: number; players: number }; side: 'a' | 'b'; mine: boolean }) {
  const emoji = team.name.match(/^\p{Emoji}+/u)?.[0] || '';
  return (
    <div className={`rounded-xl px-2.5 py-1.5 text-left ${mine ? 'ring-4 ring-amber-300' : ''} ${side === 'a' ? 'bg-purple-50' : 'bg-green-50 text-right'}`}>
      <div className={`flex items-center gap-1 ${side === 'b' ? 'justify-end' : ''}`}>
        <span className="text-lg">{emoji}</span>
        <span className="text-[11px] font-extrabold text-gray-700">{team.name.replace(/^\p{Emoji}+\s*/u, '')}{mine ? t('arena.youBang') : ''}</span>
      </div>
      <div className={`text-xl font-black ${side === 'a' ? 'text-purple-600' : 'text-green-600'}`}>{team.pts}</div>
      <div className="text-[10px] font-medium text-gray-400">{t('arena.kids', { count: team.players })}</div>
    </div>
  );
}

function PullerList({ rows, color }: { rows: ArenaRow[]; color: 'purple' | 'green' }) {
  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-sm ${color === 'purple' ? 'border-purple-100' : 'border-green-100'} border`}>
      <div className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide ${color === 'purple' ? 'bg-purple-50 text-purple-500' : 'bg-green-50 text-green-600'}`}>
        {t('arena.topPullers')}
      </div>
      {rows.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">{t('arena.noPulls')}</div>}
      {rows.map((r) => (
        <div key={r.adm} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${r.me ? 'bg-amber-50 font-bold' : ''}`}>
          <span className="min-w-0 flex-1 truncate text-gray-700">{r.name}{r.me ? ' ⭐' : ''}</span>
          <span className="font-extrabold text-gray-800">{r.pts}</span>
        </div>
      ))}
    </div>
  );
}
