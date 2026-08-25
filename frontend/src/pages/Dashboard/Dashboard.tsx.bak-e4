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
} from 'lucide-react';
import apiClient from '@/lib/api/client';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { getSchoolId } from '@/lib/utils/school';
import A11ySettings from '@/components/A11ySettings';
import AdminNav from '@/components/AdminNav';

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

const NAV_CARDS: NavCard[] = [
  {
    title: 'My Children',
    description: "View each child's games, stars and progress.",
    icon: Baby,
    audience: 'parent',
    sprint: 'Live',
    to: '/parent',
  },
  {
    title: 'Child Activities',
    description: 'See published lessons and games your children can play.',
    icon: Eye,
    audience: 'parent',
    sprint: 'Live',
    to: '/parent/activities',
  },
  {
    title: 'Progress Report',
    description: "Detailed breakdown of each child's XP, stars and games.",
    icon: BarChart3,
    audience: 'parent',
    sprint: 'Live',
    to: '/parent',
  },
  {
    title: 'Lessons',
    description: 'Create lessons and review AI-generated games.',
    icon: BookOpen,
    audience: 'staff',
    sprint: 'Live',
    to: '/teacher/lessons',
  },
  {
    title: 'Approvals',
    description: 'Review and publish pending game content.',
    icon: ShieldCheck,
    audience: 'staff',
    sprint: 'Live',
    to: '/teacher/approvals',
  },
  {
    title: 'My Games',
    description: 'Play educational games and earn stars and XP!',
    icon: Gamepad2,
    audience: 'student',
    sprint: 'Live',
    to: '/student',
  },
  {
    title: 'My Progress',
    description: 'Check your stars, XP and games completed.',
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

    // Live wiring check: proves the SPA can reach elite-kids-api.
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
    toast.success('Signed out');
    navigate('/login');
  }, [navigate]);

  const role = String(user?.user_type || 'User');
  const isStaff = /admin|teacher|superadmin/i.test(role);
  const isStudent = /student/i.test(role);
  const isParent = /parent/i.test(role);

  // Staff auto-redirects to lessons — but still renders if they navigate here directly
  const cards = NAV_CARDS.filter((c) => {
    if (isStaff) return c.audience === 'staff';
    if (isStudent) return c.audience === 'student';
    return c.audience === 'parent'; // default: parent view
  });
  const schoolId = getSchoolId();

  const welcomeLabel = isStaff ? 'teacher' : isStudent ? 'student' : isParent ? 'parent' : 'staff';

  return (
    <div className="min-h-screen bg-[#E7EEF6]">
      {isStaff ? (
        <AdminNav />
      ) : (
      <header className="border-b border-[#0F4D92]/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Elite Kids" className="h-10 w-10 rounded-full object-contain" />
            <div>
              <h1 className="text-lg font-bold leading-tight text-[#0F4D92]">Elite Kids</h1>
              <p className="text-xs text-gray-500">
                {schoolId ? `${schoolId} · ` : ''}
                <span className="capitalize">{role}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <A11ySettings />
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                apiOk === null
                  ? 'bg-gray-100 text-gray-500'
                  : apiOk
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
              }`}
              title={apiOk === null ? 'Checking API...' : apiOk ? 'API reachable' : 'API unreachable'}
            >
              {apiOk === null ? (
                <GraduationCap className="h-3.5 w-3.5" />
              ) : apiOk ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {apiOk === null ? 'Checking...' : apiOk ? 'API online' : 'API offline'}
            </span>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      )}

      {/* Body */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-800">
          Welcome, {welcomeLabel} 👋
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          {isStaff
            ? 'Manage lessons, review AI content and approve games for your students.'
            : isStudent
              ? 'Play educational games and earn stars and XP!'
              : "Track your children's learning progress, view their activities and published games."}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => {
            const badge = card.to ? (
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                {card.sprint}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                {card.sprint}
              </span>
            );
            const body = (
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F4D92]/10 text-[#0F4D92]">
                  <card.icon className="h-6 w-6" />
                </span>
                {badge}
              </div>
            );
            const title = <h3 className="font-semibold text-gray-800">{card.title}</h3>;
            const desc = <p className="mt-1 text-sm text-gray-500">{card.description}</p>;

            return card.to ? (
              <Link
                key={card.title}
                to={card.to}
                className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm transition hover:border-[#0F4D92]/30 hover:shadow-md"
              >
                {body}
                {title}
                {desc}
              </Link>
            ) : (
              <div
                key={card.title}
                className="rounded-2xl border border-[#0F4D92]/10 bg-white p-5 shadow-sm transition hover:shadow-md"
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
