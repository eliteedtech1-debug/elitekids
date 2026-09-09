'use strict';

/**
 * Placement exam controller — "measure the child, place the child".
 *
 * Placement is intentionally NOT generated from the catalog. Catalog questions
 * can be duplicated, stale, ambiguous, or accidentally mismatched to a band.
 * This controller uses a small, reviewed staircase fixture instead:
 * one clear answer per item, age-progressive skills, and a mixture of game
 * interaction types. The server owns all answer keys.
 *
 * Policy: only students on the flagship Kids schools may take this exam. Real
 * school students are classified from their authoritative students.class_name
 * mapping and do not get to override that classification with placement.
 */

const dbm = () => require('../models');
const { isFlagshipSchool } = require('../services/lessonBridgeContext');
const { PLATFORM_BANDS, platformBandToNerdc, nerdcBandToPlatform } = require('../services/ageBand');

const QUIZ_MAX_QUESTIONS = 10;
const QUIZ_REUSE_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Exactly ten reviewed items. `band` is the legacy technical storage value;
 * `nerdc_band` is the canonical NERDC label used for classification and
 * reporting. Crèche + Playgroup share the old `Creche` storage bucket.
 *
 * game_type is deliberately varied so the exam tests transfer, not memorizing
 * one repeated quiz layout. Every option set has one unambiguous answer.
 * game-chain is deliberately NOT used: it is a lesson container for several
 * complete sub-games, not a single tappable interaction, so it cannot be a
 * placement item. (10 items across the 9 single-template interaction types.)
 */
const PLACEMENT_QUESTION_FIXTURE = Object.freeze([
  {
    id: 'placement-creche-1', game_type: 'tap-recognition', band: 'Creche', nerdc_band: 'Crèche', age_range: '0–2', skill: 'one familiar object',
    prompt: 'Mina has one red ball. Tap the picture that shows ONE ball.',
    options: [{ id: 'one', label: '🔴' }, { id: 'two', label: '🔴🔴' }, { id: 'three', label: '🔴🔴🔴' }], correctIndex: 0,
  },
  {
    id: 'placement-playgroup-1', game_type: 'matching', band: 'Creche', nerdc_band: 'Playgroup', age_range: '2–3', skill: 'loud and quiet',
    prompt: 'Match the drum sound to the loud picture. Which sound is loud?',
    options: [{ id: 'whisper', label: '🤫 Whisper' }, { id: 'drum', label: '🥁 BOOM' }, { id: 'sleep', label: '😴 Sleep' }], correctIndex: 1,
  },
  {
    id: 'placement-nursery1-1', game_type: 'quiz', band: 'Nursery', nerdc_band: 'Nursery 1', age_range: '3–4', skill: 'counting to five',
    prompt: 'Count the stars: ⭐ ⭐ ⭐ ⭐. How many stars are there?',
    options: [{ id: 'two', label: '2' }, { id: 'three', label: '3' }, { id: 'four', label: '4' }, { id: 'five', label: '5' }], correctIndex: 2,
  },
  {
    id: 'placement-nursery1-2', game_type: 'drag-sort', band: 'Nursery', nerdc_band: 'Nursery 1', age_range: '3–4', skill: 'initial sound',
    prompt: 'Drag the first sound for Apple into the answer space.',
    options: [{ id: 'a', label: 'A' }, { id: 'm', label: 'M' }, { id: 's', label: 'S' }, { id: 't', label: 'T' }], correctIndex: 0,
  },
  {
    id: 'placement-nursery2-1', game_type: 'memory-pairs', band: 'KG1', nerdc_band: 'Nursery 2', age_range: '4–5', skill: 'number order to ten',
    prompt: 'Remember the number path. What number comes after 7?',
    options: [{ id: 'six', label: '6' }, { id: 'eight', label: '8' }, { id: 'nine', label: '9' }, { id: 'ten', label: '10' }], correctIndex: 1,
  },
  {
    id: 'placement-nursery2-2', game_type: 'fill-in-blank', band: 'KG1', nerdc_band: 'Nursery 2', age_range: '4–5', skill: 'quantity comparison',
    prompt: 'Fill the blank: the greater number is __. Which is greater, 6 or 9?',
    options: [{ id: 'six', label: '6' }, { id: 'nine', label: '9' }], correctIndex: 1,
  },
  {
    id: 'placement-kindergarten-1', game_type: 'stage-sequence', band: 'KG2', nerdc_band: 'Kindergarten', age_range: '5–6', skill: 'joining groups',
    prompt: 'Put the story step in order: 3 mangoes, then 2 more. How many now?',
    options: [{ id: 'four', label: '4' }, { id: 'five', label: '5' }, { id: 'six', label: '6' }, { id: 'seven', label: '7' }], correctIndex: 1,
  },
  {
    id: 'placement-kindergarten-2', game_type: 'label-diagram', band: 'KG2', nerdc_band: 'Kindergarten', age_range: '5–6', skill: 'sentence meaning',
    prompt: 'Tap the label that tells what a dog can do.',
    options: [{ id: 'bark', label: 'A dog can bark.' }, { id: 'colour', label: 'A dog is a colour.' }, { id: 'number', label: 'A dog is a number.' }, { id: 'shape', label: 'A dog is a shape.' }], correctIndex: 0,
  },
  {
    id: 'placement-primary-1', game_type: 'quiz', band: 'Primary', nerdc_band: 'Primary', age_range: '6+', skill: 'addition within twenty',
    prompt: '7 children get on the bus, then 5 more get on. How many children are on the bus now?',
    options: [{ id: 'ten', label: '10' }, { id: 'eleven', label: '11' }, { id: 'twelve', label: '12' }, { id: 'thirteen', label: '13' }], correctIndex: 2,
  },
  {
    id: 'placement-primary-2', game_type: 'puzzle-split', band: 'Primary', nerdc_band: 'Primary', age_range: '6+', skill: 'word meaning',
    prompt: 'Solve the word puzzle: which word is the opposite of HOT?',
    options: [{ id: 'cold', label: 'Cold' }, { id: 'tall', label: 'Tall' }, { id: 'fast', label: 'Fast' }, { id: 'round', label: 'Round' }], correctIndex: 0,
  },
]);

