#!/usr/bin/env node
/**
 * Create a cross-modal Matching lesson: Fruits & Vegetables
 *
 * Cross-modal design:
 *   promptMode: 'text'  → child sees the TEXT label (e.g. "Apple 🍎")
 *   responseMode: 'image' → child picks the matching IMAGE
 *
 * Usage:
 *   node create-fruits-vegetables-lesson.js
 *
 * Requires BACKEND_URL and auth token (set TOKEN env var).
 */

const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = process.env.BACKEND_URL || 'https://elitekids.com.ng';
const TOKEN = process.env.TOKEN || '';
const SCHOOL_ID = process.env.SCHOOL_ID || '';

if (!TOKEN) {
  console.error('❌ Set TOKEN env var with your admin JWT token.');
  console.error('   Example: TOKEN=eyJhbGci... node create-fruits-vegetables-lesson.js');
  process.exit(1);
}

// ── Game Config ──────────────────────────────────────────────────────────────

const LESSON_ID = uuidv4();
const GAME_ID = `game-fruits-veggies-${Date.now()}`;

const AGE_LEVELS = ['KG1', 'KG2'];

const configJson = {
  gameId: GAME_ID,
  template: 'matching',
  lessonId: LESSON_ID,
  ageLevel: 'KG1',
  category: 'Science',
  tier: 0,
  item_id: LESSON_ID,
  durationTargetSec: 60,

  // Cross-modal: text labels → image matching
  promptMode: 'text',
  responseMode: 'image',

  assets: {
    background: 'media/fruits-veggies/background.webp',
    items: [
      // ── Fruits ──
      {
        id: 'apple',
        image: 'media/fruits-veggies/apple.webp',
        matches: 'apple-label',
      },
      {
        id: 'apple-label',
        image: 'media/fruits-veggies/label-apple.webp',
        matches: 'apple',
      },
      {
        id: 'banana',
        image: 'media/fruits-veggies/banana.webp',
        matches: 'banana-label',
      },
      {
        id: 'banana-label',
        image: 'media/fruits-veggies/label-banana.webp',
        matches: 'banana',
      },
      {
        id: 'orange',
        image: 'media/fruits-veggies/orange.webp',
        matches: 'orange-label',
      },
      {
        id: 'orange-label',
        image: 'media/fruits-veggies/label-orange.webp',
        matches: 'orange',
      },
      // ── Vegetables ──
      {
        id: 'carrot',
        image: 'media/fruits-veggies/carrot.webp',
        matches: 'carrot-label',
      },
      {
        id: 'carrot-label',
        image: 'media/fruits-veggies/label-carrot.webp',
        matches: 'carrot',
      },
    ],
  },

  rewards: {
    starsOnComplete: 3,
    xp: 50,
  },
  successThresholdPct: 60,
};

// ── Scene scripts ────────────────────────────────────────────────────────────

const scenes = [
  {
    sceneId: 'scene-1',
    lessonId: LESSON_ID,
    sceneType: 'teach',
    background: 'fruits-veggies',
    narrationText: 'Hello friends! Today we are going to learn about yummy fruits and vegetables!',
    durationSec: 6,
    subtitles: true,
  },
  {
    sceneId: 'scene-2',
    lessonId: LESSON_ID,
    sceneType: 'teach',
    background: 'fruits-veggies',
    narrationText: 'Fruits are sweet and grow on trees. We have apples, bananas, and oranges!',
    durationSec: 8,
    subtitles: true,
  },
  {
    sceneId: 'scene-3',
    lessonId: LESSON_ID,
    sceneType: 'teach',
    background: 'fruits-veggies',
    narrationText: 'Vegetables grow in the ground. Carrots are orange and crunchy!',
    durationSec: 7,
    subtitles: true,
  },
  {
    sceneId: 'scene-4',
    lessonId: LESSON_ID,
    sceneType: 'reinforce',
    background: 'fruits-veggies',
    narrationText: 'Now let\'s play a game! Match the name to the picture. You can do it!',
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
  console.log('🎓 Creating cross-modal matching lesson: Fruits & Vegetables');
  console.log(`   Age levels: ${AGE_LEVELS.join(', ')}`);
  console.log(`   Cross-modal: text→image (child reads label, picks picture)`);
  console.log('');

  const body = {
    title: 'Fruits & Vegetables — Match the Picture',
    subject: 'Science',
    age_level: 'KG1',
    template: 'matching',
    config_json: configJson,
    lesson_text: 'Learn to identify common fruits and vegetables by matching their names to pictures.',
    scenes,
  };

  try {
    const res = await post('/kids/lessons/manual', body);

    if (res.status === 201 && res.data?.success) {
      const { lesson_id, config_id, template } = res.data.data;
      console.log('✅ Lesson created successfully!');
      console.log('');
      console.log('   Lesson ID:', lesson_id);
      console.log('   Config ID:', config_id);
      console.log('   Template: ', template);
      console.log('   Status:   pending_human_review');
      console.log('');
      console.log('📋 To approve: POST /kids/approvals/{approval_id}/decide { "decision": "approve" }');
      console.log('🔗 Play at:   https://elitekids.com.ng/student/play/' + lesson_id);
    } else {
      console.error('❌ Failed:', res.status, JSON.stringify(res.data, null, 2));
    }
  } catch (err) {
    console.error('❌ Request failed:', err.message);
  }
}

main();
