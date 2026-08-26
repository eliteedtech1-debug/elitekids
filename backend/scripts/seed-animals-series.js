'use strict';

/**
 * Seed Script — Animals Game Series (Units 1–8)
 * Based on elitekids-animals-series-package (Doc A–E)
 *
 * Usage: cd backend && node scripts/seed-animals-series.js
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../src/models');

const AGE_BANDS = [
  { key: 'creche', label: 'Creche', tier: 0, tapTargetPx: 96, dragSnapRadiusPx: 60, timedOptional: false, successThresholdPct: 60 },
  { key: 'nursery', label: 'Nursery', tier: 1, tapTargetPx: 72, dragSnapRadiusPx: 48, timedOptional: false, successThresholdPct: 65 },
  { key: 'kg1', label: 'KG1', tier: 2, tapTargetPx: 56, dragSnapRadiusPx: 36, timedOptional: false, successThresholdPct: 70 },
  { key: 'kg2', label: 'KG2', tier: 2, tapTargetPx: 56, dragSnapRadiusPx: 28, timedOptional: true, successThresholdPct: 75 },
  { key: 'primary', label: 'Primary', tier: 3, tapTargetPx: 48, dragSnapRadiusPx: 20, timedOptional: true, successThresholdPct: 80 },
];

const SCHOOL_ID = 'SCH-TEST';
const BRANCH_ID = 'BR-TEST';
const CREATED_BY = 'system-seed';

const UNITS = [
  { number: 1, title: 'Farm Animals — Identity & Sound', templates: ['matching', 'tap-recognition', 'drag-sort', 'fill-in-blank'], ageBands: ['creche', 'nursery', 'kg1', 'kg2', 'primary'],
    items: [{ id: 'cow', label: 'Cow', emoji: '🐄', sound: 'Moo' }, { id: 'goat', label: 'Goat', emoji: '🐐', sound: 'Bleat' }, { id: 'chicken', label: 'Chicken', emoji: '🐔', sound: 'Cluck' }, { id: 'sheep', label: 'Sheep', emoji: '🐑', sound: 'Baa' }, { id: 'dog', label: 'Dog', emoji: '🐕', sound: 'Bark' }] },
  { number: 2, title: 'Wild Animals — Identity & Sound', templates: ['matching', 'tap-recognition', 'drag-sort', 'fill-in-blank'], ageBands: ['creche', 'nursery', 'kg1', 'kg2', 'primary'],
    items: [{ id: 'lion', label: 'Lion', emoji: '🦁', sound: 'Roar' }, { id: 'elephant', label: 'Elephant', emoji: '🐘', sound: 'Trumpet' }, { id: 'monkey', label: 'Monkey', emoji: '🐒', sound: 'Ooh-ooh' }, { id: 'hyena', label: 'Hyena', emoji: '🐺', sound: 'Laugh' }, { id: 'python', label: 'Python', emoji: '🐍', sound: 'Hiss' }] },
  { number: 3, title: 'Animal Homes — Habitats', templates: ['matching', 'tap-recognition', 'drag-sort', 'quiz'], ageBands: ['creche', 'nursery', 'kg1', 'kg2', 'primary'],
    items: [{ id: 'barn', label: 'Barn', emoji: '🏠' }, { id: 'forest', label: 'Forest', emoji: '🌳' }, { id: 'pond', label: 'Pond', emoji: '💧' }, { id: 'burrow', label: 'Burrow', emoji: '🕳️' }, { id: 'nest', label: 'Nest', emoji: '🪺' }] },
  { number: 4, title: 'Animal Babies — Parent & Offspring', templates: ['matching', 'tap-recognition', 'drag-sort'], ageBands: ['creche', 'nursery', 'kg1', 'kg2', 'primary'],
    items: [{ id: 'cow-calf', label: 'Cow → Calf', emoji: '🐮' }, { id: 'hen-chick', label: 'Hen → Chick', emoji: '🐤' }, { id: 'goat-kid', label: 'Goat → Kid', emoji: '🧒' }, { id: 'dog-puppy', label: 'Dog → Puppy', emoji: '🐶' }, { id: 'sheep-lamb', label: 'Sheep → Lamb', emoji: '🐏' }] },
  { number: 5, title: 'Animal Movement', templates: ['tap-recognition', 'drag-sort'], ageBands: ['creche', 'nursery', 'kg1', 'kg2', 'primary'],
    items: [{ id: 'walk', label: 'Walk', emoji: '🚶' }, { id: 'hop', label: 'Hop', emoji: '🦘' }, { id: 'fly', label: 'Fly', emoji: '🦅' }, { id: 'swim', label: 'Swim', emoji: '🏊' }, { id: 'slither', label: 'Slither', emoji: '🐍' }] },
  { number: 6, title: 'Diet & Classification', templates: ['drag-sort', 'quiz', 'fill-in-blank'], ageBands: ['kg2', 'primary'],
    items: [{ id: 'herbivore', label: 'Herbivore', emoji: '🌿' }, { id: 'carnivore', label: 'Carnivore', emoji: '🥩' }, { id: 'omnivore', label: 'Omnivore', emoji: '🍽️' }] },
  { number: 7, title: 'Advanced Animal Sounds — Spelling', templates: ['fill-in-blank'], ageBands: ['primary'],
    items: [{ id: 'moo', label: 'Moo', emoji: '🐄' }, { id: 'baa', label: 'Baa', emoji: '🐑' }, { id: 'woof', label: 'Woof', emoji: '🐕' }, { id: 'neigh', label: 'Neigh', emoji: '🐴' }, { id: 'cluck', label: 'Cluck', emoji: '🐔' }] },
  { number: 8, title: 'Capstone — Animal World', templates: ['matching', 'drag-sort', 'quiz', 'puzzle-split'], ageBands: ['creche', 'nursery', 'kg1', 'kg2', 'primary'],
    items: [{ id: 'review', label: 'Review All', emoji: '🌍' }] },
];

function defaultAffective(ageBand) {
  const lines = { creche: ['Try again, friend!', 'You are doing great!'], nursery: ['Almost! Try once more.', 'You can do it!'], kg1: ['Listen carefully and try again!', 'You are getting better!'], kg2: ['Keep sorting, you have got this!', 'Well done!'], primary: ['Take your time, you can do it.', 'You are learning well!'] };
  return { encouragementVoiceLines: lines[ageBand] || lines.kg1, retryPenalty: false, celebrationOnAttempt: true };
}

function genConfig(unit, ageBand, template) {
  const ab = AGE_BANDS.find((a) => a.key === ageBand);
  const items = unit.items;
  const base = { gameId: `animals-u${unit.number}-${template}-${ageBand}`, template, topic: 'Animals', unit: unit.number, ageBand, tier: ab.tier, successThresholdPct: ab.successThresholdPct, durationTargetSec: 90, interaction: { tapTargetPx: ab.tapTargetPx, dragSnapRadiusPx: ab.dragSnapRadiusPx, timedOptional: ab.timedOptional }, affective: defaultAffective(ageBand), rewards: { starsOnComplete: 3, xp: 15 } };

  if (template === 'matching') return { ...base, promptMode: 'text', responseMode: 'image', pairs: items.slice(0, 4).map((i) => ({ id: i.id, a: `${i.emoji} ${i.label}`, b: i.sound || i.label })) };
  if (template === 'tap-recognition') { const c = items[0]; const d = items.slice(1, 4); return { ...base, promptMode: 'text', responseMode: 'image', prompt: `Tap the ${c.label}!`, context: `Find the ${c.label}`, items: [{ id: c.id, label: c.label, emoji: c.emoji }, ...d.map((x) => ({ id: x.id, label: x.label, emoji: x.emoji }))], correctId: c.id }; }
  if (template === 'drag-sort') return { ...base, promptMode: 'text', responseMode: 'image', items: items.slice(0, 5).map((i, idx) => ({ id: i.id, label: i.label, num: idx + 1, emoji: i.emoji })) };
  if (template === 'quiz') { const c = items[0]; return { ...base, promptMode: 'text', responseMode: 'text', question: `Which animal says ${c.sound || c.label}?`, context: '', options: items.slice(0, 4).map((i) => ({ id: i.id, label: i.label, emoji: i.emoji })), correctId: c.id }; }
  if (template === 'fill-in-blank') { const c = items[0]; return { ...base, promptMode: 'text', responseMode: 'text', sentence: `The ${c.label.toLowerCase()} says ___.`, blanks: [{ id: 0, answer: (c.sound || c.label).toLowerCase() }], wordBank: items.map((i) => (i.sound || i.label).toLowerCase()), reflectionPrompt: ageBand === 'primary' ? { text: 'How sure were you?', scored: false } : undefined }; }
  if (template === 'puzzle-split') return { ...base, promptMode: 'image', responseMode: 'image', originalImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/481px-Cat_November_2010-1a.jpg', grid: { rows: 2, cols: 2 }, difficulties: { easy: { grid: { rows: 2, cols: 2 }, pieceSize: { width: 150, height: 150 }, label: 'Easy', emoji: '⭐', minAge: 'Creche' }, medium: { grid: { rows: 3, cols: 3 }, pieceSize: { width: 100, height: 100 }, label: 'Medium', emoji: '⭐⭐', minAge: 'Nursery' }, hard: { grid: { rows: 4, cols: 4 }, pieceSize: { width: 75, height: 75 }, label: 'Hard', emoji: '⭐⭐⭐', minAge: 'KG1' }, expert: { grid: { rows: 5, cols: 5 }, pieceSize: { width: 60, height: 60 }, label: 'Expert', emoji: '🏆', minAge: 'KG2' } }, rewardOnly: unit.number === 8, successThresholdPct: unit.number === 8 ? null : ab.successThresholdPct };
  return base;
}

async function seed() {
  const seq = db.content || db.sequelize;
  console.log('🐾 Seeding Animals Game Series...\n');

  // 0. Clean existing Animals series (idempotent re-run)
  console.log('🧹 Cleaning existing Animals series data...');
  await seq.query(`DELETE ca FROM kids_content_approvals ca JOIN kids_game_configs gc ON ca.content_id = gc.id WHERE gc.category = 'Animals'`).catch(() => {});
  await seq.query(`DELETE FROM kids_game_configs WHERE category = 'Animals'`).catch(() => {});
  await seq.query(`DELETE FROM kids_lessons WHERE subject = 'Animals'`).catch(() => {});
  await seq.query(`DELETE FROM kids_game_units WHERE series_id IN (SELECT id FROM kids_game_series WHERE category = 'Animals')`).catch(() => {});
  await seq.query(`DELETE FROM kids_game_series WHERE category = 'Animals'`).catch(() => {});
  console.log('  ✅ Cleaned\n');

  // 1. Create series
  const seriesId = uuidv4();  const now0 = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await seq.query(`INSERT INTO kids_game_series (id, name, category, description, created_by, createdAt, updatedAt) VALUES (?, 'Animals — Nigerian Farm & Wild', 'Animals', '8-unit game series for Nigerian schools', ?, ?, ?)` , { replacements: [seriesId, CREATED_BY, now0, now0] });
  console.log(`✅ Created series: ${seriesId}`);

  // 2. Create units
  const unitIds = [];
  for (const unit of UNITS) {
    const unitId = uuidv4();
    unitIds.push(unitId);
    const ci = JSON.stringify(unit.items.map((i) => ({ item_id: i.id, label: i.label, emoji: i.emoji })));    const now1 = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await seq.query(`INSERT INTO kids_game_units (id, series_id, unit_number, title, prerequisite_unit_id, content_items, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)` , { replacements: [unitId, seriesId, unit.number, unit.title, unit.number > 1 ? unitIds[unit.number - 2] : null, ci, now1, now1] });
    console.log(`  ✅ Unit ${unit.number}: ${unit.title}`);
  }

  // 3. Create lessons + configs
  let total = 0;
  for (const unit of UNITS) {
    for (const ageBand of unit.ageBands) {
      for (const template of unit.templates) {
        if (unit.number === 7 && template !== 'fill-in-blank') continue;
        if (unit.number === 8 && template === 'fill-in-blank') continue;

        const config = genConfig(unit, ageBand, template);
        const lessonId = uuidv4();
        const configId = uuidv4();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const ageLabel = AGE_BANDS.find((a) => a.key === ageBand)?.label || 'KG1';
        const lessonTitle = `U${unit.number} ${unit.title.split(' — ')[0]} — ${ageBand} ${template}`;

        await seq.query(`INSERT INTO kids_lessons (id, school_id, branch_id, title, subject, age_level, lesson_text, created_by, content_state, lesson_type, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'Animals', ?, ?, ?, 'published', 'game', ?, ?)`, { replacements: [lessonId, SCHOOL_ID, BRANCH_ID, lessonTitle, ageLabel, `Unit ${unit.number}: ${unit.title}`, CREATED_BY, now, now] });
        await seq.query(`INSERT INTO kids_game_configs (id, lesson_id, template, age_level, config_json, schema_version, content_state, model_version, created_by, item_id, tier, category, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, '2.0', 'published', 'animals-v1', ?, ?, ?, 'Animals', ?, ?)`, { replacements: [configId, lessonId, template, ageLabel, JSON.stringify(config), CREATED_BY, config.gameId, config.tier, now, now] });
        await seq.query(`INSERT INTO kids_content_approvals (id, school_id, branch_id, content_type, content_id, status, createdAt, updatedAt) VALUES (?, ?, ?, 'game_config', ?, 'approved', ?, ?)`, { replacements: [uuidv4(), SCHOOL_ID, BRANCH_ID, configId, now, now] }).catch(() => {});
        total++;
      }
    }
  }

  console.log(`\n✅ Created ${total} lessons with game configs`);
  console.log(`🐾 Animals Series seeded! Series ID: ${seriesId}`);
  return seriesId;
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
}
module.exports = { seed };
