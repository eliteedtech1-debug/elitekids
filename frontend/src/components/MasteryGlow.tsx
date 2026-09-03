import { MASTERY_VISUALS, type MasteryState } from '@/lib/types/adaptive';
import { masteryLabel } from '@/lib/game/adaptive';

interface MasteryGlowProps {
  state: MasteryState;
  probability: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function MasteryGlow({ state, probability, size = 'md' }: MasteryGlowProps) {
  const visual = MASTERY_VISUALS[state] || MASTERY_VISUALS.new;
  const dims = {
    sm: { box: 'h-10 w-10', text: 'text-lg', ring: 'ring-2' },
    md: { box: 'h-14 w-14', text: 'text-2xl', ring: 'ring-4' },
    lg: { box: 'h-20 w-20', text: 'text-4xl', ring: 'ring-4' },
  }[size];

  const pct = Math.round(probability * 100);

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div
        className={`flex ${dims.box} items-center justify-center rounded-full border ${visual.color} ${dims.ring} ${
          visual.glow ? 'shadow-[0_0_24px_rgba(74,222,128,0.5)]' : ''
        }`}
      >
        {pct >= 85 ? (
          <span className={dims.text}>🌟</span>
        ) : pct >= 70 ? (
          <span className={dims.text}>🌱</span>
        ) : pct >= 50 ? (
          <span className={dims.text}>✨</span>
        ) : pct >= 30 ? (
          <span className={dims.text}>📖</span>
        ) : (
          <span className={dims.text}>🌱</span>
        )}
      </div>
      <span className={`text-xs font-semibold ${visual.color}`}>{masteryLabel(state)}</span>
      <span className="text-[10px] text-white/40">{pct}%</span>
    </div>
  );
}
