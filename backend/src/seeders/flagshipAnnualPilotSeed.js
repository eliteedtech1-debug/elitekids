'use strict';

/**
 * Flagship Annual Pilot — editable source-to-database seed.
 *
 * Scope: SCH-ELITE / BR-MAIN, five early-years bands, nine canonical subjects,
 * three terms, ten teaching weeks, one playable game per subject/week. The
 * Numbers track is concrete and age-banded; the Letters track is PHONIX-aware.
 *
 * This file deliberately keeps the source plan in
 * curriculum/00-framework/flagship-annual-pilot-plan.json and generates the
 * repetitive weekly records from that plan. It is idempotent: all primary keys
 * are deterministic and rows are upserted in batches.
 *
 * Safety: the default state is pending_human_review. The seed never invents an
 * adult play-test or approval. A teacher can preview/edit each lesson and the
 * existing approval workflow can publish it after validation. The initial pilot
 * write is deliberately not child-visible until that approval happens.
 *
 * Run from backend/:
 *   node src/seeders/flagshipAnnualPilotSeed.js --dry-run
 *   node src/seeders/flagshipAnnualPilotSeed.js
 *
 * The production write requires explicit `--confirm` in addition to the
 * `KIDS_ANNUAL_PILOT_SEED=true` boot opt-in. This prevents an accidental bulk
 * curriculum write from a plain node invocation.
 *
 * This is an explicit pilot release operation. It writes all rows in
 * pending_human_review; the normal approval flow must publish them after adult
 * review. Run `npm run seed:flagship-pilot` from backend/ after approval.
 */

const fs = require('fs');
const path = require('path');
const { validateManualConfig } = require('../services/gameConfigRules');

const PLAN_PATH = path.join(__dirname, '..', '..', '..', 'curriculum', '00-framework', 'flagship-annual-pilot-plan.json');
const PLAN = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));

const SCHOOL = Object.freeze({ school_id: PLAN.schoolId, branch_id: PLAN.branchId, created_by: 'FLAGSHIP-ANNUAL-PILOT' });
const TERMS = Object.freeze(PLAN.terms);
const SUBJECTS = Object.freeze(PLAN.subjects);
const BAND_CODES = Object.freeze({
  creche: 'cr',
  playgroup: 'pg',
  'nursery-1': 'n1',
  'nursery-2': 'n2',
  kindergarten: 'kg',
});
const TERM_CODES = Object.freeze({ 'First Term': 'ft', 'Second Term': 'st', 'Third Term': 'tt' });
const SUBJECT_CODES = Object.freeze({
  'comm-literacy': 'comm',
  writing: 'write',
  numeracy: 'num',
  'science-nature': 'science',
  'social-habits': 'social',
  'health-selfcare': 'health',
  movement: 'move',
  'creative-arts': 'arts',
  digital: 'digital',
});
const CATEGORY_BY_SUBJECT = Object.freeze({
  'comm-literacy': 'Letters',
  writing: 'Writing',
  numeracy: 'Numbers',
  'science-nature': 'Science',
  'social-habits': 'SocialHabits',
  'health-selfcare': 'HealthHabits',
  movement: 'Movement',
  'creative-arts': 'CreativeArts',
  digital: 'Digital',
});
const TEMPLATE_BY_WEEK = Object.freeze([
  'tap-recognition',
  'matching',
  'quiz',
  'drag-sort',
  'stage-sequence',
  'quiz',
  'matching',
  'drag-sort',
  'quiz',
  'stage-sequence',
]);
const EMOJIS = Object.freeze({
  'comm-literacy': '🔤',
  writing: '✏️',
  numeracy: '🔢',
  'science-nature': '🌱',
  'social-habits': '🤝',
  'health-selfcare': '🧼',
  movement: '🏃',
  'creative-arts': '🎨',
  digital: '🎮',
});
const PHONIX = Object.freeze({
  engine: 'PHONIX',
  version: 'v1',
  purpose: 'Speak phonemes as sounds instead of letter names.',
  notation: 'grapheme-to-sound',
  category: 'Letters',
});

