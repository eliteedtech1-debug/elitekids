'use strict';

/**
 * BRIDGE CONTENT (Phase 5, MASTER-approved 2026-09-03) — two additions:
 *
 * 1) "Money & Time (U10a–f)" series — splits the legacy mixed-topic U10
 *    "Money and Time Basics" into SIX one-topic units per the one-game-one-
 *    topic rule. Every lesson is a `stage-sequence`: ordered step graphics,
 *    simple → complex, never shuffled, with a closing assessment. Time units
 *    use analog-clock frames (rendered by the AnalogClock SVG); money/story
 *    units use image/emoji frames. Legacy U10 lessons are LEFT in place
 *    (additive C2; existing children/ladders unaffected) — ticket-only debt.
 *
 * 2) label-diagram sample lessons (standalone, published, global):
 *    Human Body (Nursery), Tree (KG1), Car (KG1).
 *
 * Idempotent upserts by fixed PKs, mirroring animalsNumbersExpansionSeed.js.
 * Run: node src/seeders/moneyTimeBridgeSeed.js
 */

require('dotenv').config();
const db = require('../models');

const SCHOOL = { school_id: 'SCH-ELITE', branch_id: 'BR-MAIN', created_by: 'SYSTEM' };
const SERIES_ID = 'series-money-time';

// ── tiny content builders ────────────────────────────────────────────────────
const clockStep = (id, label, time, narration, durationSec = 8) => ({
  id, label, kind: 'analog-clock', time, narration, durationSec,
});
const imageStep = (id, label, image, narration, durationSec = 8) => ({
  id, label, kind: 'image', image, narration, durationSec,
});
const emojiStep = (id, label, emoji, narration, durationSec = 8) => ({
  id, label, kind: 'emoji', emoji, narration, durationSec,
});
const clockCheck = (id, time, options, correctIndex, prompt = 'What time is it?') => ({
  id, kind: 'analog-clock', time, prompt, options, correctIndex,
});
const textCheck = (id, prompt, options, correctIndex) => ({
  id, kind: 'text', prompt, options, correctIndex,
});

function stageLesson(unitNumber, ageLevel, tier, xp, threshold, topic, itemTitle, steps, assessment) {
  const lessonId = `lesson-${SERIES_ID}-u${unitNumber}-seq`;
  const cfgId = `gc-${SERIES_ID}-u${unitNumber}-seq`;
  return {
    lessonId, cfgId, ageLevel, tier, xp, threshold, topic, itemTitle, steps, assessment,
  };
}

