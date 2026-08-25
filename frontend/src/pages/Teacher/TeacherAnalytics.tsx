import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Users,
  Gamepad2,
  Trophy,
  AlertTriangle,
  TrendingUp,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import AdminNav from '@/components/AdminNav';

/* ── Types ────────────────────────────────────────────── */

interface Overview {
  total_students: number;
  active_this_week: number;
  games_played_this_week: number;
  avg_score_this_week: number;
  excellent_games_this_week: number;
  active_classes: number;
  total_points: number;
}

interface ClassRow {
  class_code: string;
  games_played: number;
  active_students: number;
  avg_score: number;
  excellent_games: number;
  first_play: string;
  last_play: string;
}

interface StrugglingRow {
  child_admission_no: string;
  student_name: string;
  surname: string;
  class_code: string;
  games_played: number;
  avg_score: number;
  worst_score: number;
  last_played: string;
  days_inactive: number;
}

interface GameRow {
  lesson_id: string;
  title: string;
  subject: string;
  times_played: number;
  unique_students: number;
  avg_score: number;
  best_score: number;
  worst_score: number;
}

interface LeaderboardRow {
  child_admission_no: string;
  student_name: string;
  surname: string;
  class_code: string;
  games_played: number;
  avg_score: number;
  excellent_games: number;
}

/* ── Stat Card ──────────────────────────────────────── */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

