'use strict';
/**
 * Shop — browse, buy, equip items with XP.
 * Endpoints:
 *   GET  /kids/economy/shop          — list categories + items (with owned/equipped state)
 *   POST /kids/economy/shop/buy      — purchase an item
 *   POST /kids/economy/shop/equip    — equip an owned item
 */
const crypto = require('crypto');
const dbm = () => require('../models');
const {
  getFullCatalog,
  getItem,
  validatePurchase,
  calculateNewBalance,
} = require('../services/shopService');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const { content } = dbm();
  await content.query(`CREATE TABLE IF NOT EXISTS kids_shop_items (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    cost INT NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    preview_url VARCHAR(500) NULL,
    metadata JSON,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_shop_category (category),
    KEY idx_shop_active (active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await content.query(`CREATE TABLE IF NOT EXISTS kids_shop_purchases (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    cost INT NOT NULL,
    equipped BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_purchase_child_item (child_admission_no, item_id),
    KEY idx_purchase_child (child_admission_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

function isStudentUser(u) {
  return String(u.user_type || '').toLowerCase() === 'student';
}

async function getPurchases(content, adm) {
  const [rows] = await content.query(
    `SELECT item_id, equipped FROM kids_shop_purchases WHERE child_admission_no = :adm`,
    { replacements: { adm } }
  );
  return (Array.isArray(rows) ? rows : []).map(r => ({
    item_id: r.item_id,
    equipped: !!r.equipped,
  }));
}

// GET /kids/economy/shop
async function getShop(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, code: 'ECO_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');

    await ensureSchema();
    const { content } = dbm();

    // Load DB items (fallback to defaults if table empty)
    let dbItems = [];
    try {
      const [rows] = await content.query(
        `SELECT id, name, description, category, cost, item_type, preview_url FROM kids_shop_items WHERE active = TRUE`
      );
      dbItems = (Array.isArray(rows) ? rows : []).map(r => ({
        id: r.id, name: r.name, description: r.description, category: r.category,
        cost: r.cost, item_type: r.item_type, preview_url: r.preview_url,
      }));
    } catch (e) {
      dbItems = [];
    }

    const catalog = dbItems.length > 0 ? dbItems : getFullCatalog().flatMap(c => c.items);

    const purchases = await getPurchases(content, adm);

    // Balance
    let balance = 0;
    try {
      const [bRows] = await content.query(
        `SELECT xp_total FROM kids_economy WHERE child_admission_no = :adm LIMIT 1`,
        { replacements: { adm } }
      );
      const b = (Array.isArray(bRows) ? bRows : [])[0];
      balance = b ? Number(b.xp_total || 0) : 0;
    } catch (e) { /* non-fatal */ }

    // Group by category
    const categories = {};
    for (const item of catalog) {
      if (!categories[item.category]) {
        categories[item.category] = { id: item.category, name: humanize(item.category), items: [] };
      }
      const purchase = purchases.find(p => p.item_id === item.id);
      categories[item.category].items.push({
        ...item,
        owned: !!purchase,
        equipped: purchase ? purchase.equipped : false,
      });
    }

    return res.json({
      success: true,
      data: {
        categories: Object.values(categories),
        balance,
      },
    });
  } catch (err) {
    console.error('shop get error:', err.message);
    return res.status(500).json({ success: false, code: 'ECO_SERVER_ERROR', message: 'Server error.' });
  }
}

// POST /kids/economy/shop/buy
async function buyItem(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, code: 'ECO_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const { item_id } = req.body || {};

    if (!item_id) {
      return res.status(400).json({ success: false, code: 'ECO_ITEM_REQUIRED', message: 'item_id is required' });
    }

    await ensureSchema();
    const { content } = dbm();

    // Get item (from DB or defaults)
    let item = null;
    try {
      const [rows] = await content.query(
        `SELECT id, name, cost, item_type FROM kids_shop_items WHERE id = :iid AND active = TRUE LIMIT 1`,
        { replacements: { iid: item_id } }
      );
      item = (Array.isArray(rows) ? rows : [])[0] || null;
    } catch (e) {
      item = null;
    }
    if (!item) {
      item = getItem(item_id);
    }
    if (!item) {
      return res.status(404).json({ success: false, code: 'ECO_ITEM_NOT_FOUND', message: 'Item not found in shop' });
    }

    // Check if already owned
    let alreadyOwned = false;
    try {
      const [oRows] = await content.query(
        `SELECT COUNT(*) AS cnt FROM kids_shop_purchases WHERE child_admission_no = :adm AND item_id = :iid`,
        { replacements: { adm, iid: item_id } }
      );
      const o = (Array.isArray(oRows) ? oRows : [])[0];
      alreadyOwned = o ? Number(o.cnt) > 0 : false;
    } catch (e) { /* non-fatal */ }

    // Balance
    let balance = 0;
    try {
      const [bRows] = await content.query(
        `SELECT xp_total FROM kids_economy WHERE child_admission_no = :adm LIMIT 1`,
        { replacements: { adm } }
      );
      const b = (Array.isArray(bRows) ? bRows : [])[0];
      balance = b ? Number(b.xp_total || 0) : 0;
    } catch (e) { /* non-fatal */ }

    // Validate
    const cost = Number(item.cost || 0);
    const validation = validatePurchase(balance, cost, alreadyOwned);
    if (!validation.valid) {
      return res.status(alreadyOwned ? 409 : 400).json({
        success: false,
        code: alreadyOwned ? 'ECO_ITEM_ALREADY_OWNED' : 'ECO_INSUFFICIENT_XP',
        message: validation.error,
        data: { required: cost, available: balance, shortfall: Math.max(0, cost - balance) },
      });
    }

    // Atomically deduct + record purchase
    const newBalance = calculateNewBalance(balance, cost);

    try {
      await content.query(
        `UPDATE kids_economy SET xp_total = :b WHERE child_admission_no = :adm AND xp_total = :old`,
        { replacements: { b: newBalance, adm, old: balance } }
      );
      await content.query(
        `INSERT INTO kids_shop_purchases (child_admission_no, item_id, cost)
         VALUES (:adm, :iid, :cost)`,
        { replacements: { adm, iid: item_id, cost } }
      );
    } catch (e) {
      return res.status(500).json({ success: false, code: 'ECO_PURCHASE_FAILED', message: 'Purchase failed, please retry' });
    }

    // Record transaction
    try {
      await content.query(
        `INSERT INTO kids_economy_transactions (child_admission_no, action, amount, base_amount, context)
         VALUES (:adm, 'shop_purchase', :neg, :neg, :ctx)`,
        {
          replacements: {
            adm,
            neg: -cost,
            ctx: JSON.stringify({ item_id, item_name: item.name }),
          },
        }
      );
    } catch (e) { /* non-fatal */ }

    return res.json({
      success: true,
      data: {
        item_id,
        cost,
        new_balance: newBalance,
        owned_items: [item_id],
      },
    });
  } catch (err) {
    console.error('shop buy error:', err.message);
    return res.status(500).json({ success: false, code: 'ECO_SERVER_ERROR', message: 'Server error.' });
  }
}

