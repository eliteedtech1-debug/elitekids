'use strict';

const {
  PLAN,
  buildPilotRows,
  validatePilotRows,
} = require('../src/seeders/flagshipAnnualPilotSeed');

describe('flagship annual pilot seed', () => {
  test('covers five bands, nine subjects, three ten-week terms and 1,350 games', () => {
    const rows = buildPilotRows();
    const report = validatePilotRows(rows);

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.counts).toEqual({
      bands: 5,
      subjects: 9,
      terms: 3,
      weeksPerTerm: 10,
      games: 1350,
      series: 45,
      units: 1350,
      curriculumPoints: 1350,
      libraryGames: 1350,
    });
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
  });

  test('uses editable canonical term/week metadata and keeps content unpublished for adult review', () => {
    const rows = buildPilotRows();
    const firstTermWeekOne = rows.configs.find((config) => config.config_json.termName === 'First Term' && config.config_json.week === 1);
    const thirdTermWeekTen = rows.configs.find((config) => config.config_json.termName === 'Third Term' && config.config_json.week === 10);

    expect(PLAN.weeksPerTerm).toBe(10);
    expect(firstTermWeekOne.config_json.termName).toBe('First Term');
    expect(firstTermWeekOne.config_json.week).toBe(1);
    expect(thirdTermWeekTen.config_json.termName).toBe('Third Term');
    expect(thirdTermWeekTen.config_json.week).toBe(10);
    expect(new Set(rows.lessons.map((lesson) => lesson.content_state))).toEqual(new Set(['pending_human_review']));
    expect(new Set(rows.configs.map((config) => config.content_state))).toEqual(new Set(['pending_human_review']));
    expect(rows.configs.every((config) => config.approved_by === null && config.approved_at === null)).toBe(true);
  });
});
