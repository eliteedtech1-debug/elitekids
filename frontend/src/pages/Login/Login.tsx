// Login page — modern 3D claymorphism design for EliteKids
// Teacher / Parent toggle, school crest + name from school_setup via subdomain,
// Kids Stand-Alone module gate, parent signup, cross-app handoff.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { User, Lock, GraduationCap, Users, Eye, EyeOff, Sparkles, BookOpen, Star } from 'lucide-react';
import { short_name, hasKidsAccess, getSchoolShortName, createAuthHeaders } from '@/lib/utils/school';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import AppSwitcher from '@/components/AppSwitcher';
import PublicLoginSwitcher from '@/components/PublicLoginSwitcher';
import LoginAppsPanel from '@/components/LoginAppsPanel';
import { t } from '@/lib/i18n';

interface SchoolDetails {
  school_id: string;
  school_name: string;
  badge_url?: string | null;
  school_motto?: string | null;
  kids_stand_alone?: number | string | null;
}

type LoginMode = 'users' | 'students';
type AuthView = 'login' | 'signup';

/* ── Floating 3D decorative shapes ───────────────────────────────────────── */
function FloatingShapes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Large teal blob */}
      <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-gradient-to-br from-teal-400/30 to-emerald-500/20 blur-3xl animate-pulse" />
      {/* Amber accent */}
      <div className="absolute top-1/3 -right-16 h-56 w-56 rounded-full bg-gradient-to-br from-amber-400/25 to-orange-400/15 blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
      {/* Small floating book */}
      <svg className="absolute top-[15%] left-[10%] h-12 w-12 text-teal-300/40 animate-bounce" style={{ animationDuration: '3s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 4H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM4 6h7v12H4V6zm9 12V6h7v12h-7z"/>
      </svg>
      {/* Floating star */}
      <svg className="absolute top-[60%] left-[5%] h-8 w-8 text-amber-300/50 animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
      {/* Pencil */}
      <svg className="absolute top-[25%] right-[12%] h-10 w-10 text-emerald-300/35 animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1.5s' }} viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
      {/* Small circle */}
      <div className="absolute bottom-[20%] right-[8%] h-6 w-6 rounded-full bg-teal-400/30 animate-pulse" style={{ animationDelay: '2s' }} />
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('users');
  const [form, setForm] = useState({ school_id: '', email: '', password: '' });
  const [shortNameInput, setShortNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [school, setSchool] = useState<SchoolDetails | null>(null);
  const [schoolError, setSchoolError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [signupForm, setSignupForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [signupLoading, setSignupLoading] = useState(false);
  const tokenHandled = useRef(false);

  // ── Cross-app handoff uses a short-lived ticket, never a raw JWT URL ──
  useEffect(() => {
    if (tokenHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('handoff_ticket');
    if (!ticket) return;
    tokenHandled.current = true;

    params.delete('handoff_ticket');
    const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);

    (async () => {
      try {
        const res = await apiClient.post('/api/apps/kids/redeem-ticket', { ticket });
        const data = res.data as any;
        if (data?.ok && (data?.user_id || data?.user)) {
          const user: any = data.user || { id: data.user_id, school_id: data.school_id, user_type: data.user_type || '' };
          if (data.token) localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
          localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
          if (user.school_id) localStorage.setItem(STORAGE_KEYS.SCHOOL_ID, user.school_id);
          if (user.branch_id) localStorage.setItem(STORAGE_KEYS.BRANCH_ID, user.branch_id);
          toast.success(t('login.loginSuccess'));
          const userType = (user.user_type || '').toLowerCase();
          if (userType === 'student') navigate('/student', { replace: true });
          else if (userType === 'parent') navigate('/parent', { replace: true });
          else navigate('/dashboard', { replace: true });
        } else {
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          setError('Session expired. Please log in again.');
        }
      } catch {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        setError('Could not verify session. Please log in again.');
      }
    })();
  }, [navigate]);

  const loadSchool = useCallback(async (shortName: string) => {
    const sn = (shortName || '').trim();
    if (!sn) return;
    setSchoolError('');
    try {
      const res = await apiClient.get(ENDPOINTS.SCHOOL.GET_DETAILS, {
        params: { query_type: 'select-by-short-name', short_name: sn },
      });
      if (res.data?.success && res.data.data?.length > 0) {
        const s = res.data.data[0];
        setSchool(s);
        setForm((p) => ({ ...p, school_id: s.school_id }));
      } else {
        setSchool(null);
        setSchoolError(res.data?.message || t('login.noSchoolFound'));
      }
    } catch {
      setSchool(null);
      setSchoolError(t('login.serverUnreachable'));
    }
  }, []);

  useEffect(() => {
    if (!short_name || short_name === 'localhost') return;
    loadSchool(getSchoolShortName());
  }, [loadSchool]);

  if (school && !hasKidsAccess(school)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f0fdfa] via-[#e0f7ef] to-[#fef3c7] p-4">
        <FloatingShapes />
        <div className="relative w-full max-w-md rounded-3xl bg-white/70 backdrop-blur-xl p-8 text-center shadow-[0_8px_40px_rgba(13,148,136,0.12)] border border-white/50">
          <img src={school.badge_url || '/logo.svg'} alt={t('login.schoolLogoAlt')} className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-lg" />
          <h2 className="text-2xl font-bold text-[#0F4D92]">{t('login.brand')}</h2>
          <p className="mb-4 text-sm text-gray-500">{t('login.subtitle')}</p>
          <div className="rounded-2xl bg-amber-50/80 p-4 text-sm text-amber-800 border border-amber-200/50">
            <p className="font-semibold">{t('login.accessRestricted')}</p>
            <p>{t('login.noSubscription')}</p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if ((!short_name || short_name === 'localhost') && !form.school_id) {
      setError(t('login.invalidShortName'));
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.post(ENDPOINTS.AUTH.LOGIN(mode), {
        username: form.email,
        password: form.password,
        school_id: form.school_id,
      });
      const data = res.data;
      if (data?.success && data.token) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token.replace(/^Bearer\s+/i, ''));
        localStorage.setItem(STORAGE_KEYS.SCHOOL_ID, data.school_id || form.school_id);
        const userType = data.user?.user_type || data.user_type || '';
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify({ user_type: userType }));
        toast.success(t('login.loginSuccess'));
        if (/student/i.test(userType)) navigate('/student');
        else if (/parent/i.test(userType)) navigate('/parent');
        else navigate('/dashboard');
      } else {
        setError(data?.message || t('login.loginFailed'));
      }
    } catch (err: any) {
      setError(err?.message || t('login.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school_id) {
      setError(t('login.shortNameFirst'));
      return;
    }
    setSignupLoading(true);
    setError('');
    try {
      const res = await apiClient.post(ENDPOINTS.AUTH.PARENT_SIGNUP, {
        ...signupForm,
        school_id: form.school_id,
      });
      const data = res.data;
      if (data?.success && data.token) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token.replace(/^Bearer\s+/i, ''));
        localStorage.setItem(STORAGE_KEYS.SCHOOL_ID, form.school_id);
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify({ user_type: 'Parent' }));
        toast.success(t('login.signupSuccess'));
        navigate('/dashboard');
      } else {
        setError(data?.message || t('login.signupFailed'));
      }
    } catch (err: any) {
      setError(err?.message || t('login.signupFailed'));
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f0fdfa] via-[#e0f7ef] to-[#fef3c7] p-4 sm:p-6 overflow-hidden">
      <FloatingShapes />

      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white/60 backdrop-blur-2xl shadow-[0_20px_80px_rgba(13,148,136,0.15)] border border-white/60 lg:flex">
        {/* ── Left hero panel ─────────────────────────────────────────────── */}
        <section className="hidden min-h-[680px] w-[40%] flex-col justify-between rounded-l-[2rem] bg-gradient-to-br from-[#0a1628] via-[#0F4D92] to-[#0d9488] p-10 text-white relative overflow-hidden lg:flex">
          {/* 3D decorative blobs */}
          <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-teal-400/20 blur-2xl" />
          <div className="absolute bottom-20 -right-10 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl" />

          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-sm px-4 py-2 border border-white/10">
              <img src="/logo.svg" alt="Elite brand" className="h-10 w-10 rounded-xl object-contain" />
              <span className="text-lg font-bold tracking-tight">EliteKids</span>
            </div>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight">
              Gamified<br />Learning for<br />Early Education
            </h1>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-blue-100/80">
              Interactive lessons, progress tracking, and fun learning games — all in one place.
            </p>
          </div>

          {/* Feature pills */}
          <div className="relative z-10 space-y-3">
            {[
              { icon: <Sparkles className="h-4 w-4" />, text: 'AI-Powered Content' },
              { icon: <BookOpen className="h-4 w-4" />, text: 'NERDC Curriculum' },
              { icon: <Star className="h-4 w-4" />, text: 'Progress Garden' },
            ].map((feat) => (
              <div key={feat.text} className="inline-flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium border border-white/5">
                {feat.icon}
                {feat.text}
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-auto">
            <LoginAppsPanel />
          </div>
        </section>

        {/* ── Right form panel ────────────────────────────────────────────── */}
        <section className="w-full p-6 sm:p-8 lg:w-[60%] lg:p-10">
          <div className="mb-4 flex items-center justify-end lg:hidden">
            <PublicLoginSwitcher />
          </div>

          {/* School crest + brand */}
          <div className="mb-6 text-center">
            <div className="relative mx-auto mb-4 h-24 w-24">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-teal-400 to-emerald-500 opacity-20 blur-xl" />
              <img
                src={school?.badge_url || '/logo.svg'}
                alt={t('login.schoolLogoAlt')}
                className="relative h-24 w-24 rounded-3xl object-contain shadow-[0_8px_30px_rgba(13,148,136,0.25)] border-2 border-white/80"
              />
            </div>
            <h2 className="text-2xl font-bold text-[#0F4D92]">
              {school?.school_name ? t('login.welcomeTo', { school: school.school_name }) : t('dashboard.welcomeUser', { role: t('login.brand') })}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{t('login.brand')} · {t('login.subtitle')}</p>
          </div>

          {/* Teacher / Parent toggle */}
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100/60 p-1">
            <button
              type="button"
              onClick={() => setMode('users')}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                mode === 'users'
                  ? 'bg-gradient-to-r from-[#0F4D92] to-[#0d9488] text-white shadow-[0_4px_15px_rgba(15,77,146,0.3)]'
                  : 'text-gray-500 hover:text-[#0F4D92]'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              {t('login.modeTeacher')}
            </button>
            <button
              type="button"
              onClick={() => setMode('students')}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                mode === 'students'
                  ? 'bg-gradient-to-r from-[#0F4D92] to-[#0d9488] text-white shadow-[0_4px_15px_rgba(15,77,146,0.3)]'
                  : 'text-gray-500 hover:text-[#0F4D92]'
              }`}
            >
              <Users className="h-4 w-4" />
              {t('login.modeStudent')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* School short name (localhost only) */}
            {(!short_name || short_name === 'localhost') && (
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-500 group-focus-within:bg-teal-500 group-focus-within:text-white transition-colors duration-200">
                    <User className="h-4 w-4" />
                  </div>
                </div>
                <input
                  name="school_id"
                  value={shortNameInput}
                  onChange={(e) => {
                    setShortNameInput(e.target.value);
                    setSchool(null);
                    setSchoolError('');
                    setForm((p) => ({ ...p, school_id: '' }));
                  }}
                  onBlur={(e) => {
                    const sn = e.target.value.trim();
                    if (sn) loadSchool(sn);
                  }}
                  placeholder={t('login.schoolShortName')}
                  required
                  className="w-full rounded-2xl border border-gray-200/80 bg-white/70 py-3 pl-14 pr-4 text-sm shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus:border-teal-400 focus:bg-white focus:shadow-[0_4px_20px_rgba(13,148,136,0.1)] focus:outline-none transition-all duration-200"
                />
              </div>
            )}

            {/* Email / Admission */}
            <div className="group relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-500 group-focus-within:bg-teal-500 group-focus-within:text-white transition-colors duration-200">
                  <User className="h-4 w-4" />
                </div>
              </div>
              <input
                name="email"
                type="text"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder={mode === 'students' ? t('login.admissionNo') : t('login.emailOrPhone')}
                required
                className="w-full rounded-2xl border border-gray-200/80 bg-white/70 py-3 pl-14 pr-4 text-sm shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus:border-teal-400 focus:bg-white focus:shadow-[0_4px_20px_rgba(13,148,136,0.1)] focus:outline-none transition-all duration-200"
              />
            </div>

            {/* Password */}
            <div className="group relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-500 group-focus-within:bg-teal-500 group-focus-within:text-white transition-colors duration-200">
                  <Lock className="h-4 w-4" />
                </div>
              </div>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder={t('login.password')}
                required
                className="w-full rounded-2xl border border-gray-200/80 bg-white/70 py-3 pl-14 pr-12 text-sm shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus:border-teal-400 focus:bg-white focus:shadow-[0_4px_20px_rgba(13,148,136,0.1)] focus:outline-none transition-all duration-200"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-teal-500 transition-colors duration-200"
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Remember + forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-500 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-[#0d9488]" />
                {t('login.rememberMe')}
              </label>
              <a href="#" className="font-medium text-[#C90016] hover:underline">{t('login.forgotPassword')}</a>
            </div>

            {schoolError && (
              <div className="rounded-2xl bg-amber-50/80 border border-amber-200/50 p-3 text-xs text-amber-800 backdrop-blur-sm">
                {schoolError}
              </div>
            )}
            {error && (
              <div className="rounded-2xl bg-red-50/80 border border-red-200/50 p-3 text-xs text-red-700 backdrop-blur-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] py-3.5 text-sm font-bold text-white shadow-[0_8px_30px_rgba(15,77,146,0.3)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(15,77,146,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? t('login.signingIn') : t('login.signIn')}
              </span>
            </button>
          </form>

          {/* Parent signup link */}
          {mode === 'users' && (
            <p className="mt-4 text-center text-sm text-gray-500">
              {t('login.noAccount')}{' '}
              <button
                onClick={() => { setAuthView(authView === 'signup' ? 'login' : 'signup'); setError(''); }}
                className="font-bold text-[#0d9488] hover:underline"
              >
                {authView === 'signup' ? t('login.signInInstead') : t('login.createAccount')}
              </button>
            </p>
          )}

          {/* Parent signup form */}
          {authView === 'signup' && mode === 'users' && (
            <form onSubmit={handleSignup} className="mt-5 space-y-3 rounded-2xl bg-white/50 backdrop-blur-sm p-4 border border-white/50 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {t('login.registerTitle')}
              </p>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="name" value={signupForm.name} onChange={(e) => setSignupForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={t('login.registerFullName')} required
                  className="w-full rounded-xl border border-gray-200/80 bg-white/70 py-2.5 pl-10 pr-3 text-sm focus:border-teal-400 focus:outline-none transition-all duration-200" />
              </div>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="phone" type="tel" value={signupForm.phone} onChange={(e) => setSignupForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder={t('login.registerPhone')} required
                  className="w-full rounded-xl border border-gray-200/80 bg-white/70 py-2.5 pl-10 pr-3 text-sm focus:border-teal-400 focus:outline-none transition-all duration-200" />
              </div>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="email" type="email" value={signupForm.email} onChange={(e) => setSignupForm(p => ({ ...p, email: e.target.value }))}
                  placeholder={t('login.registerEmail')}
                  className="w-full rounded-xl border border-gray-200/80 bg-white/70 py-2.5 pl-10 pr-3 text-sm focus:border-teal-400 focus:outline-none transition-all duration-200" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input name="password" type="password" value={signupForm.password} onChange={(e) => setSignupForm(p => ({ ...p, password: e.target.value }))}
                  placeholder={t('login.registerPassword')} required minLength={6}
                  className="w-full rounded-xl border border-gray-200/80 bg-white/70 py-2.5 pl-10 pr-3 text-sm focus:border-teal-400 focus:outline-none transition-all duration-200" />
              </div>
              <button type="submit" disabled={signupLoading || !form.school_id}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)] transition-all duration-300 hover:shadow-[0_8px_25px_rgba(16,185,129,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">
                {signupLoading ? t('login.creatingAccount') : t('login.createParentAccount')}
              </button>
            </form>
          )}

          <div className="mt-5 flex items-center justify-center gap-3 text-xs text-gray-400">
            <span>{t('common.poweredBy')}</span>
            <span className="hidden lg:inline-flex"><PublicLoginSwitcher /></span>
          </div>
        </section>
      </div>
    </div>
  );
}
