import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Baby,
  BookOpen,
  CheckCircle2,
  Gamepad2,
  GraduationCap,
  LogOut,
  ShieldCheck,
  XCircle,
  Eye,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { getSchoolId } from '@/lib/utils/school';
import { t } from '@/lib/i18n';
import A11ySettings from '@/components/A11ySettings';
import AdminNav from '@/components/AdminNav';
import KidPageBackground from '@/components/KidPageBackground';

/** Decode the JWT payload (role/school claims) — never trust it for authz. */
function decodeToken(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

interface NavCard {
  title: string;
  description: string;
  icon: typeof Baby;
  audience: 'parent' | 'staff' | 'student';
  sprint: string;
  to?: string;
}

interface NavCardI18n {
  titleKey: string;
  descriptionKey: string;
}

const NAV_CARDS: Array<NavCard & NavCardI18n> = [
  {
    titleKey: 'dashboard.card.children',
    descriptionKey: 'dashboard.card.childrenDesc',
    title: 'My Children',
    description: '',
    icon: Baby,
    audience: 'parent',
    sprint: 'Live',
    to: '/parent',
  },
  {
    titleKey: 'dashboard.card.activities',
    descriptionKey: 'dashboard.card.activitiesDesc',
    title: 'Child Activities',
    description: '',
    icon: Eye,
    audience: 'parent',
    sprint: 'Live',
    to: '/parent/activities',
  },
  {
    titleKey: 'dashboard.card.progressReport',
    descriptionKey: 'dashboard.card.progressReportDesc',
    title: 'Progress Report',
    description: '',
    icon: BarChart3,
    audience: 'parent',
    sprint: 'Live',
    to: '/parent',
  },
  {
    titleKey: 'dashboard.card.lessons',
    descriptionKey: 'dashboard.card.lessonsDesc',
    title: 'Lessons',
    description: '',
    icon: BookOpen,
    audience: 'staff',
    sprint: 'Live',
    to: '/teacher/lessons',
  },
  {
    titleKey: 'dashboard.card.approvals',
    descriptionKey: 'dashboard.card.approvalsDesc',
    title: 'Approvals',
    description: '',
    icon: ShieldCheck,
    audience: 'staff',
    sprint: 'Live',
    to: '/teacher/approvals',
  },
  {
    titleKey: 'dashboard.card.myGames',
    descriptionKey: 'dashboard.card.myGamesDesc',
    title: 'My Games',
    description: '',
    icon: Gamepad2,
    audience: 'student',
    sprint: 'Live',
    to: '/student',
  },
  {
    titleKey: 'dashboard.card.myProgress',
    descriptionKey: 'dashboard.card.myProgressDesc',
    title: 'My Progress',
    description: '',
    icon: BarChart3,
    audience: 'student',
    sprint: 'Live',
    to: '/student',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [user, setUser] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    try {
      setUser(decodeToken(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || ''));
    } catch {
      setUser(null);
    }

    apiClient
      .get('/health')
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    toast.success(t('dashboard.signedOut'));
    navigate('/login');
  }, [navigate]);

  const role = String(user?.user_type || 'User');
  const isStaff = /admin|teacher|superadmin/i.test(role);
  const isStudent = /student/i.test(role);
  const isParent = /parent/i.test(role);

  useEffect(() => {
    if (isParent) navigate('/parent', { replace: true });
  }, [isParent, navigate]);

  const cards = NAV_CARDS.filter((c) => {
    if (isStaff) return c.audience === 'staff';
    if (isStudent) return c.audience === 'student';
    return c.audience === 'parent';
  });
  const schoolId = getSchoolId();

  const welcomeLabel = isStaff ? 'teacher' : isStudent ? 'student' : isParent ? 'parent' : 'staff';

  return (
    <div className="min-h-screen">
      {isStaff ? (
        <AdminNav />
      ) : (
        <>
          {isStudent && <KidPageBackground />}
          <header className="relative border-b border-[#0F4D92]/10">
            {/* Blur lives on an inner layer — the header element itself must not
                create a stacking context, or the fixed dropdown panels inside
                (A11ySettings) get trapped under page content. */}
            <div className="pointer-events-none absolute inset-0 bg-white/80 backdrop-blur-xl" />
            <div className="relative z-30 mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src="/logo.svg" alt={t('dashboard.brand')} className="h-10 w-10 rounded-2xl object-contain shadow-lg shadow-[#0F4D92]/20" />
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border-2 border-white shadow-sm" />
                </div>
                <div>
                  <h1 className="text-lg font-extrabold leading-tight bg-gradient-to-r from-[#0F4D92] to-[#0d9488] bg-clip-text text-transparent">{t('dashboard.brand')}</h1>
                  <p className="text-xs text-gray-500 font-medium">
                    {schoolId ? `${schoolId} · ` : ''}
                    <span className="capitalize">{role}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <A11ySettings />
                <span
                  className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-semibold backdrop-blur-sm ${
                    apiOk === null
                      ? 'bg-gray-100 text-gray-500'
                      : apiOk
                        ? 'bg-green-50/80 text-green-700 border border-green-200/50'
                        : 'bg-red-50/80 text-red-700 border border-red-200/50'
                  }`}
                  title={apiOk === null ? t('dashboard.checkingApi') : apiOk ? t('dashboard.apiReachable') : t('dashboard.apiUnreachable')}
                >
                  {apiOk === null ? (
                    <GraduationCap className="h-3.5 w-3.5" />
                  ) : apiOk ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {apiOk === null ? t('dashboard.checking') : apiOk ? t('dashboard.apiOnline') : t('dashboard.apiOffline')}
                </span>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-red-200/80 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:shadow-sm active:scale-95"
                >
                  <LogOut className="h-4 w-4" /> {t('dashboard.signOut')}
                </button>
              </div>
            </div>
          </header>
        </>
      )}

      {/* Body */}
      <main className={`mx-auto max-w-5xl px-4 py-8 ${isStudent ? 'relative z-10' : ''}`}>
        <h2 className="text-xl font-extrabold text-gray-800">
          {t('dashboard.welcomeUser', { role: welcomeLabel })} 👋
        </h2>
        <p className="mb-6 text-sm text-gray-500 font-medium">
          {isStaff
            ? t('dashboard.staffBlurb')
            : isStudent
              ? t('dashboard.studentBlurb')
              : t('dashboard.parentBlurb')}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => {
            const body = (
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0F4D92]/10 to-[#0d9488]/10 text-[#0F4D92] shadow-sm">
                  <card.icon className="h-6 w-6" />
                </span>
                <span className="rounded-2xl bg-green-50/80 px-2.5 py-1 text-[11px] font-semibold text-green-700 border border-green-200/50">
                  {t('dashboard.live')}
                </span>
              </div>
            );
            const title = <h3 className="font-bold text-gray-800">{t(card.titleKey)}</h3>;
            const desc = <p className="mt-1 text-sm text-gray-500 font-medium">{t(card.descriptionKey)}</p>;

            return card.to ? (
              <Link
                key={card.title}
                to={card.to}
                className="group rounded-3xl border border-white/80 bg-white/70 backdrop-blur-sm p-5 shadow-lg shadow-[#0F4D92]/5 transition-all hover:border-[#0F4D92]/20 hover:shadow-xl hover:shadow-[#0F4D92]/10 hover:scale-[1.02] active:scale-[0.99]"
              >
                {body}
                {title}
                {desc}
              </Link>
            ) : (
              <div
                key={card.title}
                className="rounded-3xl border border-white/80 bg-white/70 backdrop-blur-sm p-5 shadow-lg shadow-[#0F4D92]/5 transition-all hover:shadow-xl"
              >
                {body}
                {title}
                {desc}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
