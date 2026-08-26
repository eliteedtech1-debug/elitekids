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
  return `Generate a MATCHING game config JSON for this lesson. This must feel like a FUN GAME for children, NOT a boring worksheet.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

═══ CRITICAL DESIGN RULES ═══

1. CHARACTERS: Create 2-3 recurring child-friendly characters at the top level "characters" array.
   Each character needs: name (e.g. Zara, Tobi, Maya), and a personality (e.g. curious, playful, brave).
   ALWAYS provide BOTH an "image" key AND an "emoji" key per character. Image format: "media/{lessonId}/character-{name-lowercase}.webp". Emoji format: a single emoji like 👦, 🧒, 👧.

2. IMAGES OVER EMOJIS: The visual hierarchy is Image > Emoji > Text. Always provide an image path first, emoji as fallback.
   - Characters: provide image in the characters array
   - Items: provide image in each object (e.g. "media/{lessonId}/item-name.webp")

3. SCENARIO: The matching game must be wrapped in a short, age-appropriate scenario. A character presents the challenge.
   BAD: "Match the animals to their homes"
   GOOD: "Zara is at the zoo! She found these amazing animals and their homes. Can you help her match each animal to where it lives?"

4. CONVERSATIONAL: The scenario should feel like a character is asking the child for help, not a test instruction.

5. HINT: Include a "hint" — an encouraging clue shown after a wrong match.
   Example: "Hint: A fish lives in water. Which one is the pond?"

6. FEEDBACK: Include feedbackCorrect (celebratory) and feedbackWrong (gentle, encouraging).
   Example feedbackCorrect: "You matched them! Zara is so proud!"
   Example feedbackWrong: "Not quite! Think about where this animal would live."

7. SPEECH TEXT: Include "speechText" — the exact text to read aloud via TTS. Make it sound natural when spoken.

8. MATCHING RULES: Match pairs of related items (e.g. animal-to-habitat, word-to-picture, number-to-count, shape-to-name). Each item has an "image" key and a "matches" key pointing to its partner's id.

═══ OUTPUT FORMAT ═══

Top-level keys:
- characters: array of { name, image, emoji, personality }
- scenario: string (the story wrapping the game)
- hint: string (encouraging hint for wrong matches)
- feedbackCorrect: string (celebratory message)
- feedbackWrong: string (gentle message)
- speechText: string (what to read aloud)

Each item in assets.items must have: id, image, matches (partner's id)

Output a JSON object with exactly these keys: gameId, template ("matching"), lessonId, ageLevel, durationTargetSec, characters, scenario, hint, feedbackCorrect, feedbackWrong, speechText, assets (with background key and items array), rewards (starsOnComplete:3, xp:N), successThresholdPct.`;
}

function tapPrompt(lesson, ageLevel) {
  return `Generate a TAP-RECOGNITION game config JSON for this lesson. This must feel like a FUN GAME for children, NOT a boring worksheet.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

═══ CRITICAL DESIGN RULES ═══

1. CHARACTERS: Create 2-3 recurring child-friendly characters at the top level "characters" array.
   Each character needs: name (e.g. Zara, Tobi, Maya), and a personality (e.g. curious, playful, brave).
   ALWAYS provide BOTH an "image" key AND an "emoji" key per character. The image is the preferred visual; emoji is fallback.
   Image format: "media/{lessonId}/character-{name-lowercase}.webp" (the asset pipeline generates actual images later).
   Emoji format: a single emoji like 👦, 🧒, 👧.

2. IMAGES OVER EMOJIS: The visual hierarchy is Image > Emoji > Text. Always provide an image path first, emoji as fallback.
   - Characters: provide image in the characters array
   - Items: provide image in each object (e.g. "media/{lessonId}/item-name.webp")

3. SCENARIO: The tap game must be wrapped in a short, age-appropriate scenario. A character presents the challenge.
   BAD: "Tap the red apple"
   GOOD: "Zara went to the market. She saw many fruits. Can you help her find the red apple?"

4. SETTINGS: Set the scene — at the market, in the garden, at the zoo, at school, in the kitchen, at the farm, etc.

5. CONVERSATIONAL: The prompt should feel like a character is asking the child for help, not a test instruction.

6. HINT: Include a "hint" — an encouraging clue shown after a wrong answer.
   Example: "Hint: An apple is round and red. Which one looks like that?"

7. FEEDBACK: Include feedbackCorrect (celebratory) and feedbackWrong (gentle, encouraging).
   Example feedbackCorrect: "You found it! Zara is so happy!"
   Example feedbackWrong: "Not quite! Look again — which one is red and round?"

8. SPEECH TEXT: Include "speechText" — the exact text to read aloud via TTS. Make it sound natural when spoken.

9. PEDAGOGY (cross-modal learning):
   - Set promptMode: "image" — show a big image/emoji of the concept, NO text label
   - Set responseMode: "text" — options show text labels ONLY, no images/emojis
   - This tests if the child can RECOGNIZE the image AND know the correct word

═══ OUTPUT FORMAT ═══

The child sees an image/emoji on screen and must tap the CORRECT text label from options.

Top-level keys:
- characters: array of { name, image, emoji, personality }
- scenario: string (the story wrapping the game)
- hint: string (encouraging hint for wrong answers)
- feedbackCorrect: string (celebratory message)
- feedbackWrong: string (gentle message)
- speechText: string (what to read aloud)

Each object in assets.objects must have: id, image, emoji (fallback), label (the text the child taps)

Output a JSON object with exactly these keys: gameId, template ("tap-recognition"), lessonId, ageLevel, durationTargetSec, promptMode ("image"), responseMode ("text"), characters, scenario, hint, feedbackCorrect, feedbackWrong, speechText, prompt, assets (with background, objects array, correctId), rewards, successThresholdPct.`;
}

