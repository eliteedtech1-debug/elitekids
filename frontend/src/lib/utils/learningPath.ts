/**
 * Learning-path dashboard helpers (TECH-SPEC-LEARNING-PATH).
 *
 * Mirrors the backend contract of GET /kids/learning-path (kidsSeries.js) and
 * GET/POST /kids/goals/:admissionNo (kidsGoals.js) — see b3-learning-path
 * tests for the canonical response shape. Kept as PURE functions so every
 * path-state rule (marker position, lock gating, node states, goal math) is
 * unit-testable without rendering DOM.
 */

/* ── Contract types (backend response shapes) ─────────────────────── */

export type LessonState = 'none' | 'practice_done' | 'passed';
export type UnitRelation = 'passed_below' | 'spillover' | 'current';
export type GoalSetter = 'auto' | 'child' | 'teacher';

export interface PathLesson {
  lesson_id: string;
  title: string;
  age_level: string;
  state: LessonState;
}

export interface PathUnit {
  unit_id: string;
  unit_number: number;
  title: string | null;
  topic: string | null;
  relation: UnitRelation;
  done: boolean;
  locked: boolean;
  locked_reason: string | null;
  lessons: PathLesson[];
}

export interface PathSeries {
  series_id: string;
  name: string;
  category: string | null;
  units: PathUnit[];
}

export interface WeeklyGoal {
  type: 'weekly';
  target: number;
  done: number;
  period_start: string;
  period_end: string;
  set_by: GoalSetter;
  status: 'active' | 'done';
}

export interface LearningPathData {
  student: { age_band: string | null; class_name: string | null };
  goal: WeeklyGoal | null;
  path: PathSeries[];
}

export type GameMode = 'learning' | 'practice' | 'test';

/* ── Age-band mapping + in-band ceiling filter ────────────────────── */
/* Mirrors the server-side resolver (backend/src/services/ageBand.js) so the
   offline catalog / subject tabs can never widen a child's band. Unknown
   classes resolve to null = show nothing (narrowest, never widest). */

export const AGE_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export function bandRank(band: string): number {
  return AGE_BANDS.indexOf(band as AgeBand);
}

