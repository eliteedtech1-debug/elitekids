/**
 * Kids controller — children, lessons, published content, progress, approvals.
 * SAFETY RULE: child-facing reads filter content_state='published' in SQL.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const { generateGameConfig, persistGameConfig, generateSceneScript, persistSceneScript } = require('../services/contentGeneratorService');
const { enqueueLessonGeneration } = require('../media/generation.queue');

// ── Children (parent + teacher) ────────────────────────────────────────────

const AGE_LEVELS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];

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

  if (userType.includes('superadmin') || userType.includes('admin') || userType.includes('branchadmin') || userType.includes('teacher')) {
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
    const where = {};
    if (String(user.user_type || '').toLowerCase() === 'parent') {
      where.parent_user_id = String(user.id || user.user_id);
    } else {
      where.school_id = req.headers['x-school-id'] || user.school_id;
    }
    const children = await db.KidChild.findAll({ where, order: [['full_name', 'ASC']] });
    return res.json({ success: true, data: children });
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
    return res.json({ success: true, data: { ...child.toJSON(), progress } });
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

    const { full_name, age_level, class_code, avatar_url, status, parent_user_id } = req.body || {};
    const allowed = {};
    if (full_name !== undefined) allowed.full_name = full_name;
    if (age_level !== undefined) {
      if (!AGE_LEVELS.includes(age_level)) {
        return res.status(400).json({ success: false, message: `age_level must be one of: ${AGE_LEVELS.join(', ')}.` });
      }
      allowed.age_level = age_level;
    }
    if (class_code !== undefined) allowed.class_code = class_code;
    if (avatar_url !== undefined) allowed.avatar_url = avatar_url;
    if (status !== undefined) {
      if (!['Active', 'Inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: "status must be 'Active' or 'Inactive'." });
      }
      allowed.status = status;
    }
    // Re-linking a child to a different parent is staff-only.
    const userType = String(req.user.user_type || '').toLowerCase();
    if (parent_user_id !== undefined && (userType.includes('admin') || userType.includes('branchadmin') || userType.includes('teacher') || userType.includes('superadmin'))) {
      allowed.parent_user_id = parent_user_id || null;
    }

    if (!Object.keys(allowed).length) {
      return res.status(400).json({ success: false, message: 'No updatable fields provided.' });
    }
    await child.update(allowed);
    return res.json({ success: true, data: child });
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
        `SELECT admission_no, student_name, class_code, parent_id, guardian_id, phone, email
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
        `SELECT admission_no, student_name, class_code FROM students WHERE admission_no = :a AND school_id = :school_id LIMIT 1`,
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

// ── Lessons ──────────────────────────────────────────────────────────────

/** GET /kids/lessons — list lessons (published for children, all for staff).
 * Global lessons (is_global=1 from SCH-KIDS) are included for ALL schools.
 */
const PLATFORM_SCHOOL_ID = 'SCH-KIDS';

async function listLessons(req, res) {
  try {
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const { Op } = db.Sequelize;
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    const isStaff = userType.includes('admin') || userType.includes('branchadmin') || userType.includes('teacher') || userType.includes('superadmin');

    let where;
    if (isStaff) {
      // Staff see all lessons for their school + global lessons
      where = {
        [Op.or]: [
          { school_id },
          { school_id: PLATFORM_SCHOOL_ID, is_global: 1 },
        ],
      };
    } else {
      // Students/parents: only global platform lessons (no duplicates)
      where = {
        school_id: PLATFORM_SCHOOL_ID,
        is_global: 1,
        content_state: 'published',
      };
    }

    const lessons = await db.KidLesson.findAll({ where, order: [['is_global', 'DESC'], ['createdAt', 'DESC']] });

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

    // Only the platform school (SCH-KIDS) can create global lessons
    const is_global = (school_id === PLATFORM_SCHOOL_ID && req.body.is_global) ? 1 : 0;

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

/** GET /kids/lessons/:id/game — CHILD-FACING: published game config only.
 * Resolves global platform lessons (from SCH-KIDS) for any school.
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
    const isGlobal = lesson.is_global === 1 && lesson.school_id === PLATFORM_SCHOOL_ID;
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
    return res.json({ success: true, data: config.config_json });
  } catch (err) {
    console.error('getPublishedGame error:', err.message);
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
    const isGlobal = lesson.is_global === 1 && lesson.school_id === PLATFORM_SCHOOL_ID;
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

/** POST /kids/progress/game-complete — idempotent progress record. */
async function recordGameComplete(req, res) {
  try {
    const { child_admission_no, lesson_id, game_config_id, score, stars_earned, xp, idempotency_key, difficulty } = req.body || {};
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
    });
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

      let assetsSaved = 0;
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
    return res.json({ success: true, data: rows });
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

module.exports = {
  listChildrenForParent,
  getChild,
  createChild,
  updateChild,
  deleteChild,
  linkChildForParent,
  createLesson,
  getPublishedGame,
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
};
