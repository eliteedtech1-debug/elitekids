'use strict';

/**
 * Global catalog seeder — the NEVER-EMPTY guarantee's content floor.
 *
 * Seeds a small set of PUBLISHED, GLOBAL (is_global=1, SCH-ELITE) lessons
 * with playable quiz games covering EVERY equivalence rank, so any student —
 * including SMS-imported elder kids (JSS/SSS → last rank) and brand-new
 * demo schools with no teacher-created content — always has games to play.
 *
 * Idempotent: fixed PKs, upserts safe to run on every boot.
 * Exports ensureGlobalCatalog() for the boot chain (src/index.js).
 */

const { v4: uuidv4 } = require('uuid');

const SCHOOL = { school_id: 'SCH-ELITE', branch_id: 'BR-MAIN', created_by: 'SYSTEM' };

const q = (id, prompt, labels, correctIndex) => ({
  id,
  prompt,
  options: labels.map((label, i) => ({ id: `${id}-o${i}`, label })),
  correctIndex,
});

// One lesson + one published quiz game per platform age_level value.
// Both tables store the legacy technical values used by their MySQL contracts:
// Creche, Nursery, KG1, KG2, Primary. API band classification/reporting uses
// the canonical NERDC labels and converts at the boundary.
const CATALOG = [
  {
    lessonId: 'GLESSON-RANK0-COLORS',
    title: 'Colors Around Us',
    subject: 'Art',
    lesson_age_level: 'Creche',
    game_age_level: 'Creche',
    questions: [
      q('c1', 'Which one is RED?', ['🍎 Apple', '🥬 Leaf', '🌊 Sea', '☁️ Cloud'], 0),
      q('c2', 'Which one is GREEN?', ['🍎 Apple', '🥬 Leaf', '🌞 Sun', '🍌 Banana'], 1),
      q('c3', 'Which one is YELLOW?', ['🐸 Frog', '🍇 Grape', '🌞 Sun', '🐻 Bear'], 2),
      q('c4', 'Which one is BLUE?', ['🌊 Sea', '🔥 Fire', '🌳 Tree', '🍌 Banana'], 0),
      q('c5', 'Tap the WHITE one', ['☁️ Cloud', 'coal ⚫', 'grass 🌿', 'cheese 🧀'], 0),
    ],
  },
  {
    lessonId: 'GLESSON-RANK1-SOUNDS',
    title: 'Listening and Sounds',
    subject: 'Music',
    lesson_age_level: 'Creche',
    game_age_level: 'Creche',
    questions: [
      q('pg1', 'Which sound is LOUD? 🔊', ['Whisper', 'Thunder', 'Murmur', 'Tick'], 1),
      q('pg2', 'Clap your hands — which is TWO claps? 👏👏', ['👏', '👏👏', '👏👏👏', '👏👏👏👏'], 1),
      q('pg3', 'Which one makes a sound? 🔇', ['A stone', 'A drum', 'A feather', 'Cotton'], 1),
      q('pg4', 'Listen: 🐶 — that is a…', ['Cat', 'Dog', 'Bird', 'Fish'], 1),
      q('pg5', 'Which is QUIETER? 🤫', ['Shout', 'Whisper', 'Scream', 'Bang'], 1),
    ],
  },
  {
    lessonId: 'GLESSON-RANK1-COUNT',
    title: 'Counting Fun 1-5',
    subject: 'Math',
    lesson_age_level: 'Nursery 1',
    game_age_level: 'Nursery',
    questions: [
      q('n1', 'How many fingers on ONE hand? ✋', ['3', '4', '5', '6'], 2),
      q('n2', 'Count the ducks: 🦆🦆🦆', ['1', '2', '3', '4'], 2),
      q('n3', 'What comes after 2?', ['1', '3', '4', '5'], 1),
      q('n4', 'Count the stars: ⭐⭐', ['1', '2', '3', '5'], 1),
      q('n5', 'Which group has THREE?', ['🍓', '🍓🍓', '🍓🍓🍓', '🍓🍓🍓🍓'], 2),
    ],
  },
  {
    lessonId: 'GLESSON-RANK1-LETTERS',
    title: 'First Letters A-E',
    subject: 'English',
    lesson_age_level: 'Nursery 1',
    game_age_level: 'Nursery',
    questions: [
      q('l1', 'Which letter says "ah"?', ['A', 'B', 'C', 'D'], 0),
      q('l2', '🍎 Apple starts with…', ['Z', 'B', 'A', 'M'], 2),
      q('l3', 'Which one is letter B?', ['A', 'B', 'C', 'D'], 1),
      q('l4', '🐘 Elephant starts with…', ['E', 'F', 'L', 'P'], 0),
      q('l5', 'Which letter comes after C?', ['B', 'D', 'A', 'Z'], 1),
    ],
  },
  {
    lessonId: 'GLESSON-RANK2-SHAPES',
    title: 'Shapes and Patterns',
    subject: 'Math',
    lesson_age_level: 'KG1',
    game_age_level: 'KG1',
    questions: [
      q('s1', 'How many sides does a SQUARE have?', ['3', '4', '5', '6'], 1),
      q('s2', 'Which shape is round?', ['🔺 Triangle', '⚪ Circle', '⬛ Square', '⭐ Star'], 1),
      q('s3', 'A ball is shaped like a…', ['cube', 'sphere', 'cone', 'pyramid'], 1),
      q('s4', '🔺 + 🔺 makes a…', ['circle', 'square', 'bigger triangle', 'line'], 2),
      q('s5', 'How many corners does a TRIANGLE have?', ['2', '3', '4', '5'], 1),
    ],
  },
  {
    lessonId: 'GLESSON-RANK3-BONDS',
    title: 'Number Bonds within 10',
    subject: 'Math',
    lesson_age_level: 'KG2',
    game_age_level: 'KG2',
    questions: [
      q('kb1', 'What is 3 + 4?', ['5', '6', '7', '8'], 2),
      q('kb2', '5 + ? = 8', ['2', '3', '4', '5'], 1),
      q('kb3', 'What is 6 + 2?', ['6', '7', '8', '9'], 2),
      q('kb4', 'Which makes 10? 7 + …', ['1', '2', '3', '4'], 2),
      q('kb5', 'What is 2 + 2?', ['3', '4', '5', '6'], 1),
    ],
  },
  {
    lessonId: 'GLESSON-RANK3-NUMBERS',
    title: 'Everyday Numbers',
    subject: 'Math',
    lesson_age_level: 'Primary',
    game_age_level: 'Primary',
    questions: [
      q('p1', 'What is 7 + 5?', ['10', '11', '12', '13'], 2),
      q('p2', 'What is 9 − 4?', ['3', '4', '5', '6'], 2),
      q('p3', '₦50 + ₦20 = …', ['₦60', '₦70', '₦80', '₦100'], 1),
      q('p4', 'How many days in one week?', ['5', '6', '7', '8'], 2),
      q('p5', 'What is 2 × 6?', ['8', '10', '12', '14'], 2),
    ],
  },
  {
    lessonId: 'GLESSON-RANK3-WORDS',
    title: 'Reading Practice',
    subject: 'English',
    lesson_age_level: 'Primary',
    game_age_level: 'Primary',
    questions: [
      q('w1', 'Which word names an animal?', ['Chair', 'Table', 'Goat', 'Spoon'], 2),
      q('w2', 'Complete: The sun is ___ today.', ['hot', 'edible', 'wooden', 'asleep'], 0),
      q('w3', 'Opposite of BIG is…', ['tall', 'small', 'round', 'fast'], 1),
      q('w4', 'Which sentence is correct?', ['I is happy.', 'I am happy.', 'I are happy.', 'I be happy.'], 1),
      q('w5', 'Bread is made from…', ['yam', 'wheat flour', 'rice', 'beans'], 1),
    ],
  },
];

