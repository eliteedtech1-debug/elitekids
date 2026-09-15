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

// 'tested_out' = an approved jump-ahead exemption: the level is satisfied for the
// purpose of the lock, but it was never played and is NOT mastery.
export type LessonState = 'none' | 'practice_done' | 'passed' | 'tested_out';
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
  /** Done by an approved test-out rather than by playing every lesson. */
  exempt?: boolean;
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
   offline catalog / subject tabs can never widen a child's band.

   ONE LADDER, TWO VOCABULARIES. The rank is the position on the canonical
   NERDC six-band ladder (backend BAND_RANKS), because that is what the global
   catalog stores in kids_lessons.age_level and what the server's
   visibleLevels() ceiling compares against. The five legacy storage labels are
   accepted as aliases of the NERDC band they name (backend NERDC_TO_PLATFORM:
   Nursery→Nursery 1, KG1→Nursery 2, KG2→Kindergarten) so catalogs cached by
   older builds still rank.

   0 Crèche · 1 Playgroup · 2 Nursery 1 · 3 Nursery 2 · 4 Kindergarten ·
   5 Primary (incl. elder classes JSS/SSS/islamiyya → last rank, never an empty
   dashboard). Rank -1 = unknown label → never visible.

   2026-09-15: ranking lesson rows on the OLD five-value ladder returned -1 for
   every NERDC label, so a Nursery 1 child saw 0 of the server's 1085 lessons
   (only "Primary" is spelled the same in both vocabularies, which is why the
   bug hid from the Primary test child). */

export const AGE_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Canonical NERDC rank per accepted label (0 = youngest, 5 = Primary). */
export const BAND_RANKS: Record<string, number> = {
  // NERDC labels — what lesson rows carry
  'Crèche': 0,
  Creche: 0,
  Playgroup: 1,
  'Nursery 1': 2,
  'Nursery 2': 3,
  Kindergarten: 4,
  Primary: 5,
  // legacy storage labels → the NERDC band each one names
  Nursery: 2,
  KG1: 3,
  KG2: 4,
};

/** Canonical NERDC rank of a band label (either vocabulary), or -1. */
export function bandRank(band: string): number {
  const r = BAND_RANKS[String(band || '').trim()];
  return Number.isInteger(r) ? r : -1;
}

/**
 * Map a student's class_name to its canonical NERDC band.
 *
 * Mirrors backend/src/services/ageBand.js#classToAgeLevel rule-for-rule (same
 * order, same numbers) so the client ceiling can never disagree with the
 * server's: a class the server reads as Nursery 1 must be Nursery 1 here too.
 */
