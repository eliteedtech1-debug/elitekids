/**
 * LoginAppsPanel — Desktop sidebar panel shown on login pages.
 *
 * Displays the Elite Suite apps as clickable cards on the left side of the
 * login card (desktop only). Serves as both advertising and easy access.
 *
 * Usage: Place inside the left branding section of any login page.
 *   <section className="hidden lg:flex ...">
 *     <LoginAppsPanel />
 *   </section>
 */
import { ExternalLink } from 'lucide-react';

interface AppItem {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  url: string;
  color: string;
}

const ELITE_APPS: AppItem[] = [
  {
    key: 'sms', label: 'Elite SMS', emoji: '📱',
    desc: 'School Management — Students, Teachers, Attendance',
    url: 'https://elitesms.com.ng', color: '#3D5EE1',
  },
  {
    key: 'fees', label: 'EliteFin', emoji: '💰',
    desc: 'Finance — Invoices, Payments, Reports',
    url: 'https://elitefin.com.ng', color: '#1a365d',
  },
  {
    key: 'cbt', label: 'EliteCBT', emoji: '📝',
    desc: 'Testing — Exams & Auto-grading',
    url: 'https://elitecbt.com.ng', color: '#7c3aed',
  },
  {
    key: 'kids', label: 'EliteKids', emoji: '👶',
    desc: 'Learning — Gamified Nursery & Primary',
    url: 'https://elitekids.com.ng', color: '#ea580c',
  },
];

export default function LoginAppsPanel() {
  return (
    <div className="flex flex-col justify-between h-full">
      {/* Top: Brand */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">
          Elite Suite
        </p>
      </div>

      {/* Middle: Apps */}
      <div className="space-y-2.5">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-200/60 mb-3">
          Our Apps
        </p>
        {ELITE_APPS.map((app) => (
          <a
            key={app.key}
            href={app.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-3 rounded-xl bg-white/[0.07] p-3 transition hover:bg-white/[0.14]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
              style={{ background: `${app.color}25` }}
            >
              {app.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                {app.label}
                <ExternalLink className="h-3 w-3 text-blue-300/0 transition group-hover:text-blue-300/80" />
              </span>
              <span className="block text-[11px] text-blue-200/70 leading-tight">{app.desc}</span>
            </span>
          </a>
        ))}
      </div>

      {/* Bottom: Footer */}
      <div className="text-xs text-blue-200/50">
        <p>Powered by Elite Edu Tech Systems</p>
      </div>
    </div>
  );
}
