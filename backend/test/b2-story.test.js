'use strict';

/**
 * B2 story/scene-engine regression — locks the Phase 3 (spec A2/A5/C1) backend:
 *
 *   1. Manual lesson create (`POST /kids/lessons/manual`) with scene cards:
 *      canonical `type` (intro/teach/reinforce/recap/game_checkpoint) is written
 *      to the `scene_type` column (the old bug read `sceneType` and stored
 *      'teach' always — GUI sends `type`).
 *   2. game_checkpoint scenes must reference a lesson that HAS a game config —
 *      422 fail-closed, and NOTHING is written (fail-closed pre-write).
 *   3. Shape errors on scene cards → 400 with field path, no partial writes.
 *   4. New-template configs are schema-gated on manual save (stage-sequence,
 *      label-diagram) — bad configs 400 with field-detail errors.
 *   5. Staff library endpoints: GET /kids/scene-library + /kids/story-templates.
 *
 * Run: jest test/b2-story.test.js --runInBand --forceExit
 */
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');

afterAll(async () => {
  await closeConnections();
});

async function staffToken() {
  const res = await request(app)
    .post('/users/login')
    .send({ username: 'admin@kids.test', password: 'Admin@123' });
  expect(res.status).toBe(200);
  return res.body.token;
}

/** Minimal VALID stage-sequence config (schema + pedagogy green). */
function stageConfig(overrides = {}) {
  return {
    gameId: 'b2-stage-gc',
    template: 'stage-sequence',
    lessonId: 'b2-stage-lesson',
    ageLevel: 'Nursery',
    category: 'Numeracy',
    tier: 1,
    item_id: 'b2-stage-item',
    rewards: { starsOnComplete: 3, xp: 25 },
    successThresholdPct: 60,
    durationTargetSec: 120,
    promptMode: 'image',
    responseMode: 'text',
    scenario: 'B2 stage sequence',
    steps: [
      { id: 's1', label: 'One', kind: 'emoji', emoji: '1️⃣', narration: 'Step one.' },
      { id: 's2', label: 'Two', kind: 'emoji', emoji: '2️⃣', narration: 'Step two.' },
      { id: 's3', label: 'Three', kind: 'emoji', emoji: '3️⃣', narration: 'Step three.' },
    ],
    assessment: [
      { id: 'a1', kind: 'text', prompt: 'Which comes after two?', options: ['Three', 'One'], correctIndex: 0 },
    ],
    ...overrides,
  };
}

/** Minimal VALID label-diagram config (6 unique hotspots, bank superset). */
function labelConfig(overrides = {}) {
  return {
    gameId: 'b2-label-gc',
    template: 'label-diagram',
    lessonId: 'b2-label-lesson',
    ageLevel: 'Nursery',
    category: 'Science',
    tier: 1,
    item_id: 'b2-label-item',
    diagram: { image: 'media/b2/diagram.webp', alt: 'B2 diagram', background: 'classroom' },
    hotspots: [
      { id: 'h1', label: 'Head', x: 50, y: 10, r: 8, emoji: '👦' },
      { id: 'h2', label: 'Hand', x: 30, y: 50, r: 8, emoji: '✋' },
      { id: 'h3', label: 'Foot', x: 70, y: 80, r: 8, emoji: '🦶' },
      { id: 'h4', label: 'Eye', x: 40, y: 20, r: 6, emoji: '👁️' },
      { id: 'h5', label: 'Nose', x: 50, y: 22, r: 6, emoji: '👃' },
      { id: 'h6', label: 'Mouth', x: 55, y: 25, r: 6, emoji: '👄' },
    ],
    labelBank: ['Head', 'Hand', 'Foot', 'Eye', 'Nose', 'Mouth', 'Ear', 'Hair', 'Knee'],
    mode: 'mixed',
    rounds: 6,
    inputMode: 'tap',
    promptMode: 'text',
    responseMode: 'image',
    rewards: { starsOnComplete: 3, xp: 15 },
    successThresholdPct: 50,
    ...overrides,
  };
}

// ─── 1. scene_type column written from canonical `type` ────────────────────

