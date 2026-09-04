/**
 * Kid activity report helpers (pure, unit-tested, no DOM).
 *
 * Powers the GitHub-contribution-style grid and the XP trend chart:
 *  - activityLevel(): 0-4 heat level from games played that day
 *  - buildWeekColumns(): dense day series → columns of 7 (Mon..Sun)
 *  - monthLabels(): month name positions across the columns
 *  - xpTrendPath(): SVG polyline points for the XP-per-day curve
 */

export interface DayActivity {
  date: string; // YYYY-MM-DD
  games: number;
  xp: number;
  stars: number;
}

/** Heat levels 0-4 (mirrors GitHub's "No activity → Most active"). */
export const ACTIVITY_LEVELS = 5;

/** Day → heat level. 0 = nothing, 1 = 1 game, 2 = 2, 3 = 3-4, 4 = 5+. */
export function activityLevel(games: number): number {
  if (games <= 0) return 0;
  if (games === 1) return 1;
  if (games === 2) return 2;
  if (games <= 4) return 3;
  return 4;
}

/** Tailwind classes per level — emerald ramp like GitHub's green. */
export const LEVEL_CLASS = [
  'bg-gray-100',
  'bg-emerald-200',
  'bg-emerald-300',
  'bg-emerald-400',
  'bg-emerald-500',
] as const;

/**
 * Build week columns (Mon-first) from an ascending day series. Calendar
 * gaps are filled with empty days so every date lands on its true column
 * (a sparse series must not shift later dates left).
 */
export function buildWeekColumns(series: DayActivity[]): DayActivity[][] {
  if (!series.length) return [];
  // Dense-fill: every calendar day from first to last gets a slot.
  const dense: DayActivity[] = [];
  const cursor = new Date(`${series[0].date}T00:00:00`);
  const last = new Date(`${series[series.length - 1].date}T00:00:00`);
  const byDate = new Map(series.map((d) => [d.date, d]));
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    dense.push(byDate.get(key) || { date: key, games: 0, xp: 0, stars: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const first = new Date(`${dense[0].date}T00:00:00`);
  const lead = (first.getDay() + 6) % 7; // Monday=0 … Sunday=6
  const flat: (DayActivity | null)[] = Array.from({ length: lead }, () => null);
  for (const d of dense) flat.push(d);
  while (flat.length % 7 !== 0) flat.push(null);
  const cols: DayActivity[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    cols.push(flat.slice(i, i + 7).filter(Boolean) as DayActivity[]);
  }
  return cols;
}

/** Month labels aligned to week columns: [{ index, label }] at first column of each month. */
export function monthLabels(series: DayActivity[]): Array<{ index: number; label: string }> {
  const labels: Array<{ index: number; label: string }> = [];
  let lastMonth = -1;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const first = new Date(`${series[0]?.date || new Date().toISOString().slice(0, 10)}T00:00:00`);
  const lead = (first.getDay() + 6) % 7;
  series.forEach((d, i) => {
    const dt = new Date(`${d.date}T00:00:00`);
    if (dt.getMonth() !== lastMonth) {
      lastMonth = dt.getMonth();
      labels.push({ index: Math.floor((i + lead) / 7), label: MONTHS[lastMonth] });
    }
  });
  // de-duplicate labels landing on the same column
  return labels.filter((l, i, arr) => i === 0 || l.index !== arr[i - 1].index);
}

/**
 * SVG points for the XP trend (x evenly spaced, y inverted to chart coords).
 * Skips leading flat days so a fresh kid's chart starts where the action is.
 */
export function xpTrendPath(
  series: DayActivity[],
  width: number,
  height: number,
  padding = 6
): { points: string; lastX: number; lastY: number; maxXp: number } {
  if (!series.length) return { points: '', lastX: 0, lastY: 0, maxXp: 0 };
  const maxXp = Math.max(1, ...series.map((d) => d.xp));
  // Trim leading zero-xp days (keeps new kids' charts meaningful).
  let start = 0;
  while (start < series.length - 1 && series[start].xp === 0) start++;
  const data = series.slice(start);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts: string[] = [];
  let lastX = padding, lastY = height - padding;
  data.forEach((d, i) => {
    const x = padding + step * i;
    const y = height - padding - (d.xp / maxXp) * innerH;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    lastX = x; lastY = y;
  });
  return { points: pts.join(' '), lastX, lastY, maxXp };
}
