/**
 * Curriculum Mapping, Library & Teacher Customization controller — Doc 15.
 *
 * Curriculum Mapping:
 *   - Browse by curriculum point or category
 *   - Assign directly (no generation needed)
 *   - ECE review workflow
 *
 * Library Browsing:
 *   - Select "KG1 → Animals → recognizes common domestic animals"
 *   - Get full validated tier ladder ready to assign
 *   - No authoring required for standard curriculum
 *
 * Teacher Customization:
 *   1. Customize library game — creates class-scoped copy (structural rules locked)
 *   2. Request custom game — original AI generation flow (passes Pedagogy Validator)
 *
 * Endpoints:
 *   GET  /kids/curriculum                    — list curriculum points (filtered by age_band/category)
 *   GET  /kids/curriculum/:id                — get one curriculum point with mapped games
 *   GET  /kids/library                       — list validated library games (filtered)
 *   GET  /kids/library/:id                   — get one library game with tier ladder
 *   POST /kids/library/assign                — assign a library game to a class
 *   POST /kids/library/customize             — create a class-scoped customization
 *   GET  /kids/variants?class_id=X           — list customizations for a class
 */
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');

const AGE_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];

// ── Curriculum Mapping ──────────────────────────────────────────────────────

/**
 * GET /kids/curriculum?age_band=X&category=Y
 * List curriculum points, optionally filtered.
 */
