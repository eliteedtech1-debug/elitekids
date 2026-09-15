'use strict';

/**
 * Flagship Annual Pilot — editable source-to-database seed.
 *
 * Scope: SCH-ELITE / BR-MAIN, SIX NERDC bands, three terms, ten teaching weeks.
 * The five early-years bands run nine early-years subjects with one playable
 * game per subject/week; the `primary` band runs six NERDC primary subjects
 * with TWO games per subject/week. The Numbers track is concrete and
 * age-banded; the Letters track is PHONIX-aware.
 *
 * This file deliberately keeps the source plan in
 * curriculum/00-framework/flagship-annual-pilot-plan.json and generates the
 * repetitive weekly records from that plan. It is idempotent: all primary keys
 * are deterministic and rows are upserted in batches.
 *
 * Published posture: `PLAN.publication` owns the content state and the
 * approval stamp. The pilot is currently published directly (user directive
 * 2026-09-10, content already under intense testing/validation) — see the note
 * in the plan. Re-introducing the pending_human_review gate is a plan change,
 * not a seeder change.
 *
 * Run from backend/:
 *   node src/seeders/flagshipAnnualPilotSeed.js --dry-run
 *   node src/seeders/flagshipAnnualPilotSeed.js
 *
 * The write requires explicit `--confirm` in addition to the
 * `KIDS_ANNUAL_PILOT_SEED=true` boot opt-in. This prevents an accidental bulk
 * curriculum write from a plain node invocation.
 *
 * RECONCILIATION (2026-09-15, QUEUE Q60): the 2026-09-10 run that produced the
 * live catalog was made from working-tree changes that were never committed and
 * were then destroyed by the deploy's `git reset --hard origin/main`, leaving
 * `elite_kids` serving 1,710 lessons (6 bands) that no tracked source could
 * reproduce. This file + the plan JSON were rebuilt from the served rows and
 * are verified against them by `team-docs/tools/diff-pilot-vs-prod.mjs`, which
 * must report zero drift.
 */

const fs = require('fs');
const path = require('path');
const { validateManualConfig } = require('../services/gameConfigRules');

const PLAN_PATH = path.join(__dirname, '..', '..', '..', 'curriculum', '00-framework', 'flagship-annual-pilot-plan.json');
const PLAN = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));

const SCHOOL = Object.freeze({ school_id: PLAN.schoolId, branch_id: PLAN.branchId, created_by: 'FLAGSHIP-ANNUAL-PILOT' });
const TERMS = Object.freeze(PLAN.terms);
const SUBJECTS = Object.freeze(PLAN.subjects);
const PRIMARY_SUBJECTS = Object.freeze(PLAN.primarySubjects || []);
/** Published posture for the pilot rows (see PLAN.publication). */
const PUBLICATION = Object.freeze(PLAN.publication || { contentState: 'pending_human_review', approvedBy: null, lessonTextSuffix: 'Adult validation is required before child use.' });
const BAND_CODES = Object.freeze({
  creche: 'cr',
  playgroup: 'pg',
  'nursery-1': 'n1',
  'nursery-2': 'n2',
  kindergarten: 'kg',
  primary: 'pr',
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
  'english-studies': 'eng',
  mathematics: 'math',
  'basic-science-technology': 'bst',
  'national-values': 'nval',
  'culture-creative-arts': 'cca',
  'pre-vocational': 'pvoc',
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
  'english-studies': 'Letters',
  mathematics: 'Numbers',
  'basic-science-technology': 'Science',
  'national-values': 'SocialHabits',
  'culture-creative-arts': 'CreativeArts',
  'pre-vocational': 'PreVocational',
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
/**
 * A two-game week pairs its first game with the template FIVE weeks ahead
 * (wrapping inside the term). Verified against live for all ten weeks: week 1
 * pairs tap-recognition with quiz, week 6 pairs quiz with tap-recognition.
 */
const SECOND_SLOT_WEEK_OFFSET = 5;

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
  'english-studies': '📖',
  mathematics: '➗',
  'basic-science-technology': '🔬',
  'national-values': '🇳🇬',
  'culture-creative-arts': '🎭',
  'pre-vocational': '🧑‍🌾',
});

/**
 * NERDC primary subject vocabulary. Fifteen keywords each (the primary ladder
 * carries 15 playable items per game), rotated by week exactly like the
 * early-years grapheme track.
 */