async function ensureGlobalCatalog() {
  const db = require('../models');
  const { Op } = db.Sequelize;
  let createdLessons = 0;
  let createdGames = 0;

  for (const entry of CATALOG) {
    // ── Lesson ──
    const existing = await db.KidLesson.findOne({ where: { id: entry.lessonId } });
    if (!existing) {
      await db.KidLesson.create({
        id: entry.lessonId,
        school_id: SCHOOL.school_id,
        branch_id: SCHOOL.branch_id,
        title: entry.title,
        subject: entry.subject,
        age_level: entry.lesson_age_level,
        lesson_type: 'game',
        content_state: 'published',
        is_global: 1,
        created_by: SCHOOL.created_by,
        published_at: new Date(),
      });
      createdLessons += 1;
    } else {
      const updates = {};
      if (existing.content_state !== 'published') updates.content_state = 'published';
      if (Number(existing.is_global) !== 1) updates.is_global = 1;
      if (existing.age_level !== entry.lesson_age_level) updates.age_level = entry.lesson_age_level;
      if (Object.keys(updates).length > 0) await existing.update(updates);
    }

    // ── Quiz game config (one per lesson) ──
    const gameId = `${entry.lessonId}-quiz`;
    const gameExisting = await db.KidGameConfig.findOne({ where: { id: gameId } });
    const config_json = { questions: entry.questions };
    if (!gameExisting) {
      await db.KidGameConfig.create({
        id: gameId,
        lesson_id: entry.lessonId,
        template: 'quiz',
        age_level: entry.game_age_level,
        config_json,
        content_state: 'published',
        created_by: SCHOOL.created_by,
        approved_by: SCHOOL.created_by,
        approved_at: new Date(),
      });
      createdGames += 1;
    } else {
      const updates = {};
      if (gameExisting.content_state !== 'published') updates.content_state = 'published';
      if (gameExisting.age_level !== entry.game_age_level) updates.age_level = entry.game_age_level;
      if (Object.keys(updates).length > 0) await gameExisting.update(updates);
    }
  }

  return { createdLessons, createdGames, total: CATALOG.length };
}

module.exports = { ensureGlobalCatalog, CATALOG };