/* ── Tab Button ──────────────────────────────────────── */

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-[#0F4D92] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

/* ── Main Component ──────────────────────────────────── */

export default function TeacherAnalytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [struggling, setStruggling] = useState<StrugglingRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'classes' | 'struggling' | 'games' | 'leaderboard'>('overview');
  const [lbPeriod, setLbPeriod] = useState<'week' | 'month' | 'all'>('week');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, clRes, stRes, gaRes, lbRes] = await Promise.all([
        apiClient.get(ENDPOINTS.ANALYTICS.OVERVIEW),
        apiClient.get(ENDPOINTS.ANALYTICS.CLASSES),
        apiClient.get(ENDPOINTS.ANALYTICS.STRUGGLING),
        apiClient.get(ENDPOINTS.ANALYTICS.GAMES),
        apiClient.get(`${ENDPOINTS.ANALYTICS.LEADERBOARD}?period=${lbPeriod}`),
      ]);
      setOverview(ovRes.data?.data || null);
      setClasses(clRes.data?.data || []);
      setStruggling(stRes.data?.data || []);
      setGames(gaRes.data?.data || []);
      setLeaderboard(lbRes.data?.data || []);
    } catch {
      // errors silent — cards show 0
    } finally {
      setLoading(false);
    }
  }, [lbPeriod]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const ov = overview || { total_students: 0, active_this_week: 0, games_played_this_week: 0, avg_score_this_week: 0, excellent_games_this_week: 0, active_classes: 0, total_points: 0 };

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Analytics</h1>
            <p className="text-sm text-gray-500">School-wide performance insights.</p>
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#0F4D92]/20 px-3 py-1.5 text-sm font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Users className="h-5 w-5 text-[#0F4D92]" />} label="Total Students" value={ov.total_students} color="bg-[#0F4D92]/10" />
          <StatCard icon={<Gamepad2 className="h-5 w-5 text-green-600" />} label="Games This Week" value={ov.games_played_this_week} color="bg-green-100" />
          <StatCard icon={<TrendingUp className="h-5 w-5 text-amber-600" />} label="Avg Score" value={`${ov.avg_score_this_week}%`} color="bg-amber-100" />
          <StatCard icon={<Trophy className="h-5 w-5 text-purple-600" />} label="Total Points" value={ov.total_points.toLocaleString()} color="bg-purple-100" />
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabBtn>
          <TabBtn active={tab === 'classes'} onClick={() => setTab('classes')}>Classes</TabBtn>
          <TabBtn active={tab === 'struggling'} onClick={() => setTab('struggling')}>Needs Help</TabBtn>
          <TabBtn active={tab === 'games'} onClick={() => setTab('games')}>Games</TabBtn>
          <TabBtn active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>Leaderboard</TabBtn>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading analytics…
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {/* ── Overview Tab ── */}
            {tab === 'overview' && (
              <div className="space-y-4">
                <h2 className="font-semibold text-gray-800">This Week at a Glance</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#0F4D92]/5 p-4 text-center">
                    <p className="text-3xl font-bold text-[#0F4D92]">{ov.active_this_week}</p>
                    <p className="text-xs text-gray-500">Active Students</p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-4 text-center">
                    <p className="text-3xl font-bold text-green-600">{ov.excellent_games_this_week}</p>
                    <p className="text-xs text-gray-500">Excellent Games (≥80%)</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-4 text-center">
                    <p className="text-3xl font-bold text-amber-600">{ov.active_classes}</p>
                    <p className="text-xs text-gray-500">Active Classes</p>
                  </div>
                </div>
                {/* Top games quick list */}
                {games.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">Most Played Games</h3>
                    <div className="space-y-2">
                      {games.slice(0, 5).map((g) => (
                        <div key={g.lesson_id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
                            <Gamepad2 className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">{g.title}</p>
                            <p className="text-[11px] text-gray-500">{g.subject} · {g.times_played} plays</p>
                          </div>
                          <span className="text-sm font-bold text-gray-700">{g.avg_score}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Classes Tab ── */}
            {tab === 'classes' && (
              <div>
                <h2 className="mb-3 font-semibold text-gray-800">Class Comparison</h2>
                {classes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No class data yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs font-medium uppercase text-gray-500">
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2 text-right">Students</th>
                          <th className="px-3 py-2 text-right">Games</th>
                          <th className="px-3 py-2 text-right">Avg Score</th>
                          <th className="px-3 py-2 text-right">Excellent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classes.map((c) => (
                          <tr key={c.class_code} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-3 py-2.5 font-medium text-gray-800">{c.class_code}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{c.active_students}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{c.games_played}</td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`font-semibold ${c.avg_score >= 80 ? 'text-green-600' : c.avg_score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                {c.avg_score}%
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{c.excellent_games}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Struggling Tab ── */}
            {tab === 'struggling' && (
              <div>
                <h2 className="mb-1 font-semibold text-gray-800">Students Needing Help</h2>
                <p className="mb-3 text-xs text-gray-500">Avg score below 50% or inactive for 7+ days.</p>
                {struggling.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No struggling students — great job!</p>
                ) : (
                  <div className="space-y-2">
                    {struggling.map((s) => (
                      <div key={s.child_admission_no} className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/30 p-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800">{s.student_name} {s.surname}</p>
                          <p className="text-[11px] text-gray-500">
                            {s.class_code} · {s.games_played} games · {s.days_inactive}d inactive
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${s.avg_score < 30 ? 'text-red-600' : 'text-amber-600'}`}>
                          {s.avg_score}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Games Tab ── */}
            {tab === 'games' && (
              <div>
                <h2 className="mb-3 font-semibold text-gray-800">Game Engagement</h2>
                {games.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No game data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {games.map((g) => (
                      <div key={g.lesson_id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                          <Gamepad2 className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{g.title}</p>
                          <p className="text-[11px] text-gray-500">
                            {g.subject} · {g.times_played} plays · {g.unique_students} students
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-700">{g.avg_score}%</p>
                          <p className="text-[10px] text-gray-400">best {g.best_score}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Leaderboard Tab ── */}
            {tab === 'leaderboard' && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">Top Performers</h2>
                  <div className="flex gap-1">
                    {(['week', 'month', 'all'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setLbPeriod(p)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                          lbPeriod === p ? 'bg-[#0F4D92] text-white' : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {p === 'all' ? 'All Time' : p === 'week' ? 'This Week' : 'This Month'}
                      </button>
                    ))}
                  </div>
                </div>
                {leaderboard.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No leaderboard data for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs font-medium uppercase text-gray-500">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2 text-right">Games</th>
                          <th className="px-3 py-2 text-right">Avg Score</th>
                          <th className="px-3 py-2 text-right">Excellent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((lb, i) => (
                          <tr key={lb.child_admission_no} className="border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'text-gray-400'
                              }`}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-800">{lb.student_name} {lb.surname}</td>
                            <td className="px-3 py-2.5 text-gray-500">{lb.class_code}</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{lb.games_played}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-gray-700">{lb.avg_score}%</td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{lb.excellent_games}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
