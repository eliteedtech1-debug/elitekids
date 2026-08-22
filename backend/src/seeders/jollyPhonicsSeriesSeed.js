'use strict';
/**
 * Jolly Phonics Adventure — complete multi-age game series seed.
 *
 * 5 units (Creche → Primary), each continuing from the previous developmental
 * stage, chained via prerequisite_unit_id. 3 games per unit (15 total), every
 * one tagged with the knowledge domain it trains (cognitive | psychomotor |
 * affective) for expert transparency (Doc 14 pattern tracking).
 *
 * Jolly Phonics sound groups:
 *   U1 Creche  — Group 1: s a t i p n            (Tier 0 Exposure)
 *   U2 Nursery — Groups 1-2 review: c k e h r m d (Tier 1 Receptive)
 *   U3 KG1     — Group 3 + digraph taste ai/oa    (Tier 2 Cross-Modal)
 *   U4 KG2     — Groups 5-6 + kindness contexts   (Tier 2→3, Affective)
 *   U5 Primary — Group 7 + full recall            (Tier 3 Expressive Recall)
 *
 * Idempotent: upserts by fixed PKs. Run: node src/seeders/jollyPhonicsSeriesSeed.js
 */
require('dotenv').config();
const db = require('../models');

const SERIES_ID = 'series-jolly-phonics';
const SCHOOL = { school_id: 'SCH-KIDS', branch_id: 'BR-MAIN', created_by: 'SYSTEM' };
const MODEL_VERSION = 'jolly-phonics-v1';

