import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ShieldCheck, LayoutDashboard, LogOut, GraduationCap, Image, Wand2, BarChart3 } from 'lucide-react';
import { useCallback } from 'react';
import { STORAGE_KEYS } from '@/lib/utils/constants';
import { t } from '@/lib/i18n';
import toast from 'react-hot-toast';
import AppSwitcher from './AppSwitcher';

const NAV_ITEMS = [
  { to: '/dashboard', labelKey: 'adminNav.dashboard', icon: LayoutDashboard },
  { to: '/teacher/lessons', labelKey: 'adminNav.lessons', icon: BookOpen },
  { to: '/teacher/create-game', labelKey: 'adminNav.create', icon: Wand2 },
  { to: '/teacher/approvals', labelKey: 'adminNav.reviews', icon: ShieldCheck },
  { to: '/teacher/analytics', labelKey: 'adminNav.analytics', icon: BarChart3 },
  { to: '/admin/assets', labelKey: 'adminNav.assets', icon: Image },
];

/**
 * Shared admin/teacher navigation bar.
 * Shows at the top of every staff-facing page.
 * Highlights the active page.
 */
export default function AdminNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SCHOOL_ID);
    localStorage.removeItem(STORAGE_KEYS.BRANCH_ID);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_BRANCH);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    toast.success(t('dashboard.signedOut'));
    navigate('/login');
  }, [navigate]);

  return (
    <header className="border-b border-[#0F4D92]/10 bg-white">
      {/* Top row: logo + nav links + logout */}
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5">
        <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
          <img src="/logo.svg" alt={t('login.brand')} className="h-9 w-9 sm:h-8 sm:w-8 rounded-full object-contain" />
          <span className="hidden sm:inline text-sm font-bold text-[#0F4D92]">{t('login.brand')}</span>
        </Link>

        {/* Nav tabs */}
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            const showBadge = item.to === '/teacher/approvals' && pendingCount > 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={t(item.labelKey)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 sm:px-3 sm:py-1.5 text-sm font-medium transition-all active:scale-95 ${
                  isActive
                    ? 'bg-[#0F4D92] text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="hidden sm:inline">{t(item.labelKey)}</span>
                {showBadge && (
                  <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Cross-app launcher (AppSwitcher) */}
        <AppSwitcher />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 p-2 sm:px-2.5 sm:py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 shrink-0 active:scale-95"
        >
          <LogOut className="h-5 w-5" />
          <span className="hidden sm:inline">{t('admin.signOut')}</span>
        </button>
      </div>
    </header>
  );
}