function dragSortPrompt(lesson, ageLevel) {
  return `Generate a DRAG-SORT game config JSON for this lesson. This must feel like a FUN GAME for children, NOT a boring worksheet.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

═══ CRITICAL DESIGN RULES ═══

1. CHARACTERS: Create 2-3 recurring child-friendly characters at the top level "characters" array.
   Each character needs: name (e.g. Zara, Tobi, Maya), and a personality (e.g. curious, playful, brave).
   ALWAYS provide BOTH an "image" key AND an "emoji" key per character. Image format: "media/{lessonId}/character-{name-lowercase}.webp". Emoji format: a single emoji like 👦, 🧒, 👧.

2. IMAGES OVER EMOJIS: The visual hierarchy is Image > Emoji > Text. Always provide an image path first, emoji as fallback.
   - Characters: provide image in the characters array
   - Items: provide image in each object
   - Buckets: provide image in each bucket

3. SCENARIO: The drag-sort game must be wrapped in a short, age-appropriate scenario. A character presents the challenge.
   BAD: "Sort the animals into categories"
   GOOD: "Tobi is cleaning his room! He has lots of things scattered around. Can you help him sort each item into the right box?"

4. CONVERSATIONAL: The scenario should feel like a character is asking the child for help, not a test instruction.

5. HINT: Include a "hint" — an encouraging clue shown after a wrong placement.
   Example: "Hint: Think about where a ball would go — is it a toy or food?"

6. FEEDBACK: Include feedbackCorrect (celebratory) and feedbackWrong (gentle, encouraging).
   Example feedbackCorrect: "Great sorting! Tobi's room looks amazing!"
   Example feedbackWrong: "Hmm, try again! Which box does this belong in?"

7. SPEECH TEXT: Include "speechText" — the exact text to read aloud via TTS. Make it sound natural when spoken.

8. SORTING RULES: The child drags items into the correct category bucket. Each item has a "bucketId" matching one of the buckets. 2-4 buckets, 4-8 items.

═══ OUTPUT FORMAT ═══

Top-level keys:
- characters: array of { name, image, emoji, personality }
- scenario: string (the story wrapping the game)
- hint: string (encouraging hint for wrong placements)
- feedbackCorrect: string (celebratory message)
- feedbackWrong: string (gentle message)
- speechText: string (what to read aloud)

Each item in assets.items must have: id, image, bucketId
Each bucket in assets.buckets must have: id, label, image

Output a JSON object with exactly these keys: gameId, template ("drag-sort"), lessonId, ageLevel, durationTargetSec, characters, scenario, hint, feedbackCorrect, feedbackWrong, speechText, assets (with background, items array with bucketId, buckets array with id/label/image), rewards, successThresholdPct.`;
}

