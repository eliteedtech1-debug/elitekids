/**
 * AppSwitcher — Google-style launcher to switch between Elite family apps.
 *
 * Mirrors EliteFin's AppSwitcher (elitefin/elitefin/frontend/src/components/AppSwitcher.tsx)
 * and EliteCBT's (elite-cbt/frontend/src/components/layout/AppSwitcher.tsx):
 *   • Access = school subscription (modules from elite-api /api/apps/access)
 *             + role filter (per-app allowed roles).
 *   • Admins see ALL apps — unsubscribed ones show "Not subscribed".
 *   • Parents/teachers/students only see apps their school subscribed to.
 *   • Passes the shared JWT via ?token= for seamless cross-app handoff (no re-login).
 *
 * Data source: ONE shared endpoint on elite-api (GET /api/apps/access) which all
 * suite frontends call with the same JWT. Falls back to the EliteFin localStorage
 * caches (elitefin_modules / rbac_menu_cache_*) if the endpoint is unreachable.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { LayoutGrid, Lock, ExternalLink } from 'lucide-react';
import { STORAGE_KEYS } from '@/lib/utils/constants';

/** Shared elite-api base — single source of truth for cross-app access. */
const ELITE_API_URL =
  (import.meta.env.VITE_ELITE_API_URL as string | undefined) ||
  'https://server.brainstorm.ng/elite-api';

interface EliteApp {
  key: string; // module key in school_setup / /api/apps/access
  label: string;
  emoji: string;
  desc: string;
  url: string;
  color: string;
  roles: string[]; // user_types allowed to use this app
}

const ELITE_APPS: EliteApp[] = [
  {
    key: 'core', label: 'EliteCore', emoji: '⚙️',
    desc: 'Core Platform — Students, Teachers, Academics, SMS',
    url: 'https://elitecore.com.ng', color: '#3D5EE1',
    roles: ['admin', 'staff', 'proprietor', 'principal', 'director', 'accountant', 'teacher', 'parent', 'student'],
  },
  {
    key: 'fees', label: 'EliteFin', emoji: '💰',
    desc: 'School Finance — Invoices, Payments, Reports',
    url: 'https://elitefin.com.ng', color: '#1a365d',
    roles: ['admin', 'staff', 'proprietor', 'principal', 'director', 'accountant', 'cashier', 'teacher', 'parent'],
  },
  {
    key: 'cbt', label: 'EliteCBT', emoji: '📝',
    desc: 'Computer-Based Testing — Exams & Assessments',
    url: 'https://elitecbt.com.ng', color: '#7c3aed',
    roles: ['admin', 'staff', 'proprietor', 'principal', 'director', 'accountant', 'teacher', 'student', 'parent'],
  },
  {
    key: 'kids', label: 'EliteKids', emoji: '👶',
    desc: 'Gamified Nursery & Primary Learning',
    url: 'https://elitekids.com.ng', color: '#ea580c',
    roles: ['admin', 'staff', 'proprietor', 'principal', 'director', 'accountant', 'teacher', 'parent'],
  },
];

const ADMIN_ROLES = ['admin', 'staff', 'proprietor', 'principal', 'director', 'accountant', 'superadmin'];

function getToken(): string | null {
  try {
    // The app stores the token WITH the 'Bearer ' prefix; strip it so the
    // Authorization header isn't 'Bearer Bearer <jwt>' (same fix as EliteCore).
    const t = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    return t && t.startsWith('Bearer ') ? t.slice(7) : t;
  } catch { return null; }
}

function normalizeRole(role: string | undefined | null): string {
  return String(role || '').toLowerCase().trim();
}

function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Best-effort fallback: read EliteCore's RBAC menu cache (set on login). */
function getRBACApps(): Set<string> {
  const apps = new Set<string>(['core']);
  try {
    const cacheKey = Object.keys(localStorage).find(
      (k) => k.startsWith('rbac_menu_cache_') && !k.endsWith('_null')
    );
    if (!cacheKey) return apps;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return apps;
    const { data } = JSON.parse(cached);
    if (!data?.menu) return apps;
    for (const cat of data.menu) {
      const name = (cat.label || cat.name || '').toLowerCase();
      if (name.includes('finance') || name.includes('express')) apps.add('fees');
      if (name.includes('cbt')) apps.add('cbt');
      if (name.includes('kids')) apps.add('kids');
      if (name.includes('sms') || name.includes('messaging')) apps.add('sms');
      if (name.includes('super admin') || name.includes('superadmin')) {
        apps.add('fees'); apps.add('cbt'); apps.add('kids'); apps.add('sms');
      }
    }
  } catch { /* ignore cache errors */ }
  return apps;
}

