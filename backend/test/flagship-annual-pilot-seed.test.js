'use strict';

/**
 * Flagship annual pilot seed — reconciled with what elite_kids serves.
 *
 * These assertions lock the contract the live catalog actually holds after the
 * 2026-09-15 reconciliation (QUEUE Q60). The 2026-09-10 run that produced the
 * served rows was never committed, so the plan + seeder had to be rebuilt from
 * the rows themselves; this suite guards the numbers and the shape.
 *
 * Row-for-row parity against production is NOT testable here (it needs the live
 * DB) — that is `team-docs/tools/diff-pilot-vs-prod.mjs`, which must print
 * "IN SYNC". This suite guards the parts of that contract a change can silently
 * break: the counts, the two-game Primary slots, the pedagogy ladder and the
 * published posture.
 */
const {
  PLAN,
  buildPilotRows,
  validatePilotRows,
  subjectsForBand,
  gamesPerWeekForBand,
  templateFor,
} = require('../src/seeders/flagshipAnnualPilotSeed');

const expectedCounts = {
  bands: 6,
  subjects: 9,
  primarySubjects: 6,
  terms: 3,
  weeksPerTerm: 10,
  games: 1710,
  series: 51,
  units: 1530,
  curriculumPoints: 1710,
  libraryGames: 1710,
};

