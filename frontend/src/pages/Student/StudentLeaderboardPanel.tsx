import { useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
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
      <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('student.leaderboard.loading')}
      </div>
    );
  }

  return (
    <div className="animate-game-slide-up space-y-4">
      {/* Free-week reward banner */}
      {me?.free_access_active && (
        <div className="flex items-center gap-3 rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-4 shadow-sm animate-game-pop">
          <span className="text-3xl">🎁</span>
          <div>
            <p className="font-bold text-purple-700">{t('student.leaderboard.freeWeek')}</p>
            <p className="text-xs text-purple-500">{t('student.leaderboard.freeWeekBody', { until: me.free_access_until ? t('student.leaderboard.freeWeekUntil', { date: new Date(me.free_access_until).toLocaleDateString() }) : '' })}</p>
          </div>
        </div>
      )}

      {/* My weekly status */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-center">
          <div className="text-2xl font-bold text-[#0F4D92]">#{me?.rank ?? '—'}</div>
          <p className="text-xs text-gray-500">{t('student.leaderboard.myRank')}</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-amber-500">{me?.points ?? 0}</div>
          <p className="text-xs text-gray-500">{t('student.leaderboard.weekPoints')}</p>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{me?.attempts ?? 0}</div>
          <p className="text-xs text-gray-500">{t('student.home.gamesPlayed')}</p>
        </div>
      </div>

      {/* Class board */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="font-bold text-gray-800">{t('student.leaderboard.classChampions')}</h3>
        </div>
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {t('student.leaderboard.empty')}
          </p>
        ) : (
          <ul>
            {entries.map((e) => {
              const isMe = me?.rank != null && e.rank === me.rank;
              return (
                <li
                  key={e.rank}
                  className={`flex items-center gap-3 border-b border-gray-50 px-4 py-2.5 last:border-b-0 ${isMe ? 'bg-[#0F4D92]/5' : ''}`}
                >
                  <span className="w-7 text-center text-lg font-bold text-gray-600">
                    {e.medal || e.rank}
                  </span>
                  <span className="text-xl">{e.avatar}</span>
                  <span className={`flex-1 truncate text-sm ${isMe ? 'font-extrabold text-[#0F4D92]' : 'font-semibold text-gray-700'}`}>
                    {e.display_name}{isMe ? t('student.leaderboard.you') : ''}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-600">
                    ⭐ {e.points}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Badge shelf */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-bold text-gray-800">{t('student.leaderboard.badgeShelf')}</h3>
        {badges.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            {t('student.leaderboard.badgeHint')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map((b, i) => (
              <div
                key={`${b.week_number}-${b.position}-${i}`}
                title={t('student.leaderboard.badgeTitle', { week: b.week_number, badge: b.badge })}
                className="flex items-center gap-1.5 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2"
              >
                <span className="text-xl">{BADGE_EMOJI[b.badge] || '🎖️'}</span>
                <div className="leading-tight">
                  <p className="text-xs font-bold capitalize text-amber-700">{b.badge}</p>
                  <p className="text-[10px] text-gray-400">{t('student.leaderboard.weekShort', { week: b.week_number })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="pb-2 text-center text-[11px] text-gray-400">{t('student.leaderboard.footer')}</p>
    </div>
  );
}
