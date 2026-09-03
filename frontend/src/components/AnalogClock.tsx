/**
 * AnalogClock — pure SVG analog clock graphic.
 *
 * Used as the step graphic + closing-check visual inside stage-sequence
 * lessons (clock progression 1:00 → 3:15 → 3:45, simple → complex) and as a
 * quiz `visual`. No DOM measurement — hands/ticks are SVG transforms around
 * the centre. Hand math lives in lib/game/clock.ts (unit-tested).
 */
import { parseClockTime, clockAngles } from '@/lib/game/clock';

interface AnalogClockProps {
  /** Analog time string ("3:15", "12:00", …). Invalid → renders a plain face. */
  time: string;
  /** SVG size in px. */
  size?: number;
  /** Draw the 1–12 numerals (default true). */
  showNumerals?: boolean;
  /** Optional second hand sweep (default false). */
  animate?: boolean;
  /** Face hex (default white). */
  faceColor?: string;
  /** Hands hex (default near-black). */
  handColor?: string;
  /** Extra CSS classes for the wrapper. */
  className?: string;
  /** Aria label override (defaults to "Analog clock: H:MM"). */
  ariaLabel?: string;
}

const NUMERAL_POSITIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function AnalogClock({
  time,
  size = 170,
  showNumerals = true,
  animate = false,
  faceColor = '#FFFFFF',
  handColor = '#1F2937',
  className = '',
  ariaLabel,
}: AnalogClockProps) {
  const parsed = parseClockTime(time);
  if (!parsed) {
    // Nothing valid to draw — show a plain face so layouts don't collapse.
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={className}
        role="img"
        aria-label={ariaLabel || 'Analog clock'}
      >
        <circle cx="50" cy="50" r="48" fill={faceColor} stroke="#CBD5E1" strokeWidth="2" />
      </svg>
    );
  }
  const { hourDeg, minuteDeg, secondDeg } = clockAngles(parsed.hour, parsed.minute, parsed.second);
  const c = 50; // centre (viewBox 0 0 100 100)
  const displayHour = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  const label = ariaLabel || `Analog clock: ${displayHour}:${String(parsed.minute).padStart(2, '0')}`;

  // Ticks: 60 minute marks, emphasised every 5 minutes.
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const deg = i * 6;
    const rOuter = major ? 46 : 43.5;
    const rInner = major ? 39.5 : 42;
    return (
      <line
        key={i}
        x1={c}
        y1={c - rOuter}
        x2={c}
        y2={c - rInner}
        stroke={major ? '#334155' : '#94A3B8'}
        strokeWidth={major ? 1.8 : 0.8}
        transform={`rotate(${deg} ${c} ${c})`}
      />
    );
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={label}
    >
      {/* Face */}
      <circle cx={c} cy={c} r={48} fill={faceColor} stroke="#CBD5E1" strokeWidth="1.5" />
      {ticks}
      {showNumerals &&
        NUMERAL_POSITIONS.map((n) => {
          const deg = n * 30;
          const rad = (deg * Math.PI) / 180;
          const nx = c + Math.sin(rad) * 32;
          const ny = c - Math.cos(rad) * 32;
          return (
            <text
              key={n}
              x={nx}
              y={ny + 3.2}
              textAnchor="middle"
              fontSize="9"
              fontWeight={n % 3 === 0 ? 800 : 600}
              fill="#475569"
            >
              {n}
            </text>
          );
        })}
      {/* Minute hand */}
      <g transform={`rotate(${minuteDeg} ${c} ${c})`}>
        <rect x={c - 1.1} y={10} width={2.2} height={36} rx={1.4} fill={handColor} />
      </g>
      {/* Hour hand */}
      <g transform={`rotate(${hourDeg} ${c} ${c})`}>
        <rect x={c - 1.7} y={22} width={3.4} height={25} rx={1.8} fill={handColor} />
      </g>
      {/* Second hand (optional sweep) */}
      {secondDeg !== undefined && (
        <g transform={`rotate(${secondDeg} ${c} ${c})`} className={animate ? 'origin-center' : undefined}>
          <line x1={c} y1={16} x2={c} y2={48} stroke="#EF4444" strokeWidth="0.8" />
        </g>
      )}
      {/* Centre caps */}
      <circle cx={c} cy={c} r={2.6} fill={handColor} />
      <circle cx={c} cy={c} r={1.1} fill="#FFFFFF" />
    </svg>
  );
}
