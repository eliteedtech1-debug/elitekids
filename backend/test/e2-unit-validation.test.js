'use strict';

/**
 * E-hardening — cross-series unit content validation
 * (findCrossSeriesItems: subject-binding invariant at unit level)
 *
 * Fixtures build their own game-config rows; TEST DB is rebuilt each run.
 */

const { findCrossSeriesItems } = require('../src/controllers/kidsSeries');
const db = require('../src/models');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

let seq = 0;
async function seedConfig(seriesId, lessonId) {
  const n = ++seq;
  await db.KidGameConfig.create({
    id: `gc-xval-${seriesId}-${n}`,
    lesson_id: lessonId,
    template: 'matching',
    age_level: 'Creche',
    config_json: { gameId: `gc-xval-${n}`, lessonId, series_id: seriesId, item_id: `xv-${n}` },
    schema_version: '1.0',
    item_id: `xv-${seriesId}-${n}`,
    tier: 0,
    category: 'Letters',
    content_state: 'published',
  });
}

describe('findCrossSeriesItems', () => {
  beforeAll(async () => {
    await seedConfig('SER-A', 'lesson-a1');
    await seedConfig('SER-B', 'lesson-b1');
  });

  test('own-series items are clean', async () => {
    const out = await findCrossSeriesItems('SER-A', [
      { lesson_id: 'lesson-a1' },
      { lesson_id: 'lesson-a1' }, // dup within same series is fine
    ]);
    expect(out).toEqual([]);
  });

  test('foreign-series lesson is flagged', async () => {
    const out = await findCrossSeriesItems('SER-A', [{ lesson_id: 'lesson-b1' }]);
    expect(out).toEqual(['lesson-b1']);
  });

  test('mixed batch flags only the foreign one', async () => {
    const out = await findCrossSeriesItems('SER-A', [
      { lesson_id: 'lesson-a1' },
      { lesson_id: 'lesson-b1' },
    ]);
    expect(out).toEqual(['lesson-b1']);
  });

  test('unplaced lessons (no config) pass through unflagged', async () => {
    const out = await findCrossSeriesItems('SER-A', [{ lesson_id: 'lesson-ghost' }]);
    expect(out).toEqual([]);
  });

  test('string-form items and empty input handled', async () => {
    expect(await findCrossSeriesItems('SER-A', ['lesson-b1'])).toEqual(['lesson-b1']);
    expect(await findCrossSeriesItems('SER-A', [])).toEqual([]);
    expect(await findCrossSeriesItems('SER-A', undefined)).toEqual([]);
  });
});
