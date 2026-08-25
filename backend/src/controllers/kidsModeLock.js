'use strict';
/**
 * Mode lock controller — Teacher > Parent > Child hierarchy.
 *
 * Supports two lock scopes:
 *   Per-student: child_admission_no = 'NUR-001', class_code = NULL
 *   Class-wide:  child_admission_no = '*', class_code = 'CLS0611'
 *
 * GET    /kids/mode-lock?child_admission_no=X&lesson_id=Y&class_code=Z
 * POST   /kids/mode-lock            — set lock (per-student or class-wide)
 * DELETE /kids/mode-lock            — remove lock
 * GET    /kids/mode-locks           — list all locks for a child
 *
 * Hierarchy:
 *   Teacher (2) > Parent (1) > Child (0)
 *   Teacher can override anything.
 *   Parent can override child's choice but not teacher.
 *   Admin/superadmin treated as teacher-level.
 */
const db = require('../models');
// kids_mode_locks lives in the kids/content DB (elite_content) — NOT in
// elite_db. All queries here MUST use db.content (C1).

// Role hierarchy: higher number = more authority. Mirrors elite-api roleBasedAuth.js.
const ROLE_HIERARCHY = { superadmin: 5, admin: 4, branchadmin: 4, teacher: 2, parent: 1, student: 0 };

/* ── Helpers ─────────────────────────────────────────────── */

/** Normalize user_type to a role level used in the lock hierarchy.
 * admin/branchadmin/superadmin → treated as teacher-level for lock purposes.
 */
function callerRole(req) {
  const raw = (req.user?.user_type || req.user?.role || '').toLowerCase();
  if (raw === 'admin' || raw === 'branchadmin' || raw === 'superadmin') return 'teacher';
  return raw;
}

function callerRank(req) {
  return ROLE_HIERARCHY[callerRole(req)] || 0;
}

/**
 * Find the effective lock for a student+lesson.
 * Checks: per-student lock first, then class-wide lock.
 * Returns the lock with highest authority.
 */
async function findEffectiveLock(childAdmissionNo, lessonId, classCode) {
  // 1. Per-student lock
  const [studentLock] = await db.content.query(
    `SELECT * FROM kids_mode_locks
     WHERE child_admission_no = :child AND lesson_id = :lesson
     LIMIT 1`,
    { replacements: { child: childAdmissionNo, lesson: lessonId }, type: db.content.QueryTypes.SELECT }
  );

  // 2. Class-wide lock (if class_code provided)
  let classLock = null;
  if (classCode) {
    [classLock] = await db.content.query(
      `SELECT * FROM kids_mode_locks
       WHERE class_code = :classCode AND lesson_id = :lesson AND school_id != ''
       ORDER BY updated_at DESC LIMIT 1`,
      { replacements: { classCode, lesson: lessonId }, type: db.content.QueryTypes.SELECT }
    );
  }

  // 3. Return whichever has higher authority (teacher > parent)
  if (studentLock && classLock) {
    const sRank = ROLE_HIERARCHY[studentLock.locked_by_role] || 0;
    const cRank = ROLE_HIERARCHY[classLock.locked_by_role] || 0;
    return cRank >= sRank ? classLock : studentLock;
  }
  return studentLock || classLock || null;
}

/* ── GET /kids/mode-lock ─────────────────────────────────── */

async function getModeLock(req, res) {
  try {
    const { child_admission_no, lesson_id, class_code } = req.query;
    if (!child_admission_no || !lesson_id) {
      return res.status(400).json({ success: false, message: 'child_admission_no and lesson_id are required.' });
    }

    const lock = await findEffectiveLock(child_admission_no, lesson_id, class_code);
    return res.json({ success: true, data: lock || null });
  } catch (err) {
    console.error('getModeLock error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to get mode lock.' });
  }
}

/* ── POST /kids/mode-lock ────────────────────────────────── */