// ── Units (U10a–f) ──────────────────────────────────────────────────────────
// Each unit = ONE topic. Time units = analog-clock frames simple→complex.
const UNITS = [
  {
    id: 'unit-money-time-u10a', unit_number: 1, title: 'U10a · Basic Time & Watch (o\'clock)',
    age: 'KG1', tier: 1, prereq: null, topic: 'clock', domain: 'cognitive',
    objective: 'Read o\'clock times on an analog clock (1–12).',
    games: [
      stageLesson(1, 'KG1', 1, 25, 60, 'clock', 'O\'clock Watch — 1 to 12',
        [
          clockStep('s1', 'One o\'clock', '1:00', 'One o\'clock — the long hand points to twelve, the short hand to one.'),
          clockStep('s2', 'Two o\'clock', '2:00', 'Two o\'clock.'),
          clockStep('s3', 'Three o\'clock', '3:00', 'Three o\'clock.'),
          clockStep('s4', 'Six o\'clock', '6:00', 'Six o\'clock.'),
          clockStep('s5', 'Nine o\'clock', '9:00', 'Nine o\'clock.'),
          clockStep('s6', 'Twelve o\'clock', '12:00', 'Twelve o\'clock — both hands point to the twelve.'),
        ],
        [
          clockCheck('a1', '3:00', ['3:00', '3:15', '6:00', '9:00'], 0),
          clockCheck('a2', '6:00', ['12:00', '6:00', '3:00', '9:00'], 1),
          textCheck('a3', 'Which o\'clock comes right after 3:00?', ['4:00', '3:00', '2:00', '12:00'], 0),
          clockCheck('a4', '12:00', ['1:00', '9:00', '12:00', '6:00'], 2),
        ]),
    ],
  },
  {
    id: 'unit-money-time-u10b', unit_number: 2, title: 'U10b · Money — Coins',
    age: 'KG1', tier: 1, prereq: 'unit-money-time-u10a', topic: 'money-coins', domain: 'cognitive',
    objective: 'Recognize Nigerian coins and order them by value (smallest → biggest).',
    games: [
      stageLesson(2, 'KG1', 1, 25, 60, 'money-coins', 'Coin Value Ladder',
        [
          emojiStep('s1', '50 kobo — the smallest coin', '🪙', 'A fifty-kobo coin. Fifty kobo is the smallest coin we use.'),
          emojiStep('s2', 'Two 50-kobo coins', '🪙', 'Two fifty-kobo coins together make one naira.'),
          emojiStep('s3', '₦1 coin', '💰', 'The one-naira coin. One naira is worth one hundred kobo.'),
          emojiStep('s4', '₦2 coin', '🪙', 'The two-naira coin — bigger value than one naira.'),
        ],
        [
          textCheck('a1', 'Which coin is worth the MOST?', ['50 kobo', '₦1', '₦2', 'They are all equal'], 2),
          textCheck('a2', 'How many 50-kobo coins make ₦1?', ['2', '5', '10', '100'], 0),
          textCheck('a3', 'Which is worth the LEAST?', ['₦2', '₦1', '50 kobo', '₦5'], 2),
        ]),
    ],
  },
  {
    id: 'unit-money-time-u10c', unit_number: 3, title: 'U10c · Intermediate Time & Watch (:15 / :30 / :45)',
    age: 'KG2', tier: 2, prereq: 'unit-money-time-u10b', topic: 'clock', domain: 'cognitive',
    objective: 'Read quarter-past, half-past and quarter-to on an analog clock.',
    games: [
      stageLesson(3, 'KG2', 2, 30, 65, 'clock', 'Minutes on the Clock — quarter hours',
        [
          clockStep('s1', 'Three o\'clock', '3:00', 'Three o\'clock.'),
          clockStep('s2', 'Quarter past three', '3:15', 'Quarter past three — the long hand points to the three.'),
          clockStep('s3', 'Half past three', '3:30', 'Half past three — the long hand points to the six.'),
          clockStep('s4', 'Quarter to four', '3:45', 'Quarter to four — the long hand points to the nine.'),
          clockStep('s5', 'Four o\'clock', '4:00', 'Four o\'clock.'),
        ],
        [
          clockCheck('a1', '3:15', ['3:00', '3:15', '3:30', '3:45'], 1),
          clockCheck('a2', '3:30', ['2:30', '3:15', '3:30', '4:30'], 2),
          clockCheck('a3', '3:45', ['3:15', '3:45', '4:45', '3:30'], 1),
          textCheck('a4', 'What time is it when the long hand is on the nine and the short hand just past three?', ['3:15', '3:30', '3:45', '4:00'], 2),
        ]),
    ],
  },
  {
    id: 'unit-money-time-u10d', unit_number: 4, title: 'U10d · Money — Naira Notes',
    age: 'KG2', tier: 2, prereq: 'unit-money-time-u10c', topic: 'money-notes', domain: 'cognitive',
    objective: 'Recognize naira notes and order them by value (₦5 → ₦1000).',
    games: [
      stageLesson(4, 'KG2', 2, 30, 65, 'money-notes', 'Naira Note Ladder',
        [
          imageStep('s1', '₦5 note', 'media/money-time/u10d/note-5.webp', 'The five-naira note.'),
          imageStep('s2', '₦10 note', 'media/money-time/u10d/note-10.webp', 'The ten-naira note — worth more than five.'),
          imageStep('s3', '₦20 note', 'media/money-time/u10d/note-20.webp', 'The twenty-naira note.'),
          imageStep('s4', '₦50 note', 'media/money-time/u10d/note-50.webp', 'The fifty-naira note.'),
          imageStep('s5', '₦100 note', 'media/money-time/u10d/note-100.webp', 'The one-hundred-naira note.'),
          imageStep('s6', '₦200 note', 'media/money-time/u10d/note-200.webp', 'The two-hundred-naira note.'),
          imageStep('s7', '₦500 note', 'media/money-time/u10d/note-500.webp', 'The five-hundred-naira note.'),
          imageStep('s8', '₦1000 note', 'media/money-time/u10d/note-1000.webp', 'The one-thousand-naira note — the biggest of all!'),
        ],
        [
          textCheck('a1', 'Which note is worth the MOST?', ['₦100', '₦500', '₦1000', '₦20'], 2),
          textCheck('a2', 'How many ₦100 notes make ₦500?', ['5', '10', '50', '100'], 0),
          textCheck('a3', 'Put in order from smallest: ₦50, ₦5, ₦100 — which is smallest?', ['₦5', '₦50', '₦100', 'They are equal'], 0),
        ]),
    ],
  },
  {
    id: 'unit-money-time-u10e', unit_number: 5, title: 'U10e · Advanced Watch (:45 across the hour)',
    age: 'Primary', tier: 3, prereq: 'unit-money-time-u10d', topic: 'clock', domain: 'cognitive',
    objective: 'Fluently read quarter-to and quarter-past across different hours.',
    games: [
      stageLesson(5, 'Primary', 3, 35, 70, 'clock', 'Quarter Hours Everywhere',
        [
          clockStep('s1', 'Half past two', '2:30', 'Half past two.'),
          clockStep('s2', 'Quarter to three', '2:45', 'Quarter to three — fifteen minutes until three.'),
          clockStep('s3', 'Three o\'clock', '3:00', 'Three o\'clock.'),
          clockStep('s4', 'Quarter past three', '3:15', 'Quarter past three.'),
          clockStep('s5', 'Half past three', '3:30', 'Half past three.'),
          clockStep('s6', 'Quarter to four', '3:45', 'Quarter to four.'),
          clockStep('s7', 'Quarter past ten', '10:15', 'Quarter past ten.'),
          clockStep('s8', 'Quarter to eleven', '10:45', 'Quarter to eleven — the long hand points to the nine.'),
        ],
        [
          clockCheck('a1', '2:45', ['2:15', '3:45', '2:45', '1:45'], 2),
          clockCheck('a2', '10:15', ['10:15', '9:15', '10:45', '11:15'], 0),
          clockCheck('a3', '10:45', ['11:45', '10:15', '9:45', '10:45'], 3),
          textCheck('a4', 'Quarter to four means…', ['15 minutes to 4:00', '15 minutes past 4:00', '30 minutes to 4:00', 'exactly 4:00'], 0),
        ]),
    ],
  },
  {
    id: 'unit-money-time-u10f', unit_number: 6, title: 'U10f · Money & Time Story — Ada Saves',
    age: 'Primary', tier: 3, prereq: 'unit-money-time-u10e', topic: 'saving', domain: 'cognitive',
    objective: 'Connect time and money: saving the same amount each hour (₦50/hour → how much in N hours).',
    games: [
      stageLesson(6, 'Primary', 3, 40, 70, 'saving', 'Ada Saves by the Hour',
        [
          emojiStep('s1', 'Ada\'s plan', '💡', 'Ada helps in the shop and saves fifty naira every hour she works.'),
          emojiStep('s2', 'Hour 1 — saves ₦50', '💰', 'After one hour, Ada has saved fifty naira.'),
          emojiStep('s3', 'Hour 2 — saves ₦100', '💰', 'After two hours, Ada has saved one hundred naira.'),
          emojiStep('s4', 'Hour 3 — saves ₦150', '💰', 'After three hours, Ada has saved one hundred and fifty naira.'),
          emojiStep('s5', 'Hour 4 — saves ₦200', '💰', 'After four hours, Ada has saved two hundred naira!'),
        ],
        [
          textCheck('a1', 'Ada saves ₦50 every hour. After 2 hours she has…', ['₦50', '₦100', '₦150', '₦200'], 1),
          textCheck('a2', 'Ada saves ₦50 every hour. After 3 hours she has…', ['₦100', '₦200', '₦150', '₦250'], 2),
          textCheck('a3', 'If Ada works from 1 o\'clock until 3 o\'clock, how many hours is that?', ['1 hour', '2 hours', '3 hours', '4 hours'], 1),
          textCheck('a4', 'After 4 hours Ada has ₦200. How much for each hour?', ['₦50', '₦100', '₦25', '₦40'], 0),
        ]),
    ],
  },
];

