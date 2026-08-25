import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Baby,
  BookOpen,
  Gamepad2,
  Link2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Star,
  Zap,
  Trophy,
  RotateCcw,
  Eye,
  BarChart3,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { STORAGE_KEYS } from '@/lib/utils/constants';

/* ── Types ────────────────────────────────────────────── */

interface GameStat {
  times_played: number;
  best_score: number;
  avg_score: number;
  total_stars: number;
}

interface ProgressSummary {
  total_xp: number;
  total_stars: number;
  games_completed: number;
  game_stats?: Record<string, GameStat>;
  badges?: { badge_name: string; badge_emoji: string; awarded_at: string }[];
}

interface Child {
  id: string;
  admission_no: string;
  school_id: string;
  branch_id: string | null;
  full_name: string;
  age_level: string;
  class_code: string | null;
  avatar_url?: string | null;
  parent_user_id: string | null;
  status: string;
  progress?: ProgressSummary;
}

interface LessonActivity {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  created_at: string;
  has_games: boolean;
  has_scenes: boolean;
}

interface ChildActivity {
  child: {
    id: string;
    admission_no: string;
    full_name: string;
    age_level: string;
    class_code: string | null;
    avatar_url?: string | null;
    status: string;
  };
  progress: ProgressSummary;
  lessons: LessonActivity[];
  total_published: number;
}

/* ── Helpers ──────────────────────────────────────────── */

