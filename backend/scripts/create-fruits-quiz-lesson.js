#!/usr/bin/env node
/**
 * Create a cross-modal Quiz lesson: Fruits & Vegetables
 *
 * Cross-modal design:
 *   promptMode: 'image'  → child sees a picture/emoji of the fruit/veggie
 *   responseMode: 'text' → child picks the correct TEXT label
 *
 * This tests reading skills: child must recognize the image AND know the word.
 *
 * Usage:
 *   TOKEN=eyJhbGci... node create-fruits-quiz-lesson.js
 */

const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = process.env.BACKEND_URL || 'https://elitekids.com.ng';
const TOKEN = process.env.TOKEN || '';
const SCHOOL_ID = process.env.SCHOOL_ID || '';

if (!TOKEN) {
  console.error('❌ Set TOKEN env var with your admin JWT token.');
  process.exit(1);
}

const LESSON_ID = uuidv4();
const GAME_ID = `game-fruits-veggies-quiz-${Date.now()}`;

const configJson = {
  gameId: GAME_ID,
  template: 'quiz',
  lessonId: LESSON_ID,
  ageLevel: 'KG1',
  category: 'Science',
  tier: 0,
  item_id: LESSON_ID,
  durationTargetSec: 60,

  // Cross-modal: image prompt → text response
  promptMode: 'image',
  responseMode: 'text',

  question: 'What fruit is this?',
  image: 'media/fruits-veggies/apple.webp',
  context: 'A red, round fruit that grows on trees',

  options: [
    { id: 'o1', label: 'Apple', image: 'media/fruits-veggies/label-apple.webp' },
    { id: 'o2', label: 'Banana', image: 'media/fruits-veggies/label-banana.webp' },
    { id: 'o3', label: 'Orange', image: 'media/fruits-veggies/label-orange.webp' },
  ],
  correctId: 'o1',

  questions: [
    {
      id: 'q1',
      prompt: 'What fruit is this?',
      image: 'media/fruits-veggies/banana.webp',
      options: ['Apple', 'Banana', 'Carrot'],
      correctIndex: 1,
    },
    {
      id: 'q2',
      prompt: 'Which vegetable is orange and crunchy?',
      image: 'media/fruits-veggies/carrot.webp',
      options: ['Apple', 'Banana', 'Carrot'],
      correctIndex: 2,
    },
    {
      id: 'q3',
      prompt: 'What fruit is this?',
      image: 'media/fruits-veggies/orange.webp',
      options: ['Apple', 'Banana', 'Orange'],
      correctIndex: 2,
    },
    {
      id: 'q4',
      prompt: 'Which one is a fruit?',
      image: 'media/fruits-veggies/apple.webp',
      options: ['Carrot', 'Apple', 'Broccoli'],
      correctIndex: 1,
    },
  ],

  rewards: {
    starsOnComplete: 3,
    xp: 50,
  },
  successThresholdPct: 60,
};

// ── Scenes ───────────────────────────────────────────────────────────────────

const scenes = [
  {
    sceneId: 'scene-1',
    lessonId: LESSON_ID,
    sceneType: 'teach',
    background: 'fruits-veggies',
    narrationText: 'Welcome to the fruit and vegetable quiz! Look at each picture and pick the right word.',
    durationSec: 6,
    subtitles: true,
  },
  {
    sceneId: 'scene-2',
    lessonId: LESSON_ID,
    sceneType: 'teach',
    background: 'fruits-veggies',
    narrationText: 'Can you read the words? Let\'s find out! Look at the picture, then tap the correct answer.',
    durationSec: 7,
    subtitles: true,
  },
  {
    sceneId: 'scene-3',
    lessonId: LESSON_ID,
    sceneType: 'reinforce',
    background: 'fruits-veggies',
    narrationText: 'Great job! Remember: fruits are sweet and vegetables are healthy. Let\'s play!',
    durationSec: 5,
    subtitles: true,
  },
];

// ── API call ─────────────────────────────────────────────────────────────────

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACKEND_URL);
    const mod = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    const req = mod.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        Authorization: `Bearer ${TOKEN}`,
        'x-school-id': SCHOOL_ID,
      },
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(text) });
        } catch {
          resolve({ status: res.statusCode, data: text });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🍎 Creating cross-modal quiz lesson: Fruits & Vegetables');
  console.log('   Cross-modal: image→text (child sees picture, picks word)');
  console.log('');

  const body = {
    title: 'Fruits & Vegetables — Picture Quiz',
    subject: 'Science',
    age_level: 'KG1',
    template: 'quiz',
    config_json: configJson,
    lesson_text: 'Test your knowledge of fruits and vegetables! Look at each picture and choose the correct word.',
    scenes,
  };

  try {
    const res = await post('/kids/lessons/manual', body);

    if (res.status === 201 && res.data?.success) {
      const { lesson_id, config_id, template } = res.data.data;
      console.log('✅ Quiz lesson created!');
      console.log('');
      console.log('   Lesson ID:', lesson_id);
      console.log('   Config ID:', config_id);
      console.log('   Template: ', template);
      console.log('   Status:   pending_human_review');
      console.log('');
      console.log('🔗 Play at: https://elitekids.com.ng/student/play/' + lesson_id);
    } else {
      console.error('❌ Failed:', res.status, JSON.stringify(res.data, null, 2));
    }
  } catch (err) {
    console.error('❌ Request failed:', err.message);
  }
}

main();
