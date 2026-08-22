/**
 * Content Config Generator (Sprint 2) — turns a lesson into validated Game
 * Config JSON / Scene Script JSON. AI returns STRUCTURED JSON only; we validate
 * against the game-engine schemas, run the safety pipeline, and persist.
 *
 * Gemini structured output (JSON mode) guarantees parseable responses; schema
 * validation catches structural drift; retry-then-fallback-template handles
 * transient model failures or schema rejections.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const { runSafetyPipeline } = require('./safetyPipeline');

const ajv = new Ajv({ allErrors: true });

// ── AI client ────────────────────────────────────────────────────────────────
// Key rotation: try AI_API_KEY first, then GEMINI_API_KEY (legacy).
// API key rotation: cycle through multiple keys to handle rate limits
const _keyIndex = { current: 0 };
function getApiKey() {
  const keys = [];
  if (process.env.AI_API_KEY) keys.push(process.env.AI_API_KEY);
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  // Support rotation keys from lms-stack pattern
  for (let i = 1; i <= 9; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  if (keys.length === 0) return '';
  const key = keys[_keyIndex.current % keys.length];
  _keyIndex.current++;
  return key;
}

function getGenAI() {
  const key = getApiKey();
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

function getModelName() {
  return process.env.AI_MODEL || 'gemini-2.5-flash';
}

// ── Schema loader ────────────────────────────────────────────────────────────
const SCHEMA_DIR = path.join(__dirname, '..', '..', '..', 'game-engine', 'schemas');
const _schemaCache = {};

function loadSchema(template) {
  if (_schemaCache[template]) return _schemaCache[template];
  const file = path.join(SCHEMA_DIR, `${template}.schema.json`);
  try {
    const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
    const compiled = { schema, validate: ajv.compile(schema) };
    _schemaCache[template] = compiled;
    return compiled;
  } catch (e) {
    console.error(`⚠️ Schema load failed for ${template}:`, e.message);
    return null;
  }
}

function validateConfig(template, config) {
  const loaded = loadSchema(template);
  if (!loaded) throw new Error(`No schema for template '${template}'`);
  const valid = loaded.validate(config);
  if (!valid) {
    throw new Error(
      `Game config failed schema validation (${template}): ${ajv.errorsText(loaded.validate.errors)}`
    );
  }
  return config;
}

// ── Age-appropriate language guidance ────────────────────────────────────────
function ageGuidance(ageLevel) {
  const map = {
    Creche: 'Use single words and very simple 2-3 word phrases. Think babies/toddlers (1-3 years). Bright colors, familiar animals, basic shapes. No text the child must read.',
    Nursery: 'Use very simple sentences (3-5 words). Ages 3-4. Familiar everyday objects, animals, colors, shapes. Instructions must be voice-led or picture-based.',
    KG1: 'Use simple short sentences. Ages 4-5. Can follow 1-2 step instructions. Familiar topics: family, animals, food, body parts, basic numbers and letters.',
    KG2: 'Use clear simple sentences. Ages 5-6. Can follow 2-3 step instructions. Slightly more complex topics: simple science, counting, patterns, rhyming.',
    Primary: 'Use full but simple sentences. Ages 6-10. Can read short text. Topics align with early primary curriculum: math basics, science exploration, reading comprehension, social studies.',
  };
  return map[ageLevel] || map.KG1;
}

// ── Per-template system prompts ──────────────────────────────────────────────
function gameSystemPrompt(template) {
  return `You are an expert educational game designer for young children (ages 1-10) in Nigerian schools. You produce ONLY valid JSON — no markdown, no explanation, no code fences. The JSON must match the requested template schema exactly.

CRITICAL RULES:
- asset image/audio paths MUST be relative keys like "media/{lessonId}/item-name.webp" — the asset pipeline generates actual images later
- Use simple, culturally neutral, globally appropriate content (animals, shapes, colors, food, nature)
- Every game item needs a unique short id (e.g. "a1", "b2", "c3")
- Keep the number of items age-appropriate: Creche/Nursery=3-4, KG1/KG2=4-6, Primary=5-8
- successThresholdPct: Creche/Nursery=50, KG1=60, KG2=70, Primary=75
- starsOnComplete: always 3; xp: 10 + (itemCount * 5)
- durationTargetSec: Creche/Nursery=30, KG1=45, KG2=60, Primary=90

Available templates: matching, tap-recognition, drag-sort, quiz, fill-in-blank, memory-pairs
For fill-in-blank: create a sentence with ___ blanks, provide blanks array [{id, answer}] and wordBank (correct words + distractors).`;
}

function matchingPrompt(lesson, ageLevel) {
  return `Generate a MATCHING game config JSON for this lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

Match pairs of related items (e.g. animal-to-habitat, word-to-picture, number-to-count, shape-to-name). Each item has an "image" key (the image will be generated later) and a "matches" key pointing to its partner's id.

Output a JSON object with exactly these keys: gameId, template ("matching"), lessonId, ageLevel, durationTargetSec, assets (with background key and items array), rewards (starsOnComplete:3, xp:N), successThresholdPct.`;
}

function tapPrompt(lesson, ageLevel) {
  return `Generate a TAP-RECOGNITION game config JSON for this lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

PEDAGOGY RULE (cross-modal learning):
- Set promptMode: "image" — show a big image/emoji of the item, NO text label
- Set responseMode: "text" — options show text labels ONLY, NO images/emojis
- This tests if the child can READ the word, not just match pictures
- Example: Show a big 🐱 image. Options: "Cat", "Dog", "Fish", "Bird". Child taps "Cat".
- The child must recognize the image AND know the correct spelling/word

The child sees an image/emoji on screen and must tap the CORRECT text label from options. "correctId" tells the engine which option is right.

Output a JSON object with exactly these keys: gameId, template ("tap-recognition"), lessonId, ageLevel, durationTargetSec, promptMode ("image"), responseMode ("text"), prompt, assets (with background, objects array, correctId), rewards, successThresholdPct.`;
}

function dragSortPrompt(lesson, ageLevel) {
  return `Generate a DRAG-SORT game config JSON for this lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

The child drags items into the correct category bucket. Each item has a "bucketId" matching one of the buckets. 2-4 buckets, 4-8 items.

Output a JSON object with exactly these keys: gameId, template ("drag-sort"), lessonId, ageLevel, durationTargetSec, assets (with background, items array with bucketId, buckets array with id/label/image), rewards, successThresholdPct.`;
}

function quizPrompt(lesson, ageLevel) {
  return `Generate a QUIZ game config JSON for this lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

PEDAGOGY RULE (cross-modal learning):
- Set promptMode: "image" — questions show an image/emoji, no text hint
- Set responseMode: "text" — options show text labels ONLY, no images/emojis
- This tests if the child can READ the word, not just match pictures
- Example: Show 🐱 image. Question: "What is this?" Options: "Cat", "Dog", "Bird". Answer: Cat

Multiple-choice quiz: 3-5 questions, each with 2-4 options. Questions should test understanding of the lesson. "correctIndex" is the 0-based index of the correct option. Use simple language appropriate for the age level.

Output a JSON object with exactly these keys: gameId, template ("quiz"), lessonId, ageLevel, durationTargetSec, promptMode ("image"), responseMode ("text"), questions (array with id/prompt/options/correctIndex), rewards, successThresholdPct.`;
}

function sceneScriptPrompt(lesson, ageLevel) {
  return `Generate a SCENE SCRIPT (array of scene objects) for an animated video lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

Create 3-5 scenes that teach the lesson through animated narration. Each scene should have:
- sceneType: "teach" for explanation scenes, "reinforce" for review/quiz scenes, "game_checkpoint" only if referencing a game
- background: a simple descriptive key (e.g. "farm-daytime", "classroom", "forest")
- characters: 0-2 characters with rigId (e.g. "buddy-the-fox"), animation (e.g. "wave", "point", "talk"), position ("left"/"center"/"right")
- narrationText: simple, clear narration the child hears
- durationSec: 8-20 seconds per scene (shorter for younger children)
- subtitles: true

Output a JSON ARRAY of scene objects. Each must have: sceneId, lessonId, background, narrationText, durationSec. Optional: sceneType, characters, narrationAudio, subtitles, gameId.`;
}

function fillBlankPrompt(lesson, ageLevel) {
  return `Generate a FILL-IN-THE-BLANK game config JSON for this lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

Create a sentence with 2-4 blank spaces (using ___) and a word bank. The child reads the sentence and drags/taps the correct word into each blank. Use simple age-appropriate language.

Output a JSON object with exactly these keys:
- gameId: unique id
- template: "fill-in-blank"
- lessonId: the lesson id
- ageLevel: the age level
- durationTargetSec: seconds
- sentence: the sentence with ___ for blanks (e.g. "The ___ is sleeping on the ___")
- blanks: array of { id: number, answer: string } — each blank's correct word, id is 0-based position
- wordBank: array of ALL words (correct answers + 2-4 distractors), shuffled
- rewards: { starsOnComplete: 3, xp: N }
- successThresholdPct: age-appropriate threshold`;
}

function memoryPairsPrompt(lesson, ageLevel) {
  return `Generate a MEMORY PAIRS (flip-card concentration) game config JSON for this lesson.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

The child flips face-down cards two at a time to find matching partners. Use an EVEN number of items (4-12 cards): each item has a "matches" key pointing to its partner's id, and the partner points back. Good pair themes: letter-to-picture, word-to-picture, number-to-count, animal-to-sound-name, shape-to-name.

Output a JSON object with exactly these keys: gameId, template ("memory-pairs"), lessonId, ageLevel, durationTargetSec, assets (with background key and items array where every item has id/image/matches), rewards (starsOnComplete:3, xp:N), successThresholdPct.`;
}

const TEMPLATE_PROMPT_BUILDERS = {
  matching: matchingPrompt,
  'tap-recognition': tapPrompt,
  'drag-sort': dragSortPrompt,
  quiz: quizPrompt,
  'fill-in-blank': fillBlankPrompt,
  'memory-pairs': memoryPairsPrompt,
};

// ── AI call with structured JSON output ──────────────────────────────────────
async function callGemini(systemPrompt, userPrompt) {
  const genAI = getGenAI();
  if (!genAI) throw new Error('AI_API_KEY not configured — set AI_API_KEY or GEMINI_API_KEY in .env');

  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`AI returned invalid JSON: ${e.message}\nRaw: ${text.slice(0, 500)}`);
  }
  return parsed;
}

// ── Game Config generation ───────────────────────────────────────────────────
async function generateGameConfig({ lesson, school_id }) {
  const templates = ['matching', 'tap-recognition', 'drag-sort', 'quiz', 'fill-in-blank', 'memory-pairs', 'puzzle-split'];
  const model_provider = 'gemini';
  const model_version = getModelName();

  for (const template of templates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sysPrompt = gameSystemPrompt(template);
        const userPrompt = TEMPLATE_PROMPT_BUILDERS[template](lesson, lesson.age_level);

        const raw = await callGemini(sysPrompt, userPrompt);

        // Ensure required fields the AI may have omitted
        raw.gameId = raw.gameId || `game-${lesson.id}-${template}-01`;
        raw.template = template;
        raw.lessonId = lesson.id;
        raw.ageLevel = lesson.age_level;
        // Schema-required denormalized fields
        raw.category = raw.category || lesson.subject || 'General';
        raw.tier = raw.tier ?? 0;
        raw.item_id = raw.item_id || lesson.id;
        raw.durationTargetSec = raw.durationTargetSec || (lesson.age_level === 'Primary' ? 90 : 60);

        if (!raw.rewards) raw.rewards = { starsOnComplete: 3, xp: 25 };
        if (raw.successThresholdPct === undefined) {
          raw.successThresholdPct = { Creche: 50, Nursery: 50, KG1: 60, KG2: 70, Primary: 75 }[lesson.age_level] || 60;
        }

        // Cross-modal defaults: enforce pedagogically correct prompt/response modes
        if (!raw.promptMode) {
          raw.promptMode = { 'tap-recognition': 'image', quiz: 'image', matching: 'text', 'memory-pairs': 'text', 'drag-sort': 'text', 'fill-in-blank': 'text' }[template] || 'text';
        }
        if (!raw.responseMode) {
          raw.responseMode = { 'tap-recognition': 'text', quiz: 'text', matching: 'image', 'memory-pairs': 'image', 'drag-sort': 'image', 'fill-in-blank': 'text' }[template] || 'text';
        }

        const config = validateConfig(template, raw);

        const safety = await runSafetyPipeline({
          school_id,
          content_type: 'game_config',
          content_id: lesson.id,
          prompt: `Generate a ${template} game for lesson "${lesson.title}" (${lesson.age_level})`,
          model_provider,
          model_version,
          raw_output: config,
        });
        if (safety.verdict !== 'ok') {
          console.warn(`⚠️ ${template} config rejected by safety pipeline, trying next template`);
          continue;
        }
        return { config, model_provider, model_version };
      } catch (e) {
        console.warn(`⚠️ ${template} attempt ${attempt + 1} failed: ${e.message}`);
      }
    }
  }
  throw new Error('All templates failed generation + validation');
}

// ── Scene Script generation ──────────────────────────────────────────────────
async function generateSceneScript({ lesson, school_id }) {
  const model_provider = 'gemini';
  const model_version = getModelName();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sysPrompt = 'You are an expert children\'s educational video scriptwriter. You produce ONLY valid JSON arrays — no markdown, no explanation, no code fences.';
      const userPrompt = sceneScriptPrompt(lesson, lesson.age_level);

      let raw = await callGemini(sysPrompt, userPrompt);

      // Gemini may wrap the array in an object — unwrap if needed
      if (raw && !Array.isArray(raw) && Array.isArray(raw.scenes)) raw = raw.scenes;
      if (!Array.isArray(raw)) throw new Error('Scene script response is not an array');

      // Normalize each scene
      const scenes = raw.map((s, i) => ({
        sceneId: s.sceneId || `scene-${i + 1}`,
        lessonId: lesson.id,
        sceneType: s.sceneType || 'teach',
        background: s.background || 'classroom',
        characters: s.characters || [],
        narrationText: s.narrationText || '',
        durationSec: Math.min(60, Math.max(3, s.durationSec || 12)),
        subtitles: s.subtitles !== false,
        ...(s.gameId ? { gameId: s.gameId } : {}),
      }));

      // Validate each scene against the schema
      for (const scene of scenes) {
        validateConfig('scene-script', scene);
      }

      const safety = await runSafetyPipeline({
        school_id,
        content_type: 'scene_script',
        content_id: lesson.id,
        prompt: `Generate scene script for lesson "${lesson.title}" (${lesson.age_level}) — ${scenes.length} scenes`,
        model_provider,
        model_version,
        raw_output: scenes,
      });
      if (safety.verdict !== 'ok') {
        console.warn('⚠️ Scene script rejected by safety pipeline, retrying');
        continue;
      }
      return { scenes, model_provider, model_version };
    } catch (e) {
      console.warn(`⚠️ Scene script attempt ${attempt + 1} failed: ${e.message}`);
    }
  }
  throw new Error('Scene script generation failed after 3 attempts');
}

// ── Persist helpers ──────────────────────────────────────────────────────────
async function persistGameConfig({ lesson_id, template, age_level, config, model_provider, model_version, created_by, school_id, branch_id }) {
  const id = uuidv4();
  await db.KidGameConfig.create({
    id,
    lesson_id,
    template,
    age_level,
    config_json: config,
    schema_version: '1.0',
    content_state: 'pending_human_review',
    model_version,
    created_by,
  });
  await db.KidContentApproval.create({
    id: uuidv4(),
    school_id: school_id || null,
    branch_id: branch_id || null,
    content_type: 'game_config',
    content_id: id,
    status: 'pending',
  }).catch(() => {});
  return { id, template, config };
}

async function persistSceneScript({ lesson_id, scenes, model_provider, model_version, created_by, school_id, branch_id }) {
  const results = [];
  for (const scene of scenes) {
    const id = uuidv4();
    await db.KidSceneScript.create({
      id,
      lesson_id,
      scene_type: scene.sceneType || 'teach',
      script_json: scene,
      schema_version: '1.0',
      content_state: 'pending_human_review',
      model_version,
      created_by,
    });
    results.push({ id, sceneId: scene.sceneId });
  }
  // Single approval entry for the whole scene script batch
  await db.KidContentApproval.create({
    id: uuidv4(),
    school_id: school_id || null,
    branch_id: branch_id || null,
    content_type: 'scene_script',
    content_id: lesson_id,
    status: 'pending',
  }).catch(() => {});
  return results;
}

module.exports = {
  generateGameConfig,
  generateSceneScript,
  persistGameConfig,
  persistSceneScript,
  validateConfig,
};