async function setModeLock(req, res) {
  try {
    const { child_admission_no, lesson_id, locked_mode, class_code } = req.body;
    if (!lesson_id || !locked_mode) {
      return res.status(400).json({ success: false, message: 'lesson_id and locked_mode are required.' });
    }
    if (!['learning', 'practice', 'test'].includes(locked_mode)) {
      return res.status(400).json({ success: false, message: 'locked_mode must be learning, practice, or test.' });
    }

    // Only teachers/admins can set class-wide locks
    const role = callerRole(req);
    const isClassWide = !!class_code && (child_admission_no === '*' || !child_admission_no);

    if (isClassWide && role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers can set class-wide mode locks.' });
    }

    if (!['teacher', 'parent'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Only teachers and parents can lock modes.' });
    }

    const callerId = String(req.user?.id || '');
    const callerName = req.user?.name || req.user?.email || callerId;
    const school_id = req.user?.school_id || req.headers['x-school-id'] || '';
    const branch_id = req.user?.branch_id || req.headers['x-branch-id'] || '';

    if (isClassWide) {
      /* ── Class-wide lock ───────────────────────────── */
      const [existing] = await db.content.query(
        `SELECT * FROM kids_mode_locks
         WHERE class_code = :classCode AND lesson_id = :lesson AND school_id = :school
         LIMIT 1`,
        { replacements: { classCode: class_code, lesson: lesson_id, school: school_id }, type: db.content.QueryTypes.SELECT }
      );

      if (existing) {
        const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
        if (callerRank(req) <= eRank) {
          return res.status(403).json({ success: false, message: `Cannot override: class lock set by a ${existing.locked_by_role}.` });
        }
        await db.content.query(
          `UPDATE kids_mode_locks SET locked_mode=:mode, locked_by=:by, locked_by_role=:role,
           locked_by_name=:name, updated_at=NOW()
           WHERE class_code=:classCode AND lesson_id=:lesson AND school_id=:school`,
          { replacements: { mode: locked_mode, by: callerId, role, name: callerName, classCode: class_code, lesson: lesson_id, school: school_id } }
        );
      } else {
        // id is BIGINT AUTO_INCREMENT (prod schema) — never insert a string id.
        await db.content.query(
          `INSERT INTO kids_mode_locks
           (school_id, branch_id, child_admission_no, class_code, lesson_id, locked_mode, locked_by, locked_by_role, locked_by_name, created_at, updated_at)
           VALUES (:school, :branch, '*', :classCode, :lesson, :mode, :by, :role, :name, NOW(), NOW())`,
          { replacements: { school: school_id, branch: branch_id, classCode: class_code, lesson: lesson_id, mode: locked_mode, by: callerId, role, name: callerName } }
        );
      }
      return res.json({ success: true, message: `Mode locked for class ${class_code}.` });

    } else {
      /* ── Per-student lock ──────────────────────────── */
      if (!child_admission_no) {
        return res.status(400).json({ success: false, message: 'child_admission_no is required for per-student lock.' });
      }

      const [existing] = await db.content.query(
        `SELECT * FROM kids_mode_locks
         WHERE child_admission_no = :child AND lesson_id = :lesson
         LIMIT 1`,
        { replacements: { child: child_admission_no, lesson: lesson_id }, type: db.content.QueryTypes.SELECT }
      );

      if (existing) {
        const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
        if (callerRank(req) <= eRank) {
          return res.status(403).json({ success: false, message: `Cannot override: locked by a ${existing.locked_by_role}.` });
        }
        await db.content.query(
          `UPDATE kids_mode_locks SET locked_mode=:mode, locked_by=:by, locked_by_role=:role,
           locked_by_name=:name, updated_at=NOW()
           WHERE child_admission_no=:child AND lesson_id=:lesson`,
          { replacements: { mode: locked_mode, by: callerId, role, name: callerName, child: child_admission_no, lesson: lesson_id } }
        );
      } else {
        // id is BIGINT AUTO_INCREMENT (prod schema) — never insert a string id.
        await db.content.query(
          `INSERT INTO kids_mode_locks
           (school_id, branch_id, child_admission_no, lesson_id, locked_mode, locked_by, locked_by_role, locked_by_name, created_at, updated_at)
           VALUES (:school, :branch, :child, :lesson, :mode, :by, :role, :name, NOW(), NOW())`,
          { replacements: { school: school_id, branch: branch_id, child: child_admission_no, lesson: lesson_id, mode: locked_mode, by: callerId, role, name: callerName } }
        );
      }
      return res.json({ success: true, message: 'Mode locked.' });
    }
  } catch (err) {
    console.error('setModeLock error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to set mode lock.' });
  }
}

