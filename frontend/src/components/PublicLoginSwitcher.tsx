import { useState } from 'react';
import { Bell, ExternalLink, LayoutGrid, Megaphone } from 'lucide-react';

const APPS = [
  { key: 'core', label: 'EliteCore', emoji: '⚙️', url: 'https://elitecore.com.ng', description: 'School management' },
  { key: 'fees', label: 'EliteFin', emoji: '💰', url: 'https://elitefin.com.ng', description: 'Finance and payments' },
  { key: 'cbt', label: 'EliteCBT', emoji: '📝', url: 'https://elitecbt.com.ng', description: 'Exams and assessments' },
  { key: 'kids', label: 'EliteKids', emoji: '👶', url: 'https://elitekids.com.ng', description: 'Gamified learning' },
];

export default function PublicLoginSwitcher() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Open Elite Suite links"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
      >
        <LayoutGrid className="h-4 w-4" />
        <span>Elite Suite</span>
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 h-full w-full cursor-default" aria-label="Close links" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-gray-800"><Megaphone className="h-4 w-4 text-[#0F4D92]" /> Elite Suite</p>
              <p className="mt-1 text-xs text-gray-500">Explore public app information. Sign in before using private school data.</p>
            </div>
            <div className="p-2">
              {APPS.map((app) => (
                <a key={app.key} href={app.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-gray-50">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">{app.emoji}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-gray-800">{app.label}</strong><small className="block text-xs text-gray-500">{app.description}</small></span>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                </a>
              ))}
            </div>
            <div className="border-t border-gray-100 bg-blue-50 px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-[#0F4D92]"><Bell className="h-3.5 w-3.5" /> Quick reminder</p>
              <p className="mt-1 text-xs text-gray-600">Use <strong>demo</strong> for public demonstrations. Never enter a client school name on a shared device.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