const AVATAR_COLORS = ['bg-[#0F4D92]', 'bg-emerald-600', 'bg-amber-500', 'bg-rose-500', 'bg-violet-600'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function colorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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

export default function ParentChildren() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'children' | 'activities' | 'manage'>('children');
  const [children, setChildren] = useState<Child[]>([]);
  const [activities, setActivities] = useState<ChildActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkAdmission, setLinkAdmission] = useState('');
  const [linking, setLinking] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: '', age_level: 'Creche', admission_no: '' });
  const [creating, setCreating] = useState(false);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(ENDPOINTS.CHILDREN.LIST);
      const list: Child[] = res.data?.data || [];
      const withProgress = await Promise.all(
        list.map(async (child) => {
          try {
            const progRes = await apiClient.get(ENDPOINTS.PROGRESS.CHILD(child.admission_no));
            return { ...child, progress: progRes.data?.data };
          } catch {
            return child;
          }
        })
      );
      setChildren(withProgress);
    } catch (err: any) {
      setError(err?.message || 'Unable to load your children.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivities = useCallback(async () => {
    try {
      const res = await apiClient.get('/kids/parent/activities');
      setActivities(res.data?.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadChildren();
    loadActivities();
  }, [loadChildren, loadActivities]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const admission_no = linkAdmission.trim();
    if (!admission_no) return;
    setLinking(true);
    try {
      const res = await apiClient.post(ENDPOINTS.CHILDREN.LINK, { admission_no });
      toast.success(res.data?.message || 'Child linked!');
      setLinkAdmission('');
      setTab('children');
      await loadChildren();
      await loadActivities();
    } catch (err: any) {
      toast.error(err?.message || 'Could not link this child.');
    } finally {
      setLinking(false);
    }
  };

  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.full_name.trim()) return;
    setCreating(true);
    try {
      const res = await apiClient.post(ENDPOINTS.CHILDREN.CREATE_FOR_PARENT, createForm);
      toast.success(res.data?.data?.full_name + ' added!');
      setCreateForm({ full_name: '', age_level: 'Creche', admission_no: '' });
      setShowCreate(false);
      setTab('children');
      await loadChildren();
      await loadActivities();
    } catch (err: any) {
      toast.error(err?.message || 'Could not create child.');
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    toast.success('Signed out');
    navigate('/login');
  }, [navigate]);

  const progressOf = (child: Child): ProgressSummary => child.progress || { total_xp: 0, total_stars: 0, games_completed: 0 };

  // Summary stats across all children
  const totalStars = children.reduce((sum, c) => sum + (progressOf(c).total_stars || 0), 0);
  const totalXp = children.reduce((sum, c) => sum + (progressOf(c).total_xp || 0), 0);
  const totalGames = children.reduce((sum, c) => sum + (progressOf(c).games_completed || 0), 0);

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      {/* Header */}
      <header className="border-b border-[#0F4D92]/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Elite Kids" className="h-10 w-10 rounded-full object-contain" />
            <div>
              <h1 className="text-lg font-bold leading-tight text-[#0F4D92]">Elite Kids</h1>
              <p className="text-xs text-gray-500">Parent Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Summary strip */}
        {children.length > 0 && (
          <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-amber-500">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> {totalStars}
              </div>
              <p className="text-[10px] text-gray-500">Total Stars</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-[#0F4D92]">
                <Zap className="h-5 w-5" /> {totalXp}
              </div>
              <p className="text-[10px] text-gray-500">Total XP</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-2xl font-bold text-gray-700">
                <Gamepad2 className="h-5 w-5" /> {totalGames}
              </div>
              <p className="text-[10px] text-gray-500">Games Played</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
          <TabBtn active={tab === 'children'} onClick={() => setTab('children')}>
            <Baby className="mr-1 inline h-4 w-4" /> Children
          </TabBtn>
          <TabBtn active={tab === 'activities'} onClick={() => setTab('activities')}>
            <BookOpen className="mr-1 inline h-4 w-4" /> Activities
          </TabBtn>
          <TabBtn active={tab === 'manage'} onClick={() => setTab('manage')}>
            <Plus className="mr-1 inline h-4 w-4" /> Link / Add
          </TabBtn>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* ── Children Tab ── */}
            {tab === 'children' && (
              <div>
                {children.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#0F4D92]/30 bg-white p-10 text-center">
                    <Baby className="mx-auto mb-3 h-10 w-10 text-[#0F4D92]/40" />
                    <h3 className="font-semibold text-gray-700">No children linked yet</h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                      Go to <strong>Link / Add</strong> to link a child by admission number or create a new profile.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {children.map((child) => {
                      const progress = progressOf(child);
                      const inactive = String(child.status || '').toLowerCase() !== 'active';
                      return (
                        <div
                          key={child.id}
                          className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm transition hover:shadow-md"
                        >
                          <div className="flex items-start gap-3">
                            {child.avatar_url ? (
                              <img src={child.avatar_url} alt={child.full_name} className="h-12 w-12 rounded-full object-cover" />
                            ) : (
                              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${colorFor(child.full_name)}`}>
                                {initials(child.full_name)}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="flex items-center gap-2 truncate font-semibold text-gray-800">
                                {child.full_name}
                                {inactive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Inactive</span>}
                              </h3>
                              <p className="text-xs text-gray-500">
                                {child.age_level}{child.class_code ? ` · ${child.class_code}` : ''} · {child.admission_no}
                              </p>
                            </div>
                          </div>

                          {/* Progress strip */}
                          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#0F4D92]/5 p-3">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-lg font-bold text-amber-500">
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />{progress.total_stars}
                              </div>
                              <p className="text-[11px] text-gray-500">Stars</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-lg font-bold text-[#0F4D92]">
                                <Zap className="h-4 w-4" />{progress.total_xp}
                              </div>
                              <p className="text-[11px] text-gray-500">XP</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-lg font-bold text-gray-700">
                                <Gamepad2 className="h-4 w-4" />{progress.games_completed}
                              </div>
                              <p className="text-[11px] text-gray-500">Games</p>
                            </div>
                          </div>

                          {/* Per-game breakdown */}
                          {progress.game_stats && Object.keys(progress.game_stats).length > 0 && (
                            <div className="mt-4">
                              <h4 className="mb-2 text-sm font-semibold text-gray-700">Game Progress</h4>
                              <div className="space-y-2">
                                {Object.entries(progress.game_stats).map(([lessonId, stat]) => {
                                  const prettyName = lessonId
                                    .replace(/^global-/, '')
                                    .replace(/-\d+$/, '')
                                    .replace(/-/g, ' ')
                                    .replace(/\b\w/g, (c) => c.toUpperCase());
                                  return (
                                    <div key={lessonId} className="flex items-center gap-3 rounded-xl border border-[#0F4D92]/5 bg-[#0F4D92]/[0.02] p-3">
                                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
                                        <Gamepad2 className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-800">{prettyName}</p>
                                        <div className="flex items-center gap-3 text-[11px] text-gray-500">
                                          <span className="flex items-center gap-1">
                                            <RotateCcw className="h-3 w-3" />
                                            {stat.times_played} play{stat.times_played !== 1 ? 's' : ''}
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <Trophy className="h-3 w-3" />
                                            Best: {stat.best_score}
                                          </span>
                                          <span>Avg: {stat.avg_score}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 rounded-full bg-amber-50 px-2 py-1">
                                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                        <span className="text-sm font-bold text-amber-600">{stat.total_stars}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {progress.games_completed === 0 && (
                            <p className="mt-3 text-center text-xs text-gray-400">No games played yet.</p>
                          )}

                          {/* Badges */}
                          {progress.badges && progress.badges.length > 0 && (
                            <div className="mt-4">
                              <h4 className="mb-2 text-sm font-semibold text-gray-700">Badges Earned</h4>
                              <div className="flex flex-wrap gap-2">
                                {progress.badges.map((b, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                                    {b.badge_emoji} {b.badge_name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Activities Tab ── */}
            {tab === 'activities' && (
              <div>
                {activities.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#0F4D92]/30 bg-white p-10 text-center">
                    <BookOpen className="mx-auto mb-3 h-10 w-10 text-[#0F4D92]/40" />
                    <h3 className="font-semibold text-gray-700">No activities yet</h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                      Published lessons and games will appear here once your children have content to play.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {activities.map((item) => {
                      const child = item.child;
                      const inactive = String(child.status || '').toLowerCase() !== 'active';
                      return (
                        <div key={child.id} className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm">
                          <div className="flex items-start gap-3">
                            {child.avatar_url ? (
                              <img src={child.avatar_url} alt={child.full_name} className="h-12 w-12 rounded-full object-cover" />
                            ) : (
                              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${colorFor(child.full_name)}`}>
                                {initials(child.full_name)}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <h3 className="flex items-center gap-2 truncate font-semibold text-gray-800">
                                {child.full_name}
                                {inactive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Inactive</span>}
                              </h3>
                              <p className="text-xs text-gray-500">
                                {child.age_level}{child.class_code ? ` · ${child.class_code}` : ''} · {child.admission_no}
                              </p>
                            </div>
                          </div>

                          {/* Published lessons */}
                          <div className="mt-4">
                            <h4 className="mb-2 text-sm font-semibold text-gray-700">
                              Published Lessons ({item.total_published})
                            </h4>
                            {item.lessons.length === 0 ? (
                              <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-400 text-center">No published lessons yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {item.lessons.map((lesson) => (
                                  <div key={lesson.id} className="flex items-center gap-3 rounded-xl border border-[#0F4D92]/5 bg-[#0F4D92]/[0.02] p-3 transition hover:bg-[#0F4D92]/[0.04]">
                                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F4D92]/10 text-[#0F4D92]">
                                      {lesson.lesson_type === 'game' ? <Gamepad2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-gray-800">{lesson.title}</p>
                                      <p className="text-[11px] text-gray-500">
                                        {lesson.subject} · {lesson.age_level}
                                        {lesson.has_games && lesson.has_scenes && ' · Interactive'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {lesson.has_games && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">Game</span>}
                                      {lesson.has_scenes && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Scenes</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            Your child can play these games from their own account.
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Link / Add Tab ── */}
            {tab === 'manage' && (
              <div className="space-y-4">
                {/* Link a child */}
                <div className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F4D92]/10 text-[#0F4D92]">
                      <Link2 className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-800">Link a child</h3>
                      <p className="text-xs text-gray-500">Enter the child's admission number from your school.</p>
                    </div>
                  </div>
                  <form onSubmit={handleLink} className="flex flex-col gap-2 sm:flex-row">
                    <input
                      name="admission_no"
                      value={linkAdmission}
                      onChange={(e) => setLinkAdmission(e.target.value)}
                      placeholder="e.g. NUR-001"
                      required
                      className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={linking || !linkAdmission.trim()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F4D92] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b3d76] disabled:opacity-50"
                    >
                      {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      {linking ? 'Linking…' : 'Link child'}
                    </button>
                  </form>
                </div>

                {/* Create a new child */}
                <div className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                      <Plus className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-800">Add a new child</h3>
                      <p className="text-xs text-gray-500">Create a profile for your child to start playing games.</p>
                    </div>
                  </div>
                  {!showCreate ? (
                    <button onClick={() => setShowCreate(true)}
                      className="w-full rounded-xl border-2 border-dashed border-emerald-300 py-3 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50">
                      <Plus className="mr-1 inline h-4 w-4" /> Create Child Profile
                    </button>
                  ) : (
                    <form onSubmit={handleCreateChild} className="space-y-3">
                      <input name="full_name" value={createForm.full_name} onChange={(e) => setCreateForm(p => ({ ...p, full_name: e.target.value }))}
                        placeholder="Child's full name" required
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none" />
                      <select name="age_level" value={createForm.age_level} onChange={(e) => setCreateForm(p => ({ ...p, age_level: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none">
                        <option value="Creche">Creche (0-2 years)</option>
                        <option value="Nursery">Nursery (3-4 years)</option>
                        <option value="KG1">KG1 (4-5 years)</option>
                        <option value="KG2">KG2 (5-6 years)</option>
                        <option value="Primary">Primary (6+ years)</option>
                      </select>
                      <input name="admission_no" value={createForm.admission_no} onChange={(e) => setCreateForm(p => ({ ...p, admission_no: e.target.value }))}
                        placeholder="Admission number (optional — auto-generated if blank)"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none" />
                      <div className="flex gap-2">
                        <button type="submit" disabled={creating || !createForm.full_name.trim()}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          {creating ? 'Creating…' : 'Create'}
                        </button>
                        <button type="button" onClick={() => setShowCreate(false)}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
