import { Flame, Sparkles } from 'lucide-react';
import { levelFromXp, streakMultiplierFor } from '@/lib/game/adaptive';

interface XPBarProps {
  xpTotal: number;
  streakDays?: number;
  compact?: boolean;
}

export default function XPBar({ xpTotal, streakDays = 0, compact = false }: XPBarProps) {
  const info = levelFromXp(xpTotal);
  const streak = streakMultiplierFor(streakDays);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-yellow-400" />
        <span className="font-bold text-yellow-400">{xpTotal.toLocaleString()}</span>
        <span className="text-white/40">XP</span>
        {streakDays > 0 && (
          <span className="ml-1 flex items-center gap-0.5 text-orange-400">
            <Flame className="h-4 w-4" /> {streakDays}
          </span>
        )}
      </div>
    );
  }

  const pct = Math.round(info.progress * 100);
  const isFresh = xpTotal === 0;

  return (
    <div className="w-full rounded-2xl bg-white/5 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-bold text-white">
            Level {info.level} · {info.title}
          </span>
        </div>
        <span className="text-xs text-white/70">
          {isFresh ? '🌱 Tap a lesson to start' : `${xpTotal.toLocaleString()} XP`}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFresh
              ? 'bg-gradient-to-r from-emerald-400/60 to-teal-400/60 animate-pulse'
              : info.isMax
              ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
              : 'bg-gradient-to-r from-yellow-400 to-orange-400'
          }`}
          style={{ width: `${Math.max(pct, isFresh ? 8 : 4)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-white/70">
        <span>
          {isFresh
            ? 'Earn XP by finishing games'
            : info.isMax
            ? 'Max level'
            : `${pct}% to next`}
        </span>
        {streakDays > 0 && (
          <span className="flex items-center gap-0.5 text-orange-400">
            <Flame className="h-3.5 w-3.5" /> {streakDays} day streak
            {streak.multiplier > 1 ? ` · ${streak.multiplier}×` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