async function listCurriculumPoints(req, res) {
  try {
    const { age_band, category } = req.query;
    const where = {};
    if (age_band) {
      if (!AGE_BANDS.includes(age_band)) {
        return res.status(400).json({ success: false, message: `age_band must be one of: ${AGE_BANDS.join(', ')}` });
      }
      where.age_band = age_band;
    }
    if (category) where.category = category;

    const points = await db.KidCurriculumPoint.findAll({ where, order: [['age_band', 'ASC'], ['category', 'ASC']] });

    // Enrich with mapped game count
    const enriched = [];
    for (const p of points) {
      const itemIds = Array.isArray(p.mapped_item_ids) ? p.mapped_item_ids : [];
      const gameCount = itemIds.length
        ? await db.KidGameConfig.count({
            where: { item_id: { [Op.in]: itemIds }, content_state: 'published' },
          })
        : 0;
      enriched.push({ ...p.toJSON(), published_game_count: gameCount });
    }

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('listCurriculumPoints error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/curriculum/:id — get one curriculum point with its mapped games.
 */
async function getCurriculumPoint(req, res) {
  try {
    const { id } = req.params;
    const point = await db.KidCurriculumPoint.findByPk(id);
    if (!point) {
      return res.status(404).json({ success: false, message: 'Curriculum point not found.' });
    }

    // Get mapped games
    const itemIds = Array.isArray(point.mapped_item_ids) ? point.mapped_item_ids : [];
    const games = itemIds.length
      ? await db.KidGameConfig.findAll({
          where: { item_id: { [Op.in]: itemIds }, content_state: 'published' },
          order: [['tier', 'ASC']],
        })
      : [];

    // Get library games for these items
    const gameIds = games.map((g) => g.id);
    const libraryGames = gameIds.length
      ? await db.KidLibraryGame.findAll({
          where: { game_config_id: { [Op.in]: gameIds } },
        })
      : [];

    return res.json({
      success: true,
      data: {
        ...point.toJSON(),
        games,
        library_games: libraryGames,
      },
    });
  } catch (err) {
    console.error('getCurriculumPoint error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Library Browsing ────────────────────────────────────────────────────────

/**
 * GET /kids/library?category=X&validated=true
 * List validated library games.
 */
async function listLibraryGames(req, res) {
  try {
    const { category, validated, curriculum_point_id } = req.query;
    const where = {};
    if (validated === 'true') where.ece_validated = true;
    if (curriculum_point_id) where.curriculum_point_id = curriculum_point_id;

    const libraryGames = await db.KidLibraryGame.findAll({ where, order: [['createdAt', 'DESC']] });

    // Enrich with game config details
    const enriched = [];
    for (const lg of libraryGames) {
      const config = await db.KidGameConfig.findByPk(lg.game_config_id);
      if (config && (!category || config.category === category)) {
        enriched.push({
          ...lg.toJSON(),
          game_config: config.toJSON(),
        });
      }
    }

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('listLibraryGames error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/library/:id — get one library game with its full tier ladder.
 */
async function getLibraryGame(req, res) {
  try {
    const { id } = req.params;
    const libraryGame = await db.KidLibraryGame.findByPk(id);
    if (!libraryGame) {
      return res.status(404).json({ success: false, message: 'Library game not found.' });
    }

    const config = await db.KidGameConfig.findByPk(libraryGame.game_config_id);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Game config not found.' });
    }

    // Get the full tier ladder for this item
    const tierLadder = config.item_id
      ? await db.KidGameConfig.findAll({
          where: {
            item_id: config.item_id,
            content_state: 'published',
          },
          order: [['tier', 'ASC']],
        })
      : [];

    // Get curriculum point if linked
    let curriculumPoint = null;
    if (libraryGame.curriculum_point_id) {
      curriculumPoint = await db.KidCurriculumPoint.findByPk(libraryGame.curriculum_point_id);
    }

    return res.json({
      success: true,
      data: {
        ...libraryGame.toJSON(),
        game_config: config.toJSON(),
        tier_ladder: tierLadder.map((t) => ({
          tier: t.tier,
          template: t.template,
          id: t.id,
          item_id: t.item_id,
        })),
        curriculum_point: curriculumPoint ? curriculumPoint.toJSON() : null,
      },
    });
  } catch (err) {
    console.error('getLibraryGame error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Assignment ──────────────────────────────────────────────────────────────

/**
 * POST /kids/library/assign — assign a library game to a class.
 *
 * Body:
 *   library_game_id, class_id
 *
 * Creates a class_game_variant that references the library game (no copy needed for assignment).
 */
async function assignLibraryGame(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Only staff can assign library games.' });
    }

    const { library_game_id, class_id } = req.body || {};
    if (!library_game_id || !class_id) {
      return res.status(400).json({ success: false, message: 'library_game_id and class_id are required.' });
    }

    const libraryGame = await db.KidLibraryGame.findByPk(library_game_id);
    if (!libraryGame) {
      return res.status(404).json({ success: false, message: 'Library game not found.' });
    }

    // Create a variant that references the library game (assignment, not customization)
    const variant = await db.KidClassGameVariant.create({
      id: uuidv4(),
      library_game_id,
      teacher_id: String(user.id || user.user_id || ''),
      class_id,
      customizations: { assigned: true, customizations: {} }, // no structural changes
    });

    return res.status(201).json({ success: true, data: variant });
  } catch (err) {
    console.error('assignLibraryGame error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Teacher Customization ───────────────────────────────────────────────────

/**
 * POST /kids/library/customize — create a class-scoped customization.
 *
 * Body:
 *   library_game_id, class_id, customizations
 *
 * Structural rules are locked (tier, item_id, distractor counts).
 * Surface content is customizable (images, labels, prompts, rewards).
 */
async function customizeLibraryGame(req, res) {
  try {
    const user = req.user;
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin')) {
      return res.status(403).json({ success: false, message: 'Only staff can customize library games.' });
    }

    const { library_game_id, class_id, customizations } = req.body || {};
    if (!library_game_id || !class_id || !customizations) {
      return res.status(400).json({
        success: false,
        message: 'library_game_id, class_id, and customizations are required.',
      });
    }

    const libraryGame = await db.KidLibraryGame.findByPk(library_game_id);
    if (!libraryGame) {
      return res.status(404).json({ success: false, message: 'Library game not found.' });
    }

    // Validate that customizations don't touch locked structural fields
    const LOCKED_FIELDS = ['item_id', 'tier', 'category', 'template', 'successThresholdPct'];
    const locked = Object.keys(customizations).filter((k) => LOCKED_FIELDS.includes(k));
    if (locked.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot customize locked structural fields: ${locked.join(', ')}`,
      });
    }

    const variant = await db.KidClassGameVariant.create({
      id: uuidv4(),
      library_game_id,
      teacher_id: String(user.id || user.user_id || ''),
      class_id,
      customizations,
    });

    return res.status(201).json({ success: true, data: variant });
  } catch (err) {
    console.error('customizeLibraryGame error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/variants?class_id=X — list customizations for a class.
 */
async function listClassVariants(req, res) {
  try {
    const { class_id } = req.query;
    if (!class_id) {
      return res.status(400).json({ success: false, message: 'class_id is required.' });
    }

    const variants = await db.KidClassGameVariant.findAll({
      where: { class_id },
      order: [['createdAt', 'DESC']],
    });

    // Enrich with library game + config details
    const enriched = [];
    for (const v of variants) {
      let libraryGame = null;
      let gameConfig = null;
      if (v.library_game_id) {
        libraryGame = await db.KidLibraryGame.findByPk(v.library_game_id);
        if (libraryGame) {
          gameConfig = await db.KidGameConfig.findByPk(libraryGame.game_config_id);
        }
      }
      enriched.push({
        ...v.toJSON(),
        library_game: libraryGame ? libraryGame.toJSON() : null,
        game_config: gameConfig ? gameConfig.toJSON() : null,
      });
    }

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('listClassVariants error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  listCurriculumPoints,
  getCurriculumPoint,
  listLibraryGames,
  getLibraryGame,
  assignLibraryGame,
  customizeLibraryGame,
  listClassVariants,
};