const PRIMARY_KEYWORDS = Object.freeze({
  'english-studies': ['read', 'write', 'spell', 'speak', 'listen', 'comprehend', 'compose', 'sentence', 'paragraph', 'vocabulary', 'grammar', 'pronunciation', 'fluency', 'reading', 'summary'],
  'basic-science-technology': ['living', 'non-living', 'plant', 'animal', 'energy', 'materials', 'technology', 'health', 'environment', 'safety', 'force', 'light', 'sound', 'water', 'soil'],
  'national-values': ['respect', 'responsibility', 'cooperation', 'honesty', 'civic', 'community', 'rights', 'duties', 'culture', 'service', 'tolerance', 'unity', 'peace', 'justice', 'patriotism'],
  'culture-creative-arts': ['draw', 'paint', 'sing', 'dance', 'drama', 'craft', 'rhythm', 'heritage', 'design', 'perform', 'sculpt', 'weave', 'compose', 'narrate', 'celebrate'],
  'pre-vocational': ['cook', 'sew', 'grow', 'clean', 'repair', 'tools', 'food', 'care', 'craft', 'service', 'hygiene', 'nutrition', 'harvest', 'budget', 'first-aid'],
});
/** Early-years numeracy ceiling per band; `null` means no wrap (primary ladder). */
const NUMERACY_CEILING_BY_BAND = Object.freeze({
  creche: 3,
  playgroup: 5,
  'nursery-1': 5,
  'nursery-2': 10,
  kindergarten: 20,
  primary: null,
});
const GRAPHEMES = Object.freeze(['s', 'a', 't', 'i', 'p', 'n', 'c', 'k', 'e', 'h', 'r', 'm', 'd', 'g', 'o', 'u', 'l', 'f', 'b', 'ai', 'oa', 'ie', 'ee', 'or', 'ar', 'sh', 'ch', 'th', 'ng', 'qu']);
const PHONIX = Object.freeze({
  engine: 'PHONIX',
  version: 'v1',
  purpose: 'Speak phonemes as sounds instead of letter names.',
  notation: 'grapheme-to-sound',
  category: 'Letters',
});
/** Rotating domain of knowledge, continuing across the term (verified against live). */
const DOMAINS = Object.freeze(['cognitive', 'psychomotor', 'affective']);

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

/** Bands may declare their own subject set — Primary uses the NERDC primary six. */
function subjectsForBand(band) {
  return band.subjectSet === 'primarySubjects' ? PRIMARY_SUBJECTS : SUBJECTS;
}

/** Games seeded per subject per week for a band (1 for early years, 2 for Primary). */
function gamesPerWeekForBand(band) {
  return band.ladder ? band.ladder.gamesPerWeek : 1;
}

/** Playable items generated per game for a band (5 early years, 15 Primary). */
function itemsPerGameForBand(band) {
  return band.ladder ? band.ladder.itemsPerGame : 5;
}

/** Template for a given week + slot; slot 2 uses the week five ahead. */
function templateFor(week, slot) {
  if (slot === 1) return TEMPLATE_BY_WEEK[week - 1];
  return TEMPLATE_BY_WEEK[(week - 1 + SECOND_SLOT_WEEK_OFFSET) % TEMPLATE_BY_WEEK.length];
}

function compactId(bandId, termName, week, subjectId, slot = 1) {
  const base = `fp-${BAND_CODES[bandId]}-${TERM_CODES[termName]}-w${String(week).padStart(2, '0')}-${SUBJECT_CODES[subjectId]}`;
  return slot === 1 ? base : `${base}-s2`;
}

