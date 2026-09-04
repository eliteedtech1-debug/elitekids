import { useState, useEffect } from 'react';
import { Phone, Lock, UserPlus, LogIn, Baby, Trophy, Star, TrendingUp, Bell, BookOpen, Calendar, Settings, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t, tN } from '@/lib/i18n';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import AppSwitcher from './AppSwitcher';
import SkillMap, { type PortfolioSkill, type SkillSummary, type PortfolioRecommendation } from './SkillMap';
import EvidenceGallery, { type SpeakingEvidence, type GamesEvidence, type WeeklyStats } from './EvidenceGallery';
import InsightCard from './InsightCard';
import ActionItem from './ActionItem';
import WeeklyDigest from './WeeklyDigest';
import ComparisonChart from './ComparisonChart';
import ParentNudge from './ParentNudge';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { activityLevel, LEVEL_CLASS, buildWeekColumns, xpTrendPath, type DayActivity } from '@/lib/utils/activityGrid';

type View = 'login' | 'register' | 'dashboard' | 'child';

export default function ParentDashboard() {
  const [view, setView] = useState<View>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAdm, setRegAdm] = useState('');
  const [regSchool, setRegSchool] = useState('');
  const [children, setChildren] = useState<{ admission_no: string; name: string; school_id: string; school_name: string }[]>([]);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [portfolio, setPortfolio] = useState<{
    skill_map: PortfolioSkill[];
    skill_summary: SkillSummary;
    recommendations: PortfolioRecommendation[];
    evidence: { speaking?: SpeakingEvidence; games?: GamesEvidence };
    weekly?: WeeklyStats;
  } | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [familyActivity, setFamilyActivity] = useState<FamilyActivityResponse | null>(null);
  const [familyResults, setFamilyResults] = useState<FamilyResultsResponse | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);

  const login = async () => {
    if (!phone.trim()) return toast.error(t('parent.phoneRequired'));
    if (!password.trim()) return toast.error(t('parent.passwordRequired'));
    setLoading(true);
    try {
      const res = await apiClient.post('/kids/parent/login', { phone: phone.trim(), password: password.trim() });
      const d = res.data?.data;
      if (d?.token) {
        setToken(d.token);
        setChildren(d.children || []);
        setView('dashboard');
        // Persist to the shared ecosystem storage so the AppSwitcher (and other
        // Elite-suite apps via the secure handoff flow) recognize this parent session.
        try {
          const cleanToken = d.token.replace(/^Bearer\s+/i, '');
          localStorage.setItem(STORAGE_KEYS.PARENT_TOKEN, cleanToken);
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, cleanToken);
          localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify({ user_type: 'parent', phone: phone.trim() }));
          const sid = d.children?.[0]?.school_id;
          if (sid) localStorage.setItem(STORAGE_KEYS.SCHOOL_ID, sid);
        } catch { /* storage unavailable — switcher simply won't show */ }
        toast.success(tN('parent.linkedChildren', d.children?.length || 0));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('parent.loginFailed');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    if (!regPhone.trim() || !regAdm.trim() || !regSchool.trim()) return toast.error(t('parent.allFieldsRequired'));
    if (!regPassword.trim()) return toast.error(t('parent.passwordRequired'));
    setLoading(true);
    try {
      const res = await apiClient.post('/kids/parent/register', {
        phone: regPhone.trim(),
        password: regPassword.trim(),
        admission_no: regAdm.trim(),
        school_id: regSchool.trim(),
      });
      toast.success(res.data?.data?.message || t('parent.linked'));
      setPhone(regPhone);
      setPassword(regPassword);
      setView('login');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('parent.registrationFailed');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadChild = async (adm: string) => {
    setSelectedChild(adm);
    setLoading(true);
    try {
      const res = await apiClient.get(`/kids/parent/child/${adm}/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProgress(res.data?.data || null);
      setView('child');
    } catch {
      toast.error(t('parent.progressLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Parent overview: one ownership-scoped request powers the family 365-day grid,
  // XP trend and bulk results view. It is intentionally read-only.
  useEffect(() => {
    if (view !== 'dashboard' || !token) return;
    let alive = true;
    setFamilyLoading(true);
    Promise.all([
      apiClient.get(ENDPOINTS.PARENT.ACTIVITY(365), { headers: { Authorization: `Bearer ${token}` } }),
      apiClient.get(ENDPOINTS.PARENT.RESULTS(200), { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(([activityRes, resultsRes]) => {
      if (!alive) return;
      setFamilyActivity(activityRes.data?.data || null);
      setFamilyResults(resultsRes.data?.data || null);
    }).catch(() => {
      if (alive) toast.error('Some family reports could not be loaded.');
    }).finally(() => alive && setFamilyLoading(false));
    return () => { alive = false; };
  }, [view, token]);

  // Load the Q2-E portfolio for the selected child (read-only aggregation).
  useEffect(() => {
    if (view !== 'child' || !selectedChild) return;
    let alive = true;
    setPortfolioLoading(true);
    apiClient
      .get(`/kids/portfolio/${encodeURIComponent(selectedChild)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (!alive) return;
        const d = res.data?.data;
        setPortfolio({
          skill_map: Array.isArray(d?.skill_map) ? d.skill_map : [],
          skill_summary: d?.skill_summary || { total: 0, mastered: 0, nearly_there: 0, practicing: 0, learning: 0, new: 0 },
          recommendations: Array.isArray(d?.recommendations) ? d.recommendations : [],
          evidence: d?.evidence || {},
          weekly: d?.weekly,
        });
      })
      .catch(() => { /* portfolio is additive — existing progress view still works */ })
      .finally(() => alive && setPortfolioLoading(false));
    return () => { alive = false; };
  }, [view, selectedChild, token]);

  // Q3: Fetch parent intelligence insights for selected child.
  useEffect(() => {
    if (view !== 'child' || !selectedChild || !token) return;
    let alive = true;
    apiClient.get(ENDPOINTS.PARENT_INTEL.INSIGHTS(selectedChild), {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (alive) {
        setInsights(res.data?.data?.insights || []);
        setActionItems(res.data?.data?.action_items || []);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [view, selectedChild, token]);

  // Q2-E export: same payload as a downloadable JSON file.
  const exportPortfolio = async () => {
    if (!selectedChild) return;
    try {
      const res = await apiClient.get(`/kids/portfolio/${encodeURIComponent(selectedChild)}/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-${selectedChild.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t('portfolio.export.done', { defaultValue: 'Portfolio downloaded!' }));
    } catch {
      toast.error(t('portfolio.export.failed', { defaultValue: 'Could not download portfolio.' }));
    }
  };

  // ─── Login View ────────────────────────────────────────────────────────────
  if (view === 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-3xl shadow-lg">👨‍👩‍👧</div>
            <h1 className="text-xl font-extrabold text-gray-800">{t('parent.dashboardTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('parent.trackJourney')}</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Phone className="mr-1 inline h-3.5 w-3.5" /> {t('parent.phoneNumber')}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('parent.phonePlaceholder')}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                type="tel"
              />
            </label>
            <label className="mb-4 block text-xs font-bold text-gray-600">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> {t('parent.password')}
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('parent.passwordPlaceholder')}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                type="password"
                maxLength={64}
              />
            </label>
            <button
              onClick={login}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 py-3 text-sm font-extrabold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <span className="animate-spin">⏳</span> : <LogIn className="h-4 w-4" />}
              {t('login.signIn')}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">
              {t('parent.haveAccount')}{' '}

              <button onClick={() => setView('register')} className="font-bold text-blue-500 hover:underline">
                {t('parent.linkYourChild')}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Register View ─────────────────────────────────────────────────────────
  if (view === 'register') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-blue-600 text-3xl shadow-lg">🔗</div>
            <h1 className="text-xl font-extrabold text-gray-800">{t('parent.linkYourChildTitle')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('parent.connectProgress')}</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Phone className="mr-1 inline h-3.5 w-3.5" /> {t('parent.yourPhone')}
              <input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder={t('parent.phonePlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" type="tel" />
            </label>
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> {t('parent.passwordForLogin')}
              <input value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder={t('parent.passwordPlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" type="password" maxLength={64} />
            </label>
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Baby className="mr-1 inline h-3.5 w-3.5" /> {t('parent.childAdmission')}
              <input value={regAdm} onChange={(e) => setRegAdm(e.target.value)} placeholder={t('parent.admissionPlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="mb-4 block text-xs font-bold text-gray-600">
              🏫 {t('parent.schoolId')}
              <input value={regSchool} onChange={(e) => setRegSchool(e.target.value)} placeholder={t('parent.schoolPlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </label>
            <button
              onClick={register}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-blue-600 py-3 text-sm font-extrabold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <span className="animate-spin">⏳</span> : <UserPlus className="h-4 w-4" />}
              {t('parent.accountLinked')}
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">
              {t('parent.alreadyLinked')}{' '}

              <button onClick={() => setView('login')} className="font-bold text-blue-500 hover:underline">
                {t('parent.signIn')}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Dashboard: Children List ──────────────────────────────────────────────
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="mb-5 flex items-center justify-between">
            <h1 className="text-lg font-extrabold text-gray-800">👨‍👩‍👧 {t('parent.myChildren')}</h1>
            <div className="flex items-center gap-1.5">
              <AppSwitcher />
              <button
                onClick={() => {
                  setView('login');
                  setChildren([]);
                  localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
                  localStorage.removeItem(STORAGE_KEYS.USER_DATA);
                  localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
                }}
                className="text-xs font-semibold text-gray-400 hover:text-gray-600"
              >
                {t('parent.signOut')}
              </button>
            </div>
          </div>
          {/* ── Subscription card (flagship parents) — payment lives HERE, never on the child's screen ── */}
          <ParentSubscriptionCard token={token} />
          <ParentFamilyOverview
            loading={familyLoading}
            children={children}
            activity={familyActivity}
            results={familyResults}
            onSelectChild={loadChild}
          />
          {children.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <Baby className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm font-bold text-gray-600">{t('parent.noChildren')}</p>
              <button onClick={() => setView('register')} className="mt-3 rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600">{t('parent.linkAChild')}</button>
            </div>
          ) : (
            <div className="space-y-3">
              {children.map((c) => (
                <button
                  key={c.admission_no}
                  onClick={() => loadChild(c.admission_no)}
                  className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xl text-white shadow">
                    👧
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-extrabold text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.admission_no} · {c.school_name || c.school_id}</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Child Progress Detail ─────────────────────────────────────────────────
  if (view === 'child' && progress) {
    const week = (progress as Record<string, Record<string, number>>).week || {};
    const allTime = (progress as Record<string, Record<string, number>>).all_time || {};
    const badges = (progress as Record<string, { badge_name: string; badge_emoji: string; awarded_at: string }[]>).badges || [];
    const recent = (progress as Record<string, { lesson_id: string; score: number; mode: string; created_at: string }[]>).recent_activity || [];
    const curriculum = (progress as Record<string, { subject_name: string; total_lessons: number; completed_lessons: number }[]>).curriculum_progress || [];
    const child = children.find(c => c.admission_no === selectedChild);

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6">
        <div className="mx-auto max-w-md">
          <button onClick={() => setView('dashboard')} className="mb-3 text-xs font-bold text-gray-400 hover:text-gray-600">← {t('parent.backToChildren')}</button>

          {/* Header */}
          <div className="mb-4 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-2xl">👧</div>
              <div>
                <h2 className="font-extrabold">{child?.name || selectedChild}</h2>
                <p className="text-xs opacity-80">{child?.admission_no} · {child?.school_name}</p>
              </div>
            </div>
          </div>

          {/* Q3 Parent Intelligence — meaning + next steps, not just activity */}
          {insights.length > 0 && (
            <div className="mb-4 space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                <TrendingUp className="h-3.5 w-3.5" /> {t('parentIntel.today', { defaultValue: 'What this means' })}
              </h3>
              {insights.map((insight: any, index: number) => (
                <InsightCard key={insight.id || `${insight.rule_key}-${index}`} insight={insight} />
              ))}
            </div>
          )}
          {actionItems.length > 0 && (
            <div className="mb-4 space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">
                {t('parentIntel.actions', { defaultValue: 'Try this together' })}
              </h3>
              {actionItems.map((item: any) => (
                <ActionItem key={item.id} item={{
                  ...item,
                  title: item.title || item.action_text || 'Try this learning activity',
                  description: item.description || item.nudge,
                }} />
              ))}
            </div>
          )}
          {insights.some((insight: any) => insight.severity === 'high') && (
            <div className="mb-4">
              <ParentNudge
                title={insights.find((insight: any) => insight.severity === 'high')?.title || t('parentIntel.nudgeTitle', { defaultValue: 'A little support can help' })}
                body={insights.find((insight: any) => insight.severity === 'high')?.body || t('parentIntel.nudgeBody', { defaultValue: 'A short, calm practice together can make a difference.' })}
              />
            </div>
          )}
          {selectedChild && <WeeklyDigest childId={selectedChild} />}
          {selectedChild && <div className="my-4"><ComparisonChart childId={selectedChild} /></div>}
          {selectedChild && <ParentControlsPanel childId={selectedChild} token={token} />}

          {/* This Week */}
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
              <TrendingUp className="h-3.5 w-3.5" /> {t('parent.thisWeek')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="🎮" label={t('parent.games')} value={String(week.games_played || 0)} color="blue" />
              <StatCard icon="📊" label={t('parent.avgScore')} value={`${week.avg_score || 0}%`} color="green" />
              <StatCard icon="🌟" label={t('parent.excellent')} value={String(week.excellent_games || 0)} color="amber" />
              <StatCard icon="📚" label={t('parent.lessons')} value={String(week.unique_lessons || 0)} color="purple" />
            </div>
          </div>

          {/* All Time */}
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
              <Trophy className="h-3.5 w-3.5" /> {t('parent.allTime')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="⭐" label={t('parent.totalPoints')} value={String(allTime.total_points || 0)} color="amber" />
              <StatCard icon="🎯" label={t('parent.totalAttempts')} value={String(allTime.total_attempts || 0)} color="blue" />
            </div>
          </div>

          {/* Curriculum Progress */}
          {curriculum.length > 0 && (
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                <BookOpen className="h-3.5 w-3.5" /> {t('parent.subjects')}
              </h3>
              {curriculum.map((c) => {
                const pct = c.total_lessons > 0 ? Math.round((c.completed_lessons / c.total_lessons) * 100) : 0;
                return (
                  <div key={c.subject_name} className="mb-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-700">{c.subject_name}</span>
                      <span className="text-gray-400">{c.completed_lessons}/{c.total_lessons}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                <Star className="h-3.5 w-3.5" /> {t('parent.badgesEarned')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {badges.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    {b.badge_emoji} {b.badge_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent Games */}
          {recent.length > 0 && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                {`🎮 ${t('parent.recentGames')}`}
              </h3>
              {recent.map((r, i) => (
                <div key={i} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
                  <div>
                    <span className="text-xs font-bold text-gray-700">{r.lesson_id || t('parent.defaultGame')}</span>
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{r.mode || t('parent.defaultPractice')}</span>
                  </div>
                  <span className={`text-sm font-extrabold ${r.score >= 80 ? 'text-green-600' : r.score >= 50 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {r.score}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

interface ParentChild {
  admission_no: string;
  name: string;
  school_id: string;
  school_name: string;
}

interface FamilyActivityChild {
  child_admission_no: string;
  series: DayActivity[];
  totals: { games: number; xp: number; stars: number; active_days: number; streak_days: number; best_day: DayActivity | null };
}

interface FamilyActivityResponse {
  days: number;
  children: FamilyActivityChild[];
}

interface FamilyResultsResponse {
  children: string[];
  results: Array<{ child_admission_no: string; lesson_id: string; score: number; stars_earned: number; xp: number; mode?: string; completed_at: string }>;
}

function ParentFamilyOverview({
  loading,
  children,
  activity,
  results,
  onSelectChild,
}: {
  loading: boolean;
  children: ParentChild[];
  activity: FamilyActivityResponse | null;
  results: FamilyResultsResponse | null;
  onSelectChild: (admissionNo: string) => void;
}) {
  const childById = new Map(children.map((child) => [child.admission_no, child]));
  if (loading) return <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-white p-5 text-xs text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading family reports…</div>;
  if (!activity?.children?.length) return null;

  return (
    <div className="mb-5 space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-gray-800"><Calendar className="h-4 w-4 text-emerald-500" /> Family learning year</h2>
            <p className="text-[11px] text-gray-400">365 days of activity, XP and streaks</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Parent view</span>
        </div>
        {activity.children.map((item) => {
          const child = childById.get(item.child_admission_no);
          const columns = buildWeekColumns(item.series);
          const trend = xpTrendPath(item.series, 280, 64);
          return (
            <div key={item.child_admission_no} className="mb-4 rounded-xl border border-gray-100 p-3 last:mb-0">
              <button onClick={() => onSelectChild(item.child_admission_no)} className="mb-2 flex w-full items-center justify-between text-left">
                <span className="text-xs font-extrabold text-gray-700">{child?.name || item.child_admission_no}</span>
                <span className="text-[10px] font-bold text-blue-500">Open details →</span>
              </button>
              <div className="mb-2 flex items-center gap-3 text-[10px] text-gray-500">
                <span><b className="text-gray-800">{item.totals.xp}</b> XP</span>
                <span><b className="text-gray-800">{item.totals.active_days}</b> active days</span>
                <span><b className="text-gray-800">{item.totals.streak_days}</b> day streak</span>
              </div>
              <div className="overflow-x-auto pb-1" aria-label={`${child?.name || item.child_admission_no} 365-day activity grid`}>
                <div className="flex min-w-[520px] gap-0.5">
                  {columns.map((column, columnIndex) => (
                    <div key={columnIndex} className="flex flex-col gap-0.5">
                      {column.map((day) => (
                        <span key={day.date} title={`${day.date}: ${day.games} games, ${day.xp} XP`} className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS[activityLevel(day.games)]}`} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <svg viewBox="0 0 280 64" className="mt-2 h-16 w-full" role="img" aria-label="Daily XP trend">
                <polyline points={trend.points} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {trend.points && <circle cx={trend.lastX} cy={trend.lastY} r="3" fill="#7c3aed" />}
              </svg>
            </div>
          );
        })}
      </div>
      <ParentBulkResults children={children} results={results} onSelectChild={onSelectChild} />
    </div>
  );
}

function ParentBulkResults({ children, results, onSelectChild }: { children: ParentChild[]; results: FamilyResultsResponse | null; onSelectChild: (admissionNo: string) => void }) {
  if (!results) return null;
  const names = new Map(children.map((child) => [child.admission_no, child.name]));
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-gray-800"><Trophy className="h-4 w-4 text-amber-500" /> Results across children</h2>
      <p className="mb-3 text-[11px] text-gray-400">Recent Practice and Test results in one place</p>
      {!results.results.length ? <p className="text-xs text-gray-400">No completed games yet.</p> : (
        <div className="space-y-1.5">
          {results.results.slice(0, 12).map((row, index) => (
            <button key={`${row.child_admission_no}-${row.completed_at}-${index}`} onClick={() => onSelectChild(row.child_admission_no)} className="flex w-full items-center justify-between rounded-lg border border-gray-50 px-2 py-2 text-left hover:bg-gray-50">
              <span className="min-w-0 truncate text-[11px] font-bold text-gray-700">{names.get(row.child_admission_no) || row.child_admission_no} · {row.lesson_id}</span>
              <span className="ml-2 shrink-0 text-[11px] font-extrabold text-blue-600">{row.score}% <span className="font-semibold text-gray-400">{row.mode || 'practice'}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ParentControlsPanel({ childId, token }: { childId: string; token: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState('30');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [mode, setMode] = useState<'practice' | 'test'>('practice');
  const [locks, setLocks] = useState<Array<{ lesson_id: string; mode: string; locked_by: string }>>([]);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    let alive = true;
    apiClient.get(ENDPOINTS.PARENT.CHILD_CONTROLS(childId), { headers }).then((res) => {
      if (!alive) return;
      const data = res.data?.data || {};
      const controls = data.controls || {};
      setLimit(String(controls.daily_play_limit_minutes ?? 30));
      setStart(controls.allowed_time_start || '');
      setEnd(controls.allowed_time_end || '');
      setLocks(Array.isArray(data.mode_locks) ? data.mode_locks : []);
    }).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [childId, token]);

  const saveControls = async () => {
    const minutes = Number(limit);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 480) return toast.error('Play limit must be between 0 and 480 minutes.');
    setSaving(true);
    try {
      await apiClient.post(ENDPOINTS.PARENTAL.SET, { student_id: childId, daily_play_limit_minutes: minutes, allowed_time_start: start || null, allowed_time_end: end || null }, { headers });
      toast.success('Parent controls saved.');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not save controls.'); }
    finally { setSaving(false); }
  };

  const setLock = async () => {
    if (!lessonId.trim()) return toast.error('Enter a lesson ID to lock.');
    setSaving(true);
    try {
      await apiClient.post(ENDPOINTS.MODE_LOCK.SET, { child_admission_no: childId, lesson_id: lessonId.trim(), locked_mode: mode }, { headers });
      setLocks((current) => [{ lesson_id: lessonId.trim(), mode, locked_by: 'parent' }, ...current.filter((lock) => lock.lesson_id !== lessonId.trim())]);
      toast.success(`${mode === 'test' ? 'Test' : 'Practice'} mode locked.`);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not set mode lock.'); }
    finally { setSaving(false); }
  };

  const removeLock = async (lock: { lesson_id: string }) => {
    setSaving(true);
    try {
      await apiClient.delete(ENDPOINTS.MODE_LOCK.REMOVE, { headers, data: { child_admission_no: childId, lesson_id: lock.lesson_id } });
      setLocks((current) => current.filter((item) => item.lesson_id !== lock.lesson_id));
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Could not remove mode lock.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-extrabold text-indigo-900"><Settings className="h-4 w-4" /> Parent controls</h3>
      <p className="mb-3 text-[11px] text-indigo-700/70">Set a healthy sleep window, daily play time, and Practice/Test mode.</p>
      {loading ? <div className="flex items-center gap-2 py-3 text-xs text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading controls…</div> : <>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[10px] font-bold text-gray-600">Minutes/day<input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" min="0" max="480" className="mt-1 w-full rounded-lg border border-indigo-100 bg-white px-2 py-2 text-xs" /></label>
          <label className="text-[10px] font-bold text-gray-600">Sleep starts<input value={start} onChange={(e) => setStart(e.target.value)} type="time" className="mt-1 w-full rounded-lg border border-indigo-100 bg-white px-2 py-2 text-xs" /></label>
          <label className="text-[10px] font-bold text-gray-600">Sleep ends<input value={end} onChange={(e) => setEnd(e.target.value)} type="time" className="mt-1 w-full rounded-lg border border-indigo-100 bg-white px-2 py-2 text-xs" /></label>
        </div>
        <button onClick={saveControls} disabled={saving} className="mt-3 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save sleep & play limits'}</button>
        <div className="mt-4 border-t border-indigo-100 pt-3">
          <div className="mb-2 text-[11px] font-extrabold text-indigo-900">Mode lock</div>
          <div className="flex gap-2">
            <input value={lessonId} onChange={(e) => setLessonId(e.target.value)} placeholder="Lesson ID" className="min-w-0 flex-1 rounded-lg border border-indigo-100 bg-white px-2 py-2 text-xs" />
            <select value={mode} onChange={(e) => setMode(e.target.value as 'practice' | 'test')} className="rounded-lg border border-indigo-100 bg-white px-2 py-2 text-xs"><option value="practice">Practice</option><option value="test">Test</option></select>
            <button onClick={setLock} disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Lock</button>
          </div>
          {locks.length > 0 && <div className="mt-2 space-y-1">{locks.map((lock) => <div key={lock.lesson_id} className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-[10px]"><span className="font-bold text-gray-700">{lock.lesson_id} · {lock.mode}</span><button onClick={() => removeLock(lock)} className="font-bold text-red-500">Unlock</button></div>)}</div>}
        </div>
      </>}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    amber: 'bg-amber-50',
    purple: 'bg-purple-50',
  };
  const textMap: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
    purple: 'text-purple-600',
  };
  return (
    <div className={`rounded-xl ${bgMap[color] || 'bg-gray-50'} p-3 text-center`}>
      <div className="text-lg">{icon}</div>
      <div className={`text-lg font-extrabold ${textMap[color] || 'text-gray-700'}`}>{value}</div>
      <div className="text-[10px] font-semibold text-gray-500">{label}</div>
    </div>
  );
}

/* ── Parent subscription card — where PAYMENTS live (flagship parents) ──
 * Shows plan status and a Paystack subscribe/renew button. Children never
 * see this; only the parent dashboard does. Session-free school checkout is
 * handled by LoginUpsell; authenticated parents use /initiate directly.
 */
function ParentSubscriptionCard({ token }: { token: string }) {
  const [state, setState] = useState<{
    plan?: string; status?: string; expires_at?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .get('/kids/subscription/status', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setState(res.data?.data?.subscriber || null))
      .catch(() => {});
  }, [token]);

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post(
        '/kids/subscription/initiate',
        { plan_code: 'kids_annual' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const url = res.data?.data?.authorization_url;
      if (url) window.location.href = url;
      else toast.error('Could not start payment.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Could not start payment.';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const active = state.status === 'active';
  const trial = state.status === 'trial';
  const free = state.status === 'free';
  const exp = state.expires_at ? new Date(String(state.expires_at).includes('T') ? state.expires_at : String(state.expires_at).replace(' ', 'T')) : null;
  const daysLeft = exp ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <div className={`mb-4 rounded-2xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-gray-800">
            {active ? '✅ Subscription active' : trial ? '⏳ Free trial' : '🧸 Free showcase tier'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {active && exp
              ? `All games unlocked · renews ${exp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : trial && daysLeft !== null
                ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left — subscribe to keep all games after the trial`
                : 'You are on the free showcase — unlock every game for your child'}
          </p>
          {!active && (
            <button
              onClick={subscribe}
              disabled={busy}
              className="mt-2.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-teal-700 disabled:opacity-60"
            >
              {busy ? 'Opening checkout…' : 'Subscribe — ₦1,200/year 💳'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
