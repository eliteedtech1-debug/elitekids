import { useState, useEffect } from 'react';
import { Phone, Lock, UserPlus, LogIn, Baby, Trophy, Star, TrendingUp, Bell, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { t, tN } from '@/lib/i18n';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import AppSwitcher from './AppSwitcher';

type View = 'login' | 'register' | 'dashboard' | 'child';

export default function ParentDashboard() {
  const [view, setView] = useState<View>('login');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('1234');
  const [regAdm, setRegAdm] = useState('');
  const [regSchool, setRegSchool] = useState('');
  const [children, setChildren] = useState<{ admission_no: string; name: string; school_id: string; school_name: string }[]>([]);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');

  const login = async () => {
    if (!phone.trim()) return toast.error(t('parent.phoneRequired'));
    setLoading(true);
    try {
      const res = await apiClient.post('/kids/parent/login', { phone: phone.trim(), password: pin || '1234' });
      const d = res.data?.data;
      if (d?.token) {
        setToken(d.token);
        setChildren(d.children || []);
        setView('dashboard');
        // Persist to the shared ecosystem storage so the AppSwitcher (and other
        // Elite-suite apps via the secure handoff flow) recognize this parent session.
        try {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, d.token.replace(/^Bearer\s+/i, ''));
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
    setLoading(true);
    try {
      const res = await apiClient.post('/kids/parent/register', {
        phone: regPhone.trim(),
        password: regPin || '1234',
        admission_no: regAdm.trim(),
        school_id: regSchool.trim(),
      });
      toast.success(res.data?.data?.message || t('parent.linked'));
      setPhone(regPhone);
      setPin(regPin);
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
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('parent.passwordPlaceholder')}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                type="password"
                maxLength={20}
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
              <input value={regPin} onChange={(e) => setRegPin(e.target.value)} placeholder={t('parent.passwordPlaceholder')} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" type="password" maxLength={20} />
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
