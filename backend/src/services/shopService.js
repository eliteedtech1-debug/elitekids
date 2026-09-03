'use strict';
/**
 * Shop Service — item catalog, purchases, equipment
 * Pure functions for business logic. DB calls in controllers.
 */

// ─── Shop Categories ───────────────────────────────────────────

const SHOP_CATEGORIES = {
  companion_skins: {
    id: 'companion_skins',
    name: 'Companion Skins',
    description: 'Customize your learning buddy',
  },
  garden_decorations: {
    id: 'garden_decorations',
    name: 'Garden Decorations',
    description: 'Beautify your progress garden',
  },
  themes: {
    id: 'themes',
    name: 'Themes',
    description: 'Change the look of your app',
  },
  badge_frames: {
    id: 'badge_frames',
    name: 'Badge Frames',
    description: 'Frame your achievements',
  },
  background_music: {
    id: 'background_music',
    name: 'Background Music',
    description: 'New tunes for your games',
  },
};

// ─── Default Shop Items ────────────────────────────────────────

const DEFAULT_ITEMS = [
  // Companion Skins
  { id: 'skin_blue_fox', name: 'Blue Fox', description: 'A cool blue variant', category: 'companion_skins', cost: 500, item_type: 'companion_skin', preview_url: '/media/shop/blue_fox.png' },
  { id: 'skin_golden_owl', name: 'Golden Owl', description: 'A wise golden owl', category: 'companion_skins', cost: 500, item_type: 'companion_skin', preview_url: '/media/shop/golden_owl.png' },
  { id: 'skin_rainbow_bunny', name: 'Rainbow Bunny', description: 'A colorful bunny', category: 'companion_skins', cost: 500, item_type: 'companion_skin', preview_url: '/media/shop/rainbow_bunny.png' },

  // Garden Decorations
  { id: 'garden_flower_bed', name: 'Flower Bed', description: 'Pretty flowers for your garden', category: 'garden_decorations', cost: 200, item_type: 'garden_decoration', preview_url: '/media/shop/flower_bed.png' },
  { id: 'garden_fountain', name: 'Fountain', description: 'A peaceful water fountain', category: 'garden_decorations', cost: 400, item_type: 'garden_decoration', preview_url: '/media/shop/fountain.png' },
  { id: 'garden_gazebo', name: 'Gazebo', description: 'A beautiful garden gazebo', category: 'garden_decorations', cost: 800, item_type: 'garden_decoration', preview_url: '/media/shop/gazebo.png' },

  // Themes
  { id: 'theme_ocean', name: 'Ocean Theme', description: 'Dive into the deep blue', category: 'themes', cost: 1500, item_type: 'theme', preview_url: '/media/shop/theme_ocean.png' },
  { id: 'theme_space', name: 'Space Theme', description: 'Explore the cosmos', category: 'themes', cost: 1500, item_type: 'theme', preview_url: '/media/shop/theme_space.png' },
  { id: 'theme_forest', name: 'Forest Theme', description: 'Wander through the woods', category: 'themes', cost: 1500, item_type: 'theme', preview_url: '/media/shop/theme_forest.png' },

  // Badge Frames
  { id: 'frame_silver', name: 'Silver Frame', description: 'Elegant silver frame', category: 'badge_frames', cost: 800, item_type: 'badge_frame', preview_url: '/media/shop/frame_silver.png' },
  { id: 'frame_gold', name: 'Gold Frame', description: 'Prestigious gold frame', category: 'badge_frames', cost: 800, item_type: 'badge_frame', preview_url: '/media/shop/frame_gold.png' },

  // Background Music
  { id: 'music_upbeat', name: 'Upbeat', description: 'Energetic tunes', category: 'background_music', cost: 300, item_type: 'background_music', preview_url: '/media/shop/music_upbeat.png' },
  { id: 'music_calm', name: 'Calm', description: 'Peaceful melodies', category: 'background_music', cost: 300, item_type: 'background_music', preview_url: '/media/shop/music_calm.png' },
];

// ─── Business Logic ────────────────────────────────────────────

/**
 * Validate a purchase attempt.
 * @param {number} balance - current XP balance
 * @param {number} itemCost - cost of the item
 * @param {boolean} alreadyOwned - does the child already own this item
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePurchase(balance, itemCost, alreadyOwned) {
  if (alreadyOwned) {
    return { valid: false, error: 'You already own this item.' };
  }
  if (balance < itemCost) {
    return { valid: false, error: `Not enough XP. You need ${itemCost} XP but have ${balance} XP.` };
  }
  return { valid: true };
}

/**
 * Calculate remaining balance after purchase.
 * @param {number} balance
 * @param {number} cost
 * @returns {number}
 */
function calculateNewBalance(balance, cost) {
  return Math.max(0, balance - cost);
}

/**
 * Get item by ID from catalog.
 * @param {string} itemId
 * @returns {object|null}
 */
function getItem(itemId) {
  return DEFAULT_ITEMS.find(i => i.id === itemId) || null;
}

/**
 * Get all items in a category.
 * @param {string} categoryId
 * @returns {Array}
 */
function getItemsByCategory(categoryId) {
  return DEFAULT_ITEMS.filter(i => i.category === categoryId);
}

/**
 * Get all categories with their items.
 * @returns {Array}
 */
function getFullCatalog() {
  return Object.values(SHOP_CATEGORIES).map(cat => ({
    ...cat,
    items: getItemsByCategory(cat.id),
  }));
}

module.exports = {
  SHOP_CATEGORIES,
  DEFAULT_ITEMS,
  validatePurchase,
  calculateNewBalance,
  getItem,
  getItemsByCategory,
  getFullCatalog,
};
