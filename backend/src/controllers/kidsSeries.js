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

const CATEGORIES = ['Animals', 'Letters', 'Shapes'];

// ── Series CRUD ─────────────────────────────────────────────────────────────

/** POST /kids/series — create a game series (staff only). */
async function createSeries(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Only staff can create series.' });
    }

    const { name, category, description } = req.body || {};
    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'name and category are required.' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: `category must be one of: ${CATEGORIES.join(', ')}` });
    }

    const series = await db.KidGameSeries.create({
      id: uuidv4(),
      name,
      category,
      description: description || null,
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
      if (!CATEGORIES.includes(category)) {
        return res.status(400).json({ success: false, message: `category must be one of: ${CATEGORIES.join(', ')}` });
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

    return res.json({ success: true, data: { ...series.toJSON(), units } });
  } catch (err) {
    console.error('getSeries error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Unit CRUD ───────────────────────────────────────────────────────────────

/** POST /kids/series/:id/units — create a unit in a series. */
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
    if (content_items !== undefined) allowed.content_items = content_items;
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

    // Extract item_ids from prerequisite unit's content_items
    const prereqItemIds = Array.isArray(prereqUnit.content_items)
      ? prereqUnit.content_items.map((ci) => ci.item_id || ci.id).filter(Boolean)
      : [];

    if (prereqItemIds.length === 0) {
      return res.json({ success: true, data: { locked: false, reason: null } });
    }

    // Check mastery: student has at least one pass on any item in the prereq
    const passed = await db.KidTestAttempt.findOne({
      where: {
        student_id: studentId,
        item_id: { [Op.in]: prereqItemIds },
        result: 'pass',
      },
    });

    const locked = !passed;
    return res.json({
      success: true,
      data: {
        locked,
        reason: locked ? `Complete unit ${prereqUnit.unit_number} ("${prereqUnit.title || prereqUnit.id}") first.` : null,
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