/* ── DELETE /kids/mode-lock ──────────────────────────────── */

async function removeModeLock(req, res) {
  try {
    const { child_admission_no, lesson_id, class_code } = req.body;
    if (!lesson_id) {
      return res.status(400).json({ success: false, message: 'lesson_id is required.' });
    }

    const role = callerRole(req);
    const isClassWide = !!class_code && (child_admission_no === '*' || !child_admission_no);

    if (isClassWide) {
      const [existing] = await db.content.query(
        `SELECT * FROM kids_mode_locks
         WHERE class_code = :classCode AND lesson_id = :lesson
         LIMIT 1`,
        { replacements: { classCode: class_code, lesson: lesson_id }, type: db.content.QueryTypes.SELECT }
      );
      if (!existing) return res.json({ success: true, message: 'No class lock to remove.' });
      // Unlock allows equal rank (else teacher-level locks could never be
      // removed at all — admin/superadmin collapse to teacher here); only a
      // LOWER-rank caller is blocked.
      const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
      if (callerRank(req) < eRank) {
        return res.status(403).json({ success: false, message: `Cannot unlock: class lock set by a ${existing.locked_by_role}.` });
      }
      await db.content.query(
        `DELETE FROM kids_mode_locks WHERE class_code = :classCode AND lesson_id = :lesson`,
        { replacements: { classCode: class_code, lesson: lesson_id } }
      );
      return res.json({ success: true, message: 'Class lock removed.' });

    } else {
      if (!child_admission_no) {
        return res.status(400).json({ success: false, message: 'child_admission_no is required.' });
      }
      const [existing] = await db.content.query(
        `SELECT * FROM kids_mode_locks
         WHERE child_admission_no = :child AND lesson_id = :lesson
         LIMIT 1`,
        { replacements: { child: child_admission_no, lesson: lesson_id }, type: db.content.QueryTypes.SELECT }
      );
      if (!existing) return res.json({ success: true, message: 'No lock to remove.' });
      // Unlock allows equal rank (see class-wide branch above).
      const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
      if (callerRank(req) < eRank) {
        return res.status(403).json({ success: false, message: `Cannot unlock: locked by a ${existing.locked_by_role}.` });
      }
      await db.content.query(
        `DELETE FROM kids_mode_locks WHERE child_admission_no = :child AND lesson_id = :lesson`,
        { replacements: { child: child_admission_no, lesson: lesson_id } }
      );
      return res.json({ success: true, message: 'Lock removed.' });
    }
  } catch (err) {
    console.error('removeModeLock error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to remove mode lock.' });
  }
}

/* ── GET /kids/mode-locks ────────────────────────────────── */

async function listModeLocks(req, res) {
  try {
    const { child_admission_no, class_code, school_id } = req.query;

    let locks;
    if (class_code) {
      locks = await db.content.query(
        `SELECT * FROM kids_mode_locks WHERE class_code = :classCode ORDER BY lesson_id`,
        { replacements: { classCode: class_code }, type: db.content.QueryTypes.SELECT }
      );
    } else if (child_admission_no) {
      locks = await db.content.query(
        `SELECT * FROM kids_mode_locks WHERE child_admission_no = :child ORDER BY lesson_id`,
        { replacements: { child: child_admission_no }, type: db.content.QueryTypes.SELECT }
      );
    } else {
      return res.status(400).json({ success: false, message: 'child_admission_no or class_code is required.' });
    }

    return res.json({ success: true, data: locks });
  } catch (err) {
    console.error('listModeLocks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to list mode locks.' });
  }
}

module.exports = { getModeLock, setModeLock, removeModeLock, listModeLocks };


const { weekNumberFor } = require('./kidsLeaderboard');

/** POST /kids/test-scores/convert — FB-13/14: publish class-test scores to weekly_scores.
 * Accepts ONE or MANY lesson_ids; sums each student's best score across the selection,
 * scales proportionally into the active ca_setup max (e.g. 40/60 -> 10/15 for CA1 max 15),
 * honors academic_calendar for term scoping, writes status='Draft'. */
