import { Flame, Snowflake } from 'lucide-react';
import { ordinalDay, streakMultiplierFor } from '@/lib/game/economy';

interface StreakCounterProps {
  current: number;
  longest?: number;
  freezeCount?: number;
  compact?: boolean;
}

export default function StreakCounter({ current, longest = 0, freezeCount = 0, compact = false }: StreakCounterProps) {
  const mult = streakMultiplierFor(current);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <Flame className="h-4 w-4 text-orange-400" />
        <span className="font-bold text-orange-400">{current}</span>
        {mult.multiplier > 1 && (
          <span className="rounded-full bg-orange-400/20 px-1.5 py-0.5 text-[10px] font-bold text-orange-300">
            {mult.multiplier}×
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-red-500 shadow-lg">
        <Flame className="h-6 w-6 text-white" />
      </div>
      <div>
        <div className="text-lg font-bold leading-none text-white">
          {current === 0 ? 'Start a streak!' : ordinalDay(current)}
        </div>
        <div className="mt-0.5 text-xs text-white/50">
          {mult.multiplier > 1 ? (
            <span className="font-semibold text-orange-300">{mult.label}</span>
          ) : (
            'Play daily for bonuses'
          )}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-white/50">
        {longest > 0 && <span className="hidden sm:block">Best: {longest}</span>}
        {freezeCount > 0 && (
          <span className="flex items-center gap-0.5 rounded-full bg-blue-400/20 px-2 py-0.5 text-blue-300">
            <Snowflake className="h-3 w-3" /> {freezeCount}
          </span>
        )}
      </div>
    </div>
  );
}