function quizPrompt(lesson, ageLevel) {
  return `Generate a QUIZ game config JSON for this lesson. This must feel like a FUN GAME for children, NOT a boring worksheet or exam.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

═══ CRITICAL DESIGN RULES ═══

1. CHARACTERS: Create 3-5 recurring child-friendly characters at the top level "characters" array.
   Each character needs: name (e.g. Alex, Maya, Tobi, Zara, Leo), and a personality (e.g. curious, playful, brave).
   ALWAYS provide BOTH an "image" key AND an "emoji" key per character. The image is the preferred visual; emoji is fallback.
   Image format: "media/{lessonId}/character-{name-lowercase}.webp" (the asset pipeline generates actual images later).
   Emoji format: a single emoji like 👦, 🧒, 👧.
   Use diverse, globally appropriate names.

2. IMAGES OVER EMOJIS: The visual hierarchy is Image > Emoji > Text. Always provide an image path first, emoji as fallback.
   - Characters: provide characterImage in each question AND image in the characters array
   - Settings: provide settingImage in each question (e.g. "media/{lessonId}/zoo.webp")
   - The admin/creator can later replace AI-generated image paths with real photographs for better learning.

3. SCENARIOS: Every question MUST be wrapped in a short, age-appropriate scenario. NEVER present isolated grammar statements.
   BAD: "___ is my best friend. (the boy)"
   GOOD: "Alex has a new friend named Sam. Sam is a boy. Alex says: 'Sam is my best friend. ___ is very funny!'"

4. SETTINGS: Vary the location across questions. Examples:
   At school, at home, at the playground, at the zoo, on an adventure, in a shop, at a football game, visiting grandparents, exploring space, solving a mystery.

5. CONVERSATIONAL: Write questions as something a character would ACTUALLY say. The question should feel like helping a character, not answering a test.

6. HINTS: Every question must have a "hint" — an encouraging clue for wrong answers.
   Example: hint: "Sam is a boy, so let's try the word we use for a boy!"

7. FEEDBACK: Include custom feedbackCorrect (celebratory) and feedbackWrong (gentle, encouraging).
   Example feedbackCorrect: "Awesome! You're so smart!"
   Example feedbackWrong: "Almost! Let's think about it together."

8. SPEECH TEXT: Include "speechText" for each question — the exact text to read aloud. Make it sound natural when spoken.

9. PEDAGOGY (cross-modal learning):
   - Set promptMode: "image" — questions show an image/emoji, no text hint
   - Set responseMode: "text" — options show text labels ONLY, no images/emojis
   - This tests if the child can READ the word, not just match pictures

═══ OUTPUT FORMAT ═══

Generate 3-5 questions. Each question object must have:
- id, prompt, options (array with id/label/image), correctIndex
- scenario (the story context — this is what shows on screen)
- characterName, characterImage (image path), characterEmoji (emoji fallback)
- setting (where this happens), settingImage (image path for the setting)
- hint (encouraging clue)
- speechText (what to read aloud)
- feedbackCorrect, feedbackWrong (custom messages)

The top-level "characters" array must have: name, image (asset path), emoji (fallback), personality.

Output a JSON object with exactly these keys: gameId, template ("quiz"), lessonId, ageLevel, durationTargetSec, promptMode ("image"), responseMode ("text"), characters (array with name/image/emoji/personality), questions (array with all fields above), rewards, successThresholdPct.`;
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
  return `Generate a FILL-IN-THE-BLANK game config JSON for this lesson. This must feel like a FUN GAME for children, NOT a boring worksheet.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

═══ CRITICAL DESIGN RULES ═══

1. CHARACTERS: Create 2-3 recurring child-friendly characters at the top level "characters" array.
   Each character needs: name (e.g. Zara, Tobi, Maya), and a personality (e.g. curious, playful, brave).
   ALWAYS provide BOTH an "image" key AND an "emoji" key per character. Image format: "media/{lessonId}/character-{name-lowercase}.webp". Emoji format: a single emoji like 👦, 🧒, 👧.

2. IMAGES OVER EMOJIS: The visual hierarchy is Image > Emoji > Text. Always provide an image path first, emoji as fallback.
   - Characters: provide image in the characters array

3. SCENARIO: The fill-in-blank game must be wrapped in a short, age-appropriate scenario. A character presents the challenge.
   BAD: "Fill in the blanks"
   GOOD: "Maya is writing a letter to her friend Zara. But she forgot some words! Can you help her fill in the missing words?"

4. CONVERSATIONAL: The scenario should feel like a character is asking the child for help, not a test instruction.

5. HINT: Include a "hint" — an encouraging clue shown after a wrong answer.
   Example: "Hint: A cat says '___'. What sound does it make?"

6. FEEDBACK: Include feedbackCorrect (celebratory) and feedbackWrong (gentle, encouraging).
   Example feedbackCorrect: "You filled it in! Maya's letter is perfect!"
   Example feedbackWrong: "Almost! Think about what word fits here."

7. SPEECH TEXT: Include "speechText" — the exact text to read aloud via TTS. Read the full sentence with blanks spoken as "blank". Make it sound natural.

8. SENTENCE RULES: Create a sentence with 2-4 blank spaces (using ___) and a word bank. The child reads the sentence and drags/taps the correct word into each blank. Use simple age-appropriate language.

═══ OUTPUT FORMAT ═══

Top-level keys:
- characters: array of { name, image, emoji, personality }
- scenario: string (the story wrapping the game)
- hint: string (encouraging hint for wrong answers)
- feedbackCorrect: string (celebratory message)
- feedbackWrong: string (gentle message)
- speechText: string (what to read aloud)
- sentence: the sentence with ___ for blanks
- blanks: array of { id: number, answer: string } — each blank's correct word, id is 0-based
- wordBank: array of ALL words (correct answers + 2-4 distractors), shuffled

Output a JSON object with exactly these keys: gameId, template ("fill-in-blank"), lessonId, ageLevel, durationTargetSec, characters, scenario, hint, feedbackCorrect, feedbackWrong, speechText, sentence, blanks, wordBank, rewards (starsOnComplete:3, xp:N), successThresholdPct.`;
}

