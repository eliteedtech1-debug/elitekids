'use strict';

/**
 * contentGeneratorService unit tests — Gemini, safety pipeline, and
 * schema validation are mocked so these run in CI without API keys.
 *
 * Run: cd elite-kids/backend && npm test -- test/content-generator.test.js
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

jest.mock('../src/services/safetyPipeline', () => ({
  runSafetyPipeline: jest.fn().mockResolvedValue({ verdict: 'ok', auditId: 'AUDIT-MOCK' }),
  checkDenylist: jest.fn().mockResolvedValue({ passed: true, blocked: [] }),
  prescreenClassifier: jest.fn().mockResolvedValue({ score: 95, passed: true }),
}));

jest.mock('../src/models', () => ({
  KidGameConfig: { create: jest.fn().mockResolvedValue({}), findByPk: jest.fn().mockResolvedValue(null), findAll: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue([1]) },
  KidSceneScript: { create: jest.fn().mockResolvedValue({}), findByPk: jest.fn().mockResolvedValue(null), findAll: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue([1]) },
  KidContentApproval: { create: jest.fn().mockResolvedValue({}), findByPk: jest.fn().mockResolvedValue(null), findAll: jest.fn().mockResolvedValue([]) },
  KidContentAuditLog: { create: jest.fn().mockResolvedValue({}) },
  KidPrescreenLog: { create: jest.fn().mockResolvedValue({}) },
}));

process.env.AI_API_KEY = 'test-mock-key';
process.env.AI_MODEL = 'gemini-2.5-flash';

const {
  generateGameConfig,
  generateSceneScript,
  persistGameConfig,
  persistSceneScript,
  validateConfig,
} = require('../src/services/contentGeneratorService');
const db = require('../src/models');
const { runSafetyPipeline } = require('../src/services/safetyPipeline');

// Reset only call data between tests; implementations (mockResolvedValue) survive
// because they're set per-test via mockResolvedValue (persistent, not Once).
beforeEach(() => {
  mockGenerateContent.mockClear();
  runSafetyPipeline.mockClear();
  db.KidGameConfig.create.mockClear();
  db.KidSceneScript.create.mockClear();
  db.KidContentApproval.create.mockClear();
  // Re-set default safety pipeline return value (mockClear clears .mock but not impl)
  runSafetyPipeline.mockResolvedValue({ verdict: 'ok', auditId: 'AUDIT-MOCK' });
  db.KidGameConfig.create.mockResolvedValue({});
  db.KidSceneScript.create.mockResolvedValue({});
  db.KidContentApproval.create.mockResolvedValue({});
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeLesson(overrides = {}) {
  return {
    id: 'LESSON-TEST',
    title: 'Animal Sounds',
    subject: 'Music',
    age_level: 'Nursery',
    lesson_text: 'Learn the sounds different animals make.',
    ...overrides,
  };
}

function matchingGeminiResponse() {
  return {
    gameId: 'game-LESSON-TEST-matching-01',
    template: 'matching',
    lessonId: 'LESSON-TEST',
    ageLevel: 'Nursery',
    durationTargetSec: 45,
    // Schema-required denormalized fields (generateGameConfig injects these
    // before calling validateConfig; direct unit tests provide them inline)
    category: 'English',
    tier: 0,
    item_id: 'LESSON-TEST',
    assets: {
      background: 'farm-daytime',
      items: [
        { id: 'a1', image: 'media/LESSON-TEST/cow.webp', matches: 'b1' },
        { id: 'b1', image: 'media/LESSON-TEST/moo.webp', matches: 'a1' },
        { id: 'a2', image: 'media/LESSON-TEST/cat.webp', matches: 'b2' },
        { id: 'b2', image: 'media/LESSON-TEST/meow.webp', matches: 'a2' },
      ],
    },
    rewards: { starsOnComplete: 3, xp: 30 },
    successThresholdPct: 50,
  };
}

function quizGeminiResponse() {
  return {
    gameId: 'game-LESSON-TEST-quiz-01',
    template: 'quiz',
    lessonId: 'LESSON-TEST',
    ageLevel: 'Nursery',
    durationTargetSec: 45,
    // Schema-required denormalized fields (see matchingGeminiResponse)
    category: 'English',
    tier: 0,
    item_id: 'LESSON-TEST',
    questions: [
      {
        id: 'q1', prompt: 'What does a cow say?',
        options: [
          { id: 'o1', label: 'Moo', image: 'media/moo.webp' },
          { id: 'o2', label: 'Baa', image: 'media/baa.webp' },
          { id: 'o3', label: 'Woof', image: 'media/woof.webp' },
        ],
        correctIndex: 0,
      },
      {
        id: 'q2', prompt: 'What does a cat say?',
        options: [
          { id: 'o4', label: 'Moo', image: 'media/moo.webp' },
          { id: 'o5', label: 'Meow', image: 'media/meow.webp' },
          { id: 'o6', label: 'Quack', image: 'media/quack.webp' },
        ],
        correctIndex: 1,
      },
      {
        id: 'q3', prompt: 'What does a duck say?',
        options: [
          { id: 'o7', label: 'Moo', image: 'media/moo.webp' },
          { id: 'o8', label: 'Meow', image: 'media/meow.webp' },
          { id: 'o9', label: 'Quack', image: 'media/quack.webp' },
        ],
        correctIndex: 2,
      },
    ],
    rewards: { starsOnComplete: 3, xp: 25 },
    successThresholdPct: 50,
  };
}

function sceneScriptGeminiResponse() {
  return [
    {
      sceneId: 'scene-1',
      lessonId: 'LESSON-TEST',
      sceneType: 'teach',
      background: 'farm-daytime',
      characters: [],
      narrationText: 'Welcome to the farm! Can you hear the animals?',
      durationSec: 12,
      subtitles: true,
    },
    {
      sceneId: 'scene-2',
      lessonId: 'LESSON-TEST',
      sceneType: 'reinforce',
      background: 'barn',
      characters: [],
      narrationText: 'What sound does a cow make? Moo!',
      durationSec: 10,
      subtitles: true,
    },
  ];
}

function geminiResponse(data) {
  return { response: { text: () => JSON.stringify(data) } };
}

// ── validateConfig (unit) ────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('accepts a valid matching config', () => {
    const result = validateConfig('matching', matchingGeminiResponse());
    expect(result.gameId).toBe('game-LESSON-TEST-matching-01');
    expect(result.template).toBe('matching');
  });

  it('accepts a valid quiz config', () => {
    const result = validateConfig('quiz', quizGeminiResponse());
    expect(result.questions).toHaveLength(3);
  });

  it('accepts a valid scene-script config', () => {
    const scenes = sceneScriptGeminiResponse();
    for (const scene of scenes) {
      const result = validateConfig('scene-script', scene);
      expect(result.sceneId).toBeDefined();
    }
  });

  it('rejects a config missing required fields', () => {
    expect(() => validateConfig('matching', { gameId: 'x' })).toThrow(/failed schema validation/);
  });

  it('rejects an unknown template', () => {
    expect(() => validateConfig('unknown-template', {})).toThrow(/No schema/);
  });
});

// ── generateGameConfig (integration with mocked Gemini) ──────────────────────

describe('generateGameConfig', () => {
  it('returns validated config when Gemini responds with valid JSON', async () => {
    // Every call to Gemini returns a valid matching config
    mockGenerateContent.mockResolvedValue(geminiResponse(matchingGeminiResponse()));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(result.config).toBeDefined();
    expect(result.config.template).toBe('matching');
    expect(result.config.lessonId).toBe('LESSON-TEST');
    expect(result.model_provider).toBe('gemini');
    expect(result.model_version).toBe('gemini-2.5-flash');
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('falls back to next template when first fails validation', async () => {
    // First 6 calls return invalid configs (matching×2, tap×2, drag×2)
    const invalidMatching = { gameId: 'bad', template: 'matching' };
    const invalidTap = { gameId: 'bad', template: 'tap-recognition', assets: { background: 'x' } };
    const invalidDrag = { gameId: 'bad', template: 'drag-sort', assets: { background: 'x', items: [] } };

    mockGenerateContent
      .mockResolvedValueOnce(geminiResponse(invalidMatching))
      .mockResolvedValueOnce(geminiResponse(invalidMatching))
      .mockResolvedValueOnce(geminiResponse(invalidTap))
      .mockResolvedValueOnce(geminiResponse(invalidTap))
      .mockResolvedValueOnce(geminiResponse(invalidDrag))
      .mockResolvedValueOnce(geminiResponse(invalidDrag))
      .mockResolvedValue(geminiResponse(quizGeminiResponse()));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(result.config.template).toBe('quiz');
    expect(result.config.questions.length).toBeGreaterThanOrEqual(3);
  });

  it('throws when all templates fail', async () => {
    // Every call returns garbage that fails schema validation
    mockGenerateContent.mockResolvedValue(geminiResponse({ broken: true }));

    await expect(
      generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' })
    ).rejects.toThrow(/All templates failed/);
  });

  it('enriches AI output with missing required fields', async () => {
    const minimal = {
      gameId: 'game-1',
      template: 'matching',
      lessonId: 'LESSON-TEST',
      ageLevel: 'Nursery',
      assets: {
        background: 'farm',
        items: [
          { id: 'a1', image: 'm.webp', matches: 'b1' },
          { id: 'b1', image: 'n.webp', matches: 'a1' },
        ],
      },
    };
    mockGenerateContent.mockResolvedValue(geminiResponse(minimal));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(result.config.rewards).toEqual({ starsOnComplete: 3, xp: 25 });
    expect(result.config.successThresholdPct).toBe(50);
    expect(result.config.durationTargetSec).toBe(60);
  });
});

// ── Cross-modal defaults (image→text for tap-recognition + quiz) ─────────────

describe('cross-modal defaults', () => {
  function tapRecGeminiResponse() {
    return {
      gameId: 'game-LESSON-TEST-tap-01',
      template: 'tap-recognition',
      lessonId: 'LESSON-TEST',
      ageLevel: 'Nursery',
      durationTargetSec: 45,
      prompt: 'Find the cat',
      assets: {
        background: 'farm',
        objects: [
          { id: 'a1', image: 'media/cat.webp' },
          { id: 'a2', image: 'media/dog.webp' },
          { id: 'a3', image: 'media/fish.webp' },
        ],
        correctId: 'a1',
      },
      rewards: { starsOnComplete: 3, xp: 25 },
      successThresholdPct: 50,
    };
  }

  it('tap-recognition gets image→text cross-modal defaults', async () => {
    // AI returns a tap-recognition config without promptMode/responseMode
    mockGenerateContent.mockResolvedValue(geminiResponse(tapRecGeminiResponse()));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    // The generator should auto-inject cross-modal defaults
    expect(result.config.promptMode).toBe('image');
    expect(result.config.responseMode).toBe('text');
  });

  it('quiz gets image→text cross-modal defaults', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(quizGeminiResponse()));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(result.config.promptMode).toBe('image');
    expect(result.config.responseMode).toBe('text');
  });

  it('matching gets text→image defaults (not cross-image→text)', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(matchingGeminiResponse()));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(result.config.promptMode).toBe('text');
    expect(result.config.responseMode).toBe('image');
  });

  it('does not override AI-provided promptMode/responseMode', async () => {
    // AI returns a config that already has cross-modal fields set
    const configWithModes = {
      ...tapRecGeminiResponse(),
      promptMode: 'audio',
      responseMode: 'text',
    };
    mockGenerateContent.mockResolvedValue(geminiResponse(configWithModes));

    const result = await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    // Should keep AI's values, not overwrite with defaults
    expect(result.config.promptMode).toBe('audio');
    expect(result.config.responseMode).toBe('text');
  });
});

// ── generateSceneScript (integration with mocked Gemini) ─────────────────────

describe('generateSceneScript', () => {
  it('returns scene array when Gemini responds with valid JSON', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(sceneScriptGeminiResponse()));

    const result = await generateSceneScript({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(Array.isArray(result.scenes)).toBe(true);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0].sceneType).toBe('teach');
    expect(result.scenes[1].sceneType).toBe('reinforce');
    expect(result.model_provider).toBe('gemini');
  });

  it('unwraps { scenes: [...] } wrapper from Gemini', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse({ scenes: sceneScriptGeminiResponse() }));

    const result = await generateSceneScript({ lesson: fakeLesson(), school_id: 'SCH-TEST' });
    expect(Array.isArray(result.scenes)).toBe(true);
    expect(result.scenes).toHaveLength(2);
  });

  it('throws when Gemini returns non-array and no wrapper', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse({ notScenes: true }));

    await expect(
      generateSceneScript({ lesson: fakeLesson(), school_id: 'SCH-TEST' })
    ).rejects.toThrow(/Scene script generation failed/);
  });

  it('normalizes scene fields (durationSec clamped, defaults applied)', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse([
      {
        sceneId: 's1',
        lessonId: 'LESSON-TEST',
        background: 'forest',
        narrationText: 'Hello!',
        durationSec: 999, // will be clamped to 60
      },
    ]));

    const result = await generateSceneScript({ lesson: fakeLesson(), school_id: 'SCH-TEST' });
    expect(result.scenes[0].durationSec).toBe(60);
    expect(result.scenes[0].sceneType).toBe('teach');
    expect(result.scenes[0].subtitles).toBe(true);
  });
});

// ── persistGameConfig (unit) ─────────────────────────────────────────────────

describe('persistGameConfig', () => {
  it('creates a KidGameConfig + KidContentApproval', async () => {
    const result = await persistGameConfig({
      lesson_id: 'LESSON-TEST',
      template: 'matching',
      age_level: 'Nursery',
      config: matchingGeminiResponse(),
      model_provider: 'gemini',
      model_version: 'gemini-2.5-flash',
      created_by: 'U1',
      school_id: 'SCH-TEST',
      branch_id: 'BR-TEST',
    });

    expect(result.id).toBeDefined();
    expect(result.template).toBe('matching');
    expect(db.KidGameConfig.create).toHaveBeenCalledTimes(1);
    expect(db.KidContentApproval.create).toHaveBeenCalledTimes(1);

    const createCall = db.KidGameConfig.create.mock.calls[0][0];
    expect(createCall.content_state).toBe('pending_human_review');
    expect(createCall.lesson_id).toBe('LESSON-TEST');
  });
});

// ── persistSceneScript (unit) ────────────────────────────────────────────────

describe('persistSceneScript', () => {
  it('creates one KidSceneScript per scene + a batch approval', async () => {
    const scenes = sceneScriptGeminiResponse();

    const result = await persistSceneScript({
      lesson_id: 'LESSON-TEST',
      scenes,
      model_provider: 'gemini',
      model_version: 'gemini-2.5-flash',
      created_by: 'U1',
      school_id: 'SCH-TEST',
      branch_id: 'BR-TEST',
    });

    expect(result).toHaveLength(2);
    expect(db.KidSceneScript.create).toHaveBeenCalledTimes(2);
    expect(db.KidContentApproval.create).toHaveBeenCalledTimes(1);

    const approvalCall = db.KidContentApproval.create.mock.calls[0][0];
    expect(approvalCall.content_type).toBe('scene_script');
    expect(approvalCall.content_id).toBe('LESSON-TEST');
    expect(approvalCall.status).toBe('pending');

    const firstCall = db.KidSceneScript.create.mock.calls[0][0];
    expect(firstCall.content_state).toBe('pending_human_review');
    expect(firstCall.scene_type).toBe('teach');
  });
});

// ── Safety pipeline integration ──────────────────────────────────────────────

describe('safety pipeline integration', () => {
  it('generateGameConfig calls runSafetyPipeline with correct args', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(matchingGeminiResponse()));

    await generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(runSafetyPipeline).toHaveBeenCalled();
    const callArgs = runSafetyPipeline.mock.calls[0][0];
    expect(callArgs.school_id).toBe('SCH-TEST');
    expect(callArgs.content_type).toBe('game_config');
    expect(callArgs.model_provider).toBe('gemini');
    expect(callArgs.model_version).toBe('gemini-2.5-flash');
  });

  it('generateSceneScript calls runSafetyPipeline with scene_script type', async () => {
    mockGenerateContent.mockResolvedValue(geminiResponse(sceneScriptGeminiResponse()));

    await generateSceneScript({ lesson: fakeLesson(), school_id: 'SCH-TEST' });

    expect(runSafetyPipeline).toHaveBeenCalled();
    const callArgs = runSafetyPipeline.mock.calls[0][0];
    expect(callArgs.content_type).toBe('scene_script');
    expect(callArgs.content_id).toBe('LESSON-TEST');
  });

  it('generateGameConfig retries all templates when safety rejects', async () => {
    // All Gemini calls return valid matching config
    mockGenerateContent.mockResolvedValue(geminiResponse(matchingGeminiResponse()));

    // But safety rejects everything
    runSafetyPipeline.mockResolvedValue({ verdict: 'rejected' });

    await expect(
      generateGameConfig({ lesson: fakeLesson(), school_id: 'SCH-TEST' })
    ).rejects.toThrow(/All templates failed/);

    // Safety is called only for templates whose schema accepts matching-format
    // assets: matching AND memory-pairs (both use items with id/image/matches).
    // The other templates fail schema validation before safety runs.
    // 2 accepted templates × 2 attempts = 4 safety calls.
    expect(runSafetyPipeline).toHaveBeenCalledTimes(4);
  });
});
