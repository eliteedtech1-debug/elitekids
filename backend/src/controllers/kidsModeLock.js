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
const crypto = require('crypto');

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
  const [studentLock] = await db.sequelize.query(
    `SELECT * FROM kids_mode_locks
     WHERE child_admission_no = :child AND lesson_id = :lesson
     LIMIT 1`,
    { replacements: { child: childAdmissionNo, lesson: lessonId }, type: db.sequelize.QueryTypes.SELECT }
  );

  // 2. Class-wide lock (if class_code provided)
  let classLock = null;
  if (classCode) {
    [classLock] = await db.sequelize.query(
      `SELECT * FROM kids_mode_locks
       WHERE class_code = :classCode AND lesson_id = :lesson AND school_id != ''
       ORDER BY updated_at DESC LIMIT 1`,
      { replacements: { classCode, lesson: lessonId }, type: db.sequelize.QueryTypes.SELECT }
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
      const [existing] = await db.sequelize.query(
        `SELECT * FROM kids_mode_locks
         WHERE class_code = :classCode AND lesson_id = :lesson AND school_id = :school
         LIMIT 1`,
        { replacements: { classCode: class_code, lesson: lesson_id, school: school_id }, type: db.sequelize.QueryTypes.SELECT }
      );

      if (existing) {
        const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
        if (callerRank(req) <= eRank) {
          return res.status(403).json({ success: false, message: `Cannot override: class lock set by a ${existing.locked_by_role}.` });
        }
        await db.sequelize.query(
          `UPDATE kids_mode_locks SET locked_mode=:mode, locked_by=:by, locked_by_role=:role,
           locked_by_name=:name, updated_at=NOW()
           WHERE class_code=:classCode AND lesson_id=:lesson AND school_id=:school`,
          { replacements: { mode: locked_mode, by: callerId, role, name: callerName, classCode: class_code, lesson: lesson_id, school: school_id } }
        );
      } else {
        const lockId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.sequelize.query(
          `INSERT INTO kids_mode_locks
           (id, school_id, branch_id, child_admission_no, class_code, lesson_id, locked_mode, locked_by, locked_by_role, locked_by_name, created_at, updated_at)
           VALUES (:id, :school, :branch, '*', :classCode, :lesson, :mode, :by, :role, :name, NOW(), NOW())`,
          { replacements: { id: lockId, school: school_id, branch: branch_id, classCode: class_code, lesson: lesson_id, mode: locked_mode, by: callerId, role, name: callerName } }
        );
      }
      return res.json({ success: true, message: `Mode locked for class ${class_code}.` });

    } else {
      /* ── Per-student lock ──────────────────────────── */
      if (!child_admission_no) {
        return res.status(400).json({ success: false, message: 'child_admission_no is required for per-student lock.' });
      }

      const [existing] = await db.sequelize.query(
        `SELECT * FROM kids_mode_locks
         WHERE child_admission_no = :child AND lesson_id = :lesson
         LIMIT 1`,
        { replacements: { child: child_admission_no, lesson: lesson_id }, type: db.sequelize.QueryTypes.SELECT }
      );

      if (existing) {
        const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
        if (callerRank(req) <= eRank) {
          return res.status(403).json({ success: false, message: `Cannot override: locked by a ${existing.locked_by_role}.` });
        }
        await db.sequelize.query(
          `UPDATE kids_mode_locks SET locked_mode=:mode, locked_by=:by, locked_by_role=:role,
           locked_by_name=:name, updated_at=NOW()
           WHERE child_admission_no=:child AND lesson_id=:lesson`,
          { replacements: { mode: locked_mode, by: callerId, role, name: callerName, child: child_admission_no, lesson: lesson_id } }
        );
      } else {
        const lockId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.sequelize.query(
          `INSERT INTO kids_mode_locks
           (id, school_id, branch_id, child_admission_no, lesson_id, locked_mode, locked_by, locked_by_role, locked_by_name, created_at, updated_at)
           VALUES (:id, :school, :branch, :child, :lesson, :mode, :by, :role, :name, NOW(), NOW())`,
          { replacements: { id: lockId, school: school_id, branch: branch_id, child: child_admission_no, lesson: lesson_id, mode: locked_mode, by: callerId, role, name: callerName } }
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
      const [existing] = await db.sequelize.query(
        `SELECT * FROM kids_mode_locks
         WHERE class_code = :classCode AND lesson_id = :lesson
         LIMIT 1`,
        { replacements: { classCode: class_code, lesson: lesson_id }, type: db.sequelize.QueryTypes.SELECT }
      );
      if (!existing) return res.json({ success: true, message: 'No class lock to remove.' });
      const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
      if (callerRank(req) <= eRank) {
        return res.status(403).json({ success: false, message: `Cannot unlock: class lock set by a ${existing.locked_by_role}.` });
      }
      await db.sequelize.query(
        `DELETE FROM kids_mode_locks WHERE class_code = :classCode AND lesson_id = :lesson`,
        { replacements: { classCode: class_code, lesson: lesson_id } }
      );
      return res.json({ success: true, message: 'Class lock removed.' });

    } else {
      if (!child_admission_no) {
        return res.status(400).json({ success: false, message: 'child_admission_no is required.' });
      }
      const [existing] = await db.sequelize.query(
        `SELECT * FROM kids_mode_locks
         WHERE child_admission_no = :child AND lesson_id = :lesson
         LIMIT 1`,
        { replacements: { child: child_admission_no, lesson: lesson_id }, type: db.sequelize.QueryTypes.SELECT }
      );
      if (!existing) return res.json({ success: true, message: 'No lock to remove.' });
      const eRank = ROLE_HIERARCHY[existing.locked_by_role] || 0;
      if (callerRank(req) <= eRank) {
        return res.status(403).json({ success: false, message: `Cannot unlock: locked by a ${existing.locked_by_role}.` });
      }
      await db.sequelize.query(
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
      locks = await db.sequelize.query(
        `SELECT * FROM kids_mode_locks WHERE class_code = :classCode ORDER BY lesson_id`,
        { replacements: { classCode: class_code }, type: db.sequelize.QueryTypes.SELECT }
      );
    } else if (child_admission_no) {
      locks = await db.sequelize.query(
        `SELECT * FROM kids_mode_locks WHERE child_admission_no = :child ORDER BY lesson_id`,
        { replacements: { child: child_admission_no }, type: db.sequelize.QueryTypes.SELECT }
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