interface Access {
  role: string;
  modules: string[];
}

export default function AppSwitcher() {
  const token = getToken();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;

    // 1) Try the shared elite-api endpoint (authoritative).
    axios
      .get(`${ELITE_API_URL}/api/apps/access`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      })
      .then((res) => {
        if (cancelled) return;
        const d = res.data;
        if (d?.ok) {
          setAccess({ role: normalizeRole(d.role), modules: Array.isArray(d.modules) ? d.modules : ['core', 'fees'] });
        }
      })
      .catch(() => {
        // 2) Fallback: EliteFin-style localStorage caches.
        if (cancelled) return;
        let modules: string[] = ['core', 'fees'];
        try {
          const raw = localStorage.getItem('elitefin_modules');
          if (raw) modules = JSON.parse(raw);
        } catch { /* ignore */ }
        const rbac = getRBACApps();
        setAccess({ role: '', modules: [...new Set([...modules, ...rbac])] });
      });

    return () => { cancelled = true; };
  }, [token]);

  const isCurrentApp = useCallback((app: EliteApp) => {
    const hostname = window.location.hostname;
    if (app.key === 'kids' && hostname.includes('elitekids')) return true;
    if (app.key === 'fees' && hostname.includes('elitefin')) return true;
    if (app.key === 'cbt' && hostname.includes('elitecbt')) return true;
    if (app.key === 'core' && (hostname.includes('elitecore') || hostname.includes('elitesms'))) return true;
    return false;
  }, []);

  const isAdmin = isAdminRole(access?.role || '');

  const handleOpen = useCallback((app: EliteApp) => {
    const url = token ? `${app.url}?token=${encodeURIComponent(token)}` : app.url;
    window.open(url, '_blank');
  }, [token]);

  const rows = useMemo(() => {
    if (!access) return null;
    const { modules, role } = access;

    return ELITE_APPS.map((app) => {
      const current = isCurrentApp(app);
      const roleAllowed = app.roles.includes(role);
      const subscribed = modules.includes(app.key);
      const hasAccess = roleAllowed && subscribed;

      return {
        key: app.key,
        current,
        hasAccess,
        app,
        hint: !roleAllowed
          ? 'Not available for your role'
          : subscribed
            ? ''
            : (isAdmin ? 'Not subscribed — contact Elite support' : 'Not available for your school'),
      };
    });
  }, [access, isCurrentApp, isAdmin]);

  if (!token || !rows) return null;

  const accessibleCount = rows.filter((r) => r.hasAccess).length;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg border border-[#0F4D92]/20 p-2 sm:px-2.5 sm:py-1.5 text-xs font-medium text-[#0F4D92] transition hover:bg-[#0F4D92]/5 shrink-0 active:scale-95"
      >
        <LayoutGrid className="h-5 w-5" />
        <span className="hidden sm:inline">Apps</span>
        {accessibleCount > 0 && (
          <span className="ml-0.5 rounded-full bg-[#0F4D92] px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
            {accessibleCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Elite Apps
            </div>
            {rows.map((row) => {
              const { app, current, hasAccess, hint } = row;
              return (
                <button
                  key={row.key}
                  type="button"
                  role="menuitem"
                  disabled={!hasAccess}
                  onClick={() => {
                    if (!hasAccess) return;
                    setOpen(false);
                    handleOpen(app);
                  }}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition ${
                    hasAccess ? 'hover:bg-gray-50' : 'cursor-not-allowed'
                  } ${current ? 'opacity-60' : ''}`}
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                    style={{ background: `${app.color}14` }}
                  >
                    {app.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                      {!hasAccess && !current && <Lock className="h-3 w-3 text-amber-500" />}
                      {app.label}
                      {current && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          Current
                        </span>
                      )}
                      {hasAccess && !current && <ExternalLink className="h-3 w-3 text-gray-400" />}
                    </span>
                    <span className="block truncate text-[11px] text-gray-500">{app.desc}</span>
                    {hint && !current && (
                      <span className="block text-[11px] font-medium text-amber-500">{hint}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
