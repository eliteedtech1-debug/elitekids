/**
 * Kids controller — children, lessons, published content, progress, approvals.
 * SAFETY RULE: child-facing reads filter content_state='published' in SQL.
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { hasClassAccess } = require('../services/routesHelper');
const { recordAttemptPoints } = require('./kidsLeaderboard');
const db = require('../models');
const { generateGameConfig, persistGameConfig, generateSceneScript, persistSceneScript } = require('../services/contentGeneratorService');
const { enqueueLessonGeneration } = require('../media/generation.queue');
const { validateManualConfig, canonicalSceneType, sceneCardErrors } = require('../services/gameConfigRules');
const { visibleLevels, resolveBandForAdmission } = require('../services/ageBand');
const sceneAssetsSeed = require('../seeders/sceneAssetsSeed');

// ── Children (parent + teacher) ────────────────────────────────────────────

const AGE_LEVELS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];

/** Never expose an EliteKids-local password hash in child-facing API data. */
function safeChild(child) {
  const data = child?.toJSON ? child.toJSON() : { ...(child || {}) };
  delete data.password_hash;
  return data;
}

/** Progress summary helper — shared by getChild + childProgress. */
async function progressSummary(admissionNo) {
  const rows = await db.KidProgress.findAll({ where: { child_admission_no: admissionNo } });
  const summary = rows.reduce(
    (acc, r) => {
      acc.total_xp += Number(r.xp) || 0;
      acc.total_stars += Number(r.stars_earned) || 0;
      acc.games_completed += 1;
      return acc;
    },
    { total_xp: 0, total_stars: 0, games_completed: 0 }
  );

  // Per-game aggregates: times_played, best_score, avg_score
  const byLesson = {};
  for (const r of rows) {
    const lid = r.lesson_id;
    if (!lid) continue;
    if (!byLesson[lid]) byLesson[lid] = { times_played: 0, total_score: 0, best_score: 0, total_stars: 0 };
    byLesson[lid].times_played += 1;
    byLesson[lid].total_score += Number(r.score) || 0;
    byLesson[lid].total_stars += Number(r.stars_earned) || 0;
    const s = Number(r.score) || 0;
    if (s > byLesson[lid].best_score) byLesson[lid].best_score = s;
  }
  const gameStats = {};
  for (const [lid, agg] of Object.entries(byLesson)) {
    gameStats[lid] = {
      times_played: agg.times_played,
      best_score: agg.best_score,
      avg_score: agg.times_played > 0 ? Math.round(agg.total_score / agg.times_played) : 0,
      total_stars: agg.total_stars,
    };
  }

  return { ...summary, game_stats: gameStats, games: rows };
}

/**
 * Child access guard:
 *  - Parent  → only children linked to their account (parent_user_id)
 *  - Student → only their own admission_no
 *  - Staff (Admin/Teacher/Superadmin) → any child in their school
 * Returns { ok: true } or { ok: false, status, body }.
 */
async function childAccessAllowed(req, child) {
  const user = req.user;
  const userType = String(user.user_type || user.role || '').toLowerCase();
  const childSchool = String(child.school_id || '');
  const userSchool = String(req.headers['x-school-id'] || user.school_id || '');

  if (userType === 'teacher') {
    const classCode = String(child.class_code || '').trim();
    if (classCode && await hasClassAccess(user, classCode)) return { ok: true };
    return { ok: false, status: 403, body: { success: false, message: 'This child is not in one of your assigned classes.' } };
  }
  if (userType.includes('superadmin') || userType.includes('admin') || userType.includes('branchadmin')) {
    if (childSchool && userSchool && childSchool !== userSchool) {
      return { ok: false, status: 403, body: { success: false, message: 'Not your school.' } };
    }
    return { ok: true };
  }
  if (userType.includes('parent')) {
    if (child.parent_user_id === String(user.id || user.user_id || '')) return { ok: true };
    return {
      ok: false,
      status: 403,
      body: { success: false, message: 'This child is not linked to your account.' },
    };
  }
  if (userType.includes('student')) {
    if (child.admission_no === String(user.admission_no || user.id || '')) return { ok: true };
    return { ok: false, status: 403, body: { success: false, message: 'You can only access your own data' } };
  }
  return { ok: false, status: 403, body: { success: false, message: 'Access denied for this role.' } };
}