function bandById(id) {
  const band = PLAN.bands.find((candidate) => candidate.id === id);
  if (!band) throw new Error(`Unknown pilot band: ${id}`);
  return band;
}

function subjectById(id) {
  const subject = SUBJECTS.find((candidate) => candidate.id === id);
  if (!subject) throw new Error(`Unknown pilot subject: ${id}`);
  return subject;
}

function compactId(bandId, termName, week, subjectId) {
  return `fp-${BAND_CODES[bandId]}-${TERM_CODES[termName]}-w${String(week).padStart(2, '0')}-${SUBJECT_CODES[subjectId]}`;
}

function safeText(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

/** Local inline fallback art; no external or unreviewed media dependency. */
function fallbackImage(label, emoji) {
  const text = safeText(`${emoji} ${label}`.slice(0, 42));
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" rx="24" fill="#EAF3FF"/><text x="160" y="92" text-anchor="middle" font-size="44">${safeText(emoji)}</text><text x="160" y="145" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#123">${text}</text></svg>`)}`;
}

function itemLabels(subjectId, objective, week, bandId, termIndex) {
  // Letters are real graphemes for the phonics track, not generic placeholder
  // words. The frontend's category-aware TTS routes these through PHONIX.
  if (subjectId === 'comm-literacy' && bandId !== 'creche') {
    const graphemes = ['s', 'a', 't', 'i', 'p', 'n', 'c', 'k', 'e', 'h', 'r', 'm', 'd', 'g', 'o', 'u', 'l', 'f', 'b', 'ai', 'oa', 'ie', 'ee', 'or', 'ar', 'sh', 'ch', 'th', 'ng', 'qu'];
    const start = ((termIndex * 10 + week - 1) * 5) % graphemes.length;
    return Array.from({ length: 5 }, (_, index) => graphemes[(start + index) % graphemes.length]);
  }

  // Numbers stay concrete and age-banded so the year does not repeat a
  // generic one-to-five list for every class.
  if (subjectId === 'numeracy') {
    const max = bandId === 'creche' ? 3 : bandId === 'playgroup' ? 5 : bandId === 'nursery-1' ? 5 : bandId === 'nursery-2' ? 10 : 20;
    const start = ((termIndex * 10 + week - 1) * 3) % max;
    return Array.from({ length: 5 }, (_, index) => String(((start + index) % max) + 1));
  }

  const base = {
    'comm-literacy': ['listen', 'rhyme', 'picture', 'sound', 'story'],
    writing: ['line', 'curve', 'circle', 'mark', 'name'],
    'science-nature': ['look', 'touch', 'living', 'weather', 'plant'],
    'social-habits': ['greet', 'share', 'wait', 'help', 'safe'],
    'health-selfcare': ['wash', 'brush', 'water', 'rest', 'stop'],
    movement: ['walk', 'jump', 'roll', 'balance', 'clap'],
    'creative-arts': ['beat', 'colour', 'draw', 'song', 'pretend'],
    digital: ['tap', 'listen', 'match', 'retry', 'stop'],
  }[subjectId];
  return base.map((label) => `${label} — ${objective}`.slice(0, 180));
}

function baseConfig({ gameId, lessonId, itemId, band, subject, termName, week, objective, template, seriesId, unitNumber }) {
  const category = CATEGORY_BY_SUBJECT[subject.id];
  return {
    gameId,
    template,
    lessonId,
    ageLevel: band.gameAgeLevel,
    category,
    subjectCategory: subject.category,
    tier: band.tier,
    item_id: itemId,
    series_id: seriesId,
    unit_number: unitNumber,
    academicYear: PLAN.academicYear,
    termName,
    week,
    classLabel: band.classLabel,
    subjectId: subject.id,
    lessonSeedId: lessonId,
    objective,
    strand: subject.displayName,
    subStrand: `${termName} Week ${week}`,
    successEvidence: [
      'responds by pointing, moving, speaking, drawing or choosing',
      'retries with calm adult support',
      'shows the objective in a concrete or game context',
    ],
    concreteExperience: `Use safe, familiar ${subject.displayName.toLowerCase()} materials before screen play.`,
    gamePlan: {
      minimumGames: 1,
      itemsPerGame: '5 logical playable items',
      learning: { template, tier: band.tier, choices: band.tier === 0 ? 2 : 4 },
      practice: { template, tier: band.tier, choices: band.tier === 0 ? 2 : 4 },
      test: band.tier === 0 ? null : { template, tier: band.tier, choices: 4, requiredAfterPractice: true },
    },
    assetPlan: { source: 'local inline fallback art', reviewRequired: true },
    scenePlan: ['intro', 'teach', 'game_checkpoint', 'reinforce', 'recap'],
    homeConnection: `Practise the same ${subject.displayName.toLowerCase()} idea with safe household or classroom objects.`,
    scenario: `${band.classLabel} learning time: ${objective}`,
    hint: 'Take your time. You can point, speak, move or ask an adult for help.',
    feedbackCorrect: 'Good noticing — let us keep learning!',
    feedbackWrong: 'That is a try. Let us look and try together.',
    characters: [{ name: 'Tobi', emoji: '🧒', personality: 'curious' }],
    rewards: { starsOnComplete: 3, xp: 10 + band.tier * 5 },
    successThresholdPct: band.tier === 0 ? 0 : 60,
    durationTargetSec: band.tier === 0 ? 60 : 120,
    pilot: {
      schoolId: PLAN.schoolId,
      branchId: PLAN.branchId,
      adultValidationRequired: true,
      assessment: band.tier === 0 ? 'adult observation' : 'low-stakes practical and game evidence',
      offlineEquivalent: 'Use the same objective with safe household or classroom objects before screen play.',
    },
  };
}

function buildConfig({ bandId, termName, week, subjectId }) {
  const band = bandById(bandId);
  const subject = subjectById(subjectId);
  const termIndex = TERMS.findIndex((term) => term.name === termName);
  const objective = band.objectives[subjectId];
  const lessonId = compactId(bandId, termName, week, subjectId);
  const itemId = `${lessonId}-item`;
  const gameId = `${lessonId}-game`;
  const seriesId = `fp-series-${BAND_CODES[bandId]}-${SUBJECT_CODES[subjectId]}`;
  const unitNumber = termIndex * PLAN.weeksPerTerm + week;
  const template = TEMPLATE_BY_WEEK[week - 1];
  const labels = itemLabels(subjectId, objective, week, bandId, termIndex);
  const emoji = EMOJIS[subjectId];
  const config = baseConfig({ gameId, lessonId, itemId, band, subject, termName, week, objective, template, seriesId, unitNumber });
  if (subjectId === 'comm-literacy') {
    config.phonix = { ...PHONIX, soundFirst: true, adultReplay: true };
    config.speechText = objective;
  }

  if (template === 'tap-recognition') {
    const correctIndex = (week + termIndex) % labels.length;
    config.prompt = `Tap the ${subject.displayName} idea we are exploring.`;
    config.promptMode = subjectId === 'comm-literacy' ? 'audio' : 'image';
    config.responseMode = 'image';
    config.assets = {
      background: fallbackImage(`${band.classLabel} ${subject.displayName}`, '🌈'),
      objects: labels.map((label, index) => ({ id: `${itemId}-${index + 1}`, image: fallbackImage(label, emoji), audio: label })),
      correctId: `${itemId}-${correctIndex + 1}`,
      promptAudio: objective,
    };
  } else if (template === 'matching') {
    config.promptMode = subjectId === 'comm-literacy' ? 'audio' : 'image';
    config.responseMode = 'text';
    const items = labels.flatMap((label, index) => [
      { id: `${itemId}-left-${index + 1}`, image: fallbackImage(label, emoji), matches: `${itemId}-right-${index + 1}` },
      { id: `${itemId}-right-${index + 1}`, image: fallbackImage(label, '✅'), matches: `${itemId}-left-${index + 1}` },
    ]);
    config.assets = { background: fallbackImage(subject.displayName, '🧩'), items };
  } else if (template === 'quiz') {
    config.promptMode = band.tier === 0 ? 'audio' : 'context';
    config.responseMode = 'image';
    config.questions = labels.map((label, index) => {
      const options = labels.slice(0, 4).map((option, optionIndex) => ({
        id: `${itemId}-q${index + 1}-o${optionIndex + 1}`,
        label: option,
        image: fallbackImage(option, emoji),
      }));
      return {
        id: `${itemId}-q${index + 1}`,
        prompt: `Which choice helps us practise: ${objective}`,
        scenario: `An adult is helping with ${subject.displayName}.`,
        speechText: objective,
        options,
        correctIndex: index % options.length,
      };
    });
  } else if (template === 'drag-sort') {
    config.promptMode = 'image';
    config.responseMode = 'text';
    config.assets = {
      background: fallbackImage(subject.displayName, '🗂️'),
      buckets: [
        { id: `${itemId}-bucket-1`, label: 'Try first', image: fallbackImage('Try first', '1️⃣') },
        { id: `${itemId}-bucket-2`, label: 'Try next', image: fallbackImage('Try next', '2️⃣') },
      ],
      items: labels.map((label, index) => ({
        id: `${itemId}-sort-${index + 1}`,
        image: fallbackImage(label, emoji),
        bucketId: index < 2 ? `${itemId}-bucket-1` : `${itemId}-bucket-2`,
      })),
    };
  } else {
    config.promptMode = 'image';
    config.responseMode = 'text';
    config.topic = subjectId;
    config.steps = labels.map((label, index) => ({
      id: `${itemId}-step-${index + 1}`,
      label,
      kind: 'emoji',
      emoji,
      narration: `${label}. ${objective}`,
      durationSec: 5,
    }));
    config.assessment = labels.map((label, index) => ({
      id: `${itemId}-check-${index + 1}`,
      kind: 'text',
      prompt: `What do we practise next? ${objective}`,
      options: labels.slice(0, 4),
      correctIndex: index % 4,
    }));
  }
  return { band, subject, objective, lessonId, itemId, gameId, seriesId, unitNumber, template, config };
}

function buildPilotRows() {
  const rows = { series: [], units: [], lessons: [], configs: [], points: [], libraryGames: [] };
  for (const band of PLAN.bands) {
    for (const subject of SUBJECTS) {
      const seriesId = `fp-series-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}`;
      rows.series.push({
        id: seriesId,
        name: `${band.classLabel} — ${subject.displayName}`,
        category: CATEGORY_BY_SUBJECT[subject.id],
        description: `Flagship annual pilot progression for ${band.classLabel}, ${subject.displayName}; ${PLAN.academicYear}; 3 terms × 10 weeks.`,
        created_by: SCHOOL.created_by,
        subject_code: subject.id,
        term_hint: 'First Term; Second Term; Third Term',
      });
      for (const term of TERMS) {
        for (let week = 1; week <= PLAN.weeksPerTerm; week += 1) {
          const built = buildConfig({ bandId: band.id, termName: term.name, week, subjectId: subject.id });
          const state = 'pending_human_review';
          rows.lessons.push({
            id: built.lessonId,
            ...SCHOOL,
            title: `${band.classLabel} W${week} — ${subject.displayName}`,
            subject: subject.displayName,
            // Lessons use the teacher-facing class enum; game configs use the
            // platform's technical age band below.
            age_level: band.classLabel,
            lesson_text: `${term.name}, Week ${week}. ${built.objective} Adult validation is required before child use.`,
            created_by: SCHOOL.created_by,
            content_state: state,
            lesson_type: 'game',
            duration_target_sec: built.config.durationTargetSec,
            is_global: 0,
            nerdc_code: `ECCE-${subject.id}`,
            nerdc_strand: subject.displayName,
            nerdc_sub_strand: `${PLAN.academicYear} · ${term.name} Week ${week}`,
          });
          rows.configs.push({
            id: built.gameId,
            lesson_id: built.lessonId,
            template: built.template,
            age_level: band.gameAgeLevel,
            config_json: built.config,
            schema_version: '1.0',
            item_id: built.itemId,
            tier: band.tier,
            category: CATEGORY_BY_SUBJECT[subject.id],
            content_state: state,
            model_version: 'flagship-annual-pilot-v1',
            created_by: SCHOOL.created_by,
            approved_by: null,
            approved_at: null,
          });
          const pointId = `fp-cp-${built.lessonId}`;
          rows.points.push({
            id: pointId,
            curriculum_source: 'Flagship annual pilot plan v1',
            age_band: band.classLabel,
            learning_objective: built.objective,
            category: CATEGORY_BY_SUBJECT[subject.id],
            mapped_item_ids: [built.itemId],
          });
          rows.libraryGames.push({
            id: `fp-lib-${built.lessonId}`,
            curriculum_point_id: pointId,
            game_config_id: built.gameId,
            ece_validated: 0,
            validated_by: null,
            validated_at: null,
          });
          rows.units.push({
            id: `fp-unit-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}-${String((TERMS.findIndex((candidate) => candidate.name === term.name) * PLAN.weeksPerTerm) + week).padStart(2, '0')}`,
            series_id: built.seriesId,
            unit_number: built.unitNumber,
            prerequisite_unit_id: built.unitNumber > 1
              ? `fp-unit-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}-${String(built.unitNumber - 1).padStart(2, '0')}`
              : null,
            content_items: [{ lesson_id: built.lessonId, game_config_id: built.gameId, item_id: built.itemId, template: built.template, termName: term.name, week }],
            title: `${term.name} Week ${week} — ${subject.displayName}`,
          });
        }
      }
    }
  }
  return rows;
}

function validatePilotRows(rows = buildPilotRows()) {
  const errors = [];
  const expected = PLAN.bands.length * SUBJECTS.length * TERMS.length * PLAN.weeksPerTerm;
  if (rows.lessons.length !== expected) errors.push(`lessons expected ${expected}, found ${rows.lessons.length}`);
  if (rows.configs.length !== expected) errors.push(`configs expected ${expected}, found ${rows.configs.length}`);
  if (rows.points.length !== expected) errors.push(`curriculum points expected ${expected}, found ${rows.points.length}`);
  if (rows.libraryGames.length !== expected) errors.push(`library games expected ${expected}, found ${rows.libraryGames.length}`);
  if (rows.units.length !== expected) errors.push(`units expected ${expected}, found ${rows.units.length}`);
  const seenLessons = new Set();
  for (const lesson of rows.lessons) {
    if (lesson.id.length > 50) errors.push(`lesson id exceeds 50 characters: ${lesson.id}`);
    if (seenLessons.has(lesson.id)) errors.push(`duplicate lesson id: ${lesson.id}`);
    seenLessons.add(lesson.id);
  }
  const expectedPerSubject = PLAN.bands.length * TERMS.length * PLAN.weeksPerTerm;
  const subjectCounts = new Map(SUBJECTS.map((subject) => [subject.id, 0]));
  for (const config of rows.configs) {
    const subjectId = config.config_json.subjectId;
    subjectCounts.set(subjectId, (subjectCounts.get(subjectId) || 0) + 1);
  }
  for (const subject of SUBJECTS) {
    if (subjectCounts.get(subject.id) !== expectedPerSubject) {
      errors.push(`${subject.id} expected ${expectedPerSubject} annual games, found ${subjectCounts.get(subject.id) || 0}`);
    }
  }
  if (!rows.configs.filter((config) => config.config_json.subjectId === 'comm-literacy').every((config) => config.config_json.phonix && config.config_json.phonix.engine === 'PHONIX')) {
    errors.push('comm-literacy annual games must carry PHONIX metadata');
  }
  const seenItems = new Set();
  for (const config of rows.configs) {
    if (config.id.length > 50) errors.push(`game id exceeds 50 characters: ${config.id}`);
    if (config.item_id.length > 50) errors.push(`item id exceeds 50 characters: ${config.item_id}`);
    if (seenItems.has(config.item_id)) errors.push(`duplicate item id: ${config.item_id}`);
    seenItems.add(config.item_id);
    const result = validateManualConfig(config.template, config.config_json);
    if (!result.valid) errors.push(`${config.id}: ${result.errors.join('; ')}`);
  }
  return { valid: errors.length === 0, errors, counts: {
    bands: PLAN.bands.length,
    subjects: SUBJECTS.length,
    terms: TERMS.length,
    weeksPerTerm: PLAN.weeksPerTerm,
    games: rows.configs.length,
    series: rows.series.length,
    units: rows.units.length,
    curriculumPoints: rows.points.length,
    libraryGames: rows.libraryGames.length,
  } };
}

async function batchUpsert(model, rows, fields, chunkSize = 200) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    await model.bulkCreate(rows.slice(offset, offset + chunkSize), { updateOnDuplicate: fields });
  }
}