/** Map a student's class_name to the lesson age_level category. */
export function classToAgeLevel(className: string | null | undefined): AgeBand | null {
  if (!className) return null;
  const raw = className.trim();
  const normalized = raw
    .toLowerCase()
    .replace(/cls\d+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  if (/creche|pre.?nursery|pre.?school/.test(normalized)) return 'Creche';
  if (/nursery|nurs/.test(normalized)) return 'Nursery';
  if (/\bkg1\b|kindergarten.?1|\bkg.?1\b/.test(normalized)) return 'KG1';
  if (/\bkg2\b|kindergarten.?2|\bkg.?2\b/.test(normalized)) return 'KG2';
  if (/\bkg3\b|kindergarten.?3|\bkg.?3\b/.test(normalized)) return 'Primary';

  const basicMatch = normalized.match(/\bbasic\s*(\d+)/);
  if (basicMatch) {
    const num = parseInt(basicMatch[1]);
    if (num <= 1) return 'KG1';
    if (num <= 2) return 'KG2';
    return 'Primary';
  }

  if (/\bjss\s*\d|\bjunior\s*sec|\bjunior\b/.test(normalized)) return 'Primary';
  if (/\bsss\s*\d|\bsenior\s*sec|\bsenior\b/.test(normalized)) return 'Primary';

  if (/hadana|hifz|huffaz|halkat/.test(normalized)) return 'Primary';
  if (/islamiyya|islamic|madrasa|madrasah|tarbiyah/.test(normalized)) return 'Primary';
  if (/quran|koran|tajweed/.test(normalized)) return 'Primary';

  const levelMatch = normalized.match(/\b(?:level|class|grade|form|std|standard|year|stage)\s*(\d+)/);
  if (levelMatch) {
    const num = parseInt(levelMatch[1]);
    if (num <= 1) return 'Creche';
    if (num <= 2) return 'Nursery';
    if (num <= 3) return 'KG1';
    if (num <= 4) return 'KG2';
    return 'Primary';
  }

  const bareNum = normalized.match(/(\d+)\s*$/);
  if (bareNum) {
    const num = parseInt(bareNum[1]);
    if (num <= 1) return 'KG1';
    if (num <= 2) return 'KG2';
    return 'Primary';
  }

  if (/primar|basic|element|junior/.test(normalized)) return 'Primary';
  if (/nurs|toddler|baby|infant/.test(normalized)) return 'Nursery';
  if (/pre/.test(normalized)) return 'Creche';

  return null;
}

/** Lessons at-or-below the child's band (never above). */
export function filterInBand<T extends { age_level?: string }>(lessons: T[], band: AgeBand | null): T[] {
  if (!band) return [];
  const max = bandRank(band);
  if (max === -1) return [];
  return lessons.filter((l) => {
    const r = bandRank(l.age_level || '');
    return r !== -1 && r <= max;
  });
}

/* ── Path-state decision helpers ──────────────────────────────────── */

export interface FlattenedUnit {
  series: PathSeries;
  unit: PathUnit;
}

/** Ordered unit walk across the whole path (backend already orders units
 *  below-band-first inside each series and units come in series order). */
export function flattenUnits(data: LearningPathData | null | undefined): FlattenedUnit[] {
  if (!data?.path) return [];
  const out: FlattenedUnit[] = [];
  for (const s of data.path) {
    for (const u of s.units) out.push({ series: s, unit: u });
  }
  return out;
}

/**
 * The child's current position = first unfinished unit in path order
 * (spill-over recovery comes first by construction, then the current band).
 * Returns the flattened index, or null when every unit is done.
 */
export function currentPositionIndex(data: LearningPathData | null | undefined): number | null {
  const flat = flattenUnits(data);
  for (let i = 0; i < flat.length; i++) {
    if (!flat[i].unit.done) return i;
  }
  return null;
}

/** A unit's lesson nodes are playable only when the unit itself is open
 *  (never locked). Locked units (and every lesson inside) are not clickable. */
export function isUnitOpen(unit: PathUnit): boolean {
  return !unit.locked;
}

/** Unit completion stats from per-lesson state. */
export function unitStats(unit: PathUnit): { done: number; total: number } {
  return {
    done: unit.lessons.filter((l) => l.state === 'passed').length,
    total: unit.lessons.length,
  };
}

/**
 * Default game mode for a path lesson tap:
 *  - not started      → practice (first action; Learn/Practice/Test are all
 *                       still switchable inside GamePlay)
 *  - practice done    → test (E3f gate needs a passed Test >= 50)
 *  - passed           → practice replay (never regress; replay is safe)
 */
export function defaultModeFor(state: LessonState | undefined): GameMode {
  if (state === 'practice_done') return 'test';
  if (state === 'passed') return 'practice';
  return 'practice';
}

/** Week goal progress 0–100. */
export function goalPercent(goal: WeeklyGoal | null | undefined): number {
  if (!goal || goal.target <= 0) return 0;
  return Math.min(100, Math.round((goal.done / goal.target) * 100));
}

/** Is this unit the divider point where the child's own band starts?
 *  (first current-relation unit of a series that also carries below units) */
export function isBandStart(data: LearningPathData | null | undefined, unit: PathUnit): boolean {
  if (!data || unit.relation !== 'current') return false;
  for (const s of data.path) {
    const idx = s.units.findIndex((u) => u.unit_id === unit.unit_id);
    if (idx === -1) continue;
    const earlier = s.units.slice(0, idx);
    // Only the FIRST current unit of a series that carried below-band units
    // is the divider — later current units keep rendering as plain nodes.
    if (!earlier.some((u) => u.relation === 'current')) {
      return earlier.some((u) => u.relation === 'spillover' || u.relation === 'passed_below');
    }
  }
  return false;
}

/** Human target label for the goal picker (kept in one place for tests). */
export const GOAL_CHOICES = [1, 2, 3, 4, 5] as const;