// ── label-diagram sample lessons ────────────────────────────────────────────
const LABEL_SAMPLES = [
  {
    lessonId: 'lesson-label-human-body',
    cfgId: 'gc-label-human-body',
    title: 'Parts of My Body',
    age: 'Nursery', tier: 1, category: 'Science', subject: 'Science — Body',
    cfg: {
      gameId: 'gc-label-human-body', template: 'label-diagram', lessonId: 'lesson-label-human-body',
      ageLevel: 'Nursery', category: 'Science', tier: 1, item_id: 'label-body-01',
      diagram: { image: 'media/label-human-body/diagram.webp', alt: 'Human body', background: 'classroom' },
      hotspots: [
        { id: 'head', label: 'Head', x: 50, y: 12, r: 9, emoji: '👦' },
        { id: 'eye', label: 'Eye', x: 44, y: 28, r: 6, emoji: '👁️' },
        { id: 'nose', label: 'Nose', x: 50, y: 32, r: 6, emoji: '👃' },
        { id: 'mouth', label: 'Mouth', x: 56, y: 33, r: 6, emoji: '👄' },
        { id: 'hand', label: 'Hand', x: 78, y: 52, r: 8, emoji: '✋' },
        { id: 'foot', label: 'Foot', x: 50, y: 92, r: 8, emoji: '🦶' },
      ],
      labelBank: ['Head', 'Eye', 'Nose', 'Mouth', 'Hand', 'Foot', 'Ear', 'Hair', 'Knee'],
      mode: 'label-to-part', rounds: 6, inputMode: 'tap',
      promptMode: 'text', responseMode: 'image',
      rewards: { starsOnComplete: 3, xp: 15 }, successThresholdPct: 50,
    },
  },
  {
    lessonId: 'lesson-label-tree',
    cfgId: 'gc-label-tree',
    title: 'Parts of a Tree',
    age: 'KG1', tier: 1, category: 'Science', subject: 'Science — Plants',
    cfg: {
      gameId: 'gc-label-tree', template: 'label-diagram', lessonId: 'lesson-label-tree',
      ageLevel: 'KG1', category: 'Science', tier: 1, item_id: 'label-tree-01',
      diagram: { image: 'media/label-tree/diagram.webp', alt: 'A tree with roots and leaves', background: 'garden' },
      hotspots: [
        { id: 'roots', label: 'Roots', x: 50, y: 92, r: 10, emoji: '🌱' },
        { id: 'trunk', label: 'Trunk', x: 50, y: 60, r: 8, emoji: '🪵' },
        { id: 'branch', label: 'Branch', x: 30, y: 40, r: 8, emoji: '🌿' },
        { id: 'leaf', label: 'Leaf', x: 70, y: 30, r: 8, emoji: '🍃' },
        { id: 'flower', label: 'Flower', x: 45, y: 25, r: 6, emoji: '🌸' },
        { id: 'fruit', label: 'Fruit', x: 62, y: 55, r: 7, emoji: '🍎' },
      ],
      labelBank: ['Roots', 'Trunk', 'Branch', 'Leaf', 'Flower', 'Fruit', 'Stem', 'Seed', 'Petal'],
      mode: 'mixed', rounds: 6, inputMode: 'tap',
      promptMode: 'text', responseMode: 'image',
      rewards: { starsOnComplete: 3, xp: 15 }, successThresholdPct: 60,
    },
  },
  {
    lessonId: 'lesson-label-car',
    cfgId: 'gc-label-car',
    title: 'Parts of a Car',
    age: 'KG1', tier: 2, category: 'Science', subject: 'Science — Transport',
    cfg: {
      gameId: 'gc-label-car', template: 'label-diagram', lessonId: 'lesson-label-car',
      ageLevel: 'KG1', category: 'Science', tier: 2, item_id: 'label-car-01',
      diagram: { image: 'media/label-car/diagram.webp', alt: 'A simple car', background: 'park' },
      hotspots: [
        { id: 'wheel', label: 'Wheel', x: 30, y: 78, r: 12, emoji: '🛞' },
        { id: 'door', label: 'Door', x: 50, y: 62, r: 10, emoji: '🚪' },
        { id: 'window', label: 'Window', x: 46, y: 42, r: 9, emoji: '🪟' },
        { id: 'light', label: 'Headlight', x: 8, y: 55, r: 6, emoji: '💡' },
        { id: 'roof', label: 'Roof', x: 50, y: 22, r: 9, emoji: '🚙' },
        { id: 'bumper', label: 'Bumper', x: 92, y: 70, r: 8, emoji: '🛡️' },
      ],
      labelBank: ['Wheel', 'Door', 'Window', 'Headlight', 'Roof', 'Bumper', 'Seat', 'Handle', 'Boot'],
      mode: 'mixed', rounds: 6, inputMode: 'tap',
      promptMode: 'text', responseMode: 'image',
      rewards: { starsOnComplete: 3, xp: 15 }, successThresholdPct: 60,
    },
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────
async function upsert(model, pk, values) {
  const [row] = await model.upsert({ ...values, id: pk });
  return row;
}

function buildStageConfig(seriesId, unit, lesson) {
  return {
    gameId: lesson.cfgId,
    template: 'stage-sequence',
    lessonId: lesson.lessonId,
    ageLevel: lesson.ageLevel,
    category: 'Numeracy',
    tier: lesson.tier,
    item_id: `${seriesId}-u${unit.unit_number}-seq`,
    series_id: seriesId,
    unit_number: unit.unit_number,
    domain: unit.domain,
    topic: lesson.topic,
    rewards: { starsOnComplete: 3, xp: lesson.xp },
    successThresholdPct: lesson.threshold,
    durationTargetSec: 120,
    promptMode: 'image',
    responseMode: 'text',
    characters: [{ name: 'Tobi', emoji: '👦🏾' }],
    scenario: lesson.itemTitle,
    steps: lesson.steps,
    assessment: lesson.assessment,
  };
}

async function seedMoneyTimeSeries() {
  const category = 'Numeracy';
  let prevUnitId = null;
  await upsert(db.KidGameSeries, SERIES_ID, {
    name: 'Money & Time (U10a–f)',
    category,
    description: 'One topic per unit: o\'clock → coins → quarter hours → naira notes → advanced watch → saving story. Every lesson is an ordered simple→complex stage-sequence.',
    created_by: 'SYSTEM',
  });

  for (const unit of UNITS) {
    const contentItems = [];
    for (const lesson of unit.games) {
      await upsert(db.KidLesson, lesson.lessonId, {
        ...SCHOOL,
        title: `${unit.title} — ${lesson.itemTitle}`,
        subject: 'Mathematics — Money & Time',
        age_level: lesson.ageLevel,
        is_global: 1,
        lesson_text: `${lesson.itemTitle} — ordered stage-sequence (simple → complex).`,
        content_state: 'published',
        lesson_type: 'game',
        duration_target_sec: 120,
        published_at: new Date(),
      });
      const cfg = buildStageConfig(SERIES_ID, unit, lesson);
      await upsert(db.KidGameConfig, lesson.cfgId, {
        lesson_id: lesson.lessonId,
        template: 'stage-sequence',
        age_level: lesson.ageLevel,
        config_json: cfg,
        schema_version: '1.0',
        item_id: cfg.item_id,
        tier: unit.tier,
        category,
        content_state: 'published',
        model_version: 'money-time-v1',
        approved_by: 'SYSTEM',
        approved_at: new Date(),
      });
      contentItems.push({
        lesson_id: lesson.lessonId,
        game_config_id: lesson.cfgId,
        item_id: cfg.item_id,
        template: 'stage-sequence',
        title: lesson.itemTitle,
        domain: unit.domain,
        tier: unit.tier,
      });
    }
    await upsert(db.KidGameUnit, unit.id, {
      series_id: SERIES_ID,
      unit_number: unit.unit_number,
      prerequisite_unit_id: prevUnitId,
      content_items: contentItems,
      title: unit.title,
    });

    // Curriculum points — one per game (parity with animalsNumbersExpansionSeed).
    for (const ci of contentItems) {
      await upsert(db.KidCurriculumPoint, `cp-${ci.item_id}`, {
        curriculum_source: `${'Money & Time'} — Unit ${unit.unit_number}`,
        age_band: unit.age,
        learning_objective: unit.objective,
        category,
        mapped_item_ids: [ci.item_id],
      });
    }
    prevUnitId = unit.id;
  }
  console.log(`✅ Money & Time series seeded: ${UNITS.length} units`);
}

async function seedLabelDiagramSamples() {
  for (const s of LABEL_SAMPLES) {
    await upsert(db.KidLesson, s.lessonId, {
      ...SCHOOL,
      title: s.title,
      subject: s.subject,
      age_level: s.age,
      is_global: 1,
      lesson_text: 'Tap-the-part label diagram lesson.',
      content_state: 'published',
      lesson_type: 'game',
      duration_target_sec: 90,
      published_at: new Date(),
    });
    await upsert(db.KidGameConfig, s.cfgId, {
      lesson_id: s.lessonId,
      template: 'label-diagram',
      age_level: s.age,
      config_json: s.cfg,
      schema_version: '1.0',
      item_id: s.cfg.item_id,
      tier: s.tier,
      category: s.category,
      content_state: 'published',
      model_version: 'bridge-v1',
      approved_by: 'SYSTEM',
      approved_at: new Date(),
    });
    console.log(`✅ label-diagram lesson published: ${s.cfgId}`);
  }
}

async function seedAll() {
  await seedMoneyTimeSeries();
  await seedLabelDiagramSamples();
}

if (require.main === module) {
  (async () => {
    try {
      await db.content.authenticate();
      await seedAll();
      console.log('🎉 Bridge content seeded (Money & Time U10a–f + label samples).');
      process.exit(0);
    } catch (err) {
      console.error('❌ Seed failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  SERIES_ID,
  UNITS,
  LABEL_SAMPLES,
  buildStageConfig,
  seedMoneyTimeSeries,
  seedLabelDiagramSamples,
  seedAll,
};
