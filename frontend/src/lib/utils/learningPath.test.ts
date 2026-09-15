/**
 * L2-FE Phase 4 gates — learning-path dashboard + weekly goal.
 *
 *  - Age-band mapping + in-band ceiling (subject tabs never widen a band)
 *  - Path marker position (first unfinished unit; spill-over leads)
 *  - Locked units are never open/clickable
 *  - Default mode per lesson state (practice → test once practice done)
 *  - Goal math + band-start divider
 */
import { describe, it, expect } from 'vitest';
import {
  classToAgeLevel,
  bandRank,
  compareCurriculum,
  filterInBand,
  flattenUnits,
  groupBySeries,
  currentPositionIndex,
  unitStats,
  isUnitOpen,
  defaultModeFor,
  goalPercent,
  isBandStart,
  type LearningPathData,
  type PathUnit,
} from '@/lib/utils/learningPath';

const lesson = (lesson_id: string, state: 'none' | 'practice_done' | 'passed' = 'none') => ({
  lesson_id,
  title: lesson_id,
  age_level: 'KG1',
  state,
});

const unit = (over: Partial<PathUnit> & { unit_id: string }): PathUnit => ({
  unit_number: 1,
  title: 'Unit title',
  topic: 'One topic',
  relation: 'current',
  done: false,
  locked: false,
  locked_reason: null,
  lessons: [],
  ...over,
});

describe('classToAgeLevel', () => {
  it('returns the canonical NERDC band, not a legacy storage label', () => {
    // The whole point of the 2026-09-15 fix: the value returned here is ranked
    // against kids_lessons.age_level, which stores NERDC labels.
    expect(classToAgeLevel('Nursery 1')).toBe('Nursery 1');
    expect(classToAgeLevel('Nursery 2')).toBe('Nursery 2');
    expect(classToAgeLevel('Crèche')).toBe('Crèche'); // accent-folded, not "cr che"
    expect(classToAgeLevel('Creche 1')).toBe('Crèche');
  });

  it('ranks a live Nursery 1 class so the global catalog stays visible', () => {
    // Live case (2026-09-15): adm_no Demo5, class "Nursery 1", 1085 published
    // global lessons on the wire, PLAY showed 0.
    expect(bandRank(classToAgeLevel('Nursery 1') || '')).toBe(2);
    expect(bandRank(classToAgeLevel('Nursery 2') || '')).toBe(3);
    expect(bandRank(classToAgeLevel('Kindergarten') || '')).toBe(4);
    expect(bandRank(classToAgeLevel('Primary 3') || '')).toBe(5);
  });

  it('never ranks a class above the band the server reads from it', () => {
    // Nursery 2 must NOT unlock Kindergarten; only a Kindergarten class may.
    expect(classToAgeLevel('Pre-Nursery A')).toBe('Playgroup');
    expect(classToAgeLevel('KG1')).toBe('Nursery 1');
    expect(classToAgeLevel('KG2')).toBe('Nursery 2');
    expect(classToAgeLevel('Basic 2')).toBe('Primary');
    expect(classToAgeLevel('Year 3')).toBe('Primary');
  });
  it('maps Northern Nigeria class spellings to equivalence ranks', () => {
    expect(classToAgeLevel('Creche 1')).toBe('Crèche');
    expect(classToAgeLevel('KG2 B')).toBe('Nursery 2'); // upper KG ≡ Nursery 2
    expect(classToAgeLevel('Year 5')).toBe('Primary');
  });

  it('places elder classes on the LAST rank (never an empty dashboard)', () => {
    expect(classToAgeLevel('JSS1')).toBe('Primary');
    expect(classToAgeLevel('SSS 2')).toBe('Primary');
    expect(classToAgeLevel('Islamiyya')).toBe('Primary');
  });

  it('returns null for unknown/empty classes (never widest)', () => {
    expect(classToAgeLevel('')).toBeNull();
    expect(classToAgeLevel(null)).toBeNull();
    expect(classToAgeLevel(undefined)).toBeNull();
  });
});