export function classToAgeLevel(className: string | null | undefined): NerdcBand | null {
  if (!className) return null;
  const raw = className.trim();
  const normalized = raw
    // Accent-fold FIRST (as the server does): real schools have classes named
    // "Crèche", and the punctuation strip below would otherwise flatten it to
    // "cr che" and lose the band completely.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/cls\d+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/(\d)(?=[a-z])/g, '$1 ') // "Nursery2A" → "nursery 2 a"
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  // Elder/secondary + Islamiyya vocabulary first → LAST rank (remedial door).
  if (/\bjss\b|\bjss\s*\d|\bsss\b|\bsss\s*\d|\bss\s*\d|junior\s*sec|senior\s*sec|secondary|college|polytechnic|tertiary/.test(normalized)) return 'Primary';
  // "Basic 1-6 ≡ Primary 1-6, Basic 7-9 ≡ JSS" — the server lands every Basic
  // form on the last rank.
  if (/\bbasic\s*\d/.test(normalized)) return 'Primary';
  if (/primar|element/.test(normalized)) return 'Primary';
  if (/hadana|hifz|huffaz|halkat|islamiyya|islamic|madrasa|madrasah|tarbiyah|quran|koran|tajweed/.test(normalized)) return 'Primary';

  // Playgroup — the pre-* family, BEFORE the generic nursery/kindergarten
  // keywords ("Pre-Nursery A" contains "nursery").
  if (/play ?group|\bpg\b|pre ?nursery|pre ?school|pre ?kindergarten|pre ?kg/.test(normalized)) return 'Playgroup';

  // Kindergarten — numbered KG-style forms stay narrow, as on the server.
  if (/\bkindergarten\s*1\b/.test(normalized)) return 'Nursery 1'; // ≡ KG1
  if (/\bkindergarten\s*2\b/.test(normalized)) return 'Nursery 2'; // ≡ KG2
  if (/kindergarten|kindergarden|reception|\bprep\b/.test(normalized)) return 'Kindergarten';

  // Nursery 2 / upper KG (numbered forms BEFORE generic keywords).
  if (/\b(?:nursery|nurs|nu)\s*2\b/.test(normalized)) return 'Nursery 2';
  if (/\bkg\s*2\b|upper ?kg|\bukg\b/.test(normalized)) return 'Nursery 2';

  // Third nursery year ≈ Kindergarten.
  if (/\b(?:nursery|nurs|nu)\s*3\b/.test(normalized)) return 'Kindergarten';

  // Nursery 1 / lower KG.
  if (/\b(?:nursery|nurs|nu)\s*1\b/.test(normalized)) return 'Nursery 1';
  if (/\bkg\s*1\b|lower ?kg|\blkg\b/.test(normalized)) return 'Nursery 1';

  // Crèche.
  if (/creche|crech|day ?care|baby|infant|toddler/.test(normalized)) return 'Crèche';

  // Generic nursery / KG with no number → the commonest entry point.
  if (/nursery|nurs|\bnu\b|\bkg\b/.test(normalized)) return 'Nursery 1';

  // Generic numbered ladder: Class/Year/Grade/Level N — 1 ≈ Nursery 1,
  // 2 ≈ Nursery 2, ≥3 ≈ Primary (never Crèche: Pre-Nursery is explicit vocab).
  const levelMatch = normalized.match(/\b(?:level|class|grade|form|std|standard|year|stage)\s*(\d+)/);
  if (levelMatch) {
    const num = parseInt(levelMatch[1], 10);
    if (num <= 1) return 'Nursery 1';
    if (num === 2) return 'Nursery 2';
    return 'Primary';
  }

  const bareNum = normalized.match(/(\d+)\s*$/);
  if (bareNum) {
    const num = parseInt(bareNum[1], 10);
    if (num <= 1) return 'Nursery 1';
    if (num === 2) return 'Nursery 2';
    return 'Primary';
  }

  if (/pre/.test(normalized)) return 'Playgroup';

  return null;
}

/** Term position used by the flagship catalog: First → Second → Third. */
const TERM_ORDER: Record<string, number> = { ft: 0, st: 1, tt: 2, first: 0, second: 1, third: 2 };

/**
 * Curriculum position of a lesson row, for grids the learning path does not
 * drive. Rows carry no term/week columns — the slot is in the id
 * ('fp-n2-ft-w09-num') and the title ('Nursery 2 W9 — …').
 *
 * Returns `[bandDistance, term, week, title]` relative to `band`: 0 is the
 * child's own band, then 1, 2, … for younger bands (catch-up reading), 99 for
 * an unrankable band. Within a band, term → week → title, so Week 1 leads — the
 * server hands lessons back `createdAt DESC`, which surfaced Week 9 first.
 */
export function curriculumKey(
  lesson: { id?: string | null; age_level?: string | null; title?: string | null },
  band?: string | null,
): [number, number, number, string] {
  const mine = bandRank(String(band || ''));
  const rank = bandRank(String(lesson?.age_level || ''));
  const distance = rank === -1 ? 99 : mine === -1 ? rank : rank <= mine ? mine - rank : 100 + rank;

  const hay = `${lesson?.id || ''} ${lesson?.title || ''}`.toLowerCase();
  const termMatch = hay.match(/\b(ft|st|tt)\b/) || hay.match(/\b(first|second|third)\s+term\b/);
  const weekMatch = hay.match(/\bw(?:eek\s*)?(\d{1,2})\b/);
  const term = termMatch ? TERM_ORDER[termMatch[1]] ?? 9 : 9;
  const week = weekMatch ? parseInt(weekMatch[1], 10) : 999;
  return [distance, term, week, String(lesson?.title || '')];
}

/** Stable curriculum order: band distance, then term, then week, then title. */
export function compareCurriculum(
  a: { id?: string | null; age_level?: string | null; title?: string | null },
  b: { id?: string | null; age_level?: string | null; title?: string | null },
  band?: string | null,
): number {
  const ka = curriculumKey(a, band);
  const kb = curriculumKey(b, band);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
  return ka[3].localeCompare(kb[3]);
}

/**
 * Lessons at-or-below the child's band (never above).
 *
 * `band` may be a canonical NERDC label (what the server resolves from
 * class_name) or a legacy storage label; lesson rows may carry either, so both
 * sides are ranked on the SAME canonical ladder.
 *
 * An unresolvable band does NOT filter: the list came from a catalog the
 * server already capped, and the server's own never-empty guarantee widens to
 * every band when it cannot read a class either. Returning [] there is what
 * turned "the API sent 1085 lessons" into a blank PLAY tab (2026-09-15).
 */
export function filterInBand<T extends { age_level?: string }>(
  lessons: T[],
  band: string | null | undefined,
): T[] {
  const max = bandRank(band || '');
  if (max === -1) return lessons;
  return lessons.filter((l) => {
    const r = bandRank(l.age_level || '');
    return r !== -1 && r <= max;
  });
}

/* ── NERDC canonical labels (mirror backend services/ageBand.js) ──────
   The five legacy storage values above are what lesson rows carry; the NERDC
   six-band ladder (Crèche … Primary) is what the placement exam, learning
   path and API output use. Kids never see the legacy labels — these helpers
   translate placement results into the storage domain and legacy values into
   the NERDC names shown on cards. */

/** Canonical NERDC Early-Childhood labels in ascending order (backend AGE_BANDS). */
export const NERDC_AGE_BANDS = ['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary'] as const;
export type NerdcBand = (typeof NERDC_AGE_BANDS)[number];

/**
 * Coerce any accepted label (canonical NERDC, or a legacy storage value) to the
 * canonical NERDC band. Used for server-supplied bands — e.g. the placement
 * quiz result, which arrives as a NERDC label and needs no lossy conversion.
 */
export function normalizeBand(band: string | null | undefined): NerdcBand | null {
  const value = String(band || '').trim();
  if ((NERDC_AGE_BANDS as readonly string[]).includes(value)) return value as NerdcBand;
  const rank = bandRank(value);
  return rank === -1 ? null : NERDC_AGE_BANDS[rank];
}

/** Canonical NERDC band → legacy storage label (backend NERDC_TO_PLATFORM). */
const NERDC_TO_LEGACY: Record<string, AgeBand> = {
  'Crèche': 'Creche',
  Playgroup: 'Creche',
  'Nursery 1': 'Nursery',
  'Nursery 2': 'KG1',
  Kindergarten: 'KG2',
  Primary: 'Primary',
};

/** Map a canonical NERDC band (placement result) to the legacy storage label
 *  the in-band ceiling expects. Passthrough when already a storage value. */
export function nerdcBandToAgeLevel(band: string | null | undefined): AgeBand | null {
  if (!band) return null;
  const value = String(band).trim();
  if (AGE_BANDS.includes(value as AgeBand)) return value as AgeBand;
  return NERDC_TO_LEGACY[value] || null;
}