async function seedFlagshipAnnualPilot({ db, validate = true } = {}) {
  if (!db) throw new Error('seedFlagshipAnnualPilot requires the model registry');
  const rows = buildPilotRows();
  const report = validatePilotRows(rows);
  if (validate && !report.valid) throw new Error(`Flagship annual pilot validation failed: ${report.errors.slice(0, 5).join(' | ')}`);
  await batchUpsert(db.KidGameSeries, rows.series, ['name', 'category', 'description', 'created_by', 'subject_code', 'term_hint']);
  await batchUpsert(db.KidLesson, rows.lessons, ['school_id', 'branch_id', 'title', 'subject', 'age_level', 'lesson_text', 'created_by', 'content_state', 'lesson_type', 'duration_target_sec', 'is_global', 'nerdc_code', 'nerdc_strand', 'nerdc_sub_strand']);
  await batchUpsert(db.KidGameConfig, rows.configs, ['lesson_id', 'template', 'age_level', 'config_json', 'schema_version', 'item_id', 'tier', 'category', 'content_state', 'model_version', 'created_by', 'approved_by', 'approved_at']);
  await batchUpsert(db.KidGameUnit, rows.units, ['series_id', 'unit_number', 'prerequisite_unit_id', 'content_items', 'title']);
  await batchUpsert(db.KidCurriculumPoint, rows.points, ['curriculum_source', 'age_band', 'learning_objective', 'category', 'mapped_item_ids']);
  await batchUpsert(db.KidLibraryGame, rows.libraryGames, ['curriculum_point_id', 'game_config_id', 'ece_validated', 'validated_by', 'validated_at']);
  return report;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const rows = buildPilotRows();
  const report = validatePilotRows(rows);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
  if (!dryRun && report.valid && process.argv.includes('--confirm')) {
    (async () => {
      try {
        const db = require('../models');
        await db.content.authenticate();
        const seeded = await seedFlagshipAnnualPilot({ db });
        console.log(`Flagship annual pilot seeded: ${seeded.counts.games} games in pending_human_review.`);
        await db.content.close();
      } catch (error) {
        console.error(`Flagship annual pilot seed failed: ${error.message}`);
        process.exitCode = 1;
      }
    })();
  } else if (!dryRun && report.valid) {
    console.log('Validation passed. No database write performed; rerun with --confirm to seed the pilot.');
  }
}

module.exports = {
  PLAN,
  TERMS,
  SUBJECTS,
  TEMPLATE_BY_WEEK,
  buildConfig,
  buildPilotRows,
  validatePilotRows,
  seedFlagshipAnnualPilot,
};
