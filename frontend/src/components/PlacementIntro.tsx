import { Check, LogOut, Star } from 'lucide-react';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import KidPageBackground from '@/components/KidPageBackground';

/**
 * PlacementIntro — isolated "find your level" gate for flagship kids.
 *
 * Shown INSTEAD of the student dashboard until the child has a completed
 * placement result (GET /kids/placement/status → placed). There is no skip:
 * the placement measurement is what assigns a flagship child their class,
 * exactly like class_name does for every real-school child.
 */
export default function PlacementIntro({
  onStart,
  onSignOut,
}: {
  /** Open the placement quiz (full-screen overlay). */
  onStart: () => void;
  /** Log out — the only exit until the quiz is finished. */
  onSignOut: () => void;
}) {
  const benefits = [
    t('placement.intro.bullet1'),
    t('placement.intro.bullet2'),
    t('placement.intro.bullet3'),
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <KidPageBackground />
      <div className="pointer-events-none absolute -left-16 top-16 h-48 w-48 rounded-full bg-[#0d9488]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-24 h-56 w-56 rounded-full bg-[#0F4D92]/15 blur-3xl" />

      <div className="relative w-full max-w-md text-center animate-game-slide-up">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#0F4D92]/60">
            {t('placement.intro.eyebrow')}
          </span>
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        </div>

        <span className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4D92]/10 to-[#0d9488]/15 text-6xl shadow-inner animate-game-bounce">
          🎯
        </span>

        <h1 className="text-3xl font-black text-gray-800">{t('placement.intro.title')}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-gray-500">{t('placement.intro.body')}</p>

        <div className="mt-6 grid gap-2.5 rounded-3xl border border-[#0F4D92]/10 bg-white/80 p-4 text-left backdrop-blur-sm">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0d9488] to-emerald-500 text-white">
                <Check className="h-3 w-3" />
              </span>
              {benefit}
            </div>
          ))}
        </div>

        <button
          onClick={() => { playTap(); onStart(); }}
          className="mt-7 w-full rounded-2xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-8 py-4 text-base font-bold text-white shadow-xl shadow-blue-200/60 transition hover:brightness-110 active:scale-[0.98]"
        >
          🎯 {t('placement.intro.cta')}
        </button>
        <p className="mt-2 text-xs font-medium text-gray-400">⏱️ {t('placement.intro.takesLong')}</p>
      </div>

      <button
        onClick={() => { playTap(); onSignOut(); }}
        aria-label={t('placement.intro.signout')}
        className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold text-gray-600 shadow-sm backdrop-blur-sm transition hover:bg-white active:scale-95"
      >
        <LogOut className="h-4 w-4" /> {t('placement.intro.signout')}
      </button>
    </div>
  );
}