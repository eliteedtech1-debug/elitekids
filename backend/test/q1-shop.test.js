'use strict';

/**
 * Q1 2027 — Shop Service tests.
 *
 * Tests the pure catalog/purchase logic in backend/src/services/shopService.js.
 * No DB required. This service drives GET /kids/economy/shop and
 * POST /kids/economy/shop/buy + /equip via kidsShop.js.
 */

const {
  SHOP_CATEGORIES,
  DEFAULT_ITEMS,
  validatePurchase,
  calculateNewBalance,
  getItem,
  getItemsByCategory,
  getFullCatalog,
} = require('../src/services/shopService');

describe('Shop catalog', () => {
  test('exposes the five defined categories', () => {
    const ids = Object.keys(SHOP_CATEGORIES);
    expect(ids).toEqual(
      expect.arrayContaining([
        'companion_skins',
        'garden_decorations',
        'themes',
        'badge_frames',
        'background_music',
      ])
    );
  });

  test('every default item references a known category', () => {
    for (const item of DEFAULT_ITEMS) {
      expect(SHOP_CATEGORIES[item.category]).toBeDefined();
    }
  });

  test('every default item has a positive integer cost', () => {
    for (const item of DEFAULT_ITEMS) {
      expect(Number.isInteger(item.cost)).toBe(true);
      expect(item.cost).toBeGreaterThan(0);
    }
  });

  test('item ids are unique across the catalog', () => {
    const ids = DEFAULT_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('getItem finds an existing item by id', () => {
    const item = getItem('skin_blue_fox');
    expect(item).not.toBeNull();
    expect(item.cost).toBe(500);
  });

  test('getItem returns null for unknown ids', () => {
    expect(getItem('does_not_exist')).toBeNull();
  });

  test('getItemsByCategory filters to one category', () => {
    const skins = getItemsByCategory('companion_skins');
    expect(skins.length).toBeGreaterThan(0);
    expect(skins.every((i) => i.category === 'companion_skins')).toBe(true);
  });

  test('getFullCatalog returns categories each with items', () => {
    const catalog = getFullCatalog();
    expect(Array.isArray(catalog)).toBe(true);
    for (const cat of catalog) {
      expect(cat.id).toBeDefined();
      expect(Array.isArray(cat.items)).toBe(true);
    }
  });
});

describe('validatePurchase', () => {
  test('allows a purchase the child can afford and does not own', () => {
    expect(validatePurchase(1000, 500, false)).toEqual({ valid: true });
  });

  test('rejects that which the child already owns', () => {
    const r = validatePurchase(5000, 500, true);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/already own/i);
  });

  test('rejects when balance is insufficient', () => {
    const r = validatePurchase(100, 500, false);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Not enough XP/i);
  });

  test('allows purchasing at exactly the cost (no over-required)', () => {
    expect(validatePurchase(500, 500, false)).toEqual({ valid: true });
  });
});

describe('calculateNewBalance', () => {
  test('subtracts cost from balance', () => {
    expect(calculateNewBalance(1000, 300)).toBe(700);
  });

  test('never returns a negative balance', () => {
    expect(calculateNewBalance(100, 500)).toBe(0);
  });
});
