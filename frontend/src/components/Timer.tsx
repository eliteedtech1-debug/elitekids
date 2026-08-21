import { useEffect, useState } from 'react';

interface TimerProps {
  durationSec: number;
  onTimeUp: () => void;
  running: boolean;
  className?: string;
}

/**
 * Countdown timer that displays MM:SS and fires onTimeUp when it hits zero.
 * Pauses when running=false.
 */
export default function Timer({ durationSec, onTimeUp, running, className = '' }: TimerProps) {
  const [remaining, setRemaining] = useState(durationSec);

  // Reset when duration changes
  useEffect(() => {
    setRemaining(durationSec);
  }, [durationSec]);

  // Countdown tick
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, remaining <= 0]);

  // Fire onTimeUp when zero
  useEffect(() => {
    if (remaining === 0 && running) onTimeUp();
  }, [remaining, running, onTimeUp]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = durationSec > 0 ? (remaining / durationSec) * 100 : 0;
  const urgent = remaining <= 10;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${
            urgent ? 'bg-red-500' : pct > 50 ? 'bg-green-500' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`min-w-[3rem] text-right text-sm font-bold tabular-nums ${
          urgent ? 'text-red-600 animate-pulse' : 'text-gray-600'
        }`}
      >
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  );
}

/**
 * Restartable timer — exposes a reset() via key prop.
 */
export function useTimerKey(durationSec: number) {
  return { key: `timer-${durationSec}-${Date.now()}` };
}
