/**
 * Garden & Companion controller — Doc 17: Engagement & Accessibility Layer.
 *
 * Garden Progress Metaphor:
 *   - Each mastered item/tier plants/grows something
 *   - Wired to real progress loops (not decorative)
 *   - Never regresses (only grows or stays)
 *
 * Companion Character:
 *   - One per child (chosen at first login)
 *   - Reacts to real events (celebrates, encourages)
 *   - Customization via existing emoji/sticker system
 *
 * Endpoints:
 *   GET  /kids/garden              — get garden state for a student
 *   POST /kids/garden/initialize   — initialize garden for a student
 *   POST /kids/garden/grow         — add a garden element (triggered by mastery)
 *   GET  /kids/companion           — get companion state for a student
 *   POST /kids/companion/choose    — choose companion for a student
 *   POST /kids/companion/customize — update companion customization
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const { requireChildOwnership } = require('../services/routesHelper');

const COMPANION_TYPES = ['fox', 'owl', 'bunny', 'bear', 'cat'];

/**
 * GET /kids/garden?student_id=X
 * Get garden state for a student.
 */
async function getGarden(req, res) {
  try {
    const studentId = req.query.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    let garden = await db.KidGardenState.findOne({ where: { student_id: studentId } });
    if (!garden) {
      // Auto-initialize if not found
      garden = await db.KidGardenState.create({
        id: uuidv4(),
        student_id: studentId,
        garden_elements: [
          { type: 'plot', label: 'My Garden', planted: true, position: { row: 0, col: 0 } },
        ],
      });
    }

    return res.json({ success: true, data: garden });
  } catch (err) {
    console.error('getGarden error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/garden/initialize — initialize garden for a student (idempotent).
 */
async function initializeGarden(req, res) {
  try {
    const studentId = req.body?.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    const existing = await db.KidGardenState.findOne({ where: { student_id: studentId } });
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Garden already initialized.' });
    }

    const garden = await db.KidGardenState.create({
      id: uuidv4(),
      student_id: studentId,
      garden_elements: [
        { type: 'plot', label: 'My Garden', planted: true, position: { row: 0, col: 0 } },
      ],
    });

    return res.status(201).json({ success: true, data: garden });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const existing = await db.KidGardenState.findOne({ where: { student_id: req.body?.student_id } });
      return res.json({ success: true, data: existing, message: 'Garden already initialized.' });
    }
    console.error('initializeGarden error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/garden/grow — add a garden element when an item is mastered.
 *
 * Body:
 *   student_id, item_id, category, tier
 *
 * Garden elements are only added or upgraded — never removed (Doc 17: never regresses).
 */
async function addGardenElement(req, res) {
  try {
    const { student_id, item_id, category, tier } = req.body || {};
    if (!student_id || !item_id || !category || tier === undefined) {
      return res.status(400).json({
        success: false,
        message: 'student_id, item_id, category, and tier are required.',
      });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    let garden = await db.KidGardenState.findOne({ where: { student_id } });
    if (!garden) {
      garden = await db.KidGardenState.create({
        id: uuidv4(),
        student_id,
        garden_elements: [
          { type: 'plot', label: 'My Garden', planted: true, position: { row: 0, col: 0 } },
        ],
      });
    }

    const rawElements = garden.garden_elements;
    const elements = Array.isArray(rawElements)
      ? rawElements.map((element) => ({ ...element }))
      : [];

    // Check if this item already has a garden element
    const existingIdx = elements.findIndex((e) => e.item_id === item_id);

    // Map category to garden element type
    const elementType = {
      Animals: 'flower',
      Letters: 'tree',
      Shapes: 'crystal',
    }[category] || 'plant';

    // Tier determines the growth stage
    const stageNames = ['seed', 'sprout', 'bloom', 'full'];
    const requestedTier = Math.max(0, Math.min(Number(tier), stageNames.length - 1));

    if (existingIdx >= 0) {
      // Upgrade: only grow, never regress. Older rows may have a stale or
      // missing tier, so derive the durable level from both persisted fields.
      const existing = elements[existingIdx];
      const currentStage = Math.max(0, stageNames.indexOf(existing.stage || 'seed'));
      const persistedTier = Number(existing.tier);
      const currentTier = Number.isFinite(persistedTier)
        ? Math.max(persistedTier, currentStage)
        : currentStage;
      const nextTier = Math.max(currentTier, requestedTier);

      // Normalize stage and tier together even when the request is lower. This
      // repairs legacy inconsistent JSON and makes the monotonic invariant
      // durable across requests, not just within one Sequelize instance.
      if (existing.stage !== stageNames[nextTier] || Number(existing.tier) !== nextTier) {
        elements[existingIdx] = {
          ...existing,
          stage: stageNames[nextTier],
          tier: nextTier,
          ...(nextTier > currentTier ? { upgraded_at: new Date().toISOString() } : {}),
        };
      }
    } else {
      // New element
      elements.push({
        item_id,
        category,
        type: elementType,
        stage: stageNames[requestedTier],
        tier: requestedTier,
        planted_at: new Date().toISOString(),
      });
    }

    // Clone on write: updating with the same (mutated) array reference can be
    // treated as unchanged by Sequelize and silently skip the JSON column.
    await garden.update({ garden_elements: elements });

    return res.json({ success: true, data: garden });
  } catch (err) {
    console.error('addGardenElement error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/companion?student_id=X
 * Get companion state for a student.
 */
async function getCompanion(req, res) {
  try {
    const studentId = req.query.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    const companion = await db.KidCompanionState.findOne({ where: { student_id: studentId } });
    if (!companion) {
      return res.json({ success: true, data: null, message: 'No companion chosen yet.' });
    }

    return res.json({ success: true, data: companion });
  } catch (err) {
    console.error('getCompanion error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/companion/choose — choose a companion for a student.
 *
 * Body:
 *   student_id, companion_type ('fox'|'owl'|'bunny'|'bear'|'cat')
 */
async function chooseCompanion(req, res) {
  try {
    const { student_id, companion_type } = req.body || {};
    if (!student_id || !companion_type) {
      return res.status(400).json({ success: false, message: 'student_id and companion_type are required.' });
    }
    if (!COMPANION_TYPES.includes(companion_type)) {
      return res.status(400).json({
        success: false,
        message: `companion_type must be one of: ${COMPANION_TYPES.join(', ')}`,
      });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    // Idempotent: if already chosen, return existing
    const existing = await db.KidCompanionState.findOne({ where: { student_id } });
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Companion already chosen.' });
    }

    const companion = await db.KidCompanionState.create({
      id: uuidv4(),
      student_id,
      companion_type,
      customization: { expression: 'happy', accessory: null },
    });

    return res.status(201).json({ success: true, data: companion });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const existing = await db.KidCompanionState.findOne({ where: { student_id: req.body?.student_id } });
      return res.json({ success: true, data: existing, message: 'Companion already chosen.' });
    }
    console.error('chooseCompanion error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/companion/customize — update companion customization.
 *
 * Body:
 *   student_id, expression (optional), accessory (optional)
 */
async function customizeCompanion(req, res) {
  try {
    const { student_id, expression, accessory } = req.body || {};
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    const companion = await db.KidCompanionState.findOne({ where: { student_id } });
    if (!companion) {
      return res.status(404).json({ success: false, message: 'No companion chosen yet. Choose one first.' });
    }

    const customization = { ...companion.customization };
    if (expression !== undefined) customization.expression = expression;
    if (accessory !== undefined) customization.accessory = accessory;

    await companion.update({ customization });

    return res.json({ success: true, data: companion });
  } catch (err) {
    console.error('customizeCompanion error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getGarden,
  initializeGarden,
  addGardenElement,
  getCompanion,
  chooseCompanion,
  customizeCompanion,
};