async function convertTestScores(req, res) {
  try {
    if (callerRole(req) !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers/admins can convert scores.' });
    }
    const { lesson_id, lesson_ids, class_code, target } = req.body || {};
    let ls = Array.isArray(lesson_ids) ? lesson_ids : (lesson_id ? [lesson_id] : []);
    ls = [...new Set(ls.map(String).filter(Boolean))];
    if (!ls.length || !class_code || !['CA', 'EXAM'].includes(target)) {
      return res.status(400).json({ success: false, message: 'lesson_ids[], class_code and target (CA|EXAM) are required.' });
    }

    // Every selected game must be under an active class-wide TEST lock IN THE CALLER'S SCHOOL
    const callerSchool = req.headers['x-school-id'] || (req.user && req.user.school_id) || null;
    if (!callerSchool) {
      return res.status(403).json({ success: false, message: 'School context missing.' });
    }
    const locks = await db.content.query(
      `SELECT * FROM kids_mode_locks
       WHERE class_code = :c AND locked_mode = 'test' AND lesson_id IN (:ls) AND school_id = :s
       GROUP BY lesson_id`,
      { replacements: { c: class_code, ls, s: String(callerSchool) }, type: db.content.QueryTypes.SELECT }
    );
    if (locks.some((l) => String(l.school_id) !== String(callerSchool))) {
      return res.status(403).json({ success: false, message: 'Cross-school lessons cannot be converted.' });
    }
    const lockedIds = locks.map((l) => l.lesson_id);
    const missing = ls.filter((x) => !lockedIds.includes(x));
    if (!lockedIds.length) {
      return res.status(400).json({ success: false, message: 'No active class TEST locks for the selected game(s).' });
    }
    if (missing.length) {
      return res.status(400).json({ success: false, message: 'Not in class TEST mode: ' + missing.join(', ') });
    }

    // Local subject PER LESSON: prefer domesticated (school-owned) copies, else the global lesson subject.
    // Subject-binding invariant: one conversion = ONE subject; never fold games across subjects/series.
    const subjRows = await db.content.query(
      `SELECT id, MAX(CASE WHEN owner_school_id = :s THEN subject END) AS dom_subj, MAX(subject) AS base_subj
       FROM kids_lessons WHERE id IN (:ls) GROUP BY id`,
      { replacements: { s: String(callerSchool) }, type: db.content.QueryTypes.SELECT }
    );
    const effSubj = {};
    for (const r of subjRows) effSubj[String(r.id)] = String((r.dom_subj || r.base_subj || '')).trim().toUpperCase();
    const distinctSubjects = [...new Set(ls.map((x) => effSubj[String(x)]).filter(Boolean))];
    if (distinctSubjects.length !== 1) {
      return res.status(400).json({ success: false, message: distinctSubjects.length
        ? 'Selected games span multiple subjects (' + distinctSubjects.join(', ') + ') — convert them separately.'
        : 'Could not resolve a subject for the selected game(s).' });
    }
    const subjectCode = distinctSubjects[0];

    const lock0 = locks[0];

    // Current term via academic_calendar (3 terms per branch per year)
    const [cal] = await db.sequelize.query(
      `SELECT academic_year, term, total_weeks, begin_date FROM academic_calendar
       WHERE school_id = :s AND branch_id = :b AND CURDATE() BETWEEN begin_date AND end_date
       ORDER BY id DESC LIMIT 1`,
      { replacements: { s: lock0.school_id, b: lock0.branch_id }, type: db.sequelize.QueryTypes.SELECT }
    );
    if (!cal) {
      return res.status(400).json({ success: false, message: 'No active academic_calendar term for this branch.' });
    }
    const derivedWeek = weekNumberFor(new Date(cal.begin_date), new Date());

    // Active CA/EXAM setup honoring branch scoping
    const wantTypes = target === 'EXAM' ? ['EXAM'] : ['CA1', 'CA2', 'CA3', 'CA4'];
    const [setup] = await db.sequelize.query(
      `SELECT id, ca_type, max_score, week_number FROM ca_setup
       WHERE school_id = :s AND (branch_id = :b OR branch_id IS NULL OR branch_id = '')
         AND status = 'Active' AND is_active = 1 AND ca_type IN (:t)
       ORDER BY (branch_id = :b) DESC, week_number DESC, id DESC LIMIT 1`,
      { replacements: { s: lock0.school_id, b: lock0.branch_id, t: wantTypes }, type: db.sequelize.QueryTypes.SELECT }
    );
    if (!setup) {
      return res.status(400).json({ success: false, message: `No active ${target} setup in ca_setup for this branch.` });
    }

    // Denominator per game: items x10 XP derived from config; fallback to observed best; else 100
    const cfgRows = await db.content.query(
      `SELECT lesson_id, template, config_json FROM kids_game_configs WHERE lesson_id IN (:ls)`,
      { replacements: { ls }, type: db.content.QueryTypes.SELECT }
    );
    const cfgByLesson = {};
    for (const c of cfgRows) cfgByLesson[c.lesson_id] = c;
    function deriveMax(lessonId) {
      const c = cfgByLesson[lessonId];
      try {
        const j = typeof (c && c.config_json) === 'string' ? JSON.parse(c.config_json) : (c && c.config_json) || {};
        for (const k of ['items', 'sentences', 'pieces', 'pairs', 'questions']) {
          if (Array.isArray(j[k]) && j[k].length) return j[k].length * 10;
        }
      } catch (e) { /* fallthrough */ }
      return null;
    }

    // Per-student best per lesson inside each lesson's lock window
    const perStudent = {}; // adm -> {sum, have:{}}
    for (const lk of locks) {
      const rowsQ = await db.content.query(
        `SELECT child_admission_no AS adm, MAX(score) AS best
         FROM kids_progress
         WHERE lesson_id = :l AND completed_at >= :since AND child_admission_no <> '*'
         GROUP BY child_admission_no`,
        { replacements: { l: lk.lesson_id, since: lk.created_at }, type: db.content.QueryTypes.SELECT }
      );
      for (const r of rowsQ) {
        const o = perStudent[r.adm] || (perStudent[r.adm] = {});
        o[lk.lesson_id] = Number(r.best) || 0;
      }
    }
    if (!Object.keys(perStudent).length) {
      return res.status(400).json({ success: false, message: 'No test attempts recorded during the lock window(s).' });
    }

    // Totals: denominator = sum over selected games of max(denominator)
    const denoms = {};
    let denomSum = 0;
    for (const lid of lockedIds) {
      const obsRows = await db.content.query(
        `SELECT MAX(score) AS m FROM kids_progress WHERE lesson_id = :l`,
        { replacements: { l: lid }, type: db.content.QueryTypes.SELECT }
      );
      const d = deriveMax(lid) != null ? deriveMax(lid)
        : ((obsRows[0] && Number(obsRows[0].m)) || 100);
      denoms[lid] = d;
      denomSum += d;
    }
    if (denomSum <= 0) {
      return res.status(400).json({ success: false, message: 'Could not derive game totals for scaling.' });
    }

    const targetMax = Number(setup.max_score) || 100;
    const wk = setup.week_number != null ? Number(setup.week_number) : derivedWeek;
    let inserted = 0, updatedN = 0;
    for (const adm of Object.keys(perStudent)) {
      let got = 0;
      for (const lid of lockedIds) got += perStudent[adm][lid] || 0;
      const scaled = Math.min(targetMax, Math.round((got / denomSum) * targetMax * 100) / 100);
      const [exist] = await db.sequelize.query(
        `SELECT id FROM weekly_scores
         WHERE admission_no = :a AND ca_setup_id = :cs AND subject_code = :sub
           AND class_code = :cl AND academic_year = :ay AND term = :tm
         LIMIT 1`,
        { replacements: { a: adm, cs: setup.id, sub: subjectCode, cl: class_code, ay: cal.academic_year, tm: cal.term }, type: db.sequelize.QueryTypes.SELECT }
      );
      if (exist) {
        await db.sequelize.query(
          `UPDATE weekly_scores SET score = :sc, max_score = :mx, assessment_type = :at, updated_at = NOW() WHERE id = :id`,
          { replacements: { sc: scaled, mx: targetMax, at: setup.ca_type, id: exist.id } }
        );
        updatedN++;
      } else {
        await db.sequelize.query(
          `INSERT INTO weekly_scores
           (admission_no, subject_code, class_code, ca_setup_id, score, max_score, week_number, assessment_type, is_locked, status, academic_year, term)
           VALUES (:a, :sub, :cl, :cs, :sc, :mx, :wk, :at, 0, 'Draft', :ay, :tm)`,
          { replacements: { a: adm, sub: subjectCode, cl: class_code, cs: setup.id, sc: scaled, mx: targetMax, wk, at: setup.ca_type, ay: cal.academic_year, tm: cal.term } }
        );
        inserted++;
      }
    }
    return res.json({
      success: true,
      message: `Published ${inserted + updatedN} ${setup.ca_type} score(s): raw/${denomSum} -> ${setup.ca_type} max ${targetMax}, Draft.`,
      data: { inserted, updated: updatedN, games: lockedIds.length, denom_sum: denomSum, ca_type: setup.ca_type, term: cal.term, academic_year: cal.academic_year },
    });
  } catch (err) {
    console.error('convertTestScores error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to convert scores.' });
  }
}
module.exports.convertTestScores = convertTestScores;

