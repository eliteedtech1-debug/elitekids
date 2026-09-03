/**
 * Clock math for the AnalogClock SVG — pure functions, no React/browser deps
 * so vitest can test hand angles directly (3:00/3:15/3:30/3:45/12:00 …).
 */

export interface ClockAngles {
  /** Hour hand angle in degrees clockwise from 12. */
  hourDeg: number;
  /** Minute hand angle in degrees clockwise from 12. */
  minuteDeg: number;
  /** Seconds hand angle (present when a seconds value was supplied). */
  secondDeg?: number;
}

/**
 * Convert an analog clock time (e.g. "3:15") to {hour, minute, second}.
 * Accepts "H", "H:MM" and "H:MM:SS" with an optional "am/pm" suffix.
 * Returns null for anything that is not a real clock time (12-hour, minute
 * < 60). Examples: "3:15" → {hour:3, minute:15}, "12:00" → {hour:12, minute:0}.
 */
export function parseClockTime(time?: string): { hour: number; minute: number; second: number } | null {
  if (!time) return null;
  const m = String(time).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  const second = m[3] !== undefined ? parseInt(m[3], 10) : 0;
  if (Number.isNaN(hour) || Number.isNaN(minute) || Number.isNaN(second)) return null;
  if (hour < 1 || hour > 12) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;
  // 12-hour clock: keep hour as-is (12 = 12 o'clock, 0 would be invalid input).
  if (m[4] === 'pm' && hour !== 12) hour += 12;
  if (m[4] === 'am' && hour === 12) hour = 0;
  return { hour, minute, second };
}

/**
 * Hand angles from an hour/minute pair.
 * Hour hand sweeps 30°/hour plus 0.5°/minute (so 3:15 sits a quarter past 3,
 * not exactly on the 3). Minute hand sweeps 6°/minute. 0° = pointing at 12.
 */
export function clockAngles(hour: number, minute: number, second = 0): ClockAngles {
  const h = ((hour % 12) + 12) % 12;
  return {
    hourDeg: h * 30 + minute * 0.5 + second * (0.5 / 60),
    minuteDeg: minute * 6 + second * 0.1,
    secondDeg: second * 6,
  };
}

/** Hand angles from a "H:MM" string — convenience for renderers. */
export function clockAnglesFromTime(time: string): ClockAngles | null {
  const parsed = parseClockTime(time);
  if (!parsed) return null;
  return clockAngles(parsed.hour, parsed.minute, parsed.second);
}