/** GET /kids/children — children linked to the logged-in parent (or school for staff). */
async function listChildrenForParent(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (userType === 'teacher') {
      const allChildren = await db.KidChild.findAll({
        where: { school_id: req.headers['x-school-id'] || user.school_id },
        order: [['full_name', 'ASC']],
      });
      const assigned = [];
      for (const child of allChildren) {
        if (child.class_code && await hasClassAccess(user, child.class_code)) assigned.push(child);
      }
      return res.json({ success: true, data: assigned.map(safeChild) });
    }

    const isParent = userType === 'parent';

    if (!isParent) {
      const where = { school_id: req.headers['x-school-id'] || user.school_id };
      const children = await db.KidChild.findAll({ where, order: [['full_name', 'ASC']] });
      return res.json({ success: true, data: children.map(safeChild) });
    }

    // 1) Kids-owned profiles (kids_children.parent_user_id = users.id)
    const kidChildren = await db.KidChild.findAll({
      where: { parent_user_id: String(user.id || user.user_id) },
      order: [['full_name', 'ASC']],
    });

    // 2) Canonical SHARED EliteSMS relationship — students.parent_id/guardian_id
    //    hold the parent's par_code (parents.parent_id). Mirrors EliteSMS
    //    (user.js: `SELECT * FROM students WHERE parent_id = parent.parent_id`).
    //    Resolve the logged-in parent's code via parents.user_id (or phone), then
    //    return their children. Read-only against the shared school DB.
    const userId = String(user.id || user.user_id || '');
    const userPhone = String(user.phone || '');
    let sharedRows = [];
    if (userId || userPhone) {
      try {
        const parentRows = await db.sequelize.query(
          `SELECT parent_id, phone FROM parents
           WHERE parent_id IS NOT NULL AND parent_id <> ''
             AND (
                   (LENGTH(:uid) > 0 AND user_id = :uid)
                OR (LENGTH(:phone) > 0 AND phone = :phone)
             )
           LIMIT 10`,
          { replacements: { uid: userId, phone: userPhone }, type: db.Sequelize.QueryTypes.SELECT },
        );
        const codes = [...new Set(
          (Array.isArray(parentRows) ? parentRows : [])
            .map((p) => String(p.parent_id || '').trim())
            .filter(Boolean)
        )];
        if (codes.length) {
          sharedRows = await db.sequelize.query(
            `SELECT admission_no, school_id,
                    COALESCE(class_code, current_class) AS class_code,
                    class_name, student_name AS full_name
             FROM students
             WHERE status = 'Active' AND (parent_id IN (:codes) OR guardian_id IN (:codes))`,
            { replacements: { codes }, type: db.Sequelize.QueryTypes.SELECT },
          );
        }
      } catch (e) {
        // GROUP BY variant broke under only_full_group_by (MySQL 8 default) and
        // was silently swallowed. Dedupe happens in the `seen` Map below, so no
        // GROUP BY is needed. Log anyway so future failures are visible.
        console.warn('listChildrenForParent shared-link query failed:', e.message);
      }
    }
    sharedRows = Array.isArray(sharedRows) ? sharedRows : [];

    // Merge + dedupe by admission_no; kids_children profiles take precedence.
    const seen = new Map();
    for (const c of kidChildren) seen.set(String(c.admission_no), c);
    for (const r of sharedRows) {
      const adm = String(r.admission_no || '').trim();
      if (!adm || seen.has(adm)) continue;
      seen.set(adm, {
        id: `shared_${adm}`,
        admission_no: adm,
        school_id: r.school_id || user.school_id || null,
        branch_id: null,
        full_name: String(r.full_name || '').trim() || adm,
        age_level: r.class_name || r.class_code || null,
        class_code: r.class_code || null,
        class_name: r.class_name || null,
        avatar_url: null,
        parent_user_id: userId || null,
        parent_phone: userPhone || null,
        status: 'Active',
      });
    }

    const merged = [...seen.values()].sort((a, b) =>
      String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, { sensitivity: 'base' })
    );
    return res.json({ success: true, data: merged.map(safeChild) });
  } catch (err) {
    console.error('listChildrenForParent error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}


/** GET /kids/children/detail?admission_no=X or /kids/children/:admissionNo — one child + progress summary. */
async function getChild(req, res) {
  try {
    const admissionNo = req.query.admission_no || req.params.admissionNo;
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const child = await db.KidChild.findOne({ where: { admission_no: admissionNo, school_id } });
    if (!child) return res.status(404).json({ success: false, message: 'Child not found.' });

    const access = await childAccessAllowed(req, child);
    if (!access.ok) return res.status(access.status).json(access.body);

    const progress = await progressSummary(admissionNo);
    return res.json({ success: true, data: { ...safeChild(child), progress } });
  } catch (err) {
    console.error('getChild error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** PUT /kids/children/detail?admission_no=X or /kids/children/:admissionNo — update profile/avatar/age level. */
async function updateChild(req, res) {
  try {
    const admissionNo = req.query.admission_no || req.params.admissionNo;
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const child = await db.KidChild.findOne({ where: { admission_no: admissionNo, school_id } });
    if (!child) return res.status(404).json({ success: false, message: 'Child not found.' });

    const access = await childAccessAllowed(req, child);
    if (!access.ok) return res.status(access.status).json(access.body);

    const userType = String(req.user.user_type || req.user.role || '').toLowerCase();
    if (userType === 'parent') {
      // Parents may edit only the child's own profile settings. They cannot
      // reassign ownership, deactivate the account, or alter shared SMS data.
      if (req.body.full_name !== undefined || req.body.status !== undefined || req.body.parent_user_id !== undefined) {
        return res.status(403).json({ success: false, message: 'Parents may update only age_level, class_code, avatar, and password.' });
      }
    } else if (userType === 'teacher') {
      return res.status(403).json({ success: false, message: 'Teachers have read-only access to child profiles.' });
    }

    const { age_level, class_code, avatar_url } = req.body || {};
    const allowed = {};
    if (age_level !== undefined) {
      if (!AGE_LEVELS.includes(age_level)) {
        return res.status(400).json({ success: false, message: `age_level must be one of: ${AGE_LEVELS.join(', ')}.` });
      }
      allowed.age_level = age_level;
    }
    if (class_code !== undefined) {
      if (typeof class_code !== 'string' || class_code.trim().length > 50) {
        return res.status(400).json({ success: false, message: 'class_code must be a string of 50 characters or fewer.' });
      }
      allowed.class_code = class_code.trim() || null;
    }
    if (avatar_url !== undefined) {
      if (avatar_url !== null && (typeof avatar_url !== 'string' || avatar_url.length > 500)) {
        return res.status(400).json({ success: false, message: 'avatar_url must be a string of 500 characters or fewer.' });
      }
      allowed.avatar_url = avatar_url || null;
    }
    if (req.body.password !== undefined || req.body.new_password !== undefined) {
      const password = String(req.body.new_password ?? req.body.password ?? '');
      if (password.length < 6 || password.length > 128) {
        return res.status(400).json({ success: false, message: 'password must be between 6 and 128 characters.' });
      }
      allowed.password_hash = await bcrypt.hash(password, 10);
    }

    if (!Object.keys(allowed).length) {
      return res.status(400).json({ success: false, message: 'No updatable fields provided.' });
    }
    await child.update(allowed);
    return res.json({ success: true, data: safeChild(child) });
  } catch (err) {
    console.error('updateChild error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** DELETE /kids/children/detail?admission_no=X or /kids/children/:admissionNo — soft delete (staff only; keeps history). */
async function deleteChild(req, res) {
  try {
    const admissionNo = req.query.admission_no || req.params.admissionNo;
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const child = await db.KidChild.findOne({ where: { admission_no: admissionNo, school_id } });
    if (!child) return res.status(404).json({ success: false, message: 'Child not found.' });

    const userType = String(req.user.user_type || '').toLowerCase();
    if (!(userType.includes('admin') || userType.includes('branchadmin') || userType.includes('teacher') || userType.includes('superadmin'))) {
      return res.status(403).json({ success: false, message: 'Only staff can remove a child.' });
    }

    await child.update({ status: 'Inactive' });
    return res.json({ success: true, message: 'Child removed.', data: child });
  } catch (err) {
    console.error('deleteChild error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/children/link — parent self-service linking.
 *
 * Ownership is verified against the SHARED students row: the student's
 * parent_id / guardian_id (which may hold the parent's users.id, email or
 * phone) must match the logged-in parent, or the student's phone/email must
 * match the parent's contact. No trust from the client side.
 */
async function linkChildForParent(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || '').toLowerCase();
    if (!userType.includes('parent')) {
      return res.status(403).json({ success: false, message: 'Only parents can link children.' });
    }
    const { admission_no } = req.body || {};
    if (!admission_no) {
      return res.status(400).json({ success: false, message: 'admission_no is required.' });
    }
    const school_id = req.headers['x-school-id'] || user.school_id;

    // 1) Must exist in the shared students table for this school.
    const [student] = await db.sequelize
      .query(
        `SELECT admission_no, student_name,
               COALESCE(class_code, current_class) AS class_code, class_name,
               parent_id, guardian_id, phone, email
         FROM students WHERE admission_no = :a AND school_id = :school_id LIMIT 1`,
        { replacements: { a: admission_no, school_id }, type: db.sequelize.QueryTypes.SELECT }
      )
      .catch(() => []);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found for this school.' });
    }

    // 2) Ownership check against the shared students row.
    const parentKey = String(user.id || user.user_id || '');
    const parentEmail = String(user.email || '').toLowerCase().trim();
    const [parentRow] = await db.sequelize
      .query(`SELECT phone FROM parents WHERE user_id = :uid LIMIT 1`, {
        replacements: { uid: parentKey },
        type: db.sequelize.QueryTypes.SELECT,
      })
      .catch(() => []);
    const parentPhone = parentRow?.phone ? String(parentRow.phone).replace(/\D/g, '') : '';

    const studentParentIds = [student.parent_id, student.guardian_id]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    const studentPhone = String(student.phone || '').replace(/\D/g, '');
    const studentEmail = String(student.email || '').toLowerCase().trim();

    const owns =
      studentParentIds.includes(parentKey.toLowerCase()) ||
      studentParentIds.includes(parentEmail) ||
      (parentPhone && studentPhone && parentPhone === studentPhone) ||
      (parentEmail && studentEmail && parentEmail === studentEmail);

    if (!owns) {
      return res.status(403).json({
        success: false,
        message: 'This student is not linked to your account. Contact the school to link them.',
      });
    }

    // 3) Create the kids_children profile if missing, else re-link (a parent
    //    can reclaim a child whose link was removed).
    const existing = await db.KidChild.findOne({ where: { admission_no, school_id } });
    let child;
    if (existing) {
      await existing.update({ parent_user_id: parentKey, status: 'Active' });
      child = existing;
    } else {
      child = await db.KidChild.create({
        id: uuidv4(),
        admission_no,
        school_id,
        branch_id: req.headers['x-branch-id'] || user.branch_id,
        full_name: student.student_name || admission_no,
        age_level: 'Nursery',
        class_code: student.class_code || null,
        parent_user_id: parentKey,
        parent_phone: parentRow?.phone || null,
        status: 'Active',
      });
    }
    return res.status(existing ? 200 : 201).json({ success: true, data: child });
  } catch (err) {
    console.error('linkChildForParent error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/children — create/link a child (Admin/Teacher). */
async function createChild(req, res) {
  try {
    const { admission_no, full_name, age_level, class_code, parent_user_id } = req.body || {};
    if (!admission_no || !full_name) {
      return res.status(400).json({ success: false, message: 'admission_no and full_name are required.' });
    }
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const branch_id = req.headers['x-branch-id'] || req.user.branch_id;

    // The child must exist in the shared students table (admission_no + school_id)
    const [student] = await db.sequelize
      .query(
        `SELECT admission_no, student_name,
               COALESCE(class_code, current_class) AS class_code, class_name
         FROM students WHERE admission_no = :a AND school_id = :school_id LIMIT 1`,
        { replacements: { a: admission_no, school_id }, type: db.sequelize.QueryTypes.SELECT }
      )
      .catch(() => []);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found for this school.' });
    }

    const child = await db.KidChild.create({
      id: uuidv4(),
      admission_no,
      school_id,
      branch_id,
      full_name: full_name || student.student_name,
      age_level: age_level || 'Nursery',
      class_code: class_code || student.class_code || null,
      parent_user_id: parent_user_id || null,
      status: 'Active',
    });
    return res.status(201).json({ success: true, data: child });
  } catch (err) {
    console.error('createChild error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/children/create-for-parent — parent creates a new child + students row for login. */
async function createChildForParent(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || '').toLowerCase();
    if (!userType.includes('parent')) {
      return res.status(403).json({ success: false, message: 'Only parents can create children.' });
    }
    const { full_name, age_level, admission_no, password } = req.body || {};
    if (!full_name) {
      return res.status(400).json({ success: false, message: 'full_name is required.' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ success: false, message: 'Password is required (min 4 characters).' });
    }
    const school_id = req.headers['x-school-id'] || user.school_id;
    const branch_id = req.headers['x-branch-id'] || user.branch_id || 'BR-MAIN';
    const parentKey = String(user.id || user.user_id || '');

    // Generate admission number if not provided
    const childAdmission = admission_no || `KIDS-${Date.now().toString(36).toUpperCase()}`;

    // 1) Create kids_children row (EliteKids-local profile + progress)
    const child = await db.KidChild.create({
      id: uuidv4(),
      admission_no: childAdmission,
      school_id,
      branch_id,
      full_name,
      age_level: age_level || 'Creche',
      class_code: null,
      parent_user_id: parentKey,
      password_hash: await bcrypt.hash(String(password), 10),
      status: 'Active',
    });

    // The local profile is sufficient for an EliteKids-only child. Shared
    // EliteSMS students are imported identity records and are never created or
    // mutated by this addon. Student login uses the local profile when no
    // shared row exists, and the local hash remains authoritative when present.

    return res.status(201).json({ success: true, data: child });
  } catch (err) {
    console.error('createChildForParent error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/children/change-password — parent changes a child's password. */
async function changeChildPassword(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('parent')) {
      return res.status(403).json({ success: false, message: 'Only parents can change child passwords.' });
    }
    const { admission_no, new_password } = req.body || {};
    if (!admission_no || !new_password) {
      return res.status(400).json({ success: false, message: 'admission_no and new_password are required.' });
    }
    if (String(new_password).length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
    }

    // Verify ownership
    const child = await db.KidChild.findOne({ where: { admission_no, parent_user_id: String(user.id || user.user_id || '') } });
    if (!child) {
      return res.status(404).json({ success: false, message: 'Child not found or not linked to your account.' });
    }

    const hashed = await bcrypt.hash(String(new_password), 10);

    // Password changes are Kids-local only. The shared EliteSMS students row
    // is canonical identity data and must never be overwritten by this addon.
    // studentLogin checks the local hash first, so the new password remains
    // authoritative inside EliteKids without mutating shared credentials.
    await child.update({ password_hash: hashed });

    return res.json({ success: true, message: 'Password updated.' });
  } catch (err) {
    console.error('changeChildPassword error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Lessons ──────────────────────────────────────────────────────────────

/** GET /kids/lessons — list lessons (published for children, all for staff).
 * Global lessons (is_global=1 from the platform schools) are included for ALL
 * schools. The model flagship is SCH-ELITE ('elite'); legacy SCH-KIDS kept so
 * existing platform content is never orphaned.
 */
const PLATFORM_SCHOOL_IDS = ['SCH-ELITE', 'SCH-KIDS'];

async function listLessons(req, res) {
  try {
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const { Op } = db.Sequelize;
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    const isStaff = userType.includes('admin') || userType.includes('branchadmin') || userType.includes('teacher') || userType.includes('superadmin');

    let where;
    // Band resolution for non-staff consumers (shared with the never-empty
    // fallback below — see listLessons band-widening guarantee).
    let childBand = null;
    let admission = '';
    if (isStaff) {
      // Staff see all lessons for their school + global lessons
      where = {
        [Op.or]: [
          { school_id },
          { school_id: { [Op.in]: PLATFORM_SCHOOL_IDS }, is_global: 1 },
        ],
      };
    } else {
      // Students/parents: only global platform lessons (no duplicates)
      where = {
        school_id: { [Op.in]: PLATFORM_SCHOOL_IDS },
        is_global: 1,
        content_state: 'published',
      };
      // G6 hard server-side age ceiling: never return a lesson whose equivalence
      // rank is above the child's band. Full resolution chain (placement quiz →
      // kids_children → SMS students row → tour declaration) so SMS-imported
      // nursery kids keep their ceiling too and elder classes land on the last
      // rank instead of nowhere.
      admission = String(user.admission_no || user.id || '');
      childBand = admission ? await resolveBandForAdmission(admission) : null;
      if (childBand) {
        const levels = visibleLevels(childBand);
        if (levels) where.age_level = { [Op.in]: levels };
      }
    }

    // NERDC curriculum filters (staff only)
    if (isStaff) {
      const { nerdc_strand, nerdc_sub_strand, nerdc_code } = req.query;
      if (nerdc_strand) where.nerdc_strand = nerdc_strand;
      if (nerdc_sub_strand) where.nerdc_sub_strand = nerdc_sub_strand;
      if (nerdc_code) where.nerdc_code = { [Op.like]: `%${nerdc_code}%` };
    }

    let lessons = await db.KidLesson.findAll({ where, order: [['is_global', 'DESC'], ['createdAt', 'DESC']] });

    // NEVER-EMPTY guarantee (product rule: no child logs in to a blank
    // dashboard). When the band ceiling filtered everything out (unmapped
    // class, mislabeled catalog, …) widen to ALL global published lessons —
    // the remedial door — instead of returning an empty list.
    if (!isStaff && lessons.length === 0) {
      const { age_level: _drop, ...widerWhere } = where;
      lessons = await db.KidLesson.findAll({ where: widerWhere, order: [['is_global', 'DESC'], ['createdAt', 'DESC']] });
      if (lessons.length > 0) {
        console.log(`[listLessons] band fallback: widening empty ${childBand || 'unknown'}-band catalog to ${lessons.length} global lessons for ${admission}`);
      }
    }

    // Enrich with has_games flag for student-facing view
    if (lessons.length > 0) {
      const lessonIds = lessons.map((l) => l.id);
      const gameCounts = await db.KidGameConfig.findAll({
        attributes: ['lesson_id', [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'cnt']],
        where: { lesson_id: { [Op.in]: lessonIds }, content_state: 'published' },
        group: ['lesson_id'],
        raw: true,
      });
      const gcMap = new Map(gameCounts.map((g) => [g.lesson_id, parseInt(g.cnt, 10)]));
      const enriched = lessons.map((l) => ({
        ...l.toJSON(),
        // Sequelize timestamps are camelCase (createdAt); frontend + CSV export
        // expect snake_case — send both so no consumer breaks.
        created_at: l.createdAt,
        has_games: (gcMap.get(l.id) || 0) > 0,
      }));
      return res.json({ success: true, data: enriched });
    }

    return res.json({ success: true, data: lessons });
  } catch (err) {
    console.error('listLessons error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/nerdc/report — NERDC curriculum mapping report (staff only).
 * Returns lessons grouped by strand/sub-strand with counts, plus a flat
 * list for CSV export.
 */
async function nerdcReport(req, res) {
  try {
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const { Op } = db.Sequelize;
    const { format } = req.query; // 'csv' for download, default = json

    const lessons = await db.KidLesson.findAll({
      where: {
        [Op.or]: [
          { school_id },
          { school_id: { [Op.in]: PLATFORM_SCHOOL_IDS }, is_global: 1 },
        ],
      },
      attributes: ['id', 'title', 'subject', 'age_level', 'lesson_type', 'content_state', 'nerdc_code', 'nerdc_strand', 'nerdc_sub_strand', 'created_at'],
      order: [['nerdc_strand', 'ASC'], ['nerdc_sub_strand', 'ASC'], ['title', 'ASC']],
      raw: true,
    });

    // Group by strand
    const strandMap = new Map();
    for (const l of lessons) {
      const strand = l.nerdc_strand || 'Unassigned';
      const sub = l.nerdc_sub_strand || 'Unassigned';
      if (!strandMap.has(strand)) strandMap.set(strand, new Map());
      const subMap = strandMap.get(strand);
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub).push(l);
    }

    // Build summary
    const summary = [];
    for (const [strand, subMap] of strandMap) {
      const subStrands = [];
      let strandTotal = 0;
      for (const [sub, items] of subMap) {
        subStrands.push({ name: sub, count: items.length, lessons: items });
        strandTotal += items.length;
      }
      summary.push({ strand, total: strandTotal, subStrands });
    }

    const stats = {
      total_lessons: lessons.length,
      assigned: lessons.filter((l) => l.nerdc_code).length,
      unassigned: lessons.filter((l) => !l.nerdc_code).length,
      strands: summary.length,
    };

    // CSV format
    if (format === 'csv') {
      const header = 'ID,Title,Subject,Age Level,Lesson Type,Status,NERDC Code,Strand,Sub-Strand,Created';
      const rows = lessons.map((l) =>
        [l.id, `"${(l.title || '').replace(/"/g, '""')}"`, `"${(l.subject || '').replace(/"/g, '""')}"`, l.age_level, l.lesson_type, l.content_state, l.nerdc_code || '', l.nerdc_strand || '', l.nerdc_sub_strand || '', l.created_at].join(',')
      );
      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="nerdc-curriculum-mapping.csv"');
      return res.send(csv);
    }

    return res.json({ success: true, data: { summary, stats, lessons } });
  } catch (err) {
    console.error('nerdcReport error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Lessons (teacher/admin) ────────────────────────────────────────────────

/** POST /kids/lessons — create a lesson + enqueue AI generation. */
async function createLesson(req, res) {
  try {
    const { title, subject, age_level, lesson_text, lesson_type, duration_target_sec } = req.body || {};
    if (!title || !subject || !age_level) {
      return res.status(400).json({ success: false, message: 'title, subject and age_level are required.' });
    }
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const branch_id = req.headers['x-branch-id'] || req.user.branch_id;

    // Only platform schools (SCH-ELITE flagship / legacy SCH-KIDS) can create global lessons
    const is_global = (PLATFORM_SCHOOL_IDS.includes(school_id) && req.body.is_global) ? 1 : 0;

    const lesson = await db.KidLesson.create({
      id: uuidv4(),
      school_id,
      branch_id,
      title,
      subject,
      age_level,
      lesson_text: lesson_text || null,
      created_by: req.user.id,
      content_state: 'generated',
      lesson_type: lesson_type || 'game',
      duration_target_sec: duration_target_sec || null,
      is_global,
      nerdc_code: req.body.nerdc_code || null,
      nerdc_strand: req.body.nerdc_strand || null,
      nerdc_sub_strand: req.body.nerdc_sub_strand || null,
    });

    // Enqueue AI generation on the BullMQ queue (kids-content-generation). The
    // worker runs generateGameConfig + persistGameConfig + flips the lesson to
    // pending_human_review, tracking progress in kids_generation_jobs. When
    // Redis is unavailable (local dev) enqueueLessonGeneration returns
    // { queued:false } and we keep the inline setTimeout fallback so the flow
    // still works without a broker.
    const enqueued = await enqueueLessonGeneration({ lesson, school_id, created_by: req.user.id });
    if (!enqueued.queued) {
      setTimeout(async () => {
        try {
          const { config } = await generateGameConfig({ lesson, school_id });
          await persistGameConfig({
            lesson_id: lesson.id,
            template: config.template,
            age_level,
            config: config,
            model_provider: 'gemini',
            model_version: process.env.AI_MODEL || 'gemini-2.5-flash',
            created_by: req.user.id,
            school_id,
            branch_id,
          });
          // Also generate scene script inline
          try {
            const { scenes } = await generateSceneScript({ lesson, school_id });
            await persistSceneScript({
              lesson_id: lesson.id,
              scenes,
              model_provider: 'gemini',
              model_version: process.env.AI_MODEL || 'gemini-2.5-flash',
              created_by: req.user.id,
              school_id,
              branch_id,
            });
          } catch (sceneErr) {
            console.error('⚠️ Scene script generation failed:', sceneErr.message);
          }
          await lesson.update({ content_state: 'pending_human_review' });
        } catch (e) {
          console.error('⚠️ Background generation failed for lesson', lesson.id, e.message);
        }
      }, 0);
    }

    return res.status(201).json({ success: true, data: lesson, message: 'Generation started.' });
  } catch (err) {
    console.error('createLesson error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/lessons/manual — create a lesson + game config MANUALLY (no AI).
 * Body: { title, subject, age_level, template, config_json, is_global?, lesson_text?, scenes? }
 */
async function createLessonManual(req, res) {
  try {
    const { title, subject, age_level, template, config_json, is_global, lesson_text, scenes } = req.body || {};
    if (!title || !subject || !age_level || !template || !config_json) {
      return res.status(400).json({ success: false, message: 'title, subject, age_level, template, and config_json are required.' });
    }

    const VALID_TEMPLATES = ['matching', 'tap-recognition', 'drag-sort', 'quiz', 'fill-in-blank', 'puzzle-split', 'memory-pairs', 'label-diagram', 'stage-sequence', 'game-chain', 'speech-letter', 'speech-word', 'speech-sentence', 'speech-story', 'speech-count'];
    if (!VALID_TEMPLATES.includes(template)) {
      return res.status(400).json({ success: false, message: `template must be one of: ${VALID_TEMPLATES.join(', ')}` });
    }

    // Schema + pedagogy validation (label-diagram / stage-sequence are fully
    // schema-gated on manual save — invalid configs 400 with field detail,
    // never a silent degrade). Legacy templates keep historical behavior.
    const ruleResult = validateManualConfig(template, config_json);
    if (!ruleResult.valid) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${template} config: ${ruleResult.errors[0]}`,
        errors: ruleResult.errors,
      });
    }
    let cfgToStore = config_json;
    if (typeof cfgToStore === 'string') {
      try {
        cfgToStore = JSON.parse(cfgToStore);
      } catch (e) {
        /* unreachable — parse errors already returned 400 above */
      }
    }

    // Scene cards (optional): canonical v2 shape checks up front (400) and
    // game_checkpoint gameId resolution (422 fail-closed) BEFORE any writes.
    if (Array.isArray(scenes) && scenes.length > 0) {
      const shapeErrors = [];
      const resolveErrors = [];
      for (let si = 0; si < scenes.length; si += 1) {
        const card = scenes[si];
        for (const e of sceneCardErrors(card)) shapeErrors.push(`scenes[${si}]: ${e}`);
        if (canonicalSceneType(card) === 'game_checkpoint') {
          const gid = card && card.gameId;
          if (gid) {
            const targetLesson = await db.KidLesson.findByPk(gid);
            const hasConfig = targetLesson
              ? await db.KidGameConfig.findOne({ where: { lesson_id: gid } })
              : null;
            if (!targetLesson || !hasConfig) {
              resolveErrors.push(
                `scenes[${si}]: game_checkpoint gameId "${gid}" must reference a lesson that has a game config`
              );
            }
          }
        }
      }
      if (shapeErrors.length > 0) {
        return res.status(400).json({ success: false, message: `Invalid scenes: ${shapeErrors[0]}`, errors: shapeErrors });
      }
      if (resolveErrors.length > 0) {
        return res.status(422).json({ success: false, message: resolveErrors[0], errors: resolveErrors });
      }
    }

    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const branch_id = req.headers['x-branch-id'] || req.user.branch_id || 'BR-MAIN';
    const isGlobal = (PLATFORM_SCHOOL_IDS.includes(school_id) && is_global) ? 1 : 0;

    // Create the lesson
    const lesson = await db.KidLesson.create({
      id: uuidv4(),
      school_id,
      branch_id,
      title,
      subject,
      age_level,
      lesson_text: lesson_text || null,
      created_by: req.user.id,
      content_state: 'pending_human_review',
      lesson_type: 'game',
      is_global: isGlobal,
      nerdc_code: req.body.nerdc_code || null,
      nerdc_strand: req.body.nerdc_strand || null,
      nerdc_sub_strand: req.body.nerdc_sub_strand || null,
    });

    // Create the game config directly (no AI)
    const configId = uuidv4();
    await db.KidGameConfig.create({
      id: configId,
      lesson_id: lesson.id,
      template,
      age_level,
      config_json: cfgToStore,
      schema_version: '1.0',
      content_state: 'pending_human_review',
      model_version: 'manual',
      created_by: req.user.id,
    });

    // Create approval record
    await db.KidContentApproval.create({
      id: uuidv4(),
      school_id,
      branch_id,
      content_type: 'game_config',
      content_id: configId,
      status: 'pending',
    }).catch(() => {});

    // Optionally create scene scripts
    if (Array.isArray(scenes) && scenes.length > 0) {
      for (const scene of scenes) {
        const sceneId = uuidv4();
        await db.KidSceneScript.create({
          id: sceneId,
          lesson_id: lesson.id,
          scene_type: canonicalSceneType(scene),
          script_json: scene,
          schema_version: '1.0',
          content_state: 'pending_human_review',
          model_version: 'manual',
          created_by: req.user.id,
        });
        await db.KidContentApproval.create({
          id: uuidv4(),
          school_id,
          branch_id,
          content_type: 'scene_script',
          content_id: lesson.id,
          status: 'pending',
        }).catch(() => {});
      }
    }

    return res.status(201).json({
      success: true,
      data: { lesson_id: lesson.id, config_id: configId, template },
      message: 'Lesson created manually. Pending review.',
    });
  } catch (err) {
    console.error('createLessonManual error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** Adapt a schema-format game config (nested under `assets`, e.g. produced by the
 * AI generator or content seeds) to the flat runtime shape GamePlay.tsx renders.
 * Runtime shapes (must stay in sync with frontend/src/pages/Student/GamePlay.tsx):
 *   matching        → pairs: [{ a, b }]
 *   tap-recognition → items: [{ label, color?, emoji?, image?, hex? }] — one round per item
 *   drag-sort       → items: [{ num, label }] — ordering game
 * Flat configs pass through untouched.
 */
function toRuntimeGameConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const out = { ...cfg };
  const assets = cfg.assets && typeof cfg.assets === 'object' ? cfg.assets : {};

  // matching: schema items {id,image,label?,matches} come in mutual pairs → runtime pairs
  if (cfg.template === 'matching' && !Array.isArray(out.pairs) && Array.isArray(assets.items)) {
    const byId = new Map(assets.items.map((it) => [it.id, it]));
    const seen = new Set();
    const pairs = [];
    for (const it of assets.items) {
      if (seen.has(it.id)) continue;
      const partner = byId.get(it.matches);
      if (!partner) continue;
      pairs.push({ a: it.label || it.image || it.id, b: partner.image || partner.label || partner.id });
      seen.add(it.id);
      seen.add(partner.id);
    }
    if (pairs.length) out.pairs = pairs;
  }

  // memory-pairs: flip-card items live under assets.items — hoist to runtime items
  if (cfg.template === 'memory-pairs' && !Array.isArray(out.items) && Array.isArray(assets.items)) {
    out.items = assets.items
      .map((it) => ({ id: it.id, image: it.image, audio: it.audio, matches: it.matches }))
      .filter((it) => it.id && (it.image || it.matches));
    if (out.items.length < 4) out.items = assets.items;
  }

  // tap-recognition: schema objects → ordered tap rounds (each item is one round's target)
  if (cfg.template === 'tap-recognition' && !Array.isArray(out.items) && Array.isArray(assets.objects)) {
    const items = assets.objects
      .map((o) => ({
        label: o.label,
        color: o.color,
        emoji: o.emoji,
        image: o.image,
        audio: o.audio,
      }))
      .filter((o) => o.label || o.emoji || o.image);
    if (items.length >= 2) out.items = items;
  }

  // drag-sort: bucket configs have no meaningful runtime order — degrade to a
  // stable ordering (by bucket order, then listed order) so the game stays playable
  // instead of rendering blank.
  if (cfg.template === 'drag-sort' && !Array.isArray(out.items) && Array.isArray(assets.items)) {
    const bucketOrder = new Map((assets.buckets || []).map((b, i) => [b.id, i]));
    const ordered = [...assets.items].sort(
      (x, y) => (bucketOrder.get(x.bucketId) ?? 99) - (bucketOrder.get(y.bucketId) ?? 99),
    );
    out.items = ordered.map((it, i) => ({ num: i + 1, label: it.image || it.label || it.id }));
  }

  return out;
}

/** GET /kids/lessons/:id/game — CHILD-FACING: published game config only.
 * Resolves global platform lessons for any school.
 */
async function getPublishedGame(req, res) {
  try {
    const { id } = req.params;
    const { Op } = db.Sequelize;
    const school_id = req.headers['x-school-id'] || req.user?.school_id;

    // Check if this lesson belongs to the requesting school OR is a global platform lesson
    const lesson = await db.KidLesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }
    const isOwned = lesson.school_id === school_id;
    const isGlobal = lesson.is_global === 1 && PLATFORM_SCHOOL_IDS.includes(lesson.school_id);
    if (!isOwned && !isGlobal) {
      return res.status(404).json({ success: false, message: 'No published game for this lesson.' });
    }

    const config = await db.KidGameConfig.findOne({
      where: { lesson_id: id, content_state: 'published' },
      order: [['createdAt', 'DESC']],
    });
    if (!config) {
      return res.status(404).json({ success: false, message: 'No published game for this lesson.' });
    }
    return res.json({ success: true, data: toRuntimeGameConfig(config.config_json) });
  } catch (err) {
    console.error('getPublishedGame error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/lessons/:id/game/preview — STAFF preview: any content_state.
 * Serves the latest game config (published or not) + scenes for a lesson so teachers
 * and admins can play-test BEFORE submit / BEFORE approval. Staff-only route.
 */
async function getGamePreview(req, res) {
  try {
    const { id } = req.params;
    const school_id = req.headers['x-school-id'] || req.user?.school_id;

    const lesson = await db.KidLesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }
    const isOwned = lesson.school_id === school_id;
    const isGlobal = lesson.is_global === 1 && PLATFORM_SCHOOL_IDS.includes(lesson.school_id);
    if (!isOwned && !isGlobal) {
      return res.status(404).json({ success: false, message: 'Lesson not found for this school.' });
    }

    const config = await db.KidGameConfig.findOne({
      where: { lesson_id: id },
      order: [['createdAt', 'DESC']],
    });
    if (!config) {
      return res.status(404).json({ success: false, message: 'No game config for this lesson yet.' });
    }

    const scenes = await db.KidSceneScript.findAll({
      where: { lesson_id: id },
      order: [['createdAt', 'ASC']],
    });

    return res.json({
      success: true,
      data: {
        ...toRuntimeGameConfig(config.config_json),
        content_state: config.content_state,
        scenes: scenes.map((s) => s.script_json),
      },
    });
  } catch (err) {
    console.error('getGamePreview error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Scene Scripts (child-facing) ─────────────────────────────────────────────

/** GET /kids/lessons/:id/scenes — published scene scripts for a lesson.
 * Resolves global platform lessons for any school.
 */
async function getPublishedScenes(req, res) {
  try {
    const { id } = req.params;
    const school_id = req.headers['x-school-id'] || req.user?.school_id;

    const lesson = await db.KidLesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }
    const isOwned = lesson.school_id === school_id;
    const isGlobal = lesson.is_global === 1 && PLATFORM_SCHOOL_IDS.includes(lesson.school_id);
    if (!isOwned && !isGlobal) {
      return res.status(404).json({ success: false, message: 'No published scenes for this lesson.' });
    }

    const scenes = await db.KidSceneScript.findAll({
      where: { lesson_id: id, content_state: 'published' },
      order: [['createdAt', 'ASC']],
    });
    if (!scenes.length) {
      return res.status(404).json({ success: false, message: 'No published scenes for this lesson.' });
    }
    return res.json({ success: true, data: scenes.map((s) => s.script_json) });
  } catch (err) {
    console.error('getPublishedScenes error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Generation Job Status (teacher polling) ──────────────────────────────────

/** GET /kids/generation-jobs/:id — status of a content generation job. */
async function getGenerationJob(req, res) {
  try {
    const { id } = req.params;
    const job = await db.KidGenerationJob.findByPk(id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    return res.json({ success: true, data: job });
  } catch (err) {
    console.error('getGenerationJob error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/generation-jobs?lesson_id=X — all jobs for a lesson (polling). */
async function listGenerationJobs(req, res) {
  try {
    const { lesson_id } = req.query;
    const where = {};
    if (lesson_id) where.lesson_id = lesson_id;
    const jobs = await db.KidGenerationJob.findAll({ where, order: [['createdAt', 'DESC']] });
    return res.json({ success: true, data: jobs });
  } catch (err) {
    console.error('listGenerationJobs error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Progress ───────────────────────────────────────────────────────────────

/** POST /kids/sync/batch — offline queue drain (E2). Per-item created|duplicate|error; order preserved. */
async function syncBatch(req, res) {
  try {
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ success: false, message: 'items[] required.' });
    if (items.length > 50) return res.status(400).json({ success: false, message: 'Max 50 items per batch.' });

    const user = req.user || {};
    const isStudent = String(user.user_type || '').toLowerCase() === 'student';
    const mine = String(user.admission_no || user.id || '');
    const school_id = req.headers['x-school-id'] || user.school_id;
    const branch_id = req.headers['x-branch-id'] || user.branch_id;

    const results = [];
    for (const it of items) {
      const { child_admission_no, lesson_id, game_config_id, score, stars_earned, xp, idempotency_key, difficulty, mode } = it || {};
      try {
        if (!child_admission_no || !lesson_id) {
          results.push({ status: 'error', message: 'child_admission_no and lesson_id are required.' });
          continue;
        }
        if (isStudent && String(child_admission_no).trim() !== mine) {
          results.push({ status: 'error', message: 'You can only access your own data' });
          continue;
        }
        if (idempotency_key) {
          const existing = await db.KidProgress.findOne({
            where: { child_admission_no, lesson_id, game_config_id: game_config_id || null, idempotency_key },
          });
          if (existing) { results.push({ status: 'duplicate', id: existing.id }); continue; }
        }
        const record = await db.KidProgress.create({
          id: uuidv4(),
          school_id,
          branch_id,
          child_admission_no,
          lesson_id,
          game_config_id: game_config_id || null,
          score: Number(score) || 0,
          stars_earned: Number(stars_earned) || 0,
          xp: Number(xp) || 0,
          completed_at: new Date(),
          idempotency_key: idempotency_key || null,
          difficulty: difficulty || null,
          mode: ['learning', 'practice', 'test'].includes(mode) ? mode : null,
        });
        recordAttemptPoints({ school_id, branch_id, child_admission_no, score: record.score });
        results.push({ status: 'created', id: record.id });
      } catch (e) {
        results.push({ status: 'error', message: e.message });
      }
    }
    const failed = results.filter((r) => r.status === 'error').length;
    return res.json({ success: true, data: { results, failed } });
  } catch (err) {
    console.error('syncBatch error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/sync/delta — additive versioned alias for offline delta uploads.
 * The payload uses the same idempotent progress items as /kids/sync/batch.
 */
async function syncDelta(req, res) {
  if (!Array.isArray(req.body && req.body.items)) {
    return res.status(400).json({ success: false, message: 'items[] required.' });
  }
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson({
    ...body,
    sync: { schema_version: 1, server_time: new Date().toISOString() },
  });
  return syncBatch(req, res);
}

/** POST /kids/progress/game-complete — idempotent progress record. */
async function recordGameComplete(req, res) {
  try {
    const { child_admission_no, lesson_id, game_config_id, score, stars_earned, xp, idempotency_key, difficulty, mode } = req.body || {};
    if (!child_admission_no || !lesson_id) {
      return res.status(400).json({ success: false, message: 'child_admission_no and lesson_id are required.' });
    }
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const branch_id = req.headers['x-branch-id'] || req.user.branch_id;

    // Idempotency: same (child, lesson, config, key) → return existing, no double count.
    if (idempotency_key) {
      const existing = await db.KidProgress.findOne({
        where: { child_admission_no, lesson_id, game_config_id: game_config_id || null, idempotency_key },
      });
      if (existing) return res.json({ success: true, data: existing, duplicate: true });
    }

    const record = await db.KidProgress.create({
      id: uuidv4(),
      school_id,
      branch_id,
      child_admission_no,
      lesson_id,
      game_config_id: game_config_id || null,
      score: Number(score) || 0,
      stars_earned: Number(stars_earned) || 0,
      xp: Number(xp) || 0,
      completed_at: new Date(),
      idempotency_key: idempotency_key || null,
      difficulty: difficulty || null,
      mode: ['learning', 'practice', 'test'].includes(mode) ? mode : null,
    });
    // FB-17: weekly competition points (effort+performance), fire-and-forget
    recordAttemptPoints({ school_id, branch_id, child_admission_no, score: record.score });
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error('recordGameComplete error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/progress/child?admission_no=X or /kids/progress/child/:admissionNo — stars/XP summary for a child. */
async function childProgress(req, res) {
  try {
    const admissionNo = req.query.admission_no || req.params.admissionNo;
    return res.json({ success: true, data: await progressSummary(admissionNo) });
  } catch (err) {
    console.error('childProgress error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/progress/puzzle-difficulty?child_admission_no=X&lesson_id=Y
 * Returns which difficulty levels the student has passed for this puzzle.
 * Used by the frontend to lock/unlock difficulty levels.
 */
async function getPuzzleDifficultyStatus(req, res) {
  try {
    const { child_admission_no, lesson_id } = req.query;
    if (!child_admission_no || !lesson_id) {
      return res.status(400).json({ success: false, message: 'child_admission_no and lesson_id are required.' });
    }

    // Check if student has passed (score > 0) at each difficulty
    const difficulties = ['easy', 'medium', 'hard', 'expert'];
    const completed = {};

    for (const diff of difficulties) {
      const passed = await db.KidProgress.findOne({
        where: {
          child_admission_no,
          lesson_id,
          difficulty: diff,
          score: { [db.Sequelize.Op.gt]: 0 },
        },
        order: [['score', 'DESC']],
      });
      completed[diff] = passed ? { passed: true, best_score: passed.score, stars: passed.stars_earned } : { passed: false };
    }

    // Determine which levels are unlocked
    const unlockOrder = ['easy', 'medium', 'hard', 'expert'];
    const unlocked = { easy: true }; // Easy always unlocked
    for (let i = 1; i < unlockOrder.length; i++) {
      const prev = unlockOrder[i - 1];
      const curr = unlockOrder[i];
      unlocked[curr] = completed[prev]?.passed || false;
    }

    return res.json({ success: true, data: { completed, unlocked } });
  } catch (err) {
    console.error('getPuzzleDifficultyStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Approvals (teacher/admin) ──────────────────────────────────────────────

/** POST /kids/approvals/:id/decide — approve → published, or reject. */
async function decideApproval(req, res) {
  try {
    const { id } = req.params;
    const { decision, reason } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ success: false, message: "decision must be 'approve' or 'reject'." });
    }

    const approval = await db.KidContentApproval.findByPk(id);
    if (!approval) return res.status(404).json({ success: false, message: 'Approval record not found.' });
    if (approval.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Already reviewed.' });
    }

    await approval.update({
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
      rejection_reason: decision === 'reject' ? reason || null : null,
    });

    // Flip the referenced content's state machine.
    const nextState = decision === 'approve' ? 'published' : 'generated';
    // Declared here (not inside the else branch) so the response builder
    // below can always read it — a block-scoped declaration 500'd every
    // decide call with "assetsSaved is not defined".
    let assetsSaved = 0;

    if (approval.content_type === 'scene_script') {
      // Scene scripts are batched per lesson — content_id = lesson_id.
      const updatePayload = { content_state: nextState };
      if (nextState === 'published') {
        updatePayload.approved_by = req.user.id;
        updatePayload.approved_at = new Date();
        updatePayload.published_at = new Date();
      }
      await db.KidSceneScript.update(updatePayload, {
        where: { lesson_id: approval.content_id, content_state: 'pending_human_review' },
      });
    } else {
      const modelFor = {
        game_config: db.KidGameConfig,
        lesson: db.KidLesson,
      }[approval.content_type];

      if (modelFor) {
        const content = await modelFor.findByPk(approval.content_id);
        if (content) {
          const updatePayload = { content_state: nextState };
          if (typeof content.approved_by !== 'undefined') updatePayload.approved_by = req.user.id;
          if (typeof content.approved_at !== 'undefined') updatePayload.approved_at = new Date();
          if (typeof content.published_at !== 'undefined' && nextState === 'published') updatePayload.published_at = new Date();
          await content.update(updatePayload);
          if (nextState === 'published' && approval.content_type === 'game_config') {
            await db.KidLesson.update({ content_state: 'published', published_at: new Date() }, { where: { id: content.lesson_id } });
            // Save all open-source assets from this game config to our bucket
            try {
              const { saveGameAssets } = require('../media/asset-saver');
              if (content.config_json) {
                const result = await saveGameAssets(content.config_json);
                assetsSaved = result.saved;
                await content.update({ config_json: content.config_json });
              }
            } catch (err) {
              console.error('⚠️ Asset save failed (non-blocking):', err.message);
            }
          }
        }
      }
    }

    const assetMsg = assetsSaved > 0 ? ` ${assetsSaved} asset(s) saved to bucket.` : '';
    return res.json({ success: true, message: `${decision === 'approve' ? 'Approved and published.' : 'Rejected.'}${assetMsg}` });
  } catch (err) {
    console.error('decideApproval error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** POST /kids/lessons/:id/approve — approve ALL pending approvals for a lesson at once. */
async function approveLesson(req, res) {
  try {
    const { id } = req.params;
    const { decision, reason } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ success: false, message: "decision must be 'approve' or 'reject'." });
    }

    const lesson = await db.KidLesson.findByPk(id);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found.' });

    // Find all pending approvals that reference this lesson (directly or via game_config)
    const gameConfigs = await db.KidGameConfig.findAll({ where: { lesson_id: id } });
    const gameConfigIds = gameConfigs.map((g) => String(g.id));

    const approvals = await db.KidContentApproval.findAll({
      where: {
        status: 'pending',
        [db.Sequelize.Op.or]: [
          { content_id: id },                           // scene_script or lesson
          { content_id: { [db.Sequelize.Op.in]: gameConfigIds } }, // game_config
        ],
      },
    });

    if (approvals.length === 0) {
      // No approval records — still allow direct publish for lessons that
      // were imported or created outside the approval flow
      if (decision === 'approve') {
        // Publish game configs that aren't already published
        await db.KidGameConfig.update(
          { content_state: 'published', approved_by: req.user.id, approved_at: new Date(), published_at: new Date() },
          { where: { lesson_id: id, content_state: { [db.Sequelize.Op.ne]: 'published' } } },
        );
        await lesson.update({ content_state: 'published', approved_by: req.user.id, approved_at: new Date(), published_at: new Date() });
        return res.json({ success: true, message: 'Lesson published (no approval records to review).', reviewed: [] });
      }
      return res.status(404).json({ success: false, message: 'No pending approvals for this lesson.' });
    }

    const nextState = decision === 'approve' ? 'published' : 'generated';
    const reviewed = [];

    for (const approval of approvals) {
      await approval.update({
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewed_by: req.user.id,
        reviewed_at: new Date(),
        rejection_reason: decision === 'reject' ? reason || null : null,
      });
      reviewed.push(approval.id);

      if (approval.content_type === 'scene_script') {
        await db.KidSceneScript.update(
          { content_state: nextState },
          { where: { lesson_id: id, content_state: 'pending_human_review' } },
        );
      } else if (approval.content_type === 'game_config') {
        const gc = await db.KidGameConfig.findByPk(approval.content_id);
        if (gc) {
          const gcUpdate = { content_state: nextState };
          await gc.update(gcUpdate);
        }
      } else if (approval.content_type === 'lesson') {
        await lesson.update({ content_state: nextState });
      }
    }

    // Also update game configs directly (some may not have approval records)
    let assetsSaved = 0;
    if (decision === 'approve') {
      await db.KidGameConfig.update(
        { content_state: 'published', approved_by: req.user.id, approved_at: new Date(), published_at: new Date() },
        { where: { lesson_id: id, content_state: 'pending_human_review' } },
      );
      await lesson.update({ content_state: 'published', approved_by: req.user.id, approved_at: new Date(), published_at: new Date() });

      // Save all open-source assets from game configs to our bucket
      try {
        const { saveGameAssets } = require('../media/asset-saver');
        for (const gc of gameConfigs) {
          if (gc.config_json) {
            const result = await saveGameAssets(gc.config_json);
            assetsSaved += result.saved;
            // Persist the updated config with stored URLs
            await gc.update({ config_json: gc.config_json });
          }
        }
      } catch (err) {
        console.error('⚠️ Asset save failed (non-blocking):', err.message);
      }
    } else {
      await lesson.update({ content_state: 'generated' });
    }

    return res.json({
      success: true,
      message: `${decision === 'approve' ? 'Approved' : 'Rejected'} ${reviewed.length} item(s).${assetsSaved > 0 ? ` ${assetsSaved} asset(s) saved to bucket.` : ''}`,
      reviewed,
      assets_saved: assetsSaved,
    });
  } catch (err) {
    console.error('approveLesson error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/approvals — the human review queue. */
async function listApprovals(req, res) {
  try {
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const rows = await db.KidContentApproval.findAll({
      where: { school_id, status: 'pending' },
      order: [['createdAt', 'ASC']],
    });
    // Enrich game_config approvals with their lesson_id so the teacher preview
    // route can resolve the lesson to play-test (content_id = config id for these).
    let enriched = rows.map((r) => ({ ...r.toJSON(), created_at: r.createdAt }));
    const configApprovals = enriched.filter((r) => r.content_type === 'game_config');
    if (configApprovals.length) {
      const configIds = configApprovals.map((r) => r.content_id);
      const configs = await db.KidGameConfig.findAll({ where: { id: configIds }, attributes: ['id', 'lesson_id'] });
      const lessonByConfig = new Map(configs.map((c) => [c.id, c.lesson_id]));
      enriched = enriched.map((r) => ({
        ...r,
        ...(r.content_type === 'game_config' ? { lesson_id: lessonByConfig.get(r.content_id) || r.lesson_id } : {}),
      }));
    }
    // Alias camelCase Sequelize timestamps → snake_case (see listLessons).
    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('listApprovals error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Parent read-only activity feed ──────────────────────────────────────

/**
 * GET /kids/parent/activities — parent-only: published lessons + progress for
 * all linked children.  Returns per-child breakdown with published games
 * and the child's XP / stars so the parent can browse what their kids are
 * learning (read-only — no play capability).
 */
async function listParentActivities(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || '').toLowerCase();
    if (!userType.includes('parent')) {
      return res.status(403).json({ success: false, message: 'Only parents can view this page.' });
    }

    const parentId = String(user.id || user.user_id);
    const children = await db.KidChild.findAll({
      where: { parent_user_id: parentId },
      order: [['full_name', 'ASC']],
    });

    const activities = [];
    for (const child of children) {
      // Published lessons available for this child's school/branch
      const publishedLessons = await db.KidLesson.findAll({
        where: {
          school_id: child.school_id,
          content_state: 'published',
        },
        order: [['createdAt', 'DESC']],
      });

      // Published game configs for those lessons
      const lessonIds = publishedLessons.map((l) => l.id);
      const gameConfigs = lessonIds.length
        ? await db.KidGameConfig.findAll({
            where: { lesson_id: lessonIds, content_state: 'published' },
            order: [['createdAt', 'DESC']],
          })
        : [];

      // Published scene scripts for those lessons
      const sceneScripts = lessonIds.length
        ? await db.KidSceneScript.findAll({
            where: { lesson_id: lessonIds, content_state: 'published' },
            order: [['createdAt', 'ASC']],
          })
        : [];

      // Child's progress
      const progress = await progressSummary(child.admission_no);

      // Per-lesson activity with game + scene info
      const lessonActivities = publishedLessons.map((lesson) => {
        const games = gameConfigs.filter((g) => g.lesson_id === lesson.id);
        const scenes = sceneScripts.filter((s) => s.lesson_id === lesson.id);
        return {
          id: lesson.id,
          title: lesson.title,
          subject: lesson.subject,
          age_level: lesson.age_level,
          lesson_type: lesson.lesson_type,
          created_at: lesson.createdAt,
          has_games: games.length > 0,
          has_scenes: scenes.length > 0,
        };
      });

      activities.push({
        child: {
          id: child.id,
          admission_no: child.admission_no,
          full_name: child.full_name,
          age_level: child.age_level,
          class_code: child.class_code,
          avatar_url: child.avatar_url,
          status: child.status,
        },
        progress,
        lessons: lessonActivities,
        total_published: publishedLessons.length,
      });
    }

    return res.json({ success: true, data: activities });
  } catch (err) {
    console.error('listParentActivities error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/scene-library — staff: approved backgrounds/characters/transitions
 * for the SceneEditor visual pickers (Phase 3 A5). */
async function getSceneLibrary(req, res) {
  try {
    return res.json({ success: true, data: sceneAssetsSeed.getSceneLibrary() });
  } catch (err) {
    console.error('getSceneLibrary error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/story-templates?template=matching — staff: arc + scene-card
 * scaffolds + glue hints per game type (Phase 3 C1). */
async function getStoryTemplates(req, res) {
  try {
    const { template } = req.query;
    return res.json({ success: true, data: sceneAssetsSeed.getStoryTemplates(template) });
  } catch (err) {
    console.error('getStoryTemplates error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  syncBatch,
  syncDelta,
  listChildrenForParent,
  getSceneLibrary,
  getStoryTemplates,
  getChild,
  createChild,
  createChildForParent,
  changeChildPassword,
  updateChild,
  deleteChild,
  linkChildForParent,
  createLesson,
  createLessonManual,
  getPublishedGame,
  getGamePreview,
  getPublishedScenes,
  getGenerationJob,
  listGenerationJobs,
  recordGameComplete,
  childProgress,
  getPuzzleDifficultyStatus,
  decideApproval,
  approveLesson,
  listApprovals,
  listParentActivities,
  listLessons,
  nerdcReport,
};
