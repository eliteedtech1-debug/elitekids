/**
 * Haptic vibration feedback via the Web Vibration API.
 * Safe to call on any platform — silently no-ops where unsupported (iOS Safari).
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light:     10,
  medium:    20,
  heavy:     40,
  success:   [10, 30, 10],
  error:     [30, 20, 30],
  selection: 5,
};

export function haptic(pattern: HapticPattern = 'light'): void {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(PATTERNS[pattern] ?? 10);
    }
  } catch {
    // Silently ignore — vibration blocked or unsupported
  }
}
