/**
 * Game Series & Unit CRUD controller — Doc 12: Learning Progression.
 *
 * Endpoints:
 *   POST   /kids/series                  — create a game series
 *   GET    /kids/series                  — list series (filtered by school/category)
 *   GET    /kids/series/:id              — get one series with units
 *   POST   /kids/series/:id/units        — create a unit (with prerequisite linking)
 *   PUT    /kids/series/:id/units/:unitId — update a unit
 *   GET    /kids/units/:id/lock-status   — check if unit is locked for a student
 */
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');
const { AGE_BANDS, visibleLevels, resolveBandForAdmission } = require('../services/ageBand');
const { admissionAllowed, getCurrentGoalData } = require('./kidsGoals');

const CATEGORY_MAX_LEN = 100;

// ── Series CRUD ─────────────────────────────────────────────────────────────

/** POST /kids/series — create a game series (staff only). */
async function createSeries(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Only staff can create series.' });
    }

    let { name, category, description, subject_code, term_hint } = req.body || {};
    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'name and category are required.' });
    }
    if (typeof category !== 'string' || !category.trim() || category.length > CATEGORY_MAX_LEN) {
      return res.status(400).json({ success: false, message: `category must be a non-empty string of up to ${CATEGORY_MAX_LEN} characters.` });
    }
    category = category.trim();

    const series = await db.KidGameSeries.create({
      id: uuidv4(),
      name,
      category,
      description: description || null,
      subject_code: subject_code ? String(subject_code).trim().slice(0, 50) : null,
      term_hint: term_hint ? String(term_hint).trim().slice(0, 20) : null,
      created_by: String(user.id || user.user_id || ''),
    });

    return res.status(201).json({ success: true, data: series });
  } catch (err) {
    console.error('createSeries error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/series — list series. Staff see all; students/parents see by school category. */
async function listSeries(req, res) {
  try {
    const { category } = req.query;
    const where = {};
    if (category) {
      if (typeof category !== 'string' || !category.trim() || category.length > CATEGORY_MAX_LEN) {
        return res.status(400).json({ success: false, message: `category must be a non-empty string of up to ${CATEGORY_MAX_LEN} characters.` });
      }
      where.category = category;
    }

    const series = await db.KidGameSeries.findAll({ where, order: [['createdAt', 'ASC']] });

    // Enrich with unit count
    const enriched = [];
    for (const s of series) {
      const unitCount = await db.KidGameUnit.count({ where: { series_id: s.id } });
      enriched.push({ ...s.toJSON(), unit_count: unitCount });
    }

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('listSeries error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/series/:id — get one series with its units. */
async function getSeries(req, res) {
  try {
    const { id } = req.params;
    const series = await db.KidGameSeries.findByPk(id);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found.' });
    }

    const units = await db.KidGameUnit.findAll({
      where: { series_id: id },
      order: [['unit_number', 'ASC']],
    });

    // E1: surface NERDC-coded curriculum points mapped to this series' games (additive key).
    let curriculumPoints = [];
    try {
      const [rows] = await db.content.query(
        `SELECT DISTINCT cp.id, cp.category, cp.nerdc_code, cp.nerdc_strand, cp.nerdc_sub_strand
           FROM kids_curriculum_points cp
           JOIN kids_game_configs gc ON JSON_CONTAINS(cp.mapped_item_ids, JSON_QUOTE(gc.item_id))
          WHERE JSON_UNQUOTE(JSON_EXTRACT(gc.config_json, \x27$.series_id\x27)) = :sid`,
        { replacements: { sid: id } }
      );
      curriculumPoints = rows;
    } catch (e) {
      console.error('getSeries curriculumPoints:', e.message);
    }

    return res.json({ success: true, data: { ...series.toJSON(), units, curriculum_points: curriculumPoints } });
  } catch (err) {
    console.error('getSeries error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Unit CRUD ───────────────────────────────────────────────────────────────

/** POST /kids/series/:id/units — create a unit in a series. */
/** E-hardening (f41 follow-up): lesson_ids in content_items that belong to a DIFFERENT series ([] = clean). */
async function findCrossSeriesItems(seriesId, contentItems) {
  const ids = (Array.isArray(contentItems) ? contentItems : [])
    .map((it) => (typeof it === 'string' ? it : it && it.lesson_id))
    .filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.content.query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(gc.config_json,'$.lessonId')) AS lid,
            JSON_UNQUOTE(JSON_EXTRACT(gc.config_json,'$.series_id')) AS sid
       FROM kids_game_configs gc
      WHERE JSON_UNQUOTE(JSON_EXTRACT(gc.config_json,'$.lessonId')) IN (:lids)`,
    { replacements: { lids: ids }, type: db.Sequelize.QueryTypes.SELECT }
  );
  const foreign = new Set(rows.filter((r) => r.sid && r.sid !== seriesId).map((r) => r.lid));
  return [...foreign];
}

async function createUnit(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Only staff can create units.' });
    }

    const { id: seriesId } = req.params;
    const series = await db.KidGameSeries.findByPk(seriesId);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Series not found.' });
    }

    const { unit_number, title, content_items, prerequisite_unit_id } = req.body || {};
    if (unit_number === undefined || !content_items) {
      return res.status(400).json({ success: false, message: 'unit_number and content_items are required.' });
    }

    if (unit_number < 1) {
      return res.status(400).json({ success: false, message: 'unit_number must be >= 1.' });
    }
    if (unit_number > 10) {
      return res.status(400).json({ success: false, message: 'Series are term ladders: max 10 units (one per academic week).' });
    }

    // Validate prerequisite exists in same series
    if (prerequisite_unit_id) {
      const prereq = await db.KidGameUnit.findOne({
        where: { id: prerequisite_unit_id, series_id: seriesId },
      });
      if (!prereq) {
        return res.status(400).json({ success: false, message: 'prerequisite_unit_id must reference a unit in the same series.' });
      }
      // Prerequisite must have a lower unit_number
      if (prereq.unit_number >= unit_number) {
        return res.status(400).json({ success: false, message: 'Prerequisite must have a lower unit_number.' });
      }
    }

    // Check no duplicate unit_number in this series
    const existing = await db.KidGameUnit.findOne({
      where: { series_id: seriesId, unit_number },
    });
    if (existing) {
      return res.status(409).json({ success: false, message: `Unit ${unit_number} already exists in this series.` });
    }

    // Cross-series guard: reject lessons placed in another series (subject-binding invariant)
    const crossNew = await findCrossSeriesItems(seriesId, content_items);
    if (crossNew.length) {
      return res.status(400).json({ success: false, message: `content_items contain lessons from another series: ${crossNew.join(", ")}` });
    }

    const unit = await db.KidGameUnit.create({
      id: uuidv4(),
      series_id: seriesId,
      unit_number,
      title: title || null,
      content_items,
      prerequisite_unit_id: prerequisite_unit_id || null,
    });

    return res.status(201).json({ success: true, data: unit });
  } catch (err) {
    console.error('createUnit error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** PUT /kids/series/:id/units/:unitId — update a unit. */
async function updateUnit(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Only staff can update units.' });
    }

    const { id: seriesId, unitId } = req.params;
    const unit = await db.KidGameUnit.findOne({
      where: { id: unitId, series_id: seriesId },
    });
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found in this series.' });
    }

    const allowed = {};
    const { title, content_items, prerequisite_unit_id } = req.body || {};
    if (title !== undefined) allowed.title = title;
    if (content_items !== undefined) {
      const crossUpd = await findCrossSeriesItems(seriesId, content_items);
      if (crossUpd.length) {
        return res.status(400).json({ success: false, message: `content_items contain lessons from another series: ${crossUpd.join(", ")}` });
      }
      allowed.content_items = content_items;
    }
    if (prerequisite_unit_id !== undefined) {
      if (prerequisite_unit_id) {
        const prereq = await db.KidGameUnit.findOne({
          where: { id: prerequisite_unit_id, series_id: seriesId },
        });
        if (!prereq) {
          return res.status(400).json({ success: false, message: 'prerequisite_unit_id must reference a unit in the same series.' });
        }
        if (prereq.unit_number >= unit.unit_number) {
          return res.status(400).json({ success: false, message: 'Prerequisite must have a lower unit_number.' });
        }
      }
      allowed.prerequisite_unit_id = prerequisite_unit_id || null;
    }

    if (!Object.keys(allowed).length) {
      return res.status(400).json({ success: false, message: 'No updatable fields provided.' });
    }

    await unit.update(allowed);
    return res.json({ success: true, data: unit });
  } catch (err) {
    console.error('updateUnit error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/curriculum (E3) — subject → series → units with per-child done/locked state. */
async function getCurriculum(req, res) {
  try {
    const user = req.user || {};
    const admission = String(user.admission_no || user.id || '');
    if (!admission) {
      return res.status(400).json({ success: false, message: 'Child admission required.' });
    }

    const [seriesRows, unitRows] = await Promise.all([
      db.KidGameSeries.findAll({ order: [['name', 'ASC']] }),
      db.KidGameUnit.findAll({ order: [['unit_number', 'ASC']] }),
    ]);

    const prog = await db.KidProgress.findAll({
      where: { child_admission_no: admission },
      attributes: ['lesson_id', 'mode', 'score'],
    });
    // E3f SUPERVISOR GATE (non-negotiable): a lesson counts as complete ONLY when the
    // child has BOTH a practice completion AND a passed test (score >= 50) on it.
    // Legacy rows (mode NULL from before this gate) never satisfy the pair.
    const lessonState = {};
    for (const r of prog) {
      const st = lessonState[r.lesson_id] || (lessonState[r.lesson_id] = { practice: false, testPass: false });
      if (r.mode === 'practice') st.practice = true;
      if (r.mode === 'test' && Number(r.score) >= 50) st.testPass = true;
    }
    const lessonComplete = (l) => {
      const st = lessonState[l];
      return !!st && st.practice && st.testPass;
    };

    const unitsBySeries = {};
    for (const u of unitRows) (unitsBySeries[u.series_id] = unitsBySeries[u.series_id] || []).push(u);

    const subjects = {};
    for (const s of seriesRows) {
      const list = unitsBySeries[s.id] || [];
      if (!list.length) continue;
      let chainOk = true; // cumulative: any earlier unit unfinished locks everything after
      const unitRowsOut = list.map((u) => {
        const items = Array.isArray(u.content_items) ? u.content_items : [];
        const lids = items.map((it) => it && it.lesson_id).filter(Boolean);
        const completed = lids.filter((l) => lessonComplete(l)).length;
        const done = lids.length > 0 && completed === lids.length;
        const row = {
          id: u.id,
          unit_number: u.unit_number,
          // E3 spec: one unit per academic week — unit N of the series = week N of its term
          week_number: u.unit_number,
          title: u.title || null,
          total_lessons: lids.length,
          completed_lessons: completed,
          done,
          locked: !chainOk,
          // one-tap play: first unfinished game, else the first game (replay)
          next_lesson_id: lids.find((l) => !lessonComplete(l)) || lids[0] || null,
        };
        chainOk = chainOk && done;
        return row;
      });
      const code = s.subject_code || 'GENERAL';
      (subjects[code] = subjects[code] || { subject_code: code, series: [] }).series.push({
        id: s.id,
        name: s.name,
        category: s.category || null,
        term_hint: s.term_hint || null,
        units: unitRowsOut,
      });
    }

    return res.json({ success: true, data: { child_admission_no: admission, subjects: Object.values(subjects) } });
  } catch (err) {
    console.error('getCurriculum error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Lock Status ─────────────────────────────────────────────────────────────

/**
 * GET /kids/units/:id/lock-status?student_id=X
 * Check if a unit is locked for a student.
 * Locked if: prerequisite exists AND student has not completed it.
 */
async function getUnitLockStatus(req, res) {
  try {
    const { id: unitId } = req.params;
    const studentId = req.query.student_id || req.body?.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const unit = await db.KidGameUnit.findByPk(unitId);
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found.' });
    }

    // No prerequisite → always unlocked
    if (!unit.prerequisite_unit_id) {
      return res.json({ success: true, data: { locked: false, reason: null } });
    }

    // Check if student has mastered the prerequisite
    // Look for test attempts with 'pass' result on any item in the prerequisite unit
    const prereqUnit = await db.KidGameUnit.findByPk(unit.prerequisite_unit_id);
    if (!prereqUnit) {
      return res.json({ success: true, data: { locked: false, reason: null } });
    }

    // E3f SUPERVISOR GATE (non-negotiable): every game in the prerequisite unit must be
    // completed in practice AND its test passed (score >= 50) before this unit unlocks.
    const prereqLessonIds = Array.isArray(prereqUnit.content_items)
      ? prereqUnit.content_items.map((ci) => ci && ci.lesson_id).filter(Boolean)
      : [];

    if (prereqLessonIds.length === 0) {
      // Legacy fallback: pre-E3 units carry item-only shapes — keep the historical
      // item-mastery check instead of silently unlocking the next unit.
      const prereqItemIds = Array.isArray(prereqUnit.content_items)
        ? prereqUnit.content_items.map((ci) => (ci && (ci.item_id || ci.id)) || ci).filter(Boolean)
        : [];
      if (prereqItemIds.length === 0) {
        return res.json({ success: true, data: { locked: false, reason: null } });
      }
      const passedLegacy = await db.KidTestAttempt.findOne({
        where: { student_id: studentId, item_id: { [Op.in]: prereqItemIds }, result: 'pass' },
      });
      return res.json({
        success: true,
        data: {
          locked: !passedLegacy,
          reason: passedLegacy ? null : `Finish unit ${prereqUnit.unit_number}: play Practice AND pass the Test for every game first.`,
          prerequisite_unit_id: unit.prerequisite_unit_id,
        },
      });
    }

    const progRows = await db.KidProgress.findAll({
      where: { child_admission_no: studentId, lesson_id: { [Op.in]: prereqLessonIds } },
      attributes: ['lesson_id', 'mode', 'score'],
    });
    const pstate = {};
    for (const r of progRows) {
      const s = pstate[r.lesson_id] || (pstate[r.lesson_id] = { practice: false, testPass: false });
      if (r.mode === 'practice') s.practice = true;
      if (r.mode === 'test' && Number(r.score) >= 50) s.testPass = true;
    }
    const passed = prereqLessonIds.every((l) => {
      const s = pstate[l];
      return !!s && s.practice && s.testPass;
    });

    const locked = !passed;
    return res.json({
      success: true,
      data: {
        locked,
        reason: locked ? `Finish unit ${prereqUnit.unit_number}: play Practice AND pass the Test for every game first.` : null,
        prerequisite_unit_id: unit.prerequisite_unit_id,
      },
    });
  } catch (err) {
    console.error('getUnitLockStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/lessons/:id/suggested-mode?student_id=X
 * Given a lesson ID, find which unit it belongs to and suggest the best mode.
 * - First access to a newly unlocked unit → 'learning'
 * - Has some progress but hasn't tested → 'practice'
 * - Has tested before → null (let student choose)
 */
async function getUnitSuggestedMode(req, res) {
  try {
    const { id: lessonId } = req.params;
    const studentId = req.query.student_id || req.body?.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    // Find which unit contains this lesson by scanning all units' content_items
    const allUnits = await db.KidGameUnit.findAll();
    let matchedUnit = null;

    for (const u of allUnits) {
      const items = Array.isArray(u.content_items) ? u.content_items : [];
      const found = items.some((ci) => {
        const itemId = ci.item_id || ci.id;
        const lessonRef = ci.lesson_id;
        return itemId === lessonId || lessonRef === lessonId;
      });
      if (found) { matchedUnit = u; break; }
    }

    // Not part of any unit → no suggestion
    if (!matchedUnit) {
      return res.json({ success: true, data: { suggested_mode: null, reason: null } });
    }

    // No prerequisite → always unlocked from start — don't force learning
    if (!matchedUnit.prerequisite_unit_id) {
      return res.json({ success: true, data: { suggested_mode: null, reason: null } });
    }

    // Check if the prerequisite is actually passed
    const prereqUnit = await db.KidGameUnit.findByPk(matchedUnit.prerequisite_unit_id);
    if (!prereqUnit) {
      return res.json({ success: true, data: { suggested_mode: null, reason: null } });
    }

    const prereqItemIds = Array.isArray(prereqUnit.content_items)
      ? prereqUnit.content_items.map((ci) => ci.item_id || ci.id).filter(Boolean)
      : [];

    const passed = prereqItemIds.length > 0
      ? await db.KidTestAttempt.findOne({
          where: { student_id: studentId, item_id: { [Op.in]: prereqItemIds }, result: 'pass' },
        })
      : null;

    // Prerequisite not passed → unit still locked, no suggestion
    if (!passed) {
      return res.json({ success: true, data: { suggested_mode: null, reason: null } });
    }

    // Prerequisite IS passed — check if student has any activity in THIS unit
    const thisUnitItemIds = Array.isArray(matchedUnit.content_items)
      ? matchedUnit.content_items.map((ci) => ci.item_id || ci.id).filter(Boolean)
      : [];

    if (thisUnitItemIds.length === 0) {
      return res.json({ success: true, data: { suggested_mode: 'learning', reason: 'New unit unlocked!' } });
    }

    // Check for any test attempts on items in this unit
    const hasTried = await db.KidTestAttempt.findOne({
      where: { student_id: studentId, item_id: { [Op.in]: thisUnitItemIds } },
    });

    if (hasTried) {
      // Already tested → let student choose
      return res.json({ success: true, data: { suggested_mode: null, reason: null } });
    }

    // Check for any practice/learning activity (kid_progress or item responses)
    const hasActivity = await db.KidGameItemResponse.findOne({
      where: { student_id: studentId, item_id: { [Op.in]: thisUnitItemIds } },
    }).catch(() => null);

    if (hasActivity) {
      // Has practiced but not tested → suggest practice
      return res.json({ success: true, data: { suggested_mode: 'practice', reason: 'Keep practicing!' } });
    }

    // No activity at all → this is first access → suggest learning
    return res.json({
      success: true,
      data: { suggested_mode: 'learning', reason: `Great job finishing Unit ${prereqUnit.unit_number}! Let's learn Unit ${matchedUnit.unit_number}.` },
    });
  } catch (err) {
    console.error('getUnitSuggestedMode error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  createSeries,
  listSeries,
  getSeries,
  createUnit,
  updateUnit,
  getUnitLockStatus,
  getUnitSuggestedMode,
};


/** GET /kids/lessons/:id/next-up?student_id=X — FB-10: next lesson in series order. */
async function getLessonNextUp(req, res) {
  try {
    const lessonId = String(req.params.id || '');
    const units = await db.KidGameUnit.findAll({ order: [['series_id', 'ASC'], ['unit_number', 'ASC']] });
    const itemIds = (u) => (Array.isArray(u.content_items) ? u.content_items : [])
      .map((x) => String(x && (x.item_id || x.lesson_id || x)))
      .filter(Boolean);
    let cur = null;
    for (const u of units) {
      if (itemIds(u).includes(lessonId)) { cur = u; break; }
    }
    if (!cur) return res.json({ success: true, data: { next_lesson_id: null, title: null } });
    const siblings = units.filter((u) => u.series_id === cur.series_id);
    const idx = siblings.findIndex((u) => u.id === cur.id);
    const next = siblings[idx + 1];
    if (!next) return res.json({ success: true, data: { next_lesson_id: null, title: null } });
    const nid = itemIds(next)[0] || null;
    return res.json({ success: true, data: { next_lesson_id: nid, title: next.title || null } });
  } catch (err) {
    console.error('getLessonNextUp error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}
module.exports.getLessonNextUp = getLessonNextUp;
module.exports.getCurriculum = getCurriculum;
module.exports.findCrossSeriesItems = findCrossSeriesItems;

/**
 * GET /kids/learning-path?student_id=X — the child's ENTIRE journey in one call
 * (TECH-SPEC-LEARNING-PATH §2.2). Rules enforced server-side:
 *  1. Age ceiling: a lesson above the child's band is NEVER returned (units
 *     containing any published higher-band lesson are omitted entirely).
 *  2. Spill-over: lower-band units the child hasn't finished appear first,
 *     flagged spillover/passed_below — never locked (go back & pass).
 *  3. Unit locks: E3f gate semantics (every lesson of an earlier unit needs
 *     Practice done AND Test >= 50) applied cumulatively through the unit chain.
 *  4. Per-lesson state from KidProgress (none/practice_done/passed).
 * Batched — one KidProgress query, one KidLesson query. No N+1.
 */
async function getLearningPath(req, res) {
  try {
    const studentId = String(req.query.student_id || req.body?.student_id || req.user?.admission_no || '').trim();
    if (!studentId) return res.status(400).json({ success: false, message: 'student_id is required.' });
    if (!(await admissionAllowed(req, studentId))) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this child.' });
    }

    // Band chain: kids_children → age declaration (tour) → SMS students row.
    // SMS-imported kids have no kids_children row; without the fallback the
    // path 400s for them ("games no longer showing" report).
    const child = await db.KidChild.findOne({ where: { admission_no: studentId } });
    const band = await resolveBandForAdmission(studentId);
    if (!band) {
      // Isolate by default: a child with no resolvable band gets no lessons.
      return res.status(400).json({ success: false, message: 'Could not resolve the child\'s age band (class/age_level missing).' });
    }
    const bandIdx = AGE_BANDS.indexOf(band);
    const visible = visibleLevels(band);
    const rankOf = (age) => AGE_BANDS.indexOf(age);

    const [seriesRows, unitRows] = await Promise.all([
      db.KidGameSeries.findAll({ order: [['name', 'ASC']] }),
      db.KidGameUnit.findAll({ order: [['series_id', 'ASC'], ['unit_number', 'ASC']] }),
    ]);

    const prog = await db.KidProgress.findAll({
      where: { child_admission_no: studentId },
      attributes: ['lesson_id', 'mode', 'score'],
    });
    const lessonState = {};
    for (const r of prog) {
      const st = lessonState[r.lesson_id] || (lessonState[r.lesson_id] = { practice: false, testPass: false });
      if (r.mode === 'practice') st.practice = true;
      if (r.mode === 'test' && Number(r.score) >= 50) st.testPass = true;
    }
    const lessonComplete = (l) => {
      const st = lessonState[l];
      return !!st && st.practice && st.testPass;
    };

    const idsOf = (u) => (Array.isArray(u.content_items) ? u.content_items : [])
      .map((ci) => String(ci && (ci.lesson_id || ci.item_id || ci)))
      .filter(Boolean);
    const allIds = [...new Set(unitRows.flatMap(idsOf))];
    const lessonRows = allIds.length
      ? await db.KidLesson.findAll({ where: { id: { [Op.in]: allIds }, content_state: 'published' } })
      : [];
    const lessonById = new Map(lessonRows.map((l) => [String(l.id), l]));

    const unitsBySeries = {};
    for (const u of unitRows) (unitsBySeries[u.series_id] = unitsBySeries[u.series_id] || []).push(u);

    const path = [];
    for (const s of seriesRows) {
      const list = unitsBySeries[s.id] || [];
      if (!list.length) continue;

      const unitOuts = [];
      for (const u of list) {
        const lessonIds = idsOf(u);
        const rows = lessonIds.map((lid) => lessonById.get(lid)).filter(Boolean);
        // 1) Hard ceiling: if ANY published lesson in the unit is above band,
        //    omit the whole unit — its ids must never reach the child.
        if (rows.some((l) => rankOf(l.age_level) > bandIdx)) continue;
        const inVisible = rows.filter((l) => rankOf(l.age_level) <= bandIdx);
        if (!inVisible.length) continue;
        const maxRank = Math.max(...inVisible.map((l) => rankOf(l.age_level)));
        const below = maxRank < bandIdx;
        const done = inVisible.every((l) => lessonComplete(String(l.id)));
        const lessonNodes = lessonIds
          .map((lid) => {
            const row = lessonById.get(lid);
            if (!row || rankOf(row.age_level) > bandIdx) return null;
            const st = lessonState[lid] || {};
            const state = st.testPass ? 'passed' : st.practice ? 'practice_done' : 'none';
            return { lesson_id: lid, title: row.title, age_level: row.age_level, state };
          })
          .filter(Boolean);
        unitOuts.push({ u, below, done, lessonNodes });
      }
      if (!unitOuts.length) continue;

      // Order: below-band units first (recovery), then current-band units.
      // (Number(a.below) - Number(b.below) would sort current-first and break
      // the cumulative E3f chain — below must lead so it can gate the band.)
      unitOuts.sort((a, b) => Number(b.below) - Number(a.below) || a.u.unit_number - b.u.unit_number);

      // 3) Cumulative E3f chain over the ordered unit list: a unit is locked
      //    while any earlier unit is unfinished. passed_below/spillover units
      //    are never locked (always allowed back), but an unfinished below-band
      //    unit still gates the current band ("go back & pass to unlock").
      let chainOk = true;
      const units = unitOuts.map(({ u, below, done, lessonNodes }) => {
        const locked = !done && !chainOk;
        const relation = below ? (done ? 'passed_below' : 'spillover') : 'current';
        const reason = locked
          ? `Finish the previous level: play Practice AND pass the Test first.`
          : below && !done
            ? 'Go back and pass earlier levels to unlock your level.'
            : null;
        chainOk = chainOk && done;
        return {
          unit_id: u.id,
          unit_number: u.unit_number,
          title: u.title || null,
          topic: u.topic || null,
          relation,
          done,
          locked: below ? false : locked,
          locked_reason: below ? null : reason,
          lessons: lessonNodes,
        };
      });

      path.push({ series_id: s.id, name: s.name, category: s.category || null, units });
    }

    const goal = await getCurrentGoalData(studentId);
    return res.json({
      success: true,
      data: {
        student: { age_band: band, class_name: child.class_code || null },
        goal,
        path,
      },
    });
  } catch (err) {
    console.error('getLearningPath error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}
module.exports.getLearningPath = getLearningPath;