describe('B2: manual lesson scenes — canonical type → scene_type column', () => {
  let token;
  beforeAll(async () => {
    token = await staffToken();
  });

  it('stores canonical scene `type` into scene_type (not the legacy read of sceneType)', async () => {
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Story Scene Roundtrip',
        subject: 'Literacy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: stageConfig({ gameId: 'b2-roundtrip-gc', lessonId: 'b2-roundtrip-lesson', item_id: 'b2-roundtrip-item' }),
        scenes: [
          { type: 'intro', text: 'Hello!', durationSec: 8, transition: 'fade' },
          { type: 'teach', text: 'Here is step one.', durationSec: 12 },
          // legacy alias must ALSO canonicalize (sceneType accepted for old payloads)
          { sceneType: 'recap', text: 'Well done!', durationSec: 6 },
          { type: 'game_checkpoint', gameId: 'LESSON-1', text: 'Play the game!', durationSec: 10 },
        ],
      });

    expect(res.status).toBe(201);
    const lessonId = res.body.data.lesson_id;
    expect(lessonId).toBeTruthy();

    const scenes = await testQuery(
      `SELECT scene_type FROM kids_scene_scripts WHERE lesson_id = ?`,
      [lessonId]
    );
    // Same-second createdAt rows have no stable order — compare as a set.
    expect(scenes.map((s) => s.scene_type).sort()).toEqual(['game_checkpoint', 'intro', 'recap', 'teach']);

    // Cleanup own fixture (parallel suite hygiene).
    await testQuery(`DELETE FROM kids_scene_scripts WHERE lesson_id = ?`, [lessonId]);
    await testQuery(`DELETE FROM kids_content_approvals WHERE content_id = ?`, [res.body.data.config_id]);
    await testQuery(`DELETE FROM kids_game_configs WHERE id = ?`, [res.body.data.config_id]);
    await testQuery(`DELETE FROM kids_lessons WHERE id = ?`, [lessonId]);
  });

  it('rejects an invalid scene type with a field-path 400 and writes nothing', async () => {
    const before = await testQuery(`SELECT COUNT(*) AS n FROM kids_lessons`);
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Bad Scene Type',
        subject: 'Literacy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: stageConfig(),
        scenes: [{ type: 'banana', text: 'oops', durationSec: 8 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/scenes\[0\]/);

    const after = await testQuery(`SELECT COUNT(*) AS n FROM kids_lessons`);
    expect(after[0].n).toBe(before[0].n);
  });
});

// ─── 2. game_checkpoint fail-closed resolution ─────────────────────────────

describe('B2: game_checkpoint scene must resolve to a lesson with a game config', () => {
  let token;
  beforeAll(async () => {
    token = await staffToken();
  });

  it('422s when the checkpoint gameId has no lesson with a config — and writes nothing', async () => {
    const countBefore = (await testQuery(`SELECT COUNT(*) AS n FROM kids_lessons`))[0].n;
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Broken Checkpoint',
        subject: 'Literacy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: stageConfig(),
        scenes: [{ type: 'game_checkpoint', gameId: 'NO-SUCH-LESSON-9', durationSec: 10 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/must reference a lesson that has a game config/);
    const countAfter = (await testQuery(`SELECT COUNT(*) AS n FROM kids_lessons`))[0].n;
    expect(countAfter).toBe(countBefore);
  });

  it('accepts a checkpoint whose gameId resolves (LESSON-1 has GAME-1)', async () => {
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Good Checkpoint',
        subject: 'Literacy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: stageConfig({ gameId: 'b2-checkpoint-gc', lessonId: 'b2-checkpoint-lesson', item_id: 'b2-checkpoint-item' }),
        scenes: [{ type: 'game_checkpoint', gameId: 'LESSON-1', durationSec: 10 }],
      });

    expect(res.status).toBe(201);
    const lessonId = res.body.data.lesson_id;
    const scenes = await testQuery(
      `SELECT scene_type FROM kids_scene_scripts WHERE lesson_id = ?`,
      [lessonId]
    );
    expect(scenes.map((s) => s.scene_type)).toEqual(['game_checkpoint']);

    await testQuery(`DELETE FROM kids_scene_scripts WHERE lesson_id = ?`, [lessonId]);
    await testQuery(`DELETE FROM kids_game_configs WHERE id = ?`, [res.body.data.config_id]);
    await testQuery(`DELETE FROM kids_lessons WHERE id = ?`, [lessonId]);
  });
});

