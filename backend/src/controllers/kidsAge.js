'use strict';

/**
 * Age declaration controller — "How old are you?" (welcome-tour step).
 *
 *   GET  /kids/age          — the calling child's declared age (null if none)
 *   POST /kids/age { age }  — upsert the caller's declared age (3–12)
 *
 * The declaration is the kid-friendly, self-service source for the age-band
 * resolver (ageBand.js resolveChildBandWithFallback) — critical for
 * SMS-imported students who have no kids_children row. Access: students only,
 * self-only (the payload carries no other child's data).
 */

const dbm = () => require('../models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`
CREATE TABLE IF NOT EXISTS kids_age_declarations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  child_admission_no VARCHAR(64) NOT NULL,
  school_id VARCHAR(40) NOT NULL DEFAULT '',
  age_years TINYINT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'tour',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kids_age_child (child_admission_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

function isStudentUser(u) {
  return String(u.user_type || '').toLowerCase() === 'student';
}

function getAdmission(u) {
  return String(u.admission_no || u.id || '');
}

const MIN_AGE = 3;
const MAX_AGE = 12;

/** GET /kids/age */
async function getMyAge(req, res) {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ success: false, message: 'Students only.' });
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });
    await ensureSchema();
    const { content } = dbm();
    const [rows] = await content.query(
      'SELECT age_years, source, created_at, updated_at FROM kids_age_declarations WHERE child_admission_no = ? LIMIT 1',
      { replacements: [admission] }
    );
    const row = rows && rows[0];
    return res.json({
      success: true,
      data: { age: row ? Number(row.age_years) : null, source: row ? row.source : null },
    });
  } catch (err) {
    console.error('getMyAge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/age { age } — upsert (a returning child may re-pick in the tour) */
async function setMyAge(req, res) {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ success: false, message: 'Students only.' });
    const admission = getAdmission(req.user);
    if (!admission) return res.status(400).json({ success: false, message: 'admission_no is required.' });

    const age = Number(req.body?.age);
    if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
      return res.status(400).json({ success: false, message: `age must be an integer between ${MIN_AGE} and ${MAX_AGE}.` });
    }

    await ensureSchema();
    const { content } = dbm();
    const schoolId = String(req.user.school_id || '');
    await content.query(
      `INSERT INTO kids_age_declarations (child_admission_no, school_id, age_years, source)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE age_years = VALUES(age_years), source = VALUES(source), school_id = VALUES(school_id)`,
      { replacements: [admission, schoolId, age, 'tour'] }
    );
    return res.json({ success: true, data: { age, source: 'tour' } });
  } catch (err) {
    console.error('setMyAge error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getMyAge, setMyAge, ensureSchema, MIN_AGE, MAX_AGE };