describe('filterInBand', () => {
  // The live shape: the global catalog stores NERDC labels.
  const nerdc = [
    { id: 'creche', age_level: 'Crèche' },
    { id: 'pg', age_level: 'Playgroup' },
    { id: 'n1', age_level: 'Nursery 1' },
    { id: 'n2', age_level: 'Nursery 2' },
    { id: 'kg', age_level: 'Kindergarten' },
    { id: 'pr', age_level: 'Primary' },
    { id: 'noage' },
  ];

  // A catalogs cached by an older build before the NERDC migration.
  const legacy = [
    { id: 'a', age_level: 'Nursery' },
    { id: 'b', age_level: 'KG1' },
    { id: 'c', age_level: 'KG2' },
    { id: 'd', age_level: 'Primary' },
  ];

  it('a Nursery 1 child sees Crèche + Playgroup + Nursery 1 (the live fix)', () => {
    expect(filterInBand(nerdc, 'Nursery 1').map((l) => l.id)).toEqual(['creche', 'pg', 'n1']);
  });

  it('never shows a lesson above the band', () => {
    expect(filterInBand(nerdc, 'Crèche').map((l) => l.id)).toEqual(['creche']);
    expect(filterInBand(nerdc, 'Nursery 2').map((l) => l.id)).toEqual(['creche', 'pg', 'n1', 'n2']);
    expect(filterInBand(nerdc, 'Kindergarten').map((l) => l.id)).toEqual(['creche', 'pg', 'n1', 'n2', 'kg']);
    expect(filterInBand(nerdc, 'Primary').map((l) => l.id)).toEqual(['creche', 'pg', 'n1', 'n2', 'kg', 'pr']);
  });

  it('ranks legacy storage labels on the same ladder (Nursery ≡ Nursery 1)', () => {
    // 0 Creche · 1 Playgroup · 2 Nursery 1 · 3 Nursery 2 · 4 Kindergarten · 5 Primary
    expect(filterInBand(legacy, 'Nursery 1').map((l) => l.id)).toEqual(['a']);
    expect(filterInBand(legacy, 'Nursery 2').map((l) => l.id)).toEqual(['a', 'b']);
    expect(filterInBand(legacy, 'Kindergarten').map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(filterInBand(legacy, 'Primary').map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a legacy band and its NERDC alias are interchangeable', () => {
    const both = [
      { id: 'n1', age_level: 'Nursery' },
      { id: 'nerdc1', age_level: 'Nursery 1' },
      { id: 'n2', age_level: 'Nursery 2' },
    ];
    expect(filterInBand(both, 'Nursery').map((l) => l.id)).toEqual(['n1', 'nerdc1']);
    expect(filterInBand(both, 'Nursery 1').map((l) => l.id)).toEqual(['n1', 'nerdc1']);
  });

  it('drops rows whose age_level cannot be ranked', () => {
    expect(filterInBand(nerdc, 'Primary').some((l) => l.id === 'noage')).toBe(false);
  });

  it('an unresolvable band defers to the server instead of blanking the tab', () => {
    // The server already capped this list; its own never-empty guarantee widens
    // to every band when it cannot read a class either.
    expect(filterInBand(nerdc, null)).toEqual(nerdc);
    expect(filterInBand(nerdc, 'Decorative Class Name')).toEqual(nerdc);
  });
});

describe('curriculum order (grids the path does not drive)', () => {
  // Shape of the real catalog rows: the slot is only in the id and title.
  const creative = [
    { id: 'fp-n2-ft-w09-num', age_level: 'Nursery 2', title: 'Nursery 2 W9 — Numeracy / Mathematics Skill' },
    { id: 'fp-n2-ft-w01-num', age_level: 'Nursery 2', title: 'Nursery 2 W1 — Numeracy / Mathematics Skill' },
    { id: 'fp-n2-tt-w02-sci', age_level: 'Nursery 2', title: 'Nursery 2 W2 — Pre-science and Nature' },
    { id: 'fp-n1-ft-w01-dr', age_level: 'Nursery 1', title: 'Nursery 1 W1 — Digital Readiness' },
    { id: 'fp-creche-ft-w01-col', age_level: 'Crèche', title: 'Crèche W1 — Colours' },
    { id: 'legacy-row', age_level: 'Nursery 2', title: 'A hand-written lesson' },
  ];

  const ordered = [...creative].sort((a, b) => compareCurriculum(a, b, 'Nursery 2'));

  it('leads with the child\'s own band, earliest term and week first', () => {
    expect(ordered[0].id).toBe('fp-n2-ft-w01-num');
    // Term before week: First Term W9 still precedes Third Term W2.
    expect(ordered.map((l) => l.id).slice(0, 3)).toEqual([
      'fp-n2-ft-w01-num',
      'fp-n2-ft-w09-num',
      'fp-n2-tt-w02-sci',
    ]);
  });

  it('never lets younger-band catch-up push the child\'s own unit 1 down', () => {
    const ownBand = ordered.findIndex((l) => l.id === 'fp-n2-ft-w01-num');
    const nursery1 = ordered.findIndex((l) => l.id === 'fp-n1-ft-w01-dr');
    const creche = ordered.findIndex((l) => l.id === 'fp-creche-ft-w01-col');
    expect(ownBand).toBeLessThan(nursery1);
    expect(nursery1).toBeLessThan(creche);
  });

  it('sinks rows with no parseable slot, stably, within their band', () => {
    const last = ordered.findIndex((l) => l.id === 'legacy-row');
    expect(last).toBeGreaterThan(ordered.findIndex((l) => l.id === 'fp-n2-tt-w02-sci'));
    expect(last).toBeLessThan(ordered.findIndex((l) => l.id === 'fp-n1-ft-w01-dr'));
  });

  it('falls back to plain band order when the child\'s band is unknown', () => {
    expect([...creative].sort((a, b) => compareCurriculum(a, b, null))[0].id).toBe('fp-creche-ft-w01-col');
  });
});

const makeData = (units: PathUnit[]): LearningPathData => ({
  student: { age_band: 'KG1', class_name: 'Year 3' },
  goal: { type: 'weekly', target: 1, done: 1, period_start: '2026-08-31', period_end: '2026-09-06', set_by: 'auto', status: 'done' },
  path: [{ series_id: 's1', name: 'Money & Time', category: 'Numeracy', units }],
});

describe('path marker position', () => {
  it('lands on the first unfinished unit (spill-over recovery leads)', () => {
    const data = makeData([
      unit({ unit_id: 'u-spill', relation: 'spillover', done: false, lessons: [lesson('l1', 'passed')] }),
      unit({ unit_id: 'u-band', relation: 'current', done: false, lessons: [lesson('l2')] }),
      unit({ unit_id: 'u-locked', relation: 'current', done: false, locked: true, locked_reason: 'Finish the previous level first.' }),
    ]);
    expect(currentPositionIndex(data)).toBe(0);
    expect(flattenUnits(data).map((f) => f.unit.unit_id)).toEqual(['u-spill', 'u-band', 'u-locked']);
  });

  it('moves to the current band once all below units are passed', () => {
    const data = makeData([
      unit({ unit_id: 'u-below', relation: 'passed_below', done: true, lessons: [lesson('l1', 'passed')] }),
      unit({ unit_id: 'u-band', relation: 'current', done: false, lessons: [lesson('l2')] }),
    ]);
    expect(currentPositionIndex(data)).toBe(1);
  });

  it('null when every unit is done', () => {
    const data = makeData([
      unit({ unit_id: 'u1', relation: 'current', done: true, lessons: [lesson('l1', 'passed')] }),
    ]);
    expect(currentPositionIndex(data)).toBeNull();
  });
});

describe('lock + click gating', () => {
  it('locked unit is never open even when it has lessons', () => {
    const u = unit({ unit_id: 'u', locked: true, lessons: [lesson('l1')] });
    expect(isUnitOpen(u)).toBe(false);
  });

  it('unlocked (spill-over / passed-below / current) units are open', () => {
    for (const relation of ['spillover', 'passed_below', 'current'] as const) {
      expect(isUnitOpen(unit({ unit_id: 'u', relation, done: relation === 'passed_below' }))).toBe(true);
    }
  });
});

describe('unit stats + modes', () => {
  it('counts passed lessons only', () => {
    const u = unit({
      unit_id: 'u',
      lessons: [lesson('l1', 'passed'), lesson('l2', 'practice_done'), lesson('l3', 'none')],
    });
    expect(unitStats(u)).toEqual({ done: 1, total: 3 });
  });

  it('default mode follows lesson state (E3f gate)', () => {
    expect(defaultModeFor('none')).toBe('practice');
    expect(defaultModeFor('practice_done')).toBe('test');
    expect(defaultModeFor('passed')).toBe('practice');
    expect(defaultModeFor(undefined)).toBe('practice');
  });
});

describe('goal + band divider', () => {
  it('clamps goal percent to 0–100', () => {
    expect(goalPercent({ target: 4, done: 1 } as any)).toBe(25);
    expect(goalPercent({ target: 1, done: 1 } as any)).toBe(100);
    expect(goalPercent({ target: 1, done: 7 } as any)).toBe(100);
    expect(goalPercent(null)).toBe(0);
  });

  it('flags the first current unit only when the series carries below units', () => {
    const data = makeData([
      unit({ unit_id: 'u-spill', relation: 'spillover', done: false }),
      unit({ unit_id: 'u-band', relation: 'current', done: false }),
      unit({ unit_id: 'u-next', relation: 'current', done: false, locked: true }),
    ]);
    expect(isBandStart(data, data.path[0].units[0])).toBe(false);
    expect(isBandStart(data, data.path[0].units[1])).toBe(true);
    expect(isBandStart(data, data.path[0].units[2])).toBe(false);
    expect(isBandStart(data, unit({ unit_id: 'x', relation: 'current' }))).toBe(false);
  });
});

/* PLAY sectioning. The grid is a flat band-capped catalog; these pin the
   subject grouping that folds it down without losing a card. */
describe('groupBySeries (PLAY sections)', () => {
  const makeMulti = (
    series: Array<{ id: string; name: string; category?: string; units: PathUnit[] }>,
  ): LearningPathData => ({
    student: { age_band: 'Nursery 2', class_name: 'Nursery 2' },
    goal: null,
    path: series.map((s) => ({
      series_id: s.id,
      name: s.name,
      category: s.category ?? null,
      units: s.units,
    })),
  });

  const card = (id: string, title: string, age_level = 'Nursery 2') => ({ id, age_level, title });

  it('groups the grid by subject and restores path/unit order inside it', () => {
    const data = makeMulti([
      {
        id: 'num',
        name: 'Numeracy',
        units: [
          unit({ unit_id: 'n1', unit_number: 1, lessons: [lesson('L-n1')] }),
          unit({ unit_id: 'n2', unit_number: 2, lessons: [lesson('L-n2')] }),
        ],
      },
      { id: 'sci', name: 'Science', units: [unit({ unit_id: 's1', lessons: [lesson('L-s1')] })] },
    ]);
    // The API hands rows back createdAt DESC — newest first, i.e. backwards.
    const cards = [card('L-s1', 'Science W1'), card('L-n2', 'Numeracy W2'), card('L-n1', 'Numeracy W1')];

    const { groups, uncovered } = groupBySeries(cards, data, 'Nursery 2');

    expect(groups.map((g) => g.series.series_id)).toEqual(['num', 'sci']);
    expect(groups[0].items.map((c) => c.id)).toEqual(['L-n1', 'L-n2']);
    expect(groups[1].items.map((c) => c.id)).toEqual(['L-s1']);
    expect(uncovered).toEqual([]);
  });

  it('reports only the units that carry a visible card (no padding for filtered ones)', () => {
    const data = makeMulti([
      {
        id: 'num',
        name: 'Numeracy',
        units: [
          unit({ unit_id: 'n1', unit_number: 1, lessons: [lesson('L-n1')] }),
          unit({ unit_id: 'n2', unit_number: 2, lessons: [lesson('L-n2')] }),
        ],
      },
    ]);
    // A subject chip that kept only Week 2 must not claim Unit 1 as covered.
    const { groups } = groupBySeries([card('L-n2', 'Numeracy W2')], data, 'Nursery 2');
    expect(groups[0].units.map((u) => u.unit_id)).toEqual(['n2']);
  });

  it('returns games the path does not cover instead of dropping them', () => {
    const data = makeMulti([
      { id: 'num', name: 'Numeracy', units: [unit({ unit_id: 'n1', lessons: [lesson('L-n1')] })] },
    ]);
    const { groups, uncovered } = groupBySeries(
      [card('L-n1', 'Numeracy W1'), card('GLESSON-RANK3-1', 'Global catalog floor game')],
      data,
      'Nursery 2',
    );
    expect(groups).toHaveLength(1);
    expect(uncovered.map((c) => c.id)).toEqual(['GLESSON-RANK3-1']);
  });

  it('drops a subject whose every card was filtered out', () => {
    const data = makeMulti([
      { id: 'num', name: 'Numeracy', units: [unit({ unit_id: 'n1', lessons: [lesson('L-n1')] })] },
      { id: 'sci', name: 'Science', units: [unit({ unit_id: 's1', lessons: [lesson('L-s1')] })] },
    ]);
    const { groups } = groupBySeries([card('L-s1', 'Science W1')], data, 'Nursery 2');
    expect(groups.map((g) => g.series.series_id)).toEqual(['sci']);
  });

  it('orders two cards of one unit by curriculum (Primary ships two per unit)', () => {
    const data = makeMulti([
      {
        id: 'num',
        name: 'Numeracy',
        units: [unit({ unit_id: 'n1', unit_number: 1, lessons: [lesson('L-w06'), lesson('L-w01')] })],
      },
    ]);
    const cards = [card('L-w06', 'Primary W6 — Numeracy', 'Primary'), card('L-w01', 'Primary W1 — Numeracy', 'Primary')];
    const { groups } = groupBySeries(cards, data, 'Primary');
    expect(groups[0].items.map((c) => c.id)).toEqual(['L-w01', 'L-w06']);
  });

  it('returns everything as uncovered when there is no path (offline / first paint)', () => {
    const cards = [card('a', 'A'), card('b', 'B')];
    const { groups, uncovered } = groupBySeries(cards, null, 'Nursery 2');
    expect(groups).toEqual([]);
    expect(uncovered.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it("leads with the child's OWN band, then the review ladder nearest-first", () => {
    // The server hands the path back series-name ASC, so 'Crèche — …' led for
    // every child: a Primary child's own subjects and their jump-ahead offers sat
    // ~1350 cards down the page (2026-09-15 live walk).
    const data = makeMulti([
      { id: 'cre', name: 'Crèche — Numeracy', units: [unit({ unit_id: 'c1', lessons: [lesson('L-c1')] })] },
      { id: 'n1', name: 'Nursery 1 — Numeracy', units: [unit({ unit_id: 'a1', lessons: [lesson('L-a1')] })] },
      { id: 'n2', name: 'Nursery 2 — Numeracy', units: [unit({ unit_id: 'b1', lessons: [lesson('L-b1')] })] },
      { id: 'pg', name: 'Playgroup — Numeracy', units: [unit({ unit_id: 'p1', lessons: [lesson('L-p1')] })] },
    ]);
    const cards = [
      card('L-c1', 'Crèche W1', 'Crèche'),
      card('L-p1', 'Playgroup W1', 'Playgroup'),
      card('L-a1', 'Nursery 1 W1', 'Nursery 1'),
      card('L-b1', 'Nursery 2 W1', 'Nursery 2'),
    ];

    const { groups } = groupBySeries(cards, data, 'Nursery 2');

    // own band (rank 3) → nearest below → … → furthest below
    expect(groups.map((g) => g.series.series_id)).toEqual(['n2', 'n1', 'pg', 'cre']);
  });

  it('keeps the path order among sections of the SAME band (stable sort)', () => {
    const data = makeMulti([
      { id: 'a', name: 'Nursery 2 — Communication', units: [unit({ unit_id: 'a1', lessons: [lesson('L-a1')] })] },
      { id: 'b', name: 'Nursery 2 — Numeracy', units: [unit({ unit_id: 'b1', lessons: [lesson('L-b1')] })] },
      { id: 'z', name: 'Crèche — Numeracy', units: [unit({ unit_id: 'z1', lessons: [lesson('L-z1')] })] },
    ]);
    const cards = [
      card('L-a1', 'Nursery 2 W1'),
      card('L-b1', 'Nursery 2 W2'),
      card('L-z1', 'Crèche W1', 'Crèche'),
    ];

    const { groups } = groupBySeries(cards, data, 'Nursery 2');

    expect(groups.map((g) => g.series.series_id)).toEqual(['a', 'b', 'z']);
  });

  it('sorts an unrankable section last rather than dropping it', () => {
    const data = makeMulti([
      { id: 'odd', name: 'Mystery — Numeracy', units: [unit({ unit_id: 'o1', lessons: [lesson('L-o1')] })] },
      { id: 'n2', name: 'Nursery 2 — Numeracy', units: [unit({ unit_id: 'b1', lessons: [lesson('L-b1')] })] },
    ]);
    const cards = [card('L-o1', 'Mystery W1', 'Nowhere'), card('L-b1', 'Nursery 2 W1')];

    const { groups } = groupBySeries(cards, data, 'Nursery 2');

    expect(groups.map((g) => g.series.series_id)).toEqual(['n2', 'odd']);
  });
});