describe('flagship annual pilot seed', () => {
  test('covers six bands, 15 subject-bands, three ten-week terms and 1,710 games', () => {
    const rows = buildPilotRows();
    const report = validatePilotRows(rows);

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.counts).toEqual(expectedCounts);
  });

  test('the primary band runs six NERDC primary subjects with two games per week', () => {
    const rows = buildPilotRows();
    const primary = PLAN.bands.find((band) => band.id === 'primary');

    expect(subjectsForBand(primary)).toHaveLength(6);
    expect(gamesPerWeekForBand(primary)).toBe(2);
    // 6 subjects × 30 weeks × 2 games
    expect(rows.lessons.filter((lesson) => lesson.age_level === 'Primary')).toHaveLength(360);
    expect(rows.units.filter((unit) => unit.series_id.startsWith('fp-series-pr-'))).toHaveLength(180);
    // Each primary unit carries both games; early-years units carry one.
    const primaryUnit = rows.units.find((unit) => unit.id === 'fp-unit-pr-math-01');
    expect(primaryUnit.content_items.map((item) => item.slot)).toEqual([1, 2]);
    const earlyUnit = rows.units.find((unit) => unit.id === 'fp-unit-cr-comm-01');
    expect(earlyUnit.content_items.map((item) => item.slot)).toEqual([1]);
    // Titles mark the slot so a teacher can tell the pair apart.
    expect(rows.lessons.find((lesson) => lesson.id === 'fp-pr-ft-w01-math').title).toBe('Primary W1 — Mathematics (1/2)');
    expect(rows.lessons.find((lesson) => lesson.id === 'fp-pr-ft-w01-math-s2').title).toBe('Primary W1 — Mathematics (2/2)');
  });

  test('a second weekly game takes the template five weeks ahead (wrapping in the term)', () => {
    // Verified against the served configs: week 1 pairs tap-recognition with
    // quiz, week 6 pairs quiz with tap-recognition, week 10 pairs
    // stage-sequence with itself.
    expect(templateFor(1, 1)).toBe('tap-recognition');
    expect(templateFor(1, 2)).toBe('quiz');
    expect(templateFor(6, 1)).toBe('quiz');
    expect(templateFor(6, 2)).toBe('tap-recognition');
    expect(templateFor(10, 2)).toBe('stage-sequence');
  });

  test('covers Numbers, Letters and PHONIX as first-class annual tracks', () => {
    const rows = buildPilotRows();
    const numbers = rows.configs.filter((config) => config.config_json.subjectId === 'numeracy');
    const letters = rows.configs.filter((config) => config.config_json.subjectId === 'comm-literacy');

    expect(PLAN.academicYear).toBe('2026/2027');
    expect(PLAN.tracks.map((track) => track.id)).toEqual(['numbers', 'letters', 'phonix']);
    expect(numbers).toHaveLength(150);
    expect(letters).toHaveLength(150);
    expect(letters.every((config) => config.config_json.phonix.engine === 'PHONIX')).toBe(true);
    expect(letters.every((config) => config.config_json.category === 'Letters')).toBe(true);
    expect(numbers.every((config) => config.config_json.category === 'Numbers')).toBe(true);
    // Primary English is not the PHONIX track: it must not carry phonix metadata.
    const primaryEnglish = rows.configs.filter((config) => config.config_json.subjectId === 'english-studies');
    expect(primaryEnglish).toHaveLength(60);
    expect(primaryEnglish.every((config) => config.config_json.phonix === undefined)).toBe(true);
  });

  test('embeds the one-class-fits-all learning ladder on every Playgroup and Primary game', () => {
    const rows = buildPilotRows();
    const ladderBands = PLAN.bands.filter((band) => band.ladder);
    expect(ladderBands.map((band) => band.id).sort()).toEqual(['playgroup', 'primary']);

    for (const config of rows.configs) {
      const band = ladderBands.find((candidate) => candidate.classLabel === config.config_json.classLabel);
      if (!band) {
        expect(config.config_json.pedagogy).toBeUndefined();
        continue;
      }
      const pedagogy = config.config_json.pedagogy;
      // weeklyGame tracks the week's slot, not its unit: the second game of a
      // Primary week carries id suffix `-s2` and reports weeklyGame 2.
      expect(pedagogy.ladder.weeklyGame).toBe(String(config.id).endsWith('-s2-game') ? 2 : 1);
      expect(pedagogy.learningObjective).toBe(config.config_json.objective);
      expect(['cognitive', 'psychomotor', 'affective']).toContain(pedagogy.domainOfKnowledge);
      expect(pedagogy.reinforcement.xpReward).toBe(band.ladder.rewards.xp);
    }

    // Level ramps: unit 1 sits on level 1 (concrete), unit 30 on level 6.
    const playgroupEarly = rows.configs.find((config) => config.id === 'fp-pg-ft-w01-num-game').config_json.pedagogy;
    const playgroupLate = rows.configs.find((config) => config.id === 'fp-pg-tt-w10-num-game').config_json.pedagogy;
    expect(playgroupEarly.ladder.level).toBe(1);
    expect(playgroupEarly.concreteness).toBe('concrete');
    expect(playgroupEarly.reinforcement.xpPenaltyOnWrong).toBe(0);
    expect(playgroupLate.ladder.level).toBe(6);
    expect(playgroupLate.cognitiveLoad).toBe('moderate'); // Playgroup is age-capped, never 'high'
    expect(playgroupLate.application).toBe('near-transfer'); // …and never 'generalization'

    const primaryLate = rows.configs.find((config) => config.id === 'fp-pr-tt-w10-math-game').config_json.pedagogy;
    expect(primaryLate.ladder.level).toBe(6);
    expect(primaryLate.cognitiveLoad).toBe('high');
    expect(primaryLate.concreteness).toBe('abstract');
    expect(primaryLate.reinforcement.xpPenaltyOnWrong).toBe(5); // Primary penalises from level 3
  });

  test('carries 15 playable items for Primary and 5 for the early-years bands', () => {
    const rows = buildPilotRows();
    const count = (config) => (config.config_json.questions || config.config_json.assets.objects
      || config.config_json.steps || []).length;

    const primaryMath = rows.configs.find((config) => config.id === 'fp-pr-ft-w01-math-game');
    const primaryQuiz = rows.configs.find((config) => config.id === 'fp-pr-ft-w01-math-s2-game');
    const primaryMatching = rows.configs.find((config) => config.id === 'fp-pr-ft-w02-math-game');
    const earlyNumeracy = rows.configs.find((config) => config.id === 'fp-n2-ft-w01-num-game');

    expect(primaryMath.config_json.gamePlan.itemsPerGame).toBe('up to 15 logical playable items');
    expect(primaryQuiz.config_json.questions).toHaveLength(15);
    expect(primaryMatching.config_json.assets.items).toHaveLength(30); // 15 labels × 2 sides
    expect(earlyNumeracy.config_json.assets.objects).toHaveLength(5);
    expect(earlyNumeracy.config_json.gamePlan.itemsPerGame).toBe('5 logical playable items');
    // The primary numeracy ladder keeps climbing instead of wrapping.
    expect(primaryMath.config_json.assets.objects.map((object) => object.audio)).toEqual(
      Array.from({ length: 15 }, (_, index) => String(index + 1)),
    );
    expect(count(primaryMath)).toBe(15);
  });

  test('uses editable canonical term/week metadata in the served lesson text', () => {
    const rows = buildPilotRows();
    const firstTermWeekOne = rows.configs.find((config) => config.config_json.termName === 'First Term' && config.config_json.week === 1);
    const thirdTermWeekTen = rows.configs.find((config) => config.config_json.termName === 'Third Term' && config.config_json.week === 10);

    expect(PLAN.weeksPerTerm).toBe(10);
    expect(firstTermWeekOne.config_json.termName).toBe('First Term');
    expect(firstTermWeekOne.config_json.week).toBe(1);
    expect(thirdTermWeekTen.config_json.termName).toBe('Third Term');
    expect(thirdTermWeekTen.config_json.week).toBe(10);
    expect(rows.lessons.find((lesson) => lesson.id === 'fp-cr-ft-w01-comm').lesson_text)
      .toBe('First Term, Week 1. Respond to a familiar voice, name, song or picture through gaze, gesture or sound. Actively tested and validated for the 2026/2027 pilot.');
  });

  test('publishes the pilot rows with an approval stamp, as PLAN.publication declares', () => {
    const rows = buildPilotRows();

    expect(PLAN.publication.contentState).toBe('published');
    expect(new Set(rows.lessons.map((lesson) => lesson.content_state))).toEqual(new Set(['published']));
    expect(new Set(rows.configs.map((config) => config.content_state))).toEqual(new Set(['published']));
    expect(rows.configs.every((config) => config.approved_by === PLAN.publication.approvedBy && config.approved_at !== null)).toBe(true);
    expect(rows.lessons.every((lesson) => lesson.is_global === 1)).toBe(true);
  });
});
