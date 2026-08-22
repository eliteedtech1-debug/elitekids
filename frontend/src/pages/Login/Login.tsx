// Login page — mirror of elite-cbt/src/pages/Login/Login.jsx, adapted for
// EliteKids: Teacher / Parent toggle (children never log in), school crest +
// name from school_setup via subdomain, Kids Stand-Alone module gate.
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { User, Lock, GraduationCap, Users, Eye, EyeOff } from 'lucide-react';
import { short_name, hasKidsAccess, getSchoolShortName } from '@/lib/utils/school';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';
import { STORAGE_KEYS } from '@/lib/utils/constants';

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
        setSchoolError(res.data?.message || 'No active school found for this short name.');
      }
    } catch {
      setSchool(null);
      setSchoolError('Unable to reach the server. Please check your connection.');
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
          <img src={school.badge_url || '/logo.svg'} alt="School Logo" className="mx-auto mb-4 h-20 w-20 rounded-full object-contain" />
          <h2 className="text-2xl font-bold text-[#0F4D92]">Elite Kids</h2>
          <p className="mb-4 text-sm text-gray-500">Nursery Learning Platform</p>
          <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
            <p className="font-semibold">Access Restricted</p>
            <p>Your school doesn't subscribe to the Kids module. Please contact your administrator.</p>
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
      setError('Please enter a valid school short name and wait for it to resolve.');
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
        toast.success('Login successful!');
        // Route students to their own page; everyone else to dashboard
        navigate(/student/i.test(userType) ? '/student' : '/dashboard');
      } else {
        setError(data?.message || 'Login failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school_id) {
      setError('Please enter a valid school short name first.');
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
        toast.success('Account created! Welcome to Elite Kids.');
        navigate('/dashboard');
      } else {
        setError(data?.message || 'Signup failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Signup failed.');
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E7EEF6] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        {/* Crest + brand */}
        <div className="mb-4 text-center">
          <img src={school?.badge_url || '/logo.svg'} alt="School Logo" className="mx-auto mb-3 h-20 w-20 rounded-full object-contain" />
          <h2 className="text-2xl font-bold text-[#0F4D92]">
            {school?.school_name ? `Welcome to ${school.school_name}` : 'Welcome'}
          </h2>
          <p className="text-sm text-gray-500">Elite Kids · Nursery Learning Platform</p>
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
            <GraduationCap className="mr-2 inline" /> Teacher / Parent
          </button>
          <button
            type="button"
            onClick={() => setMode('students')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === 'students' ? 'bg-[#0F4D92] text-white' : 'border border-[#0F4D92] text-[#0F4D92]'
            }`}
          >
            <Users className="mr-2 inline" /> Student (Tablet)
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
                placeholder="School Short Name (e.g. DKG)"
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
              placeholder={mode === 'students' ? 'Admission number' : 'Email or phone number'}
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
              placeholder="Password"
              required
              className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-10 focus:border-[#0F4D92] focus:outline-none"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-gray-600">
              <input type="checkbox" className="accent-[#0F4D92]" /> Remember me
            </label>
            <a href="#" className="text-[#C90016]">Forgot Password?</a>
          </div>

          {schoolError && <p className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">{schoolError}</p>}
          {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0F4D92] py-2.5 font-semibold text-white transition hover:bg-[#0b3d76] disabled:opacity-60"
          >
            {loading ? 'Signing In…' : 'Sign In'}
          </button>
        </form>

        {/* Parent signup link */}
        {mode === 'users' && (
          <p className="mt-3 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <button onClick={() => { setAuthView(authView === 'signup' ? 'login' : 'signup'); setError(''); }}
              className="font-semibold text-[#0F4D92] hover:underline">
              {authView === 'signup' ? 'Sign In instead' : 'Create Account'}
            </button>
          </p>
        )}

        {/* Parent signup form */}
        {authView === 'signup' && mode === 'users' && (
          <form onSubmit={handleSignup} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600">Parent Registration</p>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input name="name" value={signupForm.name} onChange={(e) => setSignupForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Full name" required
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input name="phone" type="tel" value={signupForm.phone} onChange={(e) => setSignupForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="Phone number" required
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" />
              <input name="email" type="email" value={signupForm.email} onChange={(e) => setSignupForm(p => ({ ...p, email: e.target.value }))}
                placeholder="Email (optional)"
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" />
              <input name="password" type="password" value={signupForm.password} onChange={(e) => setSignupForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Create password" required minLength={6}
                className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-3 focus:border-[#0F4D92] focus:outline-none" />
            </div>
            <button type="submit" disabled={signupLoading || !form.school_id}
              className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
              {signupLoading ? 'Creating Account…' : 'Create Parent Account'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">Powered by Elite Edu Tech Systems</p>
      </div>
    </div>
  );
}