// ── Game definitions ─────────────────────────────────────────────────────────
// Each entry: lesson id suffix, config, domain, curriculum objective.
const UNITS = [
  {
    id: 'unit-jp-u1', unit_number: 1, title: 'Sound Friends: s a t i p n',
    age: 'Creche', tier: 0, prereq: null,
    objective: 'Exposure to Group 1 letter shapes with their phonic sounds (multi-sensory, no wrong answers).',
    xp: 20, threshold: 50, duration: 90,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Tap the Letter s',
        prompt: 'Tap the letter s — it says sss!',
        objects: [
          { id: 's', image: '', label: 's', color: '#2E8B57', audio: '' },
          { id: 'a', image: '', label: 'a', color: '#FF6B35', audio: '' },
          { id: 't', image: '', label: 't', color: '#4A90D9', audio: '' },
        ],
        correctId: 's',
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Sort s and t Pictures',
        buckets: [
          { id: 'b-s', label: 's', image: '🐍' },
          { id: 'b-t', label: 't', image: '🐯' },
        ],
        items: [
          { id: 'sun', image: '☀️ Sun', bucketId: 'b-s' },
          { id: 'snake', image: '🐍 Snake', bucketId: 'b-s' },
          { id: 'tiger', image: '🐯 Tiger', bucketId: 'b-t' },
          { id: 'tree', image: '🌳 Tree', bucketId: 'b-t' },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Letters to Pictures',
        items: [
          { id: 's-letter', image: 's', matches: 's-word' },
          { id: 's-word', image: '☀️ Sun', matches: 's-letter' },
          { id: 'a-letter', image: 'a', matches: 'a-word' },
          { id: 'a-word', image: '🐜 Ant', matches: 'a-letter' },
          { id: 't-letter', image: 't', matches: 't-word' },
          { id: 't-word', image: '🐯 Tiger', matches: 't-letter' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u2', unit_number: 2, title: 'Listen & Find: c k e h r m d',
    age: 'Nursery', tier: 1, prereq: 'unit-jp-u1',
    objective: 'Receptive recognition — hear a phonic sound and select the matching letter shape; sort pictures by initial sound.',
    xp: 20, threshold: 50, duration: 100,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Listen and Tap /m/',
        prompt: 'Listen… mmm like moon! Tap the letter that says mmm.',
        objects: [
          { id: 'm', image: '', label: 'm', color: '#8B4513', audio: '' },
          { id: 'd', image: '', label: 'd', color: '#4A90D9', audio: '' },
          { id: 'r', image: '', label: 'r', color: '#2E8B57', audio: '' },
        ],
        correctId: 'm',
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Sort m and d Pictures',
        buckets: [
          { id: 'b-m', label: 'm', image: '🐭' },
          { id: 'b-d', label: 'd', image: '🐶' },
        ],
        items: [
          { id: 'moon', image: '🌙 Moon', bucketId: 'b-m' },
          { id: 'mouse', image: '🐭 Mouse', bucketId: 'b-m' },
          { id: 'dog', image: '🐶 Dog', bucketId: 'b-d' },
          { id: 'duck', image: '🦆 Duck', bucketId: 'b-d' },
        ],
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Sounds to Letters',
        items: [
          { id: 'h-letter', image: 'h', matches: 'h-word' },
          { id: 'h-word', image: '🎩 Hat', matches: 'h-letter' },
          { id: 'r-letter', image: 'r', matches: 'r-word' },
          { id: 'r-word', image: '🌧️ Rain', matches: 'r-letter' },
          { id: 'e-letter', image: 'e', matches: 'e-word' },
          { id: 'e-word', image: '🥚 Egg', matches: 'e-letter' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u3', unit_number: 3, title: 'Letters to Words: g o u l f b + ai/oa',
    age: 'KG1', tier: 2, prereq: 'unit-jp-u2',
    objective: 'Cross-modal association — connect letter shapes to words and first sounds; meet the ai and oa digraphs by sorting.',
    xp: 25, threshold: 60, duration: 120,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Which Word Starts with B?',
        prompt: 'B says buh! Which word starts with B?',
        objects: [
          { id: 'ball', image: '⚽ Ball', label: 'Ball', audio: '' },
          { id: 'fish', image: '🐟 Fish', label: 'Fish', audio: '' },
          { id: 'apple', image: '🍎 Apple', label: 'Apple', audio: '' },
        ],
        correctId: 'ball',
      },
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'First Sound Quiz',
        questions: [
          {
            id: 'q-g', prompt: 'Which picture starts with the g sound?',
            options: [
              { id: 'goat', label: '🐐 Goat', image: '' },
              { id: 'fish', label: '🐟 Fish', image: '' },
              { id: 'sun', label: '☀️ Sun', image: '' },
              { id: 'ant', label: '🐜 Ant', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-b', prompt: 'Which picture starts with the b sound?',
            options: [
              { id: 'bee', label: '🐝 Bee', image: '' },
              { id: 'cat', label: '🐱 Cat', image: '' },
              { id: 'moon', label: '🌙 Moon', image: '' },
              { id: 'pig', label: '🐷 Pig', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-l', prompt: 'Which picture starts with the l sound?',
            options: [
              { id: 'lion', label: '🦁 Lion', image: '' },
              { id: 'tiger', label: '🐯 Tiger', image: '' },
              { id: 'fox', label: '🦊 Fox', image: '' },
              { id: 'rat', label: '🐀 Rat', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-o', prompt: 'Which picture starts with the o sound?',
            options: [
              { id: 'orange', label: '🍊 Orange', image: '' },
              { id: 'apple', label: '🍎 Apple', image: '' },
              { id: 'banana', label: '🍌 Banana', image: '' },
              { id: 'grape', label: '🍇 Grape', image: '' },
            ], correctIndex: 0,
          },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Sort ai and oa Words',
        buckets: [
          { id: 'b-ai', label: 'ai', image: '☔' },
          { id: 'b-oa', label: 'oa', image: '🛶' },
        ],
        items: [
          { id: 'rain', image: '☔ Rain', bucketId: 'b-ai' },
          { id: 'paint', image: '🖌️ Paint', bucketId: 'b-ai' },
          { id: 'boat', image: '🛶 Boat', bucketId: 'b-oa' },
          { id: 'coat', image: '🧥 Coat', bucketId: 'b-oa' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u4', unit_number: 4, title: 'Word Builders & Kind Sounds: ch sh th ng oo',
    age: 'KG2', tier: 2, prereq: 'unit-jp-u3',
    objective: 'Build words with missing digraphs; practise kindness vocabulary through sh/ch sounds (sharing, quiet care).',
    xp: 30, threshold: 60, duration: 150,
    games: [
      {
        key: 'fib', template: 'fill-in-blank', domain: 'cognitive',
        itemTitle: 'Finish the Flower Word',
        sentence: 'The bee flies to each fl_wer.',
        blanks: [{ id: 0, answer: 'o' }],
        wordBank: ['o', 'a', 'i', 'e'],
        context: 'Buzz! The bee needs the oo sound to find the flower.',
      },
      {
        key: 'quiz-aff', template: 'quiz', domain: 'affective',
        itemTitle: 'Kind Words Start with Sh',
        questions: [
          {
            id: 'q-share', prompt: 'Your friend has no toy. What does a kind friend do?',
            options: [
              { id: 'share', label: '🤝 Share', image: '' },
              { id: 'hide', label: '🙈 Hide it', image: '' },
              { id: 'cry', label: '😭 Cry', image: '' },
              { id: 'grab', label: '✊ Grab more', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-shhh', prompt: 'The baby is sleeping. What do we say?',
            options: [
              { id: 'shhh', label: '🤫 Shhh', image: '' },
              { id: 'sing', label: '🎶 Sing loud', image: '' },
              { id: 'jump', label: '🦘 Jump around', image: '' },
              { id: 'shout', label: '📢 Shout', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-shword', prompt: 'Which word starts with the sh sound?',
            options: [
              { id: 'shoe', label: '👟 Shoe', image: '' },
              { id: 'chair', label: '🪑 Chair', image: '' },
              { id: 'car', label: '🚗 Car', image: '' },
              { id: 'banana', label: '🍌 Banana', image: '' },
            ], correctIndex: 0,
          },
        ],
      },
      {
        key: 'sort-chsh', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Sort ch and sh Words',
        buckets: [
          { id: 'b-ch', label: 'ch', image: '🪑' },
          { id: 'b-sh', label: 'sh', image: '👟' },
        ],
        items: [
          { id: 'chair', image: '🪑 Chair', bucketId: 'b-ch' },
          { id: 'cheese', image: '🧀 Cheese', bucketId: 'b-ch' },
          { id: 'cherry', image: '🍒 Cherry', bucketId: 'b-ch' },
          { id: 'ship', image: '🚢 Ship', bucketId: 'b-sh' },
          { id: 'shoe', image: '👟 Shoe', bucketId: 'b-sh' },
          { id: 'sheep', image: '🐑 Sheep', bucketId: 'b-sh' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u5', unit_number: 5, title: 'Sound Experts: qu ou oi ue er ar + Review',
    age: 'Primary', tier: 3, prereq: 'unit-jp-u4',
    objective: 'Expressive recall without picture support — solve sound riddles, spell two digraphs in one sentence, and classify spelling patterns.',
    xp: 40, threshold: 60, duration: 180,
    games: [
      {
        key: 'quiz-riddle', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Phonics Riddle Challenge',
        promptMode: 'context',
        questions: [
          {
            id: 'q-oi', prompt: 'I love mud and I say oink! My sound begins like oi. Who am I?',
            options: [
              { id: 'pig', label: '🐷 Pig', image: '' },
              { id: 'cow', label: '🐄 Cow', image: '' },
              { id: 'duck', label: '🦆 Duck', image: '' },
              { id: 'hen', label: '🐔 Hen', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-ar', prompt: 'I drive you far down the road. My name ends in ar. What am I?',
            options: [
              { id: 'car', label: '🚗 Car', image: '' },
              { id: 'bus', label: '🚌 Bus', image: '' },
              { id: 'bike', label: '🚲 Bike', image: '' },
              { id: 'plane', label: '✈️ Plane', image: '' },
            ], correctIndex: 0,
          },
          {
            id: 'q-qu', prompt: 'She rules the kingdom and her crown shines. Her title begins like kw — qu!. Who is she?',
            options: [
              { id: 'queen', label: '👑 Queen', image: '' },
              { id: 'king', label: '🤴 King', image: '' },
              { id: 'witch', label: '🧙 Witch', image: '' },
              { id: 'grandma', label: '👵 Grandma', image: '' },
            ], correctIndex: 0,
          },
        ],
      },
      {
        key: 'fib', template: 'fill-in-blank', domain: 'cognitive',
        itemTitle: 'Two Digraph Blanks',
        sentence: 'A b_rd flew over the cl_ds.',
        blanks: [{ id: 0, answer: 'ou' }, { id: 1, answer: 'ou' }],
        wordBank: ['ou', 'oi', 'ar', 'er'],
        context: 'Both missing digraphs are the same — the ou sound!',
      },
      {
        key: 'sort-patterns', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Sort ar or er Spellings',
        buckets: [
          { id: 'b-ar', label: 'ar', image: '🚗' },
          { id: 'b-or', label: 'or', image: '🌽' },
          { id: 'b-er', label: 'er', image: '🌊' },
        ],
        items: [
          { id: 'car', image: '🚗 Car', bucketId: 'b-ar' },
          { id: 'star', image: '⭐ Star', bucketId: 'b-ar' },
          { id: 'fork', image: '🍴 Fork', bucketId: 'b-or' },
          { id: 'corn', image: '🌽 Corn', bucketId: 'b-or' },
          { id: 'river', image: '🌊 River', bucketId: 'b-er' },
          { id: 'letter', image: '✉️ Letter', bucketId: 'b-er' },
        ],
      },
    ],
  },
];

function buildConfig(unit, game) {
  const base = {
    gameId: `gc-jp-${unit.unit_number}-${game.key}`,
    template: game.template,
    lessonId: `lesson-jp-u${unit.unit_number}-${game.key}`,
    ageLevel: unit.age,
    category: 'Letters',
    tier: unit.tier,
    item_id: `jp-u${unit.unit_number}-${game.key}`,
    series_id: SERIES_ID,
    unit_number: unit.unit_number,
    domain: game.domain,
    rewards: { starsOnComplete: 3, xp: unit.xp },
    successThresholdPct: unit.threshold,
    durationTargetSec: unit.duration,
    promptMode: game.promptMode || 'text',
    responseMode: game.template === 'tap-recognition' ? (game.objects[0].label && game.objects[0].image === '' ? 'text' : 'image') : undefined,
  };
  switch (game.template) {
    case 'tap-recognition':
      return { ...base, prompt: game.prompt, context: game.context, assets: { background: 'letters-classroom', objects: game.objects, correctId: game.correctId } };
    case 'drag-sort':
      return { ...base, assets: { background: 'letters-classroom', items: game.items, buckets: game.buckets } };
    case 'matching':
      return { ...base, assets: { background: 'letters-classroom', items: game.items } };
    case 'quiz':
      return { ...base, questions: game.questions, context: game.context };
    case 'fill-in-blank':
      return { ...base, sentence: game.sentence, blanks: game.blanks, wordBank: game.wordBank, context: game.context, responseMode: 'text' };
    default:
      throw new Error(`Unknown template ${game.template}`);
  }
}

async function upsert(model, pk, values) {
  const [row] = await model.upsert({ ...values, id: pk });
  return row;
}

(async () => {
  try {
    await db.content.authenticate();

    // 1) Series
    await upsert(db.KidGameSeries, SERIES_ID, {
      name: 'Jolly Phonics Adventure',
      category: 'Letters',
      description: 'Complete Jolly Phonics journey across all age levels — 42 sounds in 7 groups, one developmental unit per level, training cognitive, psychomotor and affective domains.',
      created_by: 'SYSTEM',
    });
    console.log('✅ series upserted:', SERIES_ID);

    let prevUnitId = null;
    for (const unit of UNITS) {
      // 2) Lessons + configs per game
      const contentItems = [];
      for (const game of unit.games) {
        const lessonId = `lesson-jp-u${unit.unit_number}-${game.key}`;
        await upsert(db.KidLesson, lessonId, {
          ...SCHOOL,
          title: `${unit.title} — ${game.itemTitle}`,
          subject: 'English — Phonics',
          age_level: unit.age,
          is_global: 1,
          lesson_text: `${game.itemTitle} (${game.domain} domain, Tier ${unit.tier})`,
          content_state: 'published',
          lesson_type: 'game',
          duration_target_sec: unit.duration,
          published_at: new Date(),
        });
        const cfg = buildConfig(unit, game);
        delete cfg.responseMode === undefined ? null : null;
        if (!('responseMode' in cfg) || cfg.responseMode === undefined) delete cfg.responseMode;
        if (!('promptMode' in cfg) || cfg.promptMode === undefined) delete cfg.promptMode;
        if (!('context' in cfg) || cfg.context === undefined) delete cfg.context;
        await upsert(db.KidGameConfig, `gc-jp-u${unit.unit_number}-${game.key}`, {
          lesson_id: lessonId,
          template: game.template,
          age_level: unit.age,
          config_json: cfg,
          schema_version: '1.0',
          item_id: cfg.item_id,
          tier: unit.tier,
          category: 'Letters',
          content_state: 'published',
          model_version: MODEL_VERSION,
          approved_by: 'SYSTEM',
          approved_at: new Date(),
        });
        contentItems.push({
          lesson_id: lessonId,
          game_config_id: `gc-jp-u${unit.unit_number}-${game.key}`,
          item_id: cfg.item_id,
          template: game.template,
          title: game.itemTitle,
          domain: game.domain,
          tier: unit.tier,
        });
        console.log(`  ✅ game published: ${cfg.gameId} [${game.domain}]`);
      }

      // 3) Unit (prerequisite chain)
      await upsert(db.KidGameUnit, unit.id, {
        series_id: SERIES_ID,
        unit_number: unit.unit_number,
        prerequisite_unit_id: prevUnitId,
        content_items: contentItems,
        title: unit.title,
      });
      console.log(`✅ unit upserted: ${unit.id} (${unit.age}, prereq=${prevUnitId})`);

      // 4) Curriculum points — one per game for expert transparency
      for (const ci of contentItems) {
        await upsert(db.KidCurriculumPoint, `cp-${ci.item_id}`, {
          curriculum_source: 'Jolly Phonics (Lloyd, 1998) — Group order preserved',
          age_band: unit.age,
          learning_objective: `${unit.objective} Domain: ${ci.domain}.`,
          category: 'Letters',
          mapped_item_ids: [ci.item_id],
        });
      }
      prevUnitId = unit.id;
    }

    console.log('\n🎉 Jolly Phonics Adventure seeded: 1 series, 5 units, 15 lessons+games, 15 curriculum points');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
})();
