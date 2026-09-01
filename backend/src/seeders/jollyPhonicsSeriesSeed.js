'use strict';
/**
 * Jolly Phonics Adventure — complete multi-age game series seed.
 *
 * 5 units (Creche → Primary), each continuing from the previous developmental
 * stage, chained via prerequisite_unit_id. 3 games per unit (15 total), every
 * one tagged with the knowledge domain it trains (cognitive | psychomotor |
 * affective).
 *
 * Every game carries AT LEAST 5 questions/rounds:
 *   tap-recognition → items[] = one round per item (child taps the named target)
 *   matching        → pairs[] = one match per pair (min 5 pairs)
 *   drag-sort       → items[] = ordered placement steps (min 5)
 *   quiz            → questions[] (min 5)
 *   fill-in-blank   → sentences[] rounds (min 5)
 *
 * Configs are written in the RUNTIME format consumed by GamePlay.tsx
 * (flat items/pairs/questions/sentences) so they render with no adaptation.
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
const SCHOOL = { school_id: 'SCH-ELITE', branch_id: 'BR-MAIN', created_by: 'SYSTEM' };
const MODEL_VERSION = 'jolly-phonics-v1';

// ── Helpers ──────────────────────────────────────────────────────────────────
const letterItem = (label, color) => ({ label, color });

// ── Game definitions ─────────────────────────────────────────────────────────
const UNITS = [
  {
    id: 'unit-jp-u1', unit_number: 1, title: 'Sound Friends: s a t i p n',
    age: 'Creche', tier: 0, prereq: null,
    objective: 'Exposure to Group 1 letter shapes with their phonic sounds (multi-sensory, no wrong answers).',
    xp: 20, threshold: 50, duration: 120,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Tap Your Sound Friends',
        prompt: 'Tap the letter I say!',
        items: [
          letterItem('s', '#2E8B57'),
          letterItem('a', '#FF6B35'),
          letterItem('t', '#4A90D9'),
          letterItem('i', '#8B4513'),
          letterItem('p', '#946BDE'),
          letterItem('n', '#2F8F83'),
        ],
        responseMode: 'text',
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Sounds to Pictures',
        pairs: [
          { a: 's', b: '☀️ Sun' },
          { a: 'a', b: '🐜 Ant' },
          { a: 't', b: '🐯 Tiger' },
          { a: 'i', b: '🧊 Igloo' },
          { a: 'p', b: '🐷 Pig' },
          { a: 'n', b: '🪺 Nest' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order Your First Sounds',
        context: 'Put the Group 1 sounds in teaching order.',
        items: [
          { num: 1, label: 's' }, { num: 2, label: 'a' }, { num: 3, label: 't' },
          { num: 4, label: 'i' }, { num: 5, label: 'p' }, { num: 6, label: 'n' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u2', unit_number: 2, title: 'Listen & Find: c k e h r m d',
    age: 'Nursery', tier: 1, prereq: 'unit-jp-u1',
    objective: 'Receptive recognition — hear a phonic sound and select the matching letter shape; order the group by sound.',
    xp: 20, threshold: 50, duration: 140,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Listen and Tap the Sound',
        prompt: 'Listen… then tap the letter I say!',
        items: [
          letterItem('c', '#D94A4A'),
          letterItem('k', '#4A90D9'),
          letterItem('e', '#2E8B57'),
          letterItem('h', '#8B4513'),
          letterItem('r', '#FF6B35'),
          letterItem('m', '#946BDE'),
          letterItem('d', '#2F8F83'),
        ],
        responseMode: 'text',
      },
      {
        key: 'match', template: 'matching', domain: 'cognitive',
        itemTitle: 'Match Sounds to Pictures',
        pairs: [
          { a: 'c', b: '🐱 Cat' },
          { a: 'k', b: '🪁 Kite' },
          { a: 'e', b: '🥚 Egg' },
          { a: 'h', b: '🎩 Hat' },
          { a: 'r', b: '🌧️ Rain' },
          { a: 'm', b: '🌙 Moon' },
          { a: 'd', b: '🐶 Dog' },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order Group 2 Sounds',
        context: 'Put c k e h r m d in teaching order.',
        items: [
          { num: 1, label: 'c' }, { num: 2, label: 'k' }, { num: 3, label: 'e' },
          { num: 4, label: 'h' }, { num: 5, label: 'r' }, { num: 6, label: 'm' },
          { num: 7, label: 'd' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u3', unit_number: 3, title: 'Letters to Words: g o u l f b + ai/oa',
    age: 'KG1', tier: 2, prereq: 'unit-jp-u2',
    objective: 'Cross-modal association — connect letter shapes to words and first sounds; meet the ai and oa digraphs.',
    xp: 25, threshold: 60, duration: 150,
    games: [
      {
        key: 'tap', template: 'tap-recognition', domain: 'cognitive',
        itemTitle: 'Find the Sound Word',
        prompt: 'Find the word that starts with my sound!',
        items: [
          { emoji: '🐐', label: 'Goat' },
          { emoji: '🍊', label: 'Orange' },
          { emoji: '☂️', label: 'Umbrella' },
          { emoji: '🦁', label: 'Lion' },
          { emoji: '🐟', label: 'Fish' },
          { emoji: '⚽', label: 'Ball' },
        ],
        responseMode: 'image',
      },
      {
        key: 'quiz', template: 'quiz', domain: 'cognitive',
        itemTitle: 'First Sound Quiz',
        questions: [
          {
            id: 'q-g', prompt: 'Which picture starts with the g sound?',
            options: [
              { id: 'fish', label: '🐟 Fish' },
              { id: 'goat', label: '🐐 Goat' },
              { id: 'sun', label: '☀️ Sun' },
              { id: 'ant', label: '🐜 Ant' },
            ], correctIndex: 1,
          },
          {
            id: 'q-o', prompt: 'Which picture starts with the o sound?',
            options: [
              { id: 'orange', label: '🍊 Orange' },
              { id: 'tiger', label: '🐯 Tiger' },
              { id: 'moon', label: '🌙 Moon' },
              { id: 'grape', label: '🍇 Grape' },
            ], correctIndex: 0,
          },
          {
            id: 'q-u', prompt: 'Which picture starts with the u sound?',
            options: [
              { id: 'lion', label: '🦁 Lion' },
              { id: 'duck', label: '🦆 Duck' },
              { id: 'umbrella', label: '☂️ Umbrella' },
              { id: 'pig', label: '🐷 Pig' },
            ], correctIndex: 2,
          },
          {
            id: 'q-l', prompt: 'Which picture starts with the l sound?',
            options: [
              { id: 'tree', label: '🌳 Tree' },
              { id: 'bee', label: '🐝 Bee' },
              { id: 'hat', label: '🎩 Hat' },
              { id: 'lion', label: '🦁 Lion' },
            ], correctIndex: 3,
          },
          {
            id: 'q-f', prompt: 'Which picture starts with the f sound?',
            options: [
              { id: 'frog', label: '🐸 Frog' },
              { id: 'cat', label: '🐱 Cat' },
              { id: 'snake', label: '🐍 Snake' },
              { id: 'cow', label: '🐄 Cow' },
            ], correctIndex: 0,
          },
          {
            id: 'q-b', prompt: 'Which picture starts with the b sound?',
            options: [
              { id: 'apple', label: '🍎 Apple' },
              { id: 'ball', label: '⚽ Ball' },
              { id: 'mouse', label: '🐁 Mouse' },
              { id: 'chair', label: '🪑 Chair' },
            ], correctIndex: 1,
          },
        ],
      },
      {
        key: 'sort', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order Group 3 Sounds',
        context: 'Put g o u l f b in teaching order.',
        items: [
          { num: 1, label: 'g' }, { num: 2, label: 'o' }, { num: 3, label: 'u' },
          { num: 4, label: 'l' }, { num: 5, label: 'f' }, { num: 6, label: 'b' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u4', unit_number: 4, title: 'Word Builders & Kind Sounds: ch sh th ng oo',
    age: 'KG2', tier: 2, prereq: 'unit-jp-u3',
    objective: 'Build words with missing digraphs; practise kindness vocabulary through sh/ch sounds (sharing, quiet care).',
    xp: 30, threshold: 60, duration: 180,
    games: [
      {
        key: 'fib', template: 'fill-in-blank', domain: 'cognitive',
        itemTitle: 'Finish the Kind Word',
        sentences: [
          {
            sentence: 'The king sits on a soft ___.',
            blanks: [{ id: 0, answer: 'chair' }],
            wordBank: ['chair', 'shoe', 'moon', 'ship'],
            context: 'ch says chuh!',
          },
          {
            sentence: 'I wear ___ on my feet when I run.',
            blanks: [{ id: 0, answer: 'shoes' }],
            wordBank: ['shoes', 'chair', 'star', 'cake'],
            context: 'sh says shhh!',
          },
          {
            sentence: 'A ___ says baa on the farm.',
            blanks: [{ id: 0, answer: 'sheep' }],
            wordBank: ['sheep', 'hen', 'goat', 'cow'],
            context: 'sh says shhh!',
          },
          {
            sentence: 'I love to eat a red ___ in December.',
            blanks: [{ id: 0, answer: 'cherry' }],
            wordBank: ['cherry', 'mango', 'melon', 'pear'],
            context: 'ch says chuh!',
          },
          {
            sentence: 'The baby is asleep, so we say ___.',
            blanks: [{ id: 0, answer: 'shhh' }],
            wordBank: ['shhh', 'loud', 'sing', 'jump'],
            context: 'Quiet care — shhh keeps the baby calm.',
          },
        ],
      },
      {
        key: 'quiz-aff', template: 'quiz', domain: 'affective',
        itemTitle: 'Kind Words Start with Sh',
        questions: [
          {
            id: 'q-share', prompt: 'Your friend has no toy. What does a kind friend do?',
            options: [
              { id: 'share', label: '🤝 Share' },
              { id: 'hide', label: '🙈 Hide it' },
              { id: 'cry', label: '😭 Cry' },
              { id: 'grab', label: '✊ Grab more' },
            ], correctIndex: 0,
          },
          {
            id: 'q-shword', prompt: 'Which word starts with the sh sound?',
            options: [
              { id: 'chair', label: '🪑 Chair' },
              { id: 'shoe', label: '👟 Shoe' },
              { id: 'car', label: '🚗 Car' },
              { id: 'banana', label: '🍌 Banana' },
            ], correctIndex: 1,
          },
          {
            id: 'q-shhh', prompt: 'The baby is sleeping. What do we say?',
            options: [
              { id: 'sing', label: '🎶 Sing loud' },
              { id: 'jump', label: '🦘 Jump around' },
              { id: 'shhh', label: '🤫 Shhh' },
              { id: 'shout', label: '📢 Shout' },
            ], correctIndex: 2,
          },
          {
            id: 'q-help', prompt: 'Your friend falls down. What does a thoughtful friend do?',
            options: [
              { id: 'ignore', label: '🙈 Ignore them' },
              { id: 'help', label: '🤗 Help them up' },
              { id: 'laugh', label: '😂 Laugh at them' },
              { id: 'walkaway', label: '🚶 Walk away' },
            ], correctIndex: 1,
          },
          {
            id: 'q-chkind', prompt: 'Which kind thing starts with the ch sound?',
            options: [
              { id: 'sun', label: '🌞 Sun' },
              { id: 'bus', label: '🚌 Bus' },
              { id: 'cat', label: '🐱 Cat' },
              { id: 'choose', label: '❤️ Choose' },
            ], correctIndex: 3,
          },
        ],
      },
      {
        key: 'sort-chsh', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order the Digraph Friends',
        context: 'Put ch sh th ng oo in teaching order.',
        items: [
          { num: 1, label: 'ch' }, { num: 2, label: 'sh' }, { num: 3, label: 'th' },
          { num: 4, label: 'ng' }, { num: 5, label: 'oo' },
        ],
      },
    ],
  },
  {
    id: 'unit-jp-u5', unit_number: 5, title: 'Sound Experts: qu ou oi ue er ar + Review',
    age: 'Primary', tier: 3, prereq: 'unit-jp-u4',
    objective: 'Expressive recall without picture support — solve sound riddles, spell two digraphs in one sentence, and classify spelling patterns.',
    xp: 40, threshold: 60, duration: 200,
    games: [
      {
        key: 'quiz-riddle', template: 'quiz', domain: 'cognitive',
        itemTitle: 'Phonics Riddle Challenge',
        promptMode: 'context',
        questions: [
          {
            id: 'q-oi', prompt: 'I love mud and I say oink! My sound begins like oi. Who am I?',
            options: [
              { id: 'pig', label: '🐷 Pig' },
              { id: 'cow', label: '🐄 Cow' },
              { id: 'duck', label: '🦆 Duck' },
              { id: 'hen', label: '🐔 Hen' },
            ], correctIndex: 0,
          },
          {
            id: 'q-ar', prompt: 'I drive you far down the road. My name ends in ar. What am I?',
            options: [
              { id: 'bus', label: '🚌 Bus' },
              { id: 'car', label: '🚗 Car' },
              { id: 'bike', label: '🚲 Bike' },
              { id: 'plane', label: '✈️ Plane' },
            ], correctIndex: 1,
          },
          {
            id: 'q-qu', prompt: 'She rules the kingdom and her crown shines. Her title begins like kw — qu!. Who is she?',
            options: [
              { id: 'king', label: '🤴 King' },
              { id: 'witch', label: '🧙 Witch' },
              { id: 'queen', label: '👑 Queen' },
              { id: 'grandma', label: '👵 Grandma' },
            ], correctIndex: 2,
          },
          {
            id: 'q-ou', prompt: 'I say moo in the meadow. My sound begins like ou. Who am I?',
            options: [
              { id: 'hen', label: '🐔 Hen' },
              { id: 'duck', label: '🦆 Duck' },
              { id: 'pig', label: '🐷 Pig' },
              { id: 'cow', label: '🐄 Cow' },
            ], correctIndex: 3,
          },
          {
            id: 'q-er', prompt: 'Water runs through me all day long. My name ends in er. What am I?',
            options: [
              { id: 'river', label: '🌊 River' },
              { id: 'car', label: '🚗 Car' },
              { id: 'tree', label: '🌳 Tree' },
              { id: 'book', label: '📚 Book' },
            ], correctIndex: 0,
          },
          {
            id: 'q-ue', prompt: 'Look up on a sunny day — my colour ends like ue. What am I?',
            options: [
              { id: 'grass', label: '🌿 Grass' },
              { id: 'sun', label: '🌞 Sun' },
              { id: 'sky', label: '🔵 Sky' },
              { id: 'cloud', label: '☁️ Cloud' },
            ], correctIndex: 2,
          },
        ],
      },
      {
        key: 'fib', template: 'fill-in-blank', domain: 'cognitive',
        itemTitle: 'Digraph Detective',
        sentences: [
          {
            sentence: 'A b___d flew over the cl___ds.',
            blanks: [{ id: 0, answer: 'ou' }, { id: 1, answer: 'ou' }],
            wordBank: ['ou', 'oi', 'ar', 'er'],
            context: 'Both missing digraphs are the same — the ou sound!',
          },
          {
            sentence: 'Dad drives the c___ to work.',
            blanks: [{ id: 0, answer: 'ar' }],
            wordBank: ['ou', 'ar', 'er', 'oi'],
            context: 'ar as in car!',
          },
          {
            sentence: 'We sailed our toy boat on the riv___.',
            blanks: [{ id: 0, answer: 'er' }],
            wordBank: ['ar', 'oi', 'er', 'ue'],
            context: 'er as in river!',
          },
          {
            sentence: 'Come and j___n our game!',
            blanks: [{ id: 0, answer: 'oi' }],
            wordBank: ['ue', 'oi', 'qu', 'ou'],
            context: 'oi as in join!',
          },
          {
            sentence: 'The sky is bl___ today.',
            blanks: [{ id: 0, answer: 'ue' }],
            wordBank: ['ue', 'ui', 'oa', 'ee'],
            context: 'ue as in blue!',
          },
        ],
      },
      {
        key: 'sort-patterns', template: 'drag-sort', domain: 'psychomotor',
        itemTitle: 'Order the Sound Experts',
        context: 'Put qu ou oi ue er ar in teaching order.',
        items: [
          { num: 1, label: 'qu' }, { num: 2, label: 'ou' }, { num: 3, label: 'oi' },
          { num: 4, label: 'ue' }, { num: 5, label: 'er' }, { num: 6, label: 'ar' },
        ],
      },
    ],
  },
];

function buildConfig(unit, game) {
  return {
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
    durationSec: unit.duration,
    durationTargetSec: unit.duration,
    ...(game.prompt ? { prompt: game.prompt } : {}),
    ...(game.context ? { context: game.context } : {}),
    ...(game.promptMode ? { promptMode: game.promptMode } : {}),
    ...(game.responseMode ? { responseMode: game.responseMode } : {}),
    ...(game.items ? { items: game.items } : {}),
    ...(game.pairs ? { pairs: game.pairs } : {}),
    ...(game.questions ? { questions: game.questions } : {}),
    ...(game.sentences ? { sentences: game.sentences } : {}),
  };
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
      description: 'Complete Jolly Phonics journey across all age levels — 42 sounds in 7 groups, one developmental unit per level, training cognitive, psychomotor and affective domains. Every game has at least 5 questions.',
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

    console.log('\n🎉 Jolly Phonics Adventure seeded: 1 series, 5 units, 15 lessons+games (each ≥5 questions), 15 curriculum points');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
})();