/** FB-15 helpers — series-level domestication with lineage. */
function lock0school(locks) { return (locks[0] && locks[0].school_id) || ''; }

async function ensureDomesticationSchema() {
  await db.content.query(`CREATE TABLE IF NOT EXISTS kids_series_subject_maps (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    series_id VARCHAR(50) NOT NULL,
    school_id VARCHAR(20) NOT NULL,
    branch_id VARCHAR(20) NOT NULL DEFAULT '',
    subject_code VARCHAR(50) NOT NULL,
    mapped_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_series_school (series_id, school_id, branch_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  const [col] = await db.content.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='kids_lessons' AND COLUMN_NAME='source_lesson_id'`,
    { type: db.content.QueryTypes.SELECT }
  );
  if (!col || !Number(col.n)) {
    await db.content.query(`ALTER TABLE kids_lessons
      ADD COLUMN source_lesson_id VARCHAR(50) NULL,
      ADD COLUMN owner_school_id VARCHAR(20) NULL,
      ADD INDEX idx_lessons_source (source_lesson_id),
      ADD INDEX idx_lessons_owner (owner_school_id);`);
  }
}

/** POST /kids/series/:id/domesticate {subject_code} — map WHOLE series to a local
 * subject and materialize school-owned lesson copies bearing source_lesson_id. */
