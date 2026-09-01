// Login page — mirror of elite-cbt/src/pages/Login/Login.jsx, adapted for
// EliteKids: Teacher / Parent toggle (children never log in), school crest +
// name from school_setup via subdomain, Kids Stand-Alone module gate.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { User, Lock, GraduationCap, Users, Eye, EyeOff } from 'lucide-react';
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

    // Strip the one-time ticket from URL immediately.
    params.delete('handoff_ticket');
    const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);

    // Redeem the ticket centrally. Session establishment is intentionally
    // separate from the ticket so no raw JWT is exposed to this page.
    (async () => {
      try {
        const res = await apiClient.post('/api/apps/kids/redeem-ticket', { ticket });
        const data = res.data as any;
        if (data?.ok && (data?.user_id || data?.user)) {
          const user: any = data.user || { id: data.user_id, school_id: data.school_id, user_type: data.user_type || '' };
          // Fresh short-lived session minted by the exchange — store it so the
          // app boots as a logged-in user (no raw JWT ever appeared in the URL).
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
          // Token invalid — clear and show login
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          setError('Session expired. Please log in again.');
        }
      } catch {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        setError('Could not verify session. Please log in again.');
      }
    })();
  }, [navigate]);

  // Resolve a school short name → crest + name + real school_id (public
  // endpoint, no token needed). Shared by the subdomain auto-detect and the
  // manual short-name field shown on localhost/unknown hosts.
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
        // Store the real school_id for the API but keep the short name in the input.
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

  // Auto-detect school from subdomain (kids.elitekids.com.ng → 'kids')
  useEffect(() => {
    if (!short_name || short_name === 'localhost') return;
    loadSchool(getSchoolShortName());
  }, [loadSchool]);

  // Module gate — school must have Kids Stand-Alone enabled
  if (school && !hasKidsAccess(school)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6] p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <img src={school.badge_url || '/logo.svg'} alt={t('login.schoolLogoAlt')} className="mx-auto mb-4 h-20 w-20 rounded-full object-contain" />
          <h2 className="text-2xl font-bold text-[#0F4D92]">{t('login.brand')}</h2>
          <p className="mb-4 text-sm text-gray-500">{t('login.subtitle')}</p>
          <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
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
    // For localhost/manual entry: a short name must have resolved to a school_id.
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
        // Also store user type so the Dashboard can distinguish roles
        const userType = data.user?.user_type || data.user_type || '';
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify({ user_type: userType }));
        toast.success(t('login.loginSuccess'));
        // Route students to their own page; parents to their dashboard; staff to main dashboard
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
    <div className="min-h-screen bg-[#E7EEF6] p-4 sm:p-6 lg:flex lg:items-center lg:justify-center">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-lg lg:flex">
        <section className="hidden min-h-[620px] w-[40%] flex-col justify-between bg-gradient-to-br from-[#0a1628] via-[#0F4D92] to-[#2c5282] p-10 text-white lg:flex">
          <div>
            <img src="/logo.svg" alt="Elite brand" className="mb-6 h-20 w-20 rounded-2xl object-contain" />
            <h1 className="text-3xl font-bold">Elite Kids</h1>
            <p className="mt-2 text-sm text-blue-100">Gamified learning for early education.</p>
          </div>
          <LoginAppsPanel />
        </section>
        <section className="w-full p-6 sm:p-8 lg:w-[60%] lg:p-10">
          <div className="mb-4 flex items-center justify-end lg:hidden">
            <PublicLoginSwitcher />
          </div>
          {/* Crest + brand */}
        <div className="mb-4 text-center">
          <img src={school?.badge_url || '/logo.svg'} alt={t('login.schoolLogoAlt')} className="mx-auto mb-3 h-20 w-20 rounded-full object-contain" />
          <h2 className="text-2xl font-bold text-[#0F4D92]">
            {school?.school_name ? t('login.welcomeTo', { school: school.school_name }) : t('dashboard.welcomeUser', { role: t('login.brand') })}
          </h2>
          <p className="text-sm text-gray-500">{t('login.brand')} · {t('login.subtitle')}</p>
        </div>

        {/* Teacher / Parent toggle */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('users')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === 'users' ? 'bg-[#0F4D92] text-white' : 'border border-[#0F4D92] text-[#0F4D92]'
            }`}
          >
            <GraduationCap className="mr-2 inline" /> {t('login.modeTeacher')}
          </button>
          <button
            type="button"
            onClick={() => setMode('students')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === 'students' ? 'bg-[#0F4D92] text-white' : 'border border-[#0F4D92] text-[#0F4D92]'
            }`}
          >
            <Users className="mr-2 inline" /> {t('login.modeStudent')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {(!short_name || short_name === 'localhost') && (
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input
                name="school_id"
                value={shortNameInput}
                onChange={(e) => {
                  setShortNameInput(e.target.value);
                  // Clear stale branding while the short name is being edited.
                  setSchool(null);
                  setSchoolError('');
                  // Also clear the resolved school_id so stale values can't be submitted.
                  setForm((p) => ({ ...p, school_id: '' }));
                }}
                onBlur={(e) => {
                  // Manual entry (localhost): resolve branding once the field
                  // loses focus, like the subdomain auto-detect does.
                  const sn = e.target.value.trim();
                  if (sn) loadSchool(sn);
                }}
                placeholder={t('login.schoolShortName')}
                required
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none"
              />
            </div>
          )}
          <div className="relative">
            <User className="absolute left-3 top-3 text-gray-400" />
            <input
              name="email"
              type="text"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder={mode === 'students' ? t('login.admissionNo') : t('login.emailOrPhone')}
              required
              className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-gray-400" />
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder={t('login.password')}
              required
              className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-10 focus:border-[#0F4D92] focus:outline-none"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-gray-600">
              <input type="checkbox" className="accent-[#0F4D92]" /> {t('login.rememberMe')}
            </label>
            <a href="#" className="text-[#C90016]">{t('login.forgotPassword')}</a>
          </div>

          {schoolError && <p className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">{schoolError}</p>}
          {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0F4D92] py-2.5 font-semibold text-white transition hover:bg-[#0b3d76] disabled:opacity-60"
          >
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>

        {/* Parent signup link */}
        {mode === 'users' && (
          <p className="mt-3 text-center text-sm text-gray-500">
            {t('login.noAccount')}{' '}
            <button onClick={() => { setAuthView(authView === 'signup' ? 'login' : 'signup'); setError(''); }}
              className="font-semibold text-[#0F4D92] hover:underline">
              {authView === 'signup' ? t('login.signInInstead') : t('login.createAccount')}
            </button>
          </p>
        )}

        {/* Parent signup form */}
        {authView === 'signup' && mode === 'users' && (
          <form onSubmit={handleSignup} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600">{t('login.registerTitle')}</p>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input name="name" value={signupForm.name} onChange={(e) => setSignupForm(p => ({ ...p, name: e.target.value }))}
                placeholder={t('login.registerFullName')} required
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input name="phone" type="tel" value={signupForm.phone} onChange={(e) => setSignupForm(p => ({ ...p, phone: e.target.value }))}
                placeholder={t('login.registerPhone')} required
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input name="email" type="email" value={signupForm.email} onChange={(e) => setSignupForm(p => ({ ...p, email: e.target.value }))}
                placeholder={t('login.registerEmail')}
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" />
              <input name="password" type="password" value={signupForm.password} onChange={(e) => setSignupForm(p => ({ ...p, password: e.target.value }))}
                placeholder={t('login.registerPassword')} required minLength={6}
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <button type="submit" disabled={signupLoading || !form.school_id}
              className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
              {signupLoading ? t('login.creatingAccount') : t('login.createParentAccount')}
            </button>
          </form>
        )}

        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-gray-400">
          <span>{t('common.poweredBy')}</span>
          <span className="hidden lg:inline-flex"><PublicLoginSwitcher /></span>
        </div>
        </section>
      </div>
    </div>
  );
}