/** Kid-facing NERDC class name — legacy storage values never leak to the UI. */
export function ageLevelLabel(ageLevel: string | null | undefined): string {
  const value = String(ageLevel || '').trim();
  const labels: Record<string, string> = {
    Creche: 'Crèche',
    'Crèche': 'Crèche',
    Playgroup: 'Playgroup',
    Nursery: 'Nursery 1',
    'Nursery 1': 'Nursery 1',
    'Nursery 2': 'Nursery 2',
    KG1: 'Nursery 2',
    KG2: 'Kindergarten',
    Kindergarten: 'Kindergarten',
    Primary: 'Primary',
  };
  return labels[value] || value;
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

/* ── PLAY grouping (subject sections) ─────────────────────────────── */

export interface SeriesGroup<T> {
  series: PathSeries;
  /** Units of this series that carry at least one of the given cards, in path order. */
  units: PathUnit[];
  /** This series' cards, in path/unit order. */
  items: T[];
}

export interface LessonGrouping<T> {
  groups: SeriesGroup<T>[];
  /** Cards the path does not cover (global catalog floor / offline list). */
  uncovered: T[];
}

/**
 * Band rank of a PLAY subject section: the HIGHEST rank among the cards it
 * shows, or -1 when nothing is rankable.
 *
 * A series is band-scoped by construction (the content ships one series per
 * subject per band), so this is the section's own band; taking the maximum
 * keeps a series that somehow spans two bands from being read as the younger.
 */
export function sectionBandRank(items: Array<{ age_level?: string | null }>): number {
  let rank = -1;
  for (const item of items) {
    const r = bandRank(String(item.age_level || ''));
    if (r > rank) rank = r;
  }
  return rank;
}

/**
 * Section order for a child: **their own band first**, then the below-band
 * review ladder nearest-first, and anything unrankable last.
 *
 * The server hands the path back series-name ASC, so 'Crèche — …' led for every
 * child: a Primary child's own six subjects and their six jump-ahead offers sat
 * ~1350 cards down the page, behind toddler content they had long outgrown.
 * Presentation only — the path, the lock chain, the checkpoint and the server's
 * own ordering are untouched.
 */
export function compareSectionBand(
  a: Array<{ age_level?: string | null }>,
  b: Array<{ age_level?: string | null }>,
  band?: string | null,
): number {
  const mine = bandRank(String(band || ''));
  const distance = (rank: number) => {
    if (mine === -1 || rank === -1) return 99; // unknowable → last
    if (rank === mine) return 0; // the child's own grade first
    if (rank < mine) return mine - rank; // review ladder, nearest below first
    return 50 + (rank - mine); // above the band (should not appear at all)
  };
  return distance(sectionBandRank(a)) - distance(sectionBandRank(b));
}

/**
 * Group the PLAY grid by SUBJECT, each subject's cards in path/unit order.
 *
 * PLAY hands the child a flat catalog capped by band. Unit-level sections are
 * NOT the answer: live content ships roughly one game per unit in the early
 * years and two in Primary, so a "Unit N" header per unit would be a header per
 * card for a Nursery 2 child (~1080 of them), which is worse than the flat grid.
 * Subject sections are the grain that actually folds the grid down while
 * keeping the order the child is taught in.
 *
 * Driven entirely by the SERVER's path (`pathData.path[].units[]`), so it holds
 * whatever unit:card cadence the content turns out to have — the client never
 * assumes a cadence (and repo and prod have drifted on exactly this point).
 *
 * Cards the path does not cover come back separately so the caller can keep
 * them on screen instead of silently dropping them.
 *
 * Sections are ordered for the CHILD (see `compareSectionBand`): their own band
 * leads, below-band review follows nearest-first. Within a section the cards
 * stay in path/unit order.
 */
export function groupBySeries<
  T extends { id: string; age_level?: string | null; title?: string | null },
>(
  lessons: T[],
  data: LearningPathData | null | undefined,
  band?: string | null,
): LessonGrouping<T> {
  // lesson_id → which series owns it, where its unit sits in that series, and
  // the unit itself (needed to report which units actually carry a card).
  const owner = new Map<string, { seriesId: string; unitIndex: number; unit: PathUnit }>();
  const groups: SeriesGroup<T>[] = (data?.path || []).map((series) => {
    series.units.forEach((unit, unitIndex) => {
      for (const l of unit.lessons) {
        owner.set(String(l.lesson_id), { seriesId: series.series_id, unitIndex, unit });
      }
    });
    return { series, units: [], items: [] };
  });
  const byId = new Map(groups.map((g) => [g.series.series_id, g]));

  const uncovered: T[] = [];
  for (const lesson of lessons) {
    const hit = owner.get(String(lesson.id));
    const group = hit ? byId.get(hit.seriesId) : undefined;
    if (group) group.items.push(lesson);
    else uncovered.push(lesson);
  }

  for (const group of groups) {
    // Path/unit order first — the order the child is taught in. Anything the
    // path did not place falls back to curriculum order (own band, term, week),
    // never the API's createdAt order (which led with Week 9).
    group.items.sort((a, b) => {
      const ua = owner.get(String(a.id))?.unitIndex ?? Number.MAX_SAFE_INTEGER;
      const ub = owner.get(String(b.id))?.unitIndex ?? Number.MAX_SAFE_INTEGER;
      return ua - ub || compareCurriculum(a, b, band);
    });
    // Covered units = the ones that actually contribute a card, first sighting
    // order after the sort, so units the chip filtered out never pad the count.
    const seen = new Set<string>();
    group.units = [];
    for (const item of group.items) {
      const hit = owner.get(String(item.id));
      if (hit && !seen.has(String(hit.unit.unit_id))) {
        seen.add(String(hit.unit.unit_id));
        group.units.push(hit.unit);
      }
    }
  }
  uncovered.sort((a, b) => compareCurriculum(a, b, band));

  // Child-relative section order: own band first, then the review ladder.
  // `Array#sort` is stable, so sections of equal distance keep the path's own
  // (series-name) order.
  groups.sort((a, b) => compareSectionBand(a.items, b.items, band));

  return { groups: groups.filter((g) => g.items.length > 0), uncovered };
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