const FIXTURE_BY_ID = new Map(PLACEMENT_QUESTION_FIXTURE.map((question) => [question.id, question]));

function clonePlacementFixture() {
  return PLACEMENT_QUESTION_FIXTURE.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option })),
  }));
}

/** Recursively sort object keys so byte comparison is immune to MySQL JSON
 *  column key normalization (MySQL reorders object members by key length when
 *  it stores/returns a JSON value). Without this, a persisted fixture would
 *  never match the code fixture and every retry would regenerate the exam. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => { acc[key] = sortKeys(value[key]); return acc; }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function isReviewedPlacementFixture(questions) {
  return Array.isArray(questions)
    && questions.length === QUIZ_MAX_QUESTIONS
    && new Set(questions.map((question) => question && question.id)).size === QUIZ_MAX_QUESTIONS
    && questions.every((question, index) => {
      const expected = PLACEMENT_QUESTION_FIXTURE[index];
      if (!question || !expected || question.id !== expected.id || !FIXTURE_BY_ID.has(question.id)) return false;
      // Do not trust a stale or edited database row just because its IDs match;
      // the displayed prompt/options must remain the reviewed fixture too.
      return canonicalJson({ ...question, options: question.options || [] })
        === canonicalJson({ ...expected, options: expected.options || [] });
    });
}

function publicPlacementQuestion({ correctIndex, ...question }) {
  return question;
}

function isStudentUser(user) {
  return String(user?.user_type || '').toLowerCase() === 'student';
}

function getAdmission(user) {
  return String(user?.admission_no || user?.id || '').trim();
}

/** Placement is a flagship-only capability, never a client-controlled flag. */
function canTakePlacement(user) {
  return isStudentUser(user) && isFlagshipSchool(user?.school_id);
}

