'use strict';

/**
 * Placement quiz controller — "measure the child, place the child" (Q4).
 *
 * For elder / unmapped children (JSS1, SSS2, islamiyya, …) whose class maps
 * to the last rank, or for any child whose dashboard would otherwise be
 * empty, the client offers a short placement quiz. The quiz samples
 * questions from PUBLISHED games of each band (ascending), the child
 * answers in-app, and the server scores it:
 *
 *   score >= 80%  → step UP to the next band's questions (max: Primary)
 *   score < 50%   → step DOWN (min: rank 0)
 *   otherwise     → that band is the placement
 *
 * The result is persisted in kids_band_placements (elite_content) and read
 * by ageBand.resolveBandForAdmission() as the HIGHEST-precedence band source
 * — a measured placement outranks class names and tour declarations.
 *
 * Endpoints:
 *   GET  /kids/placement/quiz            — build (or reuse today's) quiz
 *   POST /kids/placement/submit          — score + persist { answers: {qid: index} }
 *   GET  /kids/placement/status          — current placement (null when none)
 */

const crypto = require('crypto');
const dbm = () => require('../models');
const { AGE_BANDS, rankOf, classToAgeLevel, ageToBand } = require('../services/ageBand');

const QUIZ_QUESTIONS_PER_BAND = 3;
const QUIZ_MAX_QUESTIONS = 12;
const STEP_UP_PCT = 80;
const STEP_DOWN_PCT = 50;
/** Reuse the same quiz for the whole calendar day (idempotent retries). */
const QUIZ_REUSE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h

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

function isStudentUser(u) {
  return String(u.user_type || '').toLowerCase() === 'student';
}

function getAdmission(u) {
  return String(u.admission_no || u.id || '');
}

/** Starting band for the quiz: the resolved band, defaulting to rank 2 so an
 *  elder child (JSS/SSS) is measured near the top of the ladder. */
async function startingBandFor(admission) {
  const { resolveBandForAdmission } = require('../services/ageBand');
  const band = await resolveBandForAdmission(admission).catch(() => null);
  if (band && rankOf(band) >= 0) return band;
  return 'KG2'; // elder default — measure from the top of early-years ladder
}

/** Sample up to N published quiz questions from a given band's lessons. */
async function sampleQuestionsForBand(band, n) {
  const db = dbm();
  const { Op } = db.Sequelize;
  const configs = await db.KidGameConfig.findAll({
    where: { age_level: band, content_state: 'published', template: 'quiz' },
    attributes: ['id', 'config_json'],
    order: [['createdAt', 'DESC']],
    limit: 10,
  });
  const pool = [];
  for (const cfg of configs) {
    let json = cfg.config_json;
    if (typeof json === 'string') {
      try { json = JSON.parse(json); } catch { continue; }
    }
    const questions = Array.isArray(json?.questions) ? json.questions : [];
    for (const q of questions) {
      if (q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correctIndex)) {
        pool.push({
          id: `${cfg.id}:${q.id || pool.length}`,
          band,
          prompt: String(q.prompt || ''),
          options: q.options.map((o) => ({ id: o.id, label: o.label })),
          correctIndex: q.correctIndex,
        });
      }
    }
    if (pool.length >= n) break;
  }
  // Shuffle deterministically-ish and cap.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** GET /kids/placement/quiz */
