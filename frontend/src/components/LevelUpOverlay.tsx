import { useEffect } from 'react';
import { Trophy, Sparkles, X } from 'lucide-react';

interface LevelUpOverlayProps {
  isOpen: boolean;
  newLevel: number;
  title: string;
  unlocked?: string[];
  onClose: () => void;
}

export default function LevelUpOverlay({ isOpen, newLevel, title, unlocked = [], onClose }: LevelUpOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="animate-scale-in relative w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-gradient-to-b from-yellow-400/10 to-white/5 p-6 text-center shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-white/10 p-1.5 text-white/60 transition hover:bg-white/20 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 shadow-[0_0_40px_rgba(251,191,36,0.5)]">
          <Trophy className="h-8 w-8 text-white" />
        </div>

        <div className="mt-4 flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-widest text-yellow-300">
          <Sparkles className="h-3.5 w-3.5" /> Level Up! <Sparkles className="h-3.5 w-3.5" />
        </div>

        <div className="mt-1 text-5xl font-extrabold text-white">{newLevel}</div>
        <div className="mt-1 text-lg font-semibold text-yellow-300">{title}</div>

        {unlocked.length > 0 && (
          <div className="mt-4 rounded-2xl bg-white/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">New unlocks</div>
            <ul className="mt-1.5 space-y-1 text-sm text-white/80">
              {unlocked.map((u) => (
                <li key={u} className="flex items-center gap-2">
                  <span className="text-yellow-400">✦</span> {u}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 py-2.5 font-bold text-white shadow-lg transition hover:brightness-110"
        >
          Awesome!
        </button>
      </div>
    </div>
  );
}