function placementDenied(res) {
  return res.status(403).json({
    success: false,
    error_code: 'PLACEMENT_FLAGSHIP_ONLY',
    message: 'Placement exams are available only to flagship Kids students.',
  });
}

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

/** Read the canonical result from the answer envelope used by new attempts. */
function nerdcBandFromPlacementRow(row) {
  const answers = parseJson(row?.quiz_answers);
  if (answers && typeof answers === 'object' && answers.placement_nerdc_band) {
    return String(answers.placement_nerdc_band);
  }
  return platformBandToNerdc(row?.band) || row?.band || null;
}

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`
CREATE TABLE IF NOT EXISTS kids_band_placements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL DEFAULT '',
  band ENUM('Creche','Nursery','KG1','KG2','Primary') NOT NULL,
  score_pct INT NOT NULL DEFAULT 0,
  quiz_questions JSON NULL,
  quiz_answers JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kids_placement_child (child_admission_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

async function getActiveExamRow(content, admission, schoolId) {
  const [rows] = await content.query(
    'SELECT quiz_questions, quiz_answers, band FROM kids_band_placements WHERE child_admission_no = ? AND school_id = ? AND updated_at > (NOW() - INTERVAL 12 HOUR) LIMIT 1',
    { replacements: [admission, schoolId] },
  );
  const row = rows && rows[0];
  const answers = parseJson(row?.quiz_answers);
  // A completed result is not an active exam. The student may retake later,
  // but must receive a fresh reviewed fixture rather than silently resubmitting.
  if (row && answers && typeof answers === 'object' && answers.placement_nerdc_band) return null;
  return row || null;
}

/** GET /kids/placement/quiz */
async function getPlacementQuiz(req, res) {
  try {
    if (!canTakePlacement(req.user)) return placementDenied(res);
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();

    const { content } = dbm();
    const schoolId = String(req.user.school_id || '');
    const recent = await getActiveExamRow(content, admission, schoolId);
    let questions = parseJson(recent?.quiz_questions);
    if (!isReviewedPlacementFixture(questions)) questions = clonePlacementFixture();

    // Persist the exact reviewed fixture so the submit endpoint grades the
    // server copy, never a client-edited question set.
    await content.query(
      `INSERT INTO kids_band_placements (child_admission_no, school_id, band, score_pct, quiz_questions, quiz_answers)
       VALUES (?, ?, 'Creche', 0, ?, NULL)
       ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), band = 'Creche', score_pct = 0, quiz_questions = VALUES(quiz_questions), quiz_answers = NULL`,
      { replacements: [admission, schoolId, JSON.stringify(questions)] },
    );

    return res.json({
      success: true,
      data: {
        questions: questions.map(publicPlacementQuestion),
        reused: Boolean(recent && isReviewedPlacementFixture(parseJson(recent.quiz_questions))),
        startedAtBand: 'Crèche',
        maxQuestions: QUIZ_MAX_QUESTIONS,
      },
    });
  } catch (error) {
    console.error('getPlacementQuiz error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/placement/submit { answers: { [questionId]: optionIndex } } */
async function submitPlacement(req, res) {
  try {
    if (!canTakePlacement(req.user)) return placementDenied(res);
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();

    const answers = req.body?.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'answers object required.' });
    }

    const { content } = dbm();
    const schoolId = String(req.user.school_id || '');
    const [rows] = await content.query(
      'SELECT quiz_questions, band FROM kids_band_placements WHERE child_admission_no = ? AND school_id = ? AND updated_at > (NOW() - INTERVAL 12 HOUR) LIMIT 1',
      { replacements: [admission, schoolId] },
    );
    const row = rows && rows[0];
    const asked = parseJson(row?.quiz_questions);
    if (!isReviewedPlacementFixture(asked)) {
      return res.status(409).json({ success: false, message: 'No active placement exam — request GET /kids/placement/quiz first.' });
    }

    let correct = 0;
    let firstFailedAt = -1;
    const perBand = {};
    for (let index = 0; index < asked.length; index += 1) {
      const question = asked[index];
      const expected = FIXTURE_BY_ID.get(question.id);
      const given = answers[question.id];
      const isCorrect = Number.isInteger(given) && given === expected.correctIndex;
      if (isCorrect) correct += 1;
      if (!isCorrect && firstFailedAt === -1) firstFailedAt = index;
      const band = expected.nerdc_band;
      perBand[band] = perBand[band] || { correct: 0, total: 0 };
      perBand[band].total += 1;
      if (isCorrect) perBand[band].correct += 1;
    }

    // Chronological placement uses the highest consecutive developmental step.
    // Every item in a step must be correct; later lucky answers cannot leap
    // over an unmet foundation or half-pass a band with duplicate-style luck.
    const bandGroups = [];
    for (const question of asked) {
      const previous = bandGroups[bandGroups.length - 1];
      if (!previous || previous.band !== question.nerdc_band) {
        bandGroups.push({ band: question.nerdc_band, questions: [] });
      }
      bandGroups[bandGroups.length - 1].questions.push(question);
    }
    let placedNerdcBand = bandGroups[0].band;
    for (const group of bandGroups) {
      const passed = group.questions.every((question) => Number.isInteger(answers[question.id])
        && answers[question.id] === FIXTURE_BY_ID.get(question.id).correctIndex);
      if (!passed) break;
      placedNerdcBand = group.band;
    }
    const placedBand = nerdcBandToPlatform(placedNerdcBand) || PLATFORM_BANDS[0];
    const pct = Math.round((correct / asked.length) * 100);
    const storedAnswers = {
      answers,
      placement_nerdc_band: placedNerdcBand,
      placement_exam_version: 'reviewed-fixture-v1',
    };
    await content.query(
      `INSERT INTO kids_band_placements (child_admission_no, school_id, band, score_pct, quiz_questions, quiz_answers)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), band = VALUES(band), score_pct = VALUES(score_pct), quiz_questions = VALUES(quiz_questions), quiz_answers = VALUES(quiz_answers)`,
      { replacements: [admission, schoolId, placedBand, pct, JSON.stringify(asked), JSON.stringify(storedAnswers)] },
    );

    return res.json({
      success: true,
      data: {
        band: placedBand,
        nerdc_band: placedNerdcBand,
        score_pct: pct,
        per_band: perBand,
        max_questions: QUIZ_MAX_QUESTIONS,
      },
    });
  } catch (error) {
    console.error('submitPlacement error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/placement/status */
async function getPlacementStatus(req, res) {
  try {
    if (!canTakePlacement(req.user)) return placementDenied(res);
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();
    const { content } = dbm();
    const [rows] = await content.query(
      'SELECT band, score_pct, quiz_answers, updated_at FROM kids_band_placements WHERE child_admission_no = ? AND school_id = ? LIMIT 1',
      { replacements: [admission, String(req.user.school_id || '')] },
    );
    const row = rows && rows[0];
    // A persisted row is NOT proof of placement: the quiz endpoint writes a
    // starter row (answers NULL) before the child even starts. Only a row with
    // a submitted answer envelope counts as placed — that is what opens the
    // dashboard for flagship kids (else they stay on the placement gate).
    const rowAnswers = parseJson(row?.quiz_answers);
    const placed = Boolean(rowAnswers
      && typeof rowAnswers === 'object'
      && rowAnswers.placement_nerdc_band);
    return res.json({
      success: true,
      data: row ? {
        band: row.band,
        nerdc_band: nerdcBandFromPlacementRow(row),
        score_pct: row.score_pct,
        placed_at: row.updated_at,
        placed,
      } : null,
    });
  } catch (error) {
    console.error('getPlacementStatus error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  PLACEMENT_QUESTION_FIXTURE,
  QUIZ_MAX_QUESTIONS,
  canTakePlacement,
  clonePlacementFixture,
  isReviewedPlacementFixture,
  getPlacementQuiz,
  submitPlacement,
  getPlacementStatus,
  ensureSchema,
};
