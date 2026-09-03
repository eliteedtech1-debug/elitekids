import { useEffect, useState } from 'react';
import { Sparkles, Target, Route, X } from 'lucide-react';
import { playTap } from '@/lib/utils/sound';
import { t } from '@/lib/i18n';

interface WelcomeSpotlightProps {
  /** Anchor id of the goal card section to highlight. */
  goalAnchorId?: string;
  /** Anchor id of the learning-path section to highlight. */
  pathAnchorId?: string;
  onClose: () => void;
}

/**
 * Lightweight, non-blocking welcome overlay shown on the first login of a
 * returning student (i.e. onboarding already complete on the server). It
 * scrolls the goal card into view, pulses it, and points the child at the
 * Set button so the weekly-goal setup is unmissable. Closes on X, on
 * backdrop tap, or after `autoCloseMs`.
 */
export default function WelcomeSpotlight({
  goalAnchorId = 'welcome-goal-card',
  pathAnchorId = 'welcome-learning-path',
  onClose,
}: WelcomeSpotlightProps) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const goalEl = document.getElementById(goalAnchorId);
    goalEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => handleClose(), 12000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    playTap();
    setClosing(true);
    window.setTimeout(onClose, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      aria-live="polite"
      role="dialog"
    >
      {/* Soft scrim — clicking closes the tour */}
      <button
        type="button"
        onClick={handleClose}
        aria-label={t('common.close')}
        className="absolute inset-0 bg-[#0F4D92]/30 backdrop-blur-[2px]"
      />

      {/* Spotlight ring around the goal card */}
      <GoalRing anchorId={goalAnchorId} />

      {/* Tip card pointing at the goal */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 mx-auto max-w-sm px-4">
        <div className="pointer-events-auto rounded-3xl border border-white/60 bg-white/95 p-4 shadow-2xl shadow-[#0F4D92]/30 backdrop-blur-xl animate-game-slide-up">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-base font-extrabold text-gray-800">
                {t('student.welcome.title', { defaultValue: "Welcome back! Let's set today's goal 🎯" })}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs font-medium text-gray-500">
            {t('student.welcome.body', {
              defaultValue:
                'Tap the Set button to pick how many games you want to finish this week. Your garden grows as you reach your target!',
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              <Target className="h-3 w-3" />
              {t('student.goal.title', { defaultValue: "This week's goal" })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F4D92]/10 px-2.5 py-1 text-[11px] font-bold text-[#0F4D92]">
              <Route className="h-3 w-3" />
              {t('student.tab.path', { defaultValue: 'Learning path' })}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="ml-auto rounded-xl bg-gradient-to-r from-[#0F4D92] to-[#0d9488] px-3 py-1.5 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95"
            >
              {t('common.gotIt', { defaultValue: "Let's go!" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalRing({ anchorId }: { anchorId: string }) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = document.getElementById(anchorId);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({
        top: r.top - 8,
        left: r.left - 8,
        width: r.width + 16,
        height: r.height + 16,
      });
    };
    measure();
    const t1 = window.setTimeout(measure, 400);
    const t2 = window.setTimeout(measure, 900);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', measure);
    };
  }, [anchorId]);

  if (!box) return null;
  return (
    <div
      className="pointer-events-none absolute rounded-3xl ring-4 ring-amber-300/90 shadow-[0_0_0_9999px_rgba(15,77,146,0.25)] animate-game-pulse"
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
    />
  );
}