// POST /kids/economy/shop/equip
async function equipItem(req, res) {
  try {
    const u = req.user || {};
    if (!isStudentUser(u)) {
      return res.status(403).json({ success: false, code: 'ECO_FORBIDDEN', message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const { item_id } = req.body || {};

    if (!item_id) {
      return res.status(400).json({ success: false, code: 'ECO_ITEM_REQUIRED', message: 'item_id is required' });
    }

    await ensureSchema();
    const { content } = dbm();

    // Check ownership
    const [oRows] = await content.query(
      `SELECT item_id FROM kids_shop_purchases WHERE child_admission_no = :adm AND item_id = :iid LIMIT 1`,
      { replacements: { adm, iid: item_id } }
    );
    const owned = (Array.isArray(oRows) ? oRows : [])[0];
    if (!owned) {
      return res.status(400).json({ success: false, code: 'ECO_ITEM_NOT_OWNED', message: "You don't own this item" });
    }

    // Get category for this item
    let category = 'general';
    try {
      const [iRows] = await content.query(
        `SELECT category, item_type FROM kids_shop_items WHERE id = :iid LIMIT 1`,
        { replacements: { iid: item_id } }
      );
      const i = (Array.isArray(iRows) ? iRows : [])[0];
      if (i) category = i.item_type;
    } catch (e) { /* non-fatal */ }

    // Unequip others in same category
    await content.query(
      `UPDATE kids_shop_purchases p
       JOIN kids_shop_items i ON i.id = p.item_id
       SET p.equipped = FALSE
       WHERE p.child_admission_no = :adm AND i.item_type = :cat`,
      { replacements: { adm, cat: category } }
    ).catch(() => {});

    // Equip this one
    await content.query(
      `UPDATE kids_shop_purchases SET equipped = TRUE WHERE child_admission_no = :adm AND item_id = :iid`,
      { replacements: { adm, iid: item_id } }
    );

    return res.json({
      success: true,
      data: {
        equipped: item_id,
        category,
      },
    });
  } catch (err) {
    console.error('shop equip error:', err.message);
    return res.status(500).json({ success: false, code: 'ECO_SERVER_ERROR', message: 'Server error.' });
  }
}

function humanize(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = {
  getShop,
  buyItem,
  equipItem,
  ensureSchema,
};
