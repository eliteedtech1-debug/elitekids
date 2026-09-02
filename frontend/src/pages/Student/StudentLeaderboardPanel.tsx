import { useEffect, useState } from 'react';
import { Loader2, Trophy, Medal, Star, Crown, Sparkles } from 'lucide-react';
import { t } from '@/lib/i18n';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

/* FB-17 P2 — weekly Trophy Board: class top-10, my rank, badge shelf, free-week banner.
 * Privacy: server already sanitizes (first name + last initial, emoji avatar). */

interface BoardEntry {
  rank: number;
  display_name: string;
  avatar: string;
  points: number;
  attempts: number;
  medal: string | null;
}

interface MyStatus {
  ranked: boolean;
  points: number;
  attempts: number;
  rank: number | null;
  free_access_active?: boolean;
  free_access_until?: string | null;
  badge?: string | null;
}

interface BadgeRow {
  academic_year: string;
  term: string;
  week_number: number;
  position: number;
  badge: string;
  awarded_at: string;
}

const BADGE_EMOJI: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

/* ── Floating decoration for game feel ─────────────────────── */
function FloatingDeco({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute rounded-full blur-2xl opacity-20 ${className}`} />
  );
}

export default function StudentLeaderboardPanel() {
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [me, setMe] = useState<MyStatus | null>(null);
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get(ENDPOINTS.LEADERBOARD.BOARD).catch(() => ({ data: null })),
      apiClient.get(ENDPOINTS.LEADERBOARD.ME).catch(() => ({ data: null })),
      apiClient.get(ENDPOINTS.LEADERBOARD.BADGES).catch(() => ({ data: null })),
    ]).then(([b, m, g]) => {
      if (cancelled) return;
      setEntries(b.data?.data?.entries || []);
      setMe(m.data?.data || null);
      setBadges(g.data?.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-300/40 ring-2 ring-white/50">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-400">{t('student.leaderboard.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Free-week reward banner */}
      {me?.free_access_active && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-[#0F4D92]/20 bg-gradient-to-r from-[#0F4D92]/5 via-indigo-50 to-[#0d9488]/5 p-5 shadow-xl shadow-[#0F4D92]/10">
          <FloatingDeco className="-right-6 -top-6 h-24 w-24 bg-gradient-to-br from-[#0F4D92] to-indigo-400" />
          <FloatingDeco className="-left-4 -bottom-4 h-16 w-16 bg-gradient-to-br from-[#0d9488] to-teal-400" />
          <div className="relative flex items-center gap-4">
            <span className="text-4xl">🎁</span>
            <div>
              <p className="font-extrabold text-[#0F4D92]">{t('student.leaderboard.freeWeek')}</p>
              <p className="text-xs text-gray-500 font-medium">{t('student.leaderboard.freeWeekBody', { until: me.free_access_until ? t('student.leaderboard.freeWeekUntil', { date: new Date(me.free_access_until).toLocaleDateString() }) : '' })}</p>
            </div>
          </div>
        </div>
      )}

      {/* My weekly status — game-style gradient cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F4D92] to-[#0d9488] p-4 text-center text-white shadow-xl shadow-[#0F4D92]/30 group hover:scale-[1.04] transition-transform">
          <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-white/20 to-white/10" />
          <Crown className="mx-auto mb-1.5 h-5 w-5 drop-shadow-lg" />
          <div className="text-2xl font-black drop-shadow-sm">#{me?.rank ?? '—'}</div>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{t('student.leaderboard.myRank')}</p>
        </div>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-yellow-500 p-4 text-center text-white shadow-xl shadow-amber-300/30 group hover:scale-[1.04] transition-transform">
          <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-white/20 to-white/10" />
          <Star className="mx-auto mb-1.5 h-5 w-5 fill-white drop-shadow-lg" />
          <div className="text-2xl font-black drop-shadow-sm">{me?.points ?? 0}</div>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{t('student.leaderboard.weekPoints')}</p>
        </div>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d9488] to-emerald-500 p-4 text-center text-white shadow-xl shadow-[#0d9488]/30 group hover:scale-[1.04] transition-transform">
          <FloatingDeco className="-right-4 -top-4 h-16 w-16 bg-gradient-to-br from-white/20 to-white/10" />
          <Sparkles className="mx-auto mb-1.5 h-5 w-5 drop-shadow-lg" />
          <div className="text-2xl font-black drop-shadow-sm">{me?.attempts ?? 0}</div>
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{t('student.home.gamesPlayed')}</p>
        </div>
      </div>

      {/* Class board — game-style glassmorphism */}
      <div className="relative overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl shadow-[#0F4D92]/5">
        <FloatingDeco className="-right-6 -top-6 h-24 w-24 bg-gradient-to-br from-amber-300/20 to-orange-300/20" />
        <div className="relative flex items-center gap-2.5 border-b border-gray-100/80 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-300/30 ring-2 ring-white/50">
            <Trophy className="h-5 w-5 text-white drop-shadow" />
          </div>
          <h3 className="font-extrabold text-gray-800">{t('student.leaderboard.classChampions')}</h3>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400 font-medium">
            {t('student.leaderboard.empty')}
          </p>
        ) : (
          <ul>
            {entries.map((e, idx) => {
              const isMe = me?.rank != null && e.rank === me.rank;
              return (
                <li
                  key={e.rank}
                  className={`relative flex items-center gap-3.5 border-b border-gray-50/80 px-5 py-3.5 last:border-b-0 transition-all ${isMe ? 'bg-gradient-to-r from-[#0F4D92]/5 to-[#0d9488]/5' : 'hover:bg-gray-50/50'}`}
                >
                  {isMe && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#0F4D92] to-[#0d9488] rounded-r-full" />}
                  <span className="w-8 text-center text-lg font-bold">
                    {e.medal || <span className="text-gray-400">{e.rank}</span>}
                  </span>
                  <span className="text-xl">{e.avatar}</span>
                  <span className={`flex-1 truncate text-sm ${isMe ? 'font-extrabold bg-gradient-to-r from-[#0F4D92] to-[#0d9488] bg-clip-text text-transparent' : 'font-semibold text-gray-700'}`}>
                    {e.display_name}{isMe ? t('student.leaderboard.you') : ''}
                  </span>
                  <span className="rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-amber-200/40">
                    ⭐ {e.points}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Badge shelf — game-style glassmorphism */}
      <div className="relative overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl border border-white/60 p-5 shadow-xl shadow-amber-200/10">
        <FloatingDeco className="-right-6 -top-6 h-24 w-24 bg-gradient-to-br from-amber-300/15 to-orange-300/15" />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-300/30 ring-2 ring-white/50">
              <Medal className="h-5 w-5 text-white drop-shadow" />
            </div>
            <h3 className="font-extrabold text-gray-800">{t('student.leaderboard.badgeShelf')}</h3>
          </div>
          {badges.length === 0 ? (
            <p className="text-center text-sm text-gray-400 font-medium py-4">
              {t('student.leaderboard.badgeHint')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {badges.map((b, i) => (
                <div
                  key={`${b.week_number}-${b.position}-${i}`}
                  title={t('student.leaderboard.badgeTitle', { week: b.week_number, badge: b.badge })}
                  className="flex items-center gap-2 rounded-2xl border-2 border-amber-100 bg-gradient-to-r from-amber-50/80 to-orange-50/60 px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <span className="text-2xl">{BADGE_EMOJI[b.badge] || '🎖️'}</span>
                  <div className="leading-tight">
                    <p className="text-xs font-extrabold capitalize text-amber-700">{b.badge}</p>
                    <p className="text-[10px] text-gray-400 font-medium">{t('student.leaderboard.weekShort', { week: b.week_number })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="pb-2 text-center text-[11px] text-gray-400 font-medium">{t('student.leaderboard.footer')}</p>
    </div>
  );
}
