/**
 * Colorblind-safe palette — EliteKids accessibility layer.
 *
 * Provides alternative visual indicators that don't rely solely on color.
 * Used by GamePlay components to ensure correct/wrong feedback is
 * distinguishable for colorblind users (protanopia, deuteranopia, tritanopia).
 *
 * Design principles (Doc 17 §6):
 *   - Color + shape/pattern redundancy (never color alone)
 *   - High contrast ratios (WCAG AA: 4.5:1 minimum)
 *   - Consistent interaction patterns
 *   - Large, well-spaced tap targets (48px minimum)
 */

// ── Colorblind-safe feedback colors ─────────────────────────────────────────

/**
 * Correct/wrong colors that are distinguishable across color vision types.
 *
 * Standard:  green (#16A34A) / red (#DC2626)
 * Deuteranopia-safe: blue (#2563EB) / orange (#EA580C)
 *   — blue and orange are maximally distinct for all color vision types
 *
 * We use a dual-signal approach: color + icon/shape.
 */
export const FEEDBACK_COLORS = {
  correct: {
    standard: {
      bg: 'bg-green-50',
      border: 'border-green-400',
      text: 'text-green-700',
      shadow: 'shadow-green-200',
      hex: '#16A34A',
    },
    colorblind: {
      bg: 'bg-blue-50',
      border: 'border-blue-400',
      text: 'text-blue-700',
      shadow: 'shadow-blue-200',
      hex: '#2563EB',
    },
    /** Icon shown alongside color for redundant signaling. */
    icon: '✓',
    iconClass: 'text-current',
  },
  wrong: {
    standard: {
      bg: 'bg-red-50',
      border: 'border-red-400',
      text: 'text-red-600',
      shadow: 'shadow-red-200',
      hex: '#DC2626',
    },
    colorblind: {
      bg: 'bg-orange-50',
      border: 'border-orange-400',
      text: 'text-orange-600',
      shadow: 'shadow-orange-200',
      hex: '#EA580C',
    },
    /** Icon shown alongside color for redundant signaling. */
    icon: '✗',
    iconClass: 'text-current',
  },
  /** Neutral / in-progress state. */
  neutral: {
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    text: 'text-gray-600',
    hex: '#6B7280',
  },
} as const;

/**
 * Get the appropriate feedback colors based on colorblind mode.
 *
 * @param isColorblind - whether colorblind-safe mode is active
 * @param type - 'correct' or 'wrong'
 * @returns Tailwind class fragments
 */
export function getFeedbackClasses(
  isColorblind: boolean,
  type: 'correct' | 'wrong',
): { bg: string; border: string; text: string; shadow: string; icon: string } {
  const palette = isColorblind ? FEEDBACK_COLORS[type].colorblind : FEEDBACK_COLORS[type].standard;
  return {
    bg: palette.bg,
    border: palette.border,
    text: palette.text,
    shadow: palette.shadow,
    icon: FEEDBACK_COLORS[type].icon,
  };
}

/**
 * Get the full Tailwind class string for a feedback state.
 * Combines bg + border + text + optional animation.
 */
export function feedbackClassString(
  isColorblind: boolean,
  type: 'correct' | 'wrong',
  animation?: string,
): string {
  const c = getFeedbackClasses(isColorblind, type);
  const parts = [c.bg, c.border, c.text];
  if (animation) parts.push(animation);
  return parts.join(' ');
}

// ── Timer urgency colors ────────────────────────────────────────────────────

/**
 * Timer bar colors — safe across color vision types.
 *
 * Standard:  green → amber → red
 * Colorblind: blue → amber → magenta
 *   — magenta (#D946EF) is distinct from amber for all CVTs
 */
export const TIMER_COLORS = {
  safe: { standard: 'bg-green-500', colorblind: 'bg-blue-500', hex: '#16A34A' },
  warning: { standard: 'bg-amber-500', colorblind: 'bg-amber-500', hex: '#F59E0B' },
  urgent: { standard: 'bg-red-500', colorblind: 'bg-fuchsia-500', hex: '#D946EF' },
} as const;

export function getTimerColor(
  isColorblind: boolean,
  urgency: 'safe' | 'warning' | 'urgent',
): string {
  return isColorblind ? TIMER_COLORS[urgency].colorblind : TIMER_COLORS[urgency].standard;
}

// ── Status indicator colors ─────────────────────────────────────────────────

/**
 * Status badges — use icon + text + color for triple redundancy.
 */
export const STATUS_BADGES = {
  active: {
    standard: { bg: 'bg-green-100', text: 'text-green-700', icon: '●' },
    colorblind: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '●' },
  },
  inactive: {
    standard: { bg: 'bg-red-100', text: 'text-red-700', icon: '○' },
    colorblind: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '○' },
  },
  pending: {
    standard: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '◐' },
    colorblind: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '◐' },
  },
} as const;

// ── Age level badge colors ──────────────────────────────────────────────────

/**
 * Age level badges — distinct hues that work for colorblind users.
 * Each level has a unique lightness + hue combination.
 */
export const AGE_LEVEL_COLORS: Record<string, { standard: string; colorblind: string }> = {
  Creche:   { standard: 'bg-pink-100 text-pink-700',     colorblind: 'bg-pink-100 text-pink-700' },
  Nursery:  { standard: 'bg-purple-100 text-purple-700',  colorblind: 'bg-violet-100 text-violet-700' },
  KG1:      { standard: 'bg-blue-100 text-blue-700',      colorblind: 'bg-sky-100 text-sky-700' },
  KG2:      { standard: 'bg-green-100 text-green-700',    colorblind: 'bg-teal-100 text-teal-700' },
  Primary:  { standard: 'bg-amber-100 text-amber-700',    colorblind: 'bg-amber-100 text-amber-700' },
};

// ── Focus-visible styles ────────────────────────────────────────────────────

/**
 * Consistent focus ring for keyboard navigation.
 * Uses focus-visible to avoid showing rings on mouse click.
 *
 * Apply via: className={`${FOCUS_RING} ${otherClasses}`}
 */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';

/**
 * Focus ring for game buttons (thicker, more visible).
 */
export const FOCUS_RING_GAME =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:ring-offset-2';

// ── Reduced-motion helpers ──────────────────────────────────────────────────

/**
 * Check if reduced motion is preferred.
 * Returns true if the user prefers reduced motion.
 * Falls back to false (animations on) if the API is unavailable.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation class based on motion preference.
 * Returns the animation class if motion is allowed, empty string if reduced.
 */
export function motionClass(animationClass: string, reducedMotion?: boolean): string {
  const reduced = reducedMotion ?? prefersReducedMotion();
  return reduced ? '' : animationClass;
}

// ── High contrast mode ──────────────────────────────────────────────────────

/**
 * Check if high contrast is preferred.
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
}

/**
 * Get contrast-adjusted text color.
 * In high contrast mode, uses darker variants for better readability.
 */
export function contrastText(standard: string, highContrast: string): string {
  return prefersHighContrast() ? highContrast : standard;
}