async function getPlacementQuiz(req, res) {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ success: false, message: 'Students only.' });
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();

    const { content } = dbm();
    const [recent] = await content.query(
      'SELECT quiz_questions, created_at, band FROM kids_band_placements WHERE child_admission_no = ? AND updated_at > (NOW() - INTERVAL 12 HOUR) LIMIT 1',
      { replacements: [admission] }
    );
    if (recent && recent[0]?.quiz_questions) {
      let qs = recent[0].quiz_questions;
      if (typeof qs === 'string') { try { qs = JSON.parse(qs); } catch { qs = null; } }
      if (Array.isArray(qs) && qs.length > 0) {
        // Strip correct answers before sending to the client.
        return res.json({
          success: true,
          data: {
            questions: qs.map(({ correctIndex, ...q }) => q),
            reused: true,
            startedAtBand: recent[0].band,
          },
        });
      }
    }

    // Walk from the starting band upward, collecting questions band by band.
    const startBand = await startingBandFor(admission);
    const startRank = Math.max(0, rankOf(startBand));
    const questions = [];
    for (let r = startRank; r < AGE_BANDS.length && questions.length < QUIZ_MAX_QUESTIONS; r++) {
      const band = AGE_BANDS[r];
      const picked = await sampleQuestionsForBand(band, QUIZ_QUESTIONS_PER_BAND);
      questions.push(...picked);
    }
    // Fallback: ladder above the start rank empty → sample from below.
    if (questions.length === 0) {
      for (let r = startRank - 1; r >= 0 && questions.length < QUIZ_MAX_QUESTIONS; r--) {
        const band = AGE_BANDS[r];
        const picked = await sampleQuestionsForBand(band, QUIZ_QUESTIONS_PER_BAND);
        questions.push(...picked);
      }
    }

    return res.json({
      success: true,
      data: { questions, reused: false, startedAtBand: startBand },
    });
  } catch (err) {
    console.error('getPlacementQuiz error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/placement/submit { answers: { [questionId]: optionIndex } } */
async function submitPlacement(req, res) {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ success: false, message: 'Students only.' });
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();

    const answers = req.body?.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'answers object required.' });
    }

    // Rebuild the asked questions from the stored quiz (client cannot grade itself).
    const { content } = dbm();
    const [rows] = await content.query(
      'SELECT quiz_questions, band FROM kids_band_placements WHERE child_admission_no = ? AND updated_at > (NOW() - INTERVAL 12 HOUR) LIMIT 1',
      { replacements: [admission] }
    );
    let asked = rows && rows[0] ? rows[0].quiz_questions : null;
    const startedAtBand = rows && rows[0] ? rows[0].band : null;
    if (typeof asked === 'string') { try { asked = JSON.parse(asked); } catch { asked = null; } }

    // If no stored quiz exists (e.g. client built one via GET then waited),
    // rebuild it deterministically is impossible — require the GET first.
    if (!Array.isArray(asked) || asked.length === 0) {
      return res.status(409).json({ success: false, message: 'No active placement quiz — request GET /kids/placement/quiz first.' });
    }

    let correct = 0;
    const perBand = {};
    for (const q of asked) {
      const given = answers[q.id];
      const isCorrect = Number.isInteger(given) && given === q.correctIndex;
      if (isCorrect) correct += 1;
      const band = q.band || startedAtBand || 'Primary';
      perBand[band] = perBand[band] || { correct: 0, total: 0 };
      perBand[band].total += 1;
      if (isCorrect) perBand[band].correct += 1;
    }
    const pct = asked.length > 0 ? Math.round((correct / asked.length) * 100) : 0;

    // Band decision: the highest band the child handled at or above
    // STEP_DOWN_PCT; step down one rank when the weakest band is below it.
    const bandOrder = AGE_BANDS;
    let placedBand = startedAtBand || 'Primary';
    let bestRank = -1;
    for (const band of bandOrder) {
      const stat = perBand[band];
      if (!stat || stat.total === 0) continue;
      const bandPct = Math.round((stat.correct / stat.total) * 100);
      if (bandPct >= STEP_DOWN_PCT && rankOf(band) > bestRank) {
        bestRank = rankOf(band);
        placedBand = band;
      }
    }
    if (bestRank === -1) {
      // Everything below the step-down floor → floor of the ladder (rank 0)
      // but never below the start band's rank minus one (don't insult an
      // elder child with Creche unless the data says so).
      const startRank = rankOf(startedAtBand || 'Primary');
      placedBand = AGE_BANDS[Math.max(0, startRank - 1)];
    }

    const schoolId = String(req.user.school_id || '');
    await content.query(
      `INSERT INTO kids_band_placements (child_admission_no, school_id, band, score_pct, quiz_questions, quiz_answers)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE band = VALUES(band), score_pct = VALUES(score_pct), quiz_answers = VALUES(quiz_answers)`,
      { replacements: [admission, schoolId, placedBand, pct, JSON.stringify(asked), JSON.stringify(answers)] }
    );

    return res.json({
      success: true,
      data: { band: placedBand, score_pct: pct, per_band: perBand },
    });
  } catch (err) {
    console.error('submitPlacement error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/placement/status */
async function getPlacementStatus(req, res) {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ success: false, message: 'Students only.' });
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();
    const { content } = dbm();
    const [rows] = await content.query(
      'SELECT band, score_pct, updated_at FROM kids_band_placements WHERE child_admission_no = ? LIMIT 1',
      { replacements: [admission] }
    );
    const row = rows && rows[0];
    return res.json({
      success: true,
      data: row ? { band: row.band, score_pct: row.score_pct, placed_at: row.updated_at } : null,
    });
  } catch (err) {
    console.error('getPlacementStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getPlacementQuiz, submitPlacement, getPlacementStatus, ensureSchema };
