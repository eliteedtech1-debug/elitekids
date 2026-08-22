'use strict';

/**
 * Pedagogy Validator Service
 * 
 * Enforces Doc 13 rules for the Association Ladder (Doc 12):
 * - Rule 1: GDL schema is tier-aware (category, tier, item_id required)
 * - Rule 2: Sequential unlock (Tier N requires Tier N-1 to exist)
 * - Rule 3: Distractor count constraints by tier + mode
 * - Rule 5: Orphan detection (no tier without its prerequisite chain)
 * 
 * This service runs BEFORE the Content State Machine (pre-screen → denylist → approval).
 * See Doc 13: Pedagogy Enforcement Layer — Where This Sits in the Pipeline.
 */

const { Op } = require('sequelize');

// Modality Maps per category (from Doc 12)
const MODALITY_MAPS = {
  Animals: { maxTier: 3 },
  Letters: { maxTier: 3 },
  Shapes: { maxTier: 2 }, // Shapes capped at Tier 2 — no meaningful Tier 3
};

// Distractor constraints by mode (from Doc 12 + Doc 13, Rule 3)
const DISTRACTOR_CONSTRAINTS = {
  learning: { min: 3, max: 3 },      // Locked to 3
  practice: { min: 3, max: 5 },      // Scales 3-5
  test: { min: 3, max: 6 },          // Up to 6, only after Tier 2 in Practice
};

class PedagogyValidator {
  constructor(models) {
    this.models = models;
  }