function safeText(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

/** Local inline fallback art; no external or unreviewed media dependency. */
function fallbackImage(label, emoji) {
  const text = safeText(`${emoji} ${label}`.slice(0, 42));
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" rx="24" fill="#EAF3FF"/><text x="160" y="92" text-anchor="middle" font-size="44">${safeText(emoji)}</text><text x="160" y="145" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#123">${text}</text></svg>`)}`;
}

function itemLabels(subjectId, objective, week, bandId, termIndex, band) {
  const count = itemsPerGameForBand(band);
  const shift = termIndex * PLAN.weeksPerTerm + (week - 1);

  // Letters are real graphemes for the phonics track, not generic placeholder
  // words. The frontend's category-aware TTS routes these through PHONIX.
  if (subjectId === 'comm-literacy' && bandId !== 'creche') {
    const start = (shift * 5) % GRAPHEMES.length;
    return Array.from({ length: count }, (_, index) => GRAPHEMES[(start + index) % GRAPHEMES.length]);
  }

  // Primary vocabulary rotates like the grapheme track (15 keywords, eased in
  // five at a time so neighbouring weeks share half their items).
  if (PRIMARY_KEYWORDS[subjectId]) {
    const list = PRIMARY_KEYWORDS[subjectId];
    const start = (shift * 5) % list.length;
    return Array.from({ length: count }, (_, index) => `${list[(start + index) % list.length]} — ${objective}`.slice(0, 180));
  }

  // Numbers stay concrete and age-banded so the year does not repeat a generic
  // one-to-five list for every class. The primary ladder has no ceiling: the
  // sequence just keeps climbing (1-15, then 16-30, … 88-102).
  if (subjectId === 'numeracy' || subjectId === 'mathematics') {
    // `null` is a meaningful ceiling (the primary ladder never wraps), so it
    // must not be collapsed into the default by a `||` fallback.
    const ceiling = Object.prototype.hasOwnProperty.call(NUMERACY_CEILING_BY_BAND, bandId) ? NUMERACY_CEILING_BY_BAND[bandId] : 5;
    const start = shift * 3;
    return Array.from({ length: count }, (_, index) => String(ceiling === null ? start + index + 1 : ((start + index) % ceiling) + 1));
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

/**
 * The one-class-fits-all ladder block embedded in every Playgroup and Primary
 * game (user directive 2026-09-10). The complexity ramp, XP penalty and domain
 * rotation are all verified against the served configs.
 */
function pedagogyFor({ band, subject, objective, unitNumber, week, slot }) {
  const ladder = band.ladder;
  const level = Math.min(Math.ceil(unitNumber / ladder.unitsPerLevel), ladder.levels);
  const rung = ladder.ramp.find((candidate) => candidate.levels.includes(level)) || ladder.ramp[ladder.ramp.length - 1];
  const penaltyFrom = ladder.xpPenaltyFromLevel;
  const hasPenalty = Boolean(penaltyFrom) && level >= penaltyFrom;
  return {
    ladder: { level, design: ladder.design, weeklyGame: slot },
    domainOfKnowledge: DOMAINS[(week - 1 + (slot - 1)) % DOMAINS.length],
    cognitiveLoad: rung.cognitiveLoad,
    application: rung.application,
    concreteness: rung.concreteness,
    learningObjective: objective,
    measurement: {
      successEvidence: [
        'responds correctly with the target skill in the game context',
        'applies the skill to a fresh problem (near-transfer or generalisation)',
        'explains or orders the steps in the outcome',
      ],
      outcome: `produces the correct result/behaviour for ${subject.displayName} at ladder level ${level}`,
    },
    reinforcement: {
      positive: true,
      xpReward: ladder.rewards.xp,
      xpPenaltyOnWrong: hasPenalty ? ladder.xpPenaltyOnWrong : 0,
      retryPenalty: hasPenalty ? hasPenalty && ladder.retryPenaltyFromLevel !== null && level >= ladder.retryPenaltyFromLevel : false,
      celebrationOnAttempt: true,
    },
    rewards: { xp: ladder.rewards.xp, starsOnComplete: ladder.rewards.starsOnComplete },
    averageAccumulation: 'weekly games feed the learner average; the ladder unlocks as the average rises',
  };
}

function baseConfig({ gameId, lessonId, itemId, band, subject, termName, week, objective, template, seriesId, unitNumber, slot }) {
  const category = CATEGORY_BY_SUBJECT[subject.id];
  const gamesPerWeek = gamesPerWeekForBand(band);
  const itemsPerGame = itemsPerGameForBand(band);
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
      minimumGames: gamesPerWeek,
      itemsPerGame: itemsPerGame === 15 ? 'up to 15 logical playable items' : '5 logical playable items',
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

function buildConfig({ bandId, termName, week, subjectId, subject, slot = 1 }) {
  const band = bandById(bandId);
  const resolvedSubject = subject || subjectById(subjectId);
  const termIndex = TERMS.findIndex((term) => term.name === termName);
  const objective = band.objectives[resolvedSubject.id];
  const lessonId = compactId(bandId, termName, week, resolvedSubject.id, slot);
  const itemId = `${lessonId}-item`;
  const gameId = `${lessonId}-game`;
  const seriesId = `fp-series-${BAND_CODES[bandId]}-${SUBJECT_CODES[resolvedSubject.id]}`;
  const unitNumber = termIndex * PLAN.weeksPerTerm + week;
  const template = templateFor(week, slot);
  const labels = itemLabels(resolvedSubject.id, objective, week, bandId, termIndex, band);
  const emoji = EMOJIS[resolvedSubject.id];
  const config = baseConfig({
    gameId, lessonId, itemId, band, subject: resolvedSubject, termName, week, objective, template, seriesId, unitNumber, slot,
  });
  if (resolvedSubject.id === 'comm-literacy') {
    config.phonix = { ...PHONIX, soundFirst: true, adultReplay: true };
    config.speechText = objective;
  }
  if (band.ladder) {
    config.pedagogy = pedagogyFor({ band, subject: resolvedSubject, objective, unitNumber, week, slot });
  }

  if (template === 'tap-recognition') {
    const correctIndex = (week + termIndex) % labels.length;
    config.prompt = `Tap the ${resolvedSubject.displayName} idea we are exploring.`;
    config.promptMode = resolvedSubject.id === 'comm-literacy' ? 'audio' : 'image';
    config.responseMode = 'image';
    config.assets = {
      background: fallbackImage(`${band.classLabel} ${resolvedSubject.displayName}`, '🌈'),
      objects: labels.map((label, index) => ({ id: `${itemId}-${index + 1}`, image: fallbackImage(label, emoji), audio: label })),
      correctId: `${itemId}-${correctIndex + 1}`,
      promptAudio: objective,
    };
  } else if (template === 'matching') {
    config.promptMode = resolvedSubject.id === 'comm-literacy' ? 'audio' : 'image';
    config.responseMode = 'text';
    const items = labels.flatMap((label, index) => [
      { id: `${itemId}-left-${index + 1}`, image: fallbackImage(label, emoji), matches: `${itemId}-right-${index + 1}` },
      { id: `${itemId}-right-${index + 1}`, image: fallbackImage(label, '✅'), matches: `${itemId}-left-${index + 1}` },
    ]);
    config.assets = { background: fallbackImage(resolvedSubject.displayName, '🧩'), items };
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
        scenario: `An adult is helping with ${resolvedSubject.displayName}.`,
        speechText: objective,
        options,
        correctIndex: index % options.length,
      };
    });
  } else if (template === 'drag-sort') {
    config.promptMode = 'image';
    config.responseMode = 'text';
    config.assets = {
      background: fallbackImage(resolvedSubject.displayName, '🗂️'),
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
    config.topic = resolvedSubject.id;
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
  return { band, subject: resolvedSubject, objective, lessonId, itemId, gameId, seriesId, unitNumber, template, slot, config };
}

function buildPilotRows() {
  const rows = { series: [], units: [], lessons: [], configs: [], points: [], libraryGames: [] };
  const contentState = PUBLICATION.contentState;
  const approvedBy = PUBLICATION.approvedBy;
  for (const band of PLAN.bands) {
    const bandSubjects = subjectsForBand(band);
    const gamesPerWeek = gamesPerWeekForBand(band);
    for (const subject of bandSubjects) {
      const seriesId = `fp-series-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}`;
      rows.series.push({
        id: seriesId,
        name: `${band.classLabel} — ${subject.displayName}`,
        category: CATEGORY_BY_SUBJECT[subject.id],
        description: `Flagship annual pilot progression for ${band.classLabel}, ${subject.displayName}; ${PLAN.academicYear}; 3 terms × 10 weeks.`,
        created_by: SCHOOL.created_by,
        subject_code: subject.subjectCode || subject.id,
        term_hint: '1st;2nd;3rd',
      });
      for (const term of TERMS) {
        for (let week = 1; week <= PLAN.weeksPerTerm; week += 1) {
          const unitNumber = TERMS.findIndex((candidate) => candidate.name === term.name) * PLAN.weeksPerTerm + week;
          const unitId = `fp-unit-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}-${String(unitNumber).padStart(2, '0')}`;
          const contentItems = [];
          for (let slot = 1; slot <= gamesPerWeek; slot += 1) {
            const built = buildConfig({ bandId: band.id, termName: term.name, week, subjectId: subject.id, subject, slot });
            const titleSuffix = gamesPerWeek > 1 ? ` (${slot}/${gamesPerWeek})` : '';
            rows.lessons.push({
              id: built.lessonId,
              ...SCHOOL,
              title: `${band.classLabel} W${week} — ${subject.displayName}${titleSuffix}`,
              subject: subject.displayName,
              // Lessons use the teacher-facing class enum; game configs use the
              // platform's technical age band below.
              age_level: band.classLabel,
              lesson_text: `${term.name}, Week ${week}. ${built.objective} ${PUBLICATION.lessonTextSuffix}`,
              created_by: SCHOOL.created_by,
              content_state: contentState,
              lesson_type: 'game',
              duration_target_sec: built.config.durationTargetSec,
              is_global: 1,
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
              content_state: contentState,
              model_version: 'flagship-annual-pilot-v1',
              created_by: SCHOOL.created_by,
              approved_by: approvedBy,
              approved_at: approvedBy ? new Date() : null,
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
            contentItems.push({
              slot,
              week,
              item_id: built.itemId,
              template: built.template,
              termName: term.name,
              lesson_id: built.lessonId,
              game_config_id: built.gameId,
            });
          }
          rows.units.push({
            id: unitId,
            series_id: `fp-series-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}`,
            unit_number: unitNumber,
            prerequisite_unit_id: unitNumber > 1
              ? `fp-unit-${BAND_CODES[band.id]}-${SUBJECT_CODES[subject.id]}-${String(unitNumber - 1).padStart(2, '0')}`
              : null,
            content_items: contentItems,
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
  const expected = PLAN.bands.reduce(
    (total, band) => total + subjectsForBand(band).length * TERMS.length * PLAN.weeksPerTerm * gamesPerWeekForBand(band),
    0,
  );
  const expectedSeries = PLAN.bands.reduce((total, band) => total + subjectsForBand(band).length, 0);
  const expectedUnits = PLAN.bands.reduce(
    (total, band) => total + subjectsForBand(band).length * TERMS.length * PLAN.weeksPerTerm,
    0,
  );
  if (rows.lessons.length !== expected) errors.push(`lessons expected ${expected}, found ${rows.lessons.length}`);
  if (rows.configs.length !== expected) errors.push(`configs expected ${expected}, found ${rows.configs.length}`);
  if (rows.points.length !== expected) errors.push(`curriculum points expected ${expected}, found ${rows.points.length}`);
  if (rows.libraryGames.length !== expected) errors.push(`library games expected ${expected}, found ${rows.libraryGames.length}`);
  if (rows.units.length !== expectedUnits) errors.push(`units expected ${expectedUnits}, found ${rows.units.length}`);
  if (rows.series.length !== expectedSeries) errors.push(`series expected ${expectedSeries}, found ${rows.series.length}`);
  const seenLessons = new Set();
  for (const lesson of rows.lessons) {
    if (lesson.id.length > 50) errors.push(`lesson id exceeds 50 characters: ${lesson.id}`);
    if (seenLessons.has(lesson.id)) errors.push(`duplicate lesson id: ${lesson.id}`);
    seenLessons.add(lesson.id);
  }
  // Every band must seed its own subject set for the whole year.
  const subjectCounts = new Map();
  for (const config of rows.configs) {
    const key = `${config.config_json.classLabel}:${config.config_json.subjectId}`;
    subjectCounts.set(key, (subjectCounts.get(key) || 0) + 1);
  }
  for (const band of PLAN.bands) {
    const games = gamesPerWeekForBand(band);
    for (const subject of subjectsForBand(band)) {
      const expectedPerSubject = TERMS.length * PLAN.weeksPerTerm * games;
      const found = subjectCounts.get(`${band.classLabel}:${subject.id}`) || 0;
      if (found !== expectedPerSubject) {
        errors.push(`${band.classLabel}/${subject.id} expected ${expectedPerSubject} annual games, found ${found}`);
      }
    }
  }
  if (!rows.configs.filter((config) => config.config_json.subjectId === 'comm-literacy').every((config) => config.config_json.phonix && config.config_json.phonix.engine === 'PHONIX')) {
    errors.push('comm-literacy annual games must carry PHONIX metadata');
  }
  // The one-class-fits-all ladder must be present on every Playgroup + Primary game.
  for (const band of PLAN.bands.filter((candidate) => candidate.ladder)) {
    const bandConfigs = rows.configs.filter((config) => config.config_json.classLabel === band.classLabel);
    const expectedGames = subjectsForBand(band).length * TERMS.length * PLAN.weeksPerTerm * gamesPerWeekForBand(band);
    if (bandConfigs.length !== expectedGames) {
      errors.push(`${band.classLabel} expected ${expectedGames} graph games, found ${bandConfigs.length}`);
    }
    if (!bandConfigs.every((config) => config.config_json.pedagogy && config.config_json.pedagogy.ladder)) {
      errors.push(`${band.classLabel} annual games must carry the learning-parameter ladder`);
    }
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
    primarySubjects: PRIMARY_SUBJECTS.length,
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
        console.log(`Flagship annual pilot seeded: ${seeded.counts.games} games in ${PUBLICATION.contentState} state.`);
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
  PRIMARY_SUBJECTS,
  TEMPLATE_BY_WEEK,
  SECOND_SLOT_WEEK_OFFSET,
  buildConfig,
  buildPilotRows,
  validatePilotRows,
  subjectsForBand,
  gamesPerWeekForBand,
  itemsPerGameForBand,
  templateFor,
  seedFlagshipAnnualPilot,
};
