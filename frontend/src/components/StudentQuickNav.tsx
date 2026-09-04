import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Gamepad2, BookOpenCheck, Mic, ShoppingBag, X } from 'lucide-react';
import { t } from '@/lib/i18n';
import { playTap } from '@/lib/utils/sound';
import { haptic } from '@/lib/utils/haptic';

/**
 * StudentQuickNav — floating quick-action button (bottom-right FAB) that
 * expands into kid-sized shortcuts: Home, Jump to Games, Review Zone,
 * Speak & Shop. Each action shows a label bubble on hover AND on tap
 * (kids on tablets never hover), so every shortcut is always labelled.
 *
 * Mount OUTSIDE the sticky header / main stacking contexts (direct child of
 * the page root) so its z-index is scoped to the page root only:
 *  - FAB + expanded items sit at z-[60]: above the student header (z-30),
 *    the live bar (z-40) and review-zone content, below nothing it needs.
 *  - Outside `pointerdown` closes the menu (works for mouse + touch);
 *    Escape closes too.
 */

interface StudentQuickNavProps {
  /** Open the Companion Shop modal (owned by StudentHome). */
  onOpenShop: () => void;
  /** Switch to the first playable subject tab and scroll to the games grid. */
  onOpenGames: () => void;
  /** Smooth-scroll to the Review Zone section. */
  onOpenReview: () => void;
}

interface QuickAction {
  key: string;
  icon: React.ReactNode;
  label: string;
  color: string; // gradient classes for the action bubble
  onClick: () => void;
}

export default function StudentQuickNav({ onOpenShop, onOpenGames, onOpenReview }: StudentQuickNavProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Label bubble shown on hover OR tap (kids on tablets never hover) —
  // set on pointer-down so the label is visible BEFORE the action runs.
  const [tipKey, setTipKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape + on outside pointerdown (works for mouse and touch).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Clear any pending tooltip-hide timer on unmount.
  useEffect(
    () => () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    },
    [],
  );

  const flashTip = (key: string) => {
    setTipKey(key);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTipKey(null), 1400);
  };

  const run = (action: () => void) => {
    playTap();
    haptic('light');
    action();
    setOpen(false);
  };

  const actions: QuickAction[] = [
    {
      key: 'home',
      icon: <Home className="h-5 w-5" />,
      label: t('student.quicknav.home'),
      color: 'from-[#0F4D92] to-[#0d9488]',
      onClick: () =>
        run(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }),
    },
    {
      key: 'games',
      icon: <Gamepad2 className="h-5 w-5" />,
      label: t('student.quicknav.games'),
      color: 'from-purple-500 to-indigo-500',
      onClick: () => run(onOpenGames),
    },
    {
      key: 'review',
      icon: <BookOpenCheck className="h-5 w-5" />,
      label: t('student.quicknav.review'),
      color: 'from-orange-400 to-amber-500',
      onClick: () => run(onOpenReview),
    },
    {
      key: 'speak',
      icon: <Mic className="h-5 w-5" />,
      label: t('student.quicknav.speak'),
      color: 'from-teal-400 to-emerald-500',
      onClick: () => run(() => navigate('/student/speech')),
    },
    {
      key: 'shop',
      icon: <ShoppingBag className="h-5 w-5" />,
      label: t('student.quicknav.shop'),
      color: 'from-pink-500 to-rose-500',
      onClick: () => run(onOpenShop),
    },
  ];

  return (
    <div ref={rootRef} className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2.5">
      {open &&
        actions.map((a, idx) => (
          <div
            key={a.key}
            className="flex items-center gap-2.5 animate-game-slide-up"
            style={{ animationDelay: `${idx * 30}ms`, animationFillMode: 'backwards' }}
          >
            {/* Label bubble — visible on hover AND for 1.4s after tap */}
            <span
              className={`rounded-xl bg-white/95 px-2.5 py-1 text-xs font-bold text-gray-700 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-opacity duration-150 ${
                tipKey === a.key ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-hidden={tipKey !== a.key}
            >
              {a.label}
            </span>
            <button
              type="button"
              aria-label={a.label}
              onPointerDown={() => flashTip(a.key)}
              onMouseEnter={() => setTipKey(a.key)}
              onMouseLeave={() => setTipKey(null)}
              onClick={a.onClick}
              className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${a.color} text-white shadow-xl ring-2 ring-white/60 transition-all hover:scale-110 active:scale-95`}
            >
              {a.icon}
            </button>
          </div>
        ))}

      {/* Main FAB — toggles the menu; 🎮/✕ shows state at a glance */}
      <button
        type="button"
        aria-label={open ? t('speech.close') : t('student.quicknav.open')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#C90016] via-orange-500 to-amber-500 text-white shadow-2xl shadow-orange-300/40 ring-4 ring-white/50 transition-all hover:scale-105 active:scale-95 ${
          open ? '' : 'animate-game-pulse'
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <Gamepad2 className="h-7 w-7" />}
      </button>
    </div>
  );
}
