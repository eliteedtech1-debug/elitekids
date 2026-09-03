'use strict';
/**
 * Q2 2027 — Voice-First Learning controllers (roadmap §2.5).
 *
 * POST /kids/speech/assess   — score a spoken attempt + log it (kids_speech_logs)
 * GET  /kids/speech/progress — speaking-skill progression for the logged child
 *
 * Schema is created additively via ensureSchema() (prod boots KIDS_SKIP_DB_SYNC=1,
 * same pattern as kidsEconomy). Whisper API integration is a server-side fallback
 * for devices without Web Speech — wired but disabled unless SPEECH_WHISPER_KEY set.
 */
const speechAnalyzer = require('../services/speechAnalyzer');

const dbm = () => require('../src/models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`
CREATE TABLE IF NOT EXISTS kids_speech_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL,
  lesson_id VARCHAR(100) NULL,
  template VARCHAR(50) NOT NULL DEFAULT 'speech-word',
  expected_text VARCHAR(500) NOT NULL,
  transcript VARCHAR(500) NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'word',
  overall_score TINYINT NOT NULL DEFAULT 0,
  word_accuracy DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  letter_accuracy DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  fluency DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  duration_ms INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_speech_child (child_admission_no),
  KEY idx_speech_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

function isStudentUser(u) {
  return String(u.user_type || '').toLowerCase() === 'student';
}

function getAdmission(u) {
  return String(u.admission_no || '');
}

const PASS_THRESHOLD = 60;

/** POST /kids/speech/assess { expected_text, transcript, duration_ms?, mode?, lesson_id?, template? } */
async function assess(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'SP_FORBIDDEN', message: 'Students only.' });
    }
    const adm = getAdmission(u);
    const schoolId = req.headers['x-school-id'] || u.school_id || '';

    const { expected_text, transcript, duration_ms = 0, mode = 'word', lesson_id = null, template = 'speech-word' } = req.body || {};
    const expectedText = String(expected_text || '').trim();
    if (!expectedText) {
      return res.status(400).json({ success: false, error_code: 'SP_EXPECTED_REQUIRED', message: 'expected_text is required.' });
    }
    const safeMode = ['letter', 'word', 'sentence'].includes(mode) ? mode : 'word';
    const safeTemplate = /^speech-[a-z]+$/.test(String(template)) ? String(template) : 'speech-word';
    const durationMs = Math.max(0, Math.min(120000, Number(duration_ms) || 0));

    const result = speechAnalyzer.scoreAttempt({
      expectedText,
      transcript: String(transcript || ''),
      durationMs,
      mode: safeMode,
    });
    const band = speechAnalyzer.feedbackBand(result.overall);
    const passed = result.overall >= PASS_THRESHOLD;

    await ensureSchema();
    const { content } = dbm();
    await content.query(
      `INSERT INTO kids_speech_logs
        (child_admission_no, school_id, lesson_id, template, expected_text, transcript, mode,
         overall_score, word_accuracy, letter_accuracy, fluency, duration_ms, passed)
       VALUES (:adm, :school, :lesson, :template, :expected, :transcript, :mode,
         :overall, :wa, :la, :fl, :dur, :passed)`,
      {
        replacements: {
          adm,
          school: String(schoolId).slice(0, 40),
          lesson: lesson_id ? String(lesson_id).slice(0, 100) : null,
          template: safeTemplate,
          expected: expectedText.slice(0, 500),
          transcript: String(transcript || '').slice(0, 500),
          mode: safeMode,
          overall: result.overall,
          wa: result.wordAccuracy,
          la: result.letterAccuracy,
          fl: result.fluency,
          dur: durationMs,
          passed,
        },
      },
    );

    return res.json({
      success: true,
      data: {
        overall: result.overall,
        passed,
        band: band.band,
        message: band.message,
        word_accuracy: result.wordAccuracy,
        letter_accuracy: result.letterAccuracy,
        fluency: result.fluency,
        word_matches: result.wordMatches,
      },
    });
  } catch (err) {
    console.error('speech assess error:', err.message);
    return res.status(500).json({ success: false, error_code: 'SP_SERVER_ERROR', message: 'Server error.' });
  }
}

/** GET /kids/speech/progress?days=30 — per-day averages + streaks of passing attempts. */
async function progress(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, error_code: 'SP_FORBIDDEN', message: 'Students only.' });
    }
    const adm = getAdmission(u);
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));

    await ensureSchema();
    const { content } = dbm();
    const [rows] = await content.query(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS attempts,
              SUM(passed = 1) AS passed_count,
              ROUND(AVG(overall_score)) AS avg_score
         FROM kids_speech_logs
        WHERE child_admission_no = :adm
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL :days DAY)
        GROUP BY DATE(created_at)
        ORDER BY day ASC`,
      { replacements: { adm, days } },
    );
    const list = Array.isArray(rows) ? rows : [];

    const [totalsRows] = await content.query(
      `SELECT COUNT(*) AS total_attempts, SUM(passed = 1) AS total_passed,
              ROUND(AVG(overall_score)) AS avg_score
         FROM kids_speech_logs
        WHERE child_admission_no = :adm`,
      { replacements: { adm } },
    );
    const totals = (Array.isArray(totalsRows) ? totalsRows : [])[0] || {};

    return res.json({
      success: true,
      data: {
        total_attempts: Number(totals.total_attempts || 0),
        total_passed: Number(totals.total_passed || 0),
        avg_score: Number(totals.avg_score || 0),
        days: list.map((r) => ({
          day: r.day,
          attempts: Number(r.attempts || 0),
          passed: Number(r.passed_count || 0),
          avg_score: Number(r.avg_score || 0),
        })),
      },
    });
  } catch (err) {
    console.error('speech progress error:', err.message);
    return res.status(500).json({ success: false, error_code: 'SP_SERVER_ERROR', message: 'Server error.' });
  }
}

module.exports = { assess, progress, ensureSchema, PASS_THRESHOLD };
