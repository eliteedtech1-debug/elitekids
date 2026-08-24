import { useState } from 'react';
import { Phone, Lock, UserPlus, LogIn, Baby, Trophy, Star, TrendingUp, Bell, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';

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
    if (!phone.trim()) return toast.error('Enter your phone number');
    setLoading(true);
    try {
      const res = await apiClient.post('/kids/parent/login', { phone: phone.trim(), pin: pin || '1234' });
      const d = res.data?.data;
      if (d?.token) {
        setToken(d.token);
        setChildren(d.children || []);
        setView('dashboard');
        toast.success(`Welcome! You have ${d.children?.length || 0} linked children`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Login failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    if (!regPhone.trim() || !regAdm.trim() || !regSchool.trim()) return toast.error('All fields required');
    setLoading(true);
    try {
      const res = await apiClient.post('/kids/parent/register', {
        phone: regPhone.trim(),
        pin: regPin || '1234',
        admission_no: regAdm.trim(),
        school_id: regSchool.trim(),
      });
      toast.success(res.data?.data?.message || 'Linked!');
      setPhone(regPhone);
      setPin(regPin);
      setView('login');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Registration failed';
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
      toast.error('Could not load progress');
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
            <h1 className="text-xl font-extrabold text-gray-800">Parent Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Track your child's learning journey</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Phone className="mr-1 inline h-3.5 w-3.5" /> Phone Number
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08012345678"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                type="tel"
              />
            </label>
            <label className="mb-4 block text-xs font-bold text-gray-600">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> PIN
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="1234"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm"
                type="password"
                maxLength={6}
              />
            </label>
            <button
              onClick={login}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 py-3 text-sm font-extrabold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <span className="animate-spin">⏳</span> : <LogIn className="h-4 w-4" />}
              Sign In
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">
              Don't have an account?{' '}
              <button onClick={() => setView('register')} className="font-bold text-blue-500 hover:underline">
                Link your child
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
            <h1 className="text-xl font-extrabold text-gray-800">Link Your Child</h1>
            <p className="mt-1 text-sm text-gray-500">Connect to track their progress</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Phone className="mr-1 inline h-3.5 w-3.5" /> Your Phone
              <input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="08012345678" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" type="tel" />
            </label>
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> PIN (for login)
              <input value={regPin} onChange={(e) => setRegPin(e.target.value)} placeholder="1234" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" type="password" maxLength={6} />
            </label>
            <label className="mb-3 block text-xs font-bold text-gray-600">
              <Baby className="mr-1 inline h-3.5 w-3.5" /> Child's Admission No.
              <input value={regAdm} onChange={(e) => setRegAdm(e.target.value)} placeholder="DKG/1/0001" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="mb-4 block text-xs font-bold text-gray-600">
              🏫 School ID
              <input value={regSchool} onChange={(e) => setRegSchool(e.target.value)} placeholder="e.g. DKG" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </label>
            <button
              onClick={register}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-blue-600 py-3 text-sm font-extrabold text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <span className="animate-spin">⏳</span> : <UserPlus className="h-4 w-4" />}
              Link Account
            </button>
            <p className="mt-3 text-center text-xs text-gray-400">
              Already linked?{' '}
              <button onClick={() => setView('login')} className="font-bold text-blue-500 hover:underline">
                Sign in
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
            <h1 className="text-lg font-extrabold text-gray-800">👨‍👩‍👧 My Children</h1>
            <button onClick={() => { setView('login'); setChildren([]); }} className="text-xs font-semibold text-gray-400 hover:text-gray-600">Sign out</button>
          </div>
          {children.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <Baby className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm font-bold text-gray-600">No children linked yet</p>
              <button onClick={() => setView('register')} className="mt-3 rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600">Link a Child</button>
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
          <button onClick={() => setView('dashboard')} className="mb-3 text-xs font-bold text-gray-400 hover:text-gray-600">← Back to children</button>

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
              <TrendingUp className="h-3.5 w-3.5" /> This Week
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="🎮" label="Games" value={String(week.games_played || 0)} color="blue" />
              <StatCard icon="📊" label="Avg Score" value={`${week.avg_score || 0}%`} color="green" />
              <StatCard icon="🌟" label="Excellent" value={String(week.excellent_games || 0)} color="amber" />
              <StatCard icon="📚" label="Lessons" value={String(week.unique_lessons || 0)} color="purple" />
            </div>
          </div>

          {/* All Time */}
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
              <Trophy className="h-3.5 w-3.5" /> All Time
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="⭐" label="Total Points" value={String(allTime.total_points || 0)} color="amber" />
              <StatCard icon="🎯" label="Total Attempts" value={String(allTime.total_attempts || 0)} color="blue" />
            </div>
          </div>

          {/* Curriculum Progress */}
          {curriculum.length > 0 && (
            <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                <BookOpen className="h-3.5 w-3.5" /> Subjects
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
                <Star className="h-3.5 w-3.5" /> Badges Earned
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
                🎮 Recent Games
              </h3>
              {recent.map((r, i) => (
                <div key={i} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
                  <div>
                    <span className="text-xs font-bold text-gray-700">{r.lesson_id || 'Game'}</span>
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{r.mode || 'practice'}</span>
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