  /**
   * Validate a GDL document against all pedagogy rules.
   * Returns { valid: boolean, errors: string[] }
   */
  async validate(gdl) {
    const errors = [];

    // Rule 1: Tier-awareness validation
    const rule1Errors = this.validateTierAwareness(gdl);
    errors.push(...rule1Errors);

    // If Rule 1 fails, don't continue (invalid structure)
    if (rule1Errors.length > 0) {
      return { valid: false, errors };
    }

    // Rule 2: Sequential unlock validation
    const rule2Errors = await this.validateSequentialUnlock(gdl);
    errors.push(...rule2Errors);

    // Rule 3: Distractor count validation
    const rule3Errors = this.validateDistractorConstraints(gdl);
    errors.push(...rule3Errors);

    // Rule 5: Orphan detection
    const rule5Errors = await this.validateOrphanDetection(gdl);
    errors.push(...rule5Errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Rule 1: GDL schema is tier-aware, not optional metadata.
   * Every GDL must declare category, tier, item_id.
   * Tier must be valid for the category's Modality Map.
   */
  validateTierAwareness(gdl) {
    const errors = [];

    // Check required fields exist
    if (!gdl.category) {
      errors.push('Rule 1: Missing required field "category"');
    }
    if (gdl.tier === undefined || gdl.tier === null) {
      errors.push('Rule 1: Missing required field "tier"');
    }
    if (!gdl.item_id) {
      errors.push('Rule 1: Missing required field "item_id"');
    }

    // If basic fields are missing, return early
    if (errors.length > 0) {
      return errors;
    }

    // Validate category exists in Modality Maps
    if (!MODALITY_MAPS[gdl.category]) {
      errors.push(`Rule 1: Invalid category "${gdl.category}". Valid categories: ${Object.keys(MODALITY_MAPS).join(', ')}`);
      return errors;
    }

    // Validate tier is within range for this category
    const maxTier = MODALITY_MAPS[gdl.category].maxTier;
    if (gdl.tier < 0 || gdl.tier > maxTier) {
      errors.push(`Rule 1: Tier ${gdl.tier} is invalid for category "${gdl.category}". Max tier for this category: ${maxTier}`);
    }

    return errors;
  }

  /**
   * Rule 2: Sequential unlock.
   * A Tier N game for a given item_id cannot be authored/published unless
   * a Tier N-1 game for that same item_id already exists.
   * Tier 0 has no prerequisite.
   */
  async validateSequentialUnlock(gdl) {
    const errors = [];

    // Tier 0 has no prerequisite
    if (gdl.tier === 0) {
      return errors;
    }

    // Check if Tier N-1 exists for this item_id
    const previousTier = gdl.tier - 1;
    
    try {
      const { KidGameConfig } = this.models;
      
      const previousTierExists = await KidGameConfig.findOne({
        where: {
          item_id: gdl.item_id,
          tier: previousTier,
          content_state: {
            [Op.in]: ['published', 'pending_human_review', 'approved'],
          },
        },
      });

      if (!previousTierExists) {
        errors.push(`Rule 2: Tier ${gdl.tier} requires Tier ${previousTier} to exist for item "${gdl.item_id}" before it can be authored`);
      }
    } catch (error) {
      errors.push(`Rule 2: Database error checking sequential unlock: ${error.message}`);
    }

    return errors;
  }

  /**
   * Rule 3: Distractor count is constrained by tier + mode, not freely set.
   */
  validateDistractorConstraints(gdl) {
    const errors = [];

    // Extract mode from GDL (check if it's a test/practice/learning mode)
    const mode = this.extractMode(gdl);
    if (!mode) {
      // If no mode specified, skip this validation (will be set later)
      return errors;
    }

    const constraints = DISTRACTOR_CONSTRAINTS[mode];
    if (!constraints) {
      errors.push(`Rule 3: Invalid mode "${mode}". Valid modes: learning, practice, test`);
      return errors;
    }

    // Count distractors in the GDL
    const distractorCount = this.countDistractors(gdl);

    if (distractorCount < constraints.min || distractorCount > constraints.max) {
      errors.push(`Rule 3: Distractor count ${distractorCount} is invalid for mode "${mode}". Allowed range: ${constraints.min}-${constraints.max}`);
    }

    // Rule 3 additional: Test mode only available once Tier 2 minimum is completed in Practice
    if (mode === 'test' && gdl.tier < 2) {
      errors.push(`Rule 3: Test mode is only available once Tier 2 minimum has been completed in Practice for this item`);
    }

    return errors;
  }

  /**
   * Rule 5: Orphan detection.
   * Before publish, check that no higher tier exists without its full chain
   * of prerequisite tiers beneath it.
   */
  async validateOrphanDetection(gdl) {
    const errors = [];

    // Only run orphan detection for publish-ready content
    if (gdl.content_state !== 'published' && gdl.content_state !== 'approved') {
      return errors;
    }

    try {
      const { KidGameConfig } = this.models;

      // Get all tiers for this item_id
      const allTiers = await KidGameConfig.findAll({
        where: {
          item_id: gdl.item_id,
          content_state: {
            [Op.in]: ['published', 'pending_human_review', 'approved'],
          },
        },
        attributes: ['tier'],
        order: [['tier', 'ASC']],
      });

      const existingTiers = allTiers.map(t => t.tier);

      // Check for gaps in the tier chain
      for (let i = 1; i <= Math.max(...existingTiers, gdl.tier); i++) {
        if (!existingTiers.includes(i) && i <= gdl.tier) {
          errors.push(`Rule 5: Orphan detected — Tier ${i} is missing for item "${gdl.item_id}". All tiers must form a complete chain from 0 to the highest tier`);
          break;
        }
      }
    } catch (error) {
      errors.push(`Rule 5: Database error checking orphan detection: ${error.message}`);
    }

    return errors;
  }

  /**
   * Extract mode from GDL structure.
   * Mode is typically determined by the game template and configuration.
   */
  extractMode(gdl) {
    // Check if mode is explicitly set
    if (gdl.mode) {
      return gdl.mode;
    }

    // Infer mode from GDL structure
    // Learning mode: no timer, full guidance
    // Practice mode: correct/incorrect shown
    // Test mode: timer on, no visual feedback
    
    if (gdl.durationTargetSec && gdl.durationTargetSec > 0) {
      // Has a timer — likely Test mode
      return 'test';
    }

    if (gdl.showFeedback === false) {
      // No visual feedback — Test mode
      return 'test';
    }

    if (gdl.showFeedback === true) {
      // Shows correct/incorrect — Practice mode
      return 'practice';
    }

    // Default to Learning mode
    return 'learning';
  }

  /**
   * Count distractors in the GDL.
   */
  countDistractors(gdl) {
    // For matching/memory-pairs games: items minus the correct match
    if (gdl.template === 'matching' && gdl.assets && gdl.assets.items) {
      return gdl.assets.items.length;
    }

    if (gdl.template === 'memory-pairs' && gdl.assets && gdl.assets.items) {
      return gdl.assets.items.length;
    }

    // For tap-recognition: objects minus the correct one
    if (gdl.template === 'tap-recognition' && gdl.assets && gdl.assets.objects) {
      return gdl.assets.objects.length;
    }

    // For drag-sort: items (each goes to a bucket)
    if (gdl.template === 'drag-sort' && gdl.assets && gdl.assets.items) {
      return gdl.assets.items.length;
    }

    // For quiz: options per question
    if (gdl.template === 'quiz' && gdl.questions && gdl.questions.length > 0) {
      return gdl.questions[0].options ? gdl.questions[0].options.length : 0;
    }

    return 0;
  }

  /**
   * Validate a full tier ladder for an item.
   * Returns all tiers that should exist for this item.
   */
  async validateTierLadder(item_id, category) {
    const errors = [];
    const maxTier = MODALITY_MAPS[category] ? MODALITY_MAPS[category].maxTier : 3;

    try {
      const { KidGameConfig } = this.models;

      // Get all existing tiers for this item
      const existingTiers = await KidGameConfig.findAll({
        where: {
          item_id,
          content_state: {
            [Op.in]: ['published', 'pending_human_review', 'approved'],
          },
        },
        attributes: ['tier'],
        order: [['tier', 'ASC']],
      });

      const tierList = existingTiers.map(t => t.tier);

      // Check for gaps
      for (let i = 0; i <= maxTier; i++) {
        if (!tierList.includes(i)) {
          errors.push(`Tier ${i} is missing for item "${item_id}" in category "${category}"`);
        }
      }

      // Check for orphans (higher tiers without prerequisites)
      for (const tier of tierList) {
        if (tier > 0 && !tierList.includes(tier - 1)) {
          errors.push(`Orphan: Tier ${tier} exists without Tier ${tier - 1} for item "${item_id}"`);
        }
      }
    } catch (error) {
      errors.push(`Database error validating tier ladder: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      existingTiers: await this.getExistingTiers(item_id),
    };
  }

  /**
   * Get all existing tiers for an item.
   */
  async getExistingTiers(item_id) {
    try {
      const { KidGameConfig } = this.models;

      const tiers = await KidGameConfig.findAll({
        where: {
          item_id,
          content_state: {
            [Op.in]: ['published', 'pending_human_review', 'approved'],
          },
        },
        attributes: ['tier', 'template', 'content_state'],
        order: [['tier', 'ASC']],
      });

      return tiers.map(t => ({
        tier: t.tier,
        template: t.template,
        state: t.content_state,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get the next required tier for an item.
   * Returns null if the ladder is complete.
   */
  async getNextRequiredTier(item_id, category) {
    const maxTier = MODALITY_MAPS[category] ? MODALITY_MAPS[category].maxTier : 3;

    try {
      const { KidGameConfig } = this.models;

      // Get the highest existing tier
      const highestTier = await KidGameConfig.findOne({
        where: {
          item_id,
          content_state: {
            [Op.in]: ['published', 'pending_human_review', 'approved'],
          },
        },
        attributes: ['tier'],
        order: [['tier', 'DESC']],
      });

      const currentHighest = highestTier ? highestTier.tier : -1;

      // If we haven't reached the max tier, return the next one
      if (currentHighest < maxTier) {
        return currentHighest + 1;
      }

      return null; // Ladder is complete
    } catch (error) {
      return null;
    }
  }
}

module.exports = PedagogyValidator;