async function domesticateSeries(req, res) {
  try {
    if (callerRole(req) !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers/admins can domesticate series.' });
    }
    const seriesId = String(req.params.id || '');
    const { subject_code } = req.body || {};
    const schoolId = String(req.user?.school_id || req.headers['x-school-id'] || '');
    const branchId = String(req.user?.branch_id || req.headers['x-branch-id'] || '');
    if (!seriesId || !subject_code || !schoolId) {
      return res.status(400).json({ success: false, message: 'subject_code and school context are required.' });
    }
// f41: schema pre-applied via manual migration 2026-08-24; runtime DDL removed
    const uuid = () => require('crypto').randomUUID();
    await db.content.query(
      `INSERT INTO kids_series_subject_maps (series_id, school_id, branch_id, subject_code, mapped_by)
       VALUES (:se, :s, :b, :sub, :by)
       ON DUPLICATE KEY UPDATE subject_code = VALUES(subject_code), mapped_by = VALUES(mapped_by)`,
      { replacements: { se: seriesId, s: schoolId, b: branchId, sub: subject_code, by: String(req.user?.id || '') } }
    );
    // Series linkage lives in kids_game_units.content_items — resolve lessons from there
    const unitRows = await db.content.query(
      `SELECT ku.content_items FROM kids_game_units ku WHERE ku.series_id = :se`,
      { replacements: { se: seriesId }, type: db.content.QueryTypes.SELECT }
    );
    const ids = [];
    for (const u of unitRows) {
      const arr = Array.isArray(u.content_items) ? u.content_items : (() => { try { return JSON.parse(u.content_items || '[]'); } catch { return []; } })();
      for (const x of arr) { const v = x && (x.item_id || x.lesson_id || x); if (v && !ids.includes(String(v))) ids.push(String(v)); }
    }
    let copied = 0;
    for (const srcId of ids) {
      const [src] = await db.content.query(`SELECT * FROM kids_lessons WHERE id = :i LIMIT 1`, { replacements: { i: srcId }, type: db.content.QueryTypes.SELECT });
      if (!src) continue;
      const [dupe] = await db.content.query(
        `SELECT id FROM kids_lessons WHERE source_lesson_id = :i AND owner_school_id = :s LIMIT 1`,
        { replacements: { i: srcId, s: schoolId }, type: db.content.QueryTypes.SELECT }
      );
      if (dupe) continue;
      const newId = uuid();
      await db.content.query(
        `INSERT INTO kids_lessons (id, title, subject, age_level, template, status, is_global, lesson_text, source_lesson_id, owner_school_id, createdAt, updatedAt)
         SELECT :nid, title, :sub, age_level, template, 'published', 0, lesson_text, :src, :own, NOW(), NOW()
         FROM kids_lessons WHERE id = :i`,
        { replacements: { nid: newId, sub: subject_code, src: srcId, own: schoolId, i: srcId } }
      ).catch(async () => {
        // Column-shape fallback: copy minimal guaranteed fields
        await db.content.query(
          `INSERT INTO kids_lessons (id, title, subject, age_level, template, is_global, lesson_text, source_lesson_id, owner_school_id, createdAt, updatedAt)
           SELECT :nid, title, :sub, age_level, template, 0, lesson_text, :src, :own, NOW(), NOW()
           FROM kids_lessons WHERE id = :i`,
          { replacements: { nid: newId, sub: subject_code, src: srcId, own: schoolId, i: srcId } }
        );
      });
      // Copy game config
      await db.content.query(
        `INSERT INTO kids_game_configs (lesson_id, template, config_json, createdAt, updatedAt)
         SELECT :nid, template, config_json, NOW(), NOW() FROM kids_game_configs WHERE lesson_id = :i`,
        { replacements: { nid: newId, i: srcId } }
      ).catch(() => {});
      // Copy scene scripts generically (all columns except PK/AI, retarget lesson_id)
      try {
        const cols = await db.content.query(`SHOW COLUMNS FROM kids_scene_scripts`, { type: db.content.QueryTypes.SELECT });
        const names = cols.map((c) => c.Field).filter((f) => !['id', 'createdAt', 'updatedAt'].includes(f));
        if (names.includes('lesson_id')) {
          const sel = names.map((f) => (f === 'lesson_id' ? ':nid' : ('\`' + f + '\`'))).join(', ');
          await db.content.query(
            `INSERT INTO kids_scene_scripts (\`${names.join('\`, \`')}\`) SELECT ${sel.replace(':nid', '?')} FROM kids_scene_scripts WHERE lesson_id = ?`.replace(/:nid/g, '?'),
            { replacements: [newId, srcId] }
          ).catch(() => {});
        }
      } catch (e) { /* scenes optional */ }
      copied++;
    }
    return res.json({ success: true, message: `Series domesticated into ${subject_code}. Lessons copied: ${copied}.`, data: { series_id: seriesId, subject_code, copied } });
  } catch (err) {
    console.error('domesticateSeries error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to domesticate series.' });
  }
}

/** GET /kids/series-domestications — list school's series->subject mappings. */
async function listDomestications(req, res) {
  try {
    const schoolId = String(req.user?.school_id || req.headers['x-school-id'] || '');
    if (!schoolId) return res.json({ success: true, data: [] });
// f41: schema pre-applied via manual migration 2026-08-24; runtime DDL removed
    const rows = await db.content.query(
      `SELECT * FROM kids_series_subject_maps WHERE school_id = :s ORDER BY updated_at DESC`,
      { replacements: { s: schoolId }, type: db.content.QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listDomestications error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to list domestications.' });
  }
}
module.exports.domesticateSeries = domesticateSeries;
module.exports.listDomestications = listDomestications;