// ─── 3. New-template configs are schema-gated on manual save ───────────────

describe('B2: manual save schema gate for stage-sequence + label-diagram', () => {
  let token;
  beforeAll(async () => {
    token = await staffToken();
  });

  it('400s an under-minimum stage-sequence config (steps < 3)', async () => {
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Short Stage',
        subject: 'Numeracy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: stageConfig({ steps: stageConfig().steps.slice(0, 2) }),
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/failed schema validation/i);
  });

  it('400s a clock stage-sequence whose analog step lacks narration (TTS rule)', async () => {
    const bad = stageConfig({
      topic: 'clock',
      steps: [
        { id: 'c1', label: "One o'clock", kind: 'analog-clock', time: '1:00', narration: "One o'clock." },
        { id: 'c2', label: "Two o'clock", kind: 'analog-clock', time: '2:00' }, // missing narration
        { id: 'c3', label: "Three o'clock", kind: 'analog-clock', time: '3:00', narration: "Three o'clock." },
      ],
    });
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Silent Clock',
        subject: 'Numeracy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: bad,
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/missing narration/);
  });

  it('400s a label-diagram config with duplicate hotspot labels', async () => {
    const dup = labelConfig();
    dup.hotspots[1].label = 'Head'; // duplicate of hotspots[0]
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Dup Labels',
        subject: 'Science',
        age_level: 'Nursery',
        template: 'label-diagram',
        config_json: dup,
      });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/duplicate hotspot label/i);
  });

  it('accepts a valid stage-sequence manual save (201, pending review)', async () => {
    const res = await request(app)
      .post('/kids/lessons/manual')
      .set('authorization', token)
      .send({
        title: 'B2 Valid Stage',
        subject: 'Numeracy',
        age_level: 'Nursery',
        template: 'stage-sequence',
        config_json: stageConfig({ gameId: 'b2-valid-gc', lessonId: 'b2-valid-lesson', item_id: 'b2-valid-item' }),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    await testQuery(`DELETE FROM kids_content_approvals WHERE content_id = ?`, [res.body.data.config_id]);
    await testQuery(`DELETE FROM kids_game_configs WHERE id = ?`, [res.body.data.config_id]);
    await testQuery(`DELETE FROM kids_lessons WHERE id = ?`, [res.body.data.lesson_id]);
  });
});

// ─── 4. Staff library endpoints ────────────────────────────────────────────

describe('B2: staff scene library + story templates', () => {
  it('serves the scene asset library (backgrounds/characters/transitions)', async () => {
    const token = await staffToken();
    const res = await request(app).get('/kids/scene-library').set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.backgrounds.length).toBeGreaterThanOrEqual(8);
    expect(res.body.data.characters.length).toBeGreaterThanOrEqual(8);
    expect(res.body.data.transitions.length).toBeGreaterThanOrEqual(3);
  });

  it('serves a story-template scaffold for stage-sequence', async () => {
    const token = await staffToken();
    const res = await request(app)
      .get('/kids/story-templates')
      .query({ template: 'stage-sequence' })
      .set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // getStoryTemplates returns an array of { template, scaffolds, glue } — one per type.
    const entry = res.body.data.find((e) => e.template === 'stage-sequence');
    expect(entry).toBeDefined();
    expect(entry.scaffolds.length).toBeGreaterThanOrEqual(3);
    const types = entry.scaffolds.map((c) => c.type);
    expect(types).toContain('intro');
    expect(types).toContain('game_checkpoint');
  });

  it('requires staff for the library endpoints', async () => {
    const res = await request(app).get('/kids/scene-library');
    expect(res.status).toBe(401);
  });
});