function memoryPairsPrompt(lesson, ageLevel) {
  return `Generate a MEMORY PAIRS (flip-card concentration) game config JSON for this lesson. This must feel like a FUN GAME for children, NOT a boring worksheet.

Lesson: "${lesson.title}"
Subject: ${lesson.subject}
Age Level: ${ageLevel}
${lesson.lesson_text ? `Lesson Content: ${lesson.lesson_text}` : ''}

═══ CRITICAL DESIGN RULES ═══

1. CHARACTERS: Create 2-3 recurring child-friendly characters at the top level "characters" array.
   Each character needs: name (e.g. Zara, Tobi, Maya), and a personality (e.g. curious, playful, brave).
   ALWAYS provide BOTH an "image" key AND an "emoji" key per character. Image format: "media/{lessonId}/character-{name-lowercase}.webp". Emoji format: a single emoji like 👦, 🧒, 👧.

2. IMAGES OVER EMOJIS: The visual hierarchy is Image > Emoji > Text. Always provide an image path first, emoji as fallback.
   - Characters: provide image in the characters array
   - Items: provide image in each card

3. SCENARIO: The memory game must be wrapped in a short, age-appropriate scenario. A character presents the challenge.
   BAD: "Find the matching pairs"
   GOOD: "Leo is playing a memory game! The cards are all mixed up. Can you help him find all the matching pairs?"

4. CONVERSATIONAL: The scenario should feel like a character is asking the child for help, not a test instruction.

5. HINT: Include a "hint" — an encouraging clue shown after a wrong flip.
   Example: "Hint: Try to remember where you saw that card before!"

6. FEEDBACK: Include feedbackCorrect (celebratory) and feedbackWrong (gentle, encouraging).
   Example feedbackCorrect: "You found a pair! Leo is impressed!"
   Example feedbackWrong: "Those don't match. Try again — you can do it!"

7. SPEECH TEXT: Include "speechText" — the exact text to read aloud via TTS. Make it sound natural when spoken.

8. MEMORY RULES: The child flips face-down cards two at a time to find matching partners. Use an EVEN number of items (4-12 cards): each item has a "matches" key pointing to its partner's id, and the partner points back. Good pair themes: letter-to-picture, word-to-picture, number-to-count, animal-to-sound-name, shape-to-name.

═══ OUTPUT FORMAT ═══

Top-level keys:
- characters: array of { name, image, emoji, personality }
- scenario: string (the story wrapping the game)
- hint: string (encouraging hint for wrong flips)
- feedbackCorrect: string (celebratory message)
- feedbackWrong: string (gentle message)
- speechText: string (what to read aloud)

Each item in assets.items must have: id, image, matches (partner's id)

Output a JSON object with exactly these keys: gameId, template ("memory-pairs"), lessonId, ageLevel, durationTargetSec, characters, scenario, hint, feedbackCorrect, feedbackWrong, speechText, assets (with background key and items array where every item has id/image/matches), rewards (starsOnComplete:3, xp:N), successThresholdPct.`;
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
