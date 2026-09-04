'use strict';

/**
 * EliteKids Content Marketplace (Q4 §2.13) — teachers publish/share game
 * templates, lesson packs & curriculum resources for free or a price.
 *
 * This slice is deliberately independent of Q3 (all new kids_marketplace_* tables
 * and files, zero overlap with the collaboration work). Payment uses the SAME
 * platform PAYSTACK_SECRET_KEY as the EliteSMS app (one platform key).
 *
 * Access:
 *   - browse/search/review   → any authenticated user
 *   - create/update/delete   → staff (requireStaff)
 *   - purchase               → authenticated user (school/parent)
 */

const crypto = require('crypto');
const db = () => require('../models');
const paystack = require('../services/paystackService');
const monnify = require('../services/monnifyService');

const GATEWAYS = ['paystack', 'monnify'];

let _schemaReady = false;

async function ensureSchema() {
  if (_schemaReady) return;
  const c = db().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_marketplace_listings (
    id CHAR(36) NOT NULL PRIMARY KEY,
    publisher_type ENUM('teacher','school') NOT NULL DEFAULT 'teacher',
    publisher_id VARCHAR(64) NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    category VARCHAR(80) NULL,
    subject_code VARCHAR(50) NULL,
    age_band VARCHAR(30) NULL,
    nerdc_code VARCHAR(30) NULL,
    price_ngn INT NOT NULL DEFAULT 0,
    is_free TINYINT(1) NOT NULL DEFAULT 1,
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    quality_score DECIMAL(4,2) NULL,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    preview_url VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mkt_category (category),
    KEY idx_mkt_subject (subject_code),
    KEY idx_mkt_publisher (publisher_id),
    KEY idx_mkt_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await c.query(`CREATE TABLE IF NOT EXISTS kids_marketplace_purchases (
    id CHAR(36) NOT NULL PRIMARY KEY,
    listing_id CHAR(36) NOT NULL,
    buyer_type ENUM('school','parent','teacher') NOT NULL DEFAULT 'parent',
    buyer_id VARCHAR(64) NOT NULL,
    school_id VARCHAR(20) NULL,
    amount_ngn INT NOT NULL DEFAULT 0,
    reference VARCHAR(100) NOT NULL UNIQUE,
    status ENUM('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
    gateway VARCHAR(20) NOT NULL DEFAULT 'paystack',
    gateway_response JSON NULL,
    purchased_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mkt_pur_listing (listing_id),
    KEY idx_mkt_pur_buyer (buyer_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await c.query(`CREATE TABLE IF NOT EXISTS kids_marketplace_reviews (
    id CHAR(36) NOT NULL PRIMARY KEY,
    listing_id CHAR(36) NOT NULL,
    reviewer_id VARCHAR(64) NOT NULL,
    rating TINYINT NOT NULL,
    comment TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mkt_review (listing_id, reviewer_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  _schemaReady = true;
}

function buyerScopeOf(user) {
  if (!user) return { type: 'parent', id: null };
  if (user.user_type && String(user.user_type).toLowerCase() === 'teacher') return { type: 'teacher', id: String(user.id) };
  if (user.user_type && String(user.user_type).toLowerCase() === 'admin') return { type: 'teacher', id: String(user.id) };
  if (user.user_type && String(user.user_type).toLowerCase() === 'school') return { type: 'school', id: String(user.id) };
  return { type: 'parent', id: String(user.id || '') };
}

/** GET /kids/marketplace/listings — browse/search with filters. */
async function listListings(req, res) {
  try {
    await ensureSchema();
    const {
      category, subject_code, age_band, search, status = 'published',
      is_free, sort = 'newest', page = 1, per_page = 20,
    } = req.query || {};
    const c = db().content;
    const where = ['l.status = :status'];
    const params = { status };
    if (category) { where.push('l.category = :category'); params.category = category; }
    if (subject_code) { where.push('l.subject_code = :subject_code'); params.subject_code = subject_code; }
    if (age_band) { where.push('l.age_band = :age_band'); params.age_band = age_band; }
    if (is_free === '1' || is_free === 'true') where.push('l.is_free = 1');
    if (is_free === '0' || is_free === 'false') where.push('l.is_free = 0');
    if (search) { where.push('(l.title LIKE :q OR l.description LIKE :q OR l.category LIKE :q)'); params.q = `%${search}%`; }

    const orderBy =
      sort === 'oldest' ? 'l.created_at ASC'
      : sort === 'price_low' ? 'l.price_ngn ASC'
      : sort === 'price_high' ? 'l.price_ngn DESC'
      : sort === 'rating' ? 'l.quality_score DESC'
      : 'l.created_at DESC';

    const offset = (Math.max(1, Number(page) || 1) - 1) * (Number(per_page) || 20);
    const list = await c.query(
      `SELECT l.*, COUNT(r.id) AS review_count, COALESCE(ROUND(AVG(r.rating),1),0) AS rating
       FROM kids_marketplace_listings l
       LEFT JOIN kids_marketplace_reviews r ON r.listing_id = l.id
       WHERE ${where.join(' AND ')}
       GROUP BY l.id
       ORDER BY ${orderBy}
       LIMIT ${Number(per_page) || 20} OFFSET ${offset}`,
      { replacements: params, type: c.QueryTypes.SELECT }
    );
    const [ [{ total }] ] = await c.query(
      `SELECT COUNT(*) AS total FROM kids_marketplace_listings l WHERE ${where.join(' AND ')}`,
      { replacements: params }
    );
    return res.json({ success: true, data: list, meta: { total: Number(total || 0), page: Number(page) || 1 } });
  } catch (err) {
    console.error('listListings error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to list marketplace listings.' });
  }
}

/** GET /kids/marketplace/listings/:id — single listing + reviews. */
async function getListing(req, res) {
  try {
    await ensureSchema();
    const c = db().content;
    const [listing] = await c.query(
      `SELECT * FROM kids_marketplace_listings WHERE id = :id LIMIT 1`,
      { replacements: { id: req.params.id }, type: c.QueryTypes.SELECT }
    );
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    const reviews = await c.query(
      `SELECT reviewer_id, rating, comment, created_at FROM kids_marketplace_reviews WHERE listing_id = :id ORDER BY created_at DESC`,
      { replacements: { id: req.params.id }, type: c.QueryTypes.SELECT }
    );
    const [[agg]] = await c.query(
      `SELECT COUNT(*) AS review_count, COALESCE(ROUND(AVG(rating),1),0) AS rating FROM kids_marketplace_reviews WHERE listing_id = :id`,
      { replacements: { id: req.params.id } }
    );
    return res.json({ success: true, data: { ...listing, review_count: Number(agg.review_count || 0), rating: Number(agg.rating || 0), reviews } });
  } catch (err) {
    console.error('getListing error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to get listing.' });
  }
}

/** POST /kids/marketplace/listings — create. */
async function createListing(req, res) {
  try {
    await ensureSchema();
    const { title, description, category, subject_code, age_band, nerdc_code, price_ngn, is_free, preview_url } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, message: 'title is required.' });
    const c = db().content;
    const id = crypto.randomUUID();
    const publisher = buyerScopeOf(req.user);
    await c.query(
      `INSERT INTO kids_marketplace_listings
         (id, publisher_type, publisher_id, title, description, category, subject_code, age_band, nerdc_code, price_ngn, is_free, status, preview_url)
       VALUES
         (:id, :publisher_type, :publisher_id, :title, :description, :category, :subject_code, :age_band, :nerdc_code, :price_ngn, :is_free, :status, :preview_url)`,
      {
        replacements: {
          id, publisher_type: publisher.type, publisher_id: publisher.id, title: String(title).trim(),
          description: description || null, category: category || null, subject_code: subject_code || null,
          age_band: age_band || null, nerdc_code: nerdc_code || null,
          price_ngn: Number(is_free) ? 0 : Number(price_ngn || 0),
          is_free: Number(is_free) ? 1 : 0, status: 'draft', preview_url: preview_url || null,
        },
      }
    );
    return res.status(201).json({ success: true, id, message: 'Listing created (draft).' });
  } catch (err) {
    console.error('createListing error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create listing.' });
  }
}

/** PATCH /kids/marketplace/listings/:id — update own listing. */
async function updateListing(req, res) {
  try {
    await ensureSchema();
    const c = db().content;
    const publisher = buyerScopeOf(req.user);
    const [existing] = await c.query(
      `SELECT * FROM kids_marketplace_listings WHERE id = :id LIMIT 1`,
      { replacements: { id: req.params.id }, type: c.QueryTypes.SELECT }
    );
    if (!existing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (String(existing.publisher_id) !== publisher.id) return res.status(403).json({ success: false, message: 'Not your listing.' });

    const { title, description, category, subject_code, age_band, nerdc_code, price_ngn, is_free, preview_url, status, is_featured } = req.body || {};
    const sets = [];
    const params = { id: req.params.id };
    if (title !== undefined) { sets.push('title = :title'); params.title = String(title).trim(); }
    if (description !== undefined) { sets.push('description = :description'); params.description = description; }
    if (category !== undefined) { sets.push('category = :category'); params.category = category; }
    if (subject_code !== undefined) { sets.push('subject_code = :subject_code'); params.subject_code = subject_code; }
    if (age_band !== undefined) { sets.push('age_band = :age_band'); params.age_band = age_band; }
    if (nerdc_code !== undefined) { sets.push('nerdc_code = :nerdc_code'); params.nerdc_code = nerdc_code; }
    if (is_free !== undefined) { sets.push('is_free = :is_free', 'price_ngn = :price_ngn'); params.is_free = Number(is_free) ? 1 : 0; params.price_ngn = Number(is_free) ? 0 : Number(price_ngn || existing.price_ngn); }
    else if (price_ngn !== undefined) { sets.push('price_ngn = :price_ngn'); params.price_ngn = Number(price_ngn); }
    if (preview_url !== undefined) { sets.push('preview_url = :preview_url'); params.preview_url = preview_url; }
    if (status !== undefined) { sets.push('status = :status'); params.status = status; }
    if (is_featured !== undefined) { sets.push('is_featured = :is_featured'); params.is_featured = Number(is_featured) ? 1 : 0; }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

    await c.query(`UPDATE kids_marketplace_listings SET ${sets.join(', ')} WHERE id = :id`, { replacements: params });
    return res.json({ success: true, message: 'Listing updated.' });
  } catch (err) {
    console.error('updateListing error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update listing.' });
  }
}

/** DELETE /kids/marketplace/listings/:id — archive own listing. */
async function deleteListing(req, res) {
  try {
    await ensureSchema();
    const c = db().content;
    const publisher = buyerScopeOf(req.user);
    const [existing] = await c.query(
      `SELECT * FROM kids_marketplace_listings WHERE id = :id LIMIT 1`,
      { replacements: { id: req.params.id }, type: c.QueryTypes.SELECT }
    );
    if (!existing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    if (String(existing.publisher_id) !== publisher.id) return res.status(403).json({ success: false, message: 'Not your listing.' });
    await c.query(`UPDATE kids_marketplace_listings SET status = 'archived' WHERE id = :id`, { replacements: { id: req.params.id } });
    return res.json({ success: true, message: 'Listing archived.' });
  } catch (err) {
    console.error('deleteListing error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete listing.' });
  }
}

/** POST /kids/marketplace/initiate — start a Paystack purchase (free → direct). */
async function initiatePurchase(req, res) {
  try {
    await ensureSchema();
    const { listing_id, gateway = 'paystack' } = req.body || {};
    if (!listing_id) return res.status(400).json({ success: false, message: 'listing_id is required.' });
    const gw = GATEWAYS.includes(String(gateway).toLowerCase()) ? String(gateway).toLowerCase() : 'paystack';
    const c = db().content;
    const buyer = buyerScopeOf(req.user);
    const school_id = req.user?.school_id || null;

    const [listing] = await c.query(
      `SELECT * FROM kids_marketplace_listings WHERE id = :id AND status = 'published' LIMIT 1`,
      { replacements: { id: listing_id }, type: c.QueryTypes.SELECT }
    );
    if (!listing) return res.status(404).json({ success: false, message: 'Published listing not found.' });

    const [already] = await c.query(
      `SELECT id FROM kids_marketplace_purchases
       WHERE listing_id = :listing_id AND buyer_id = :buyer_id AND status = 'success' LIMIT 1`,
      { replacements: { listing_id, buyer_id: buyer.id }, type: c.QueryTypes.SELECT }
    );
    const purchased = Boolean(already);

    // Free listing → bypass Paystack, mark success instantly.
    if (Number(listing.is_free)) {
      const pid = crypto.randomUUID();
      const ref = `MKT-FREE-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      if (!purchased) {
        await c.query(
          `INSERT INTO kids_marketplace_purchases (id, listing_id, buyer_type, buyer_id, school_id, amount_ngn, reference, status, gateway, purchased_at)
           VALUES (:id, :listing_id, :buyer_type, :buyer_id, :school_id, 0, :reference, 'success', 'free', NOW())`,
          { replacements: { id: pid, listing_id, buyer_type: buyer.type, buyer_id: buyer.id, school_id, reference: ref } }
        );
      }
      return res.json({ success: true, free: true, purchased, listing_id, message: purchased ? 'Already owned.' : 'Claimed (free).' });
    }

    const reference = `MKT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    let checkout;
    if (gw === 'monnify') {
      checkout = await monnify.initializeTransaction({
        amount: Number(listing.price_ngn) * 100,
        paymentReference: reference,
        customerEmail: req.user?.email || req.user?.username || `${buyer.id}@elitekids.com`,
        customerName: req.user?.name || 'EliteKids User',
        paymentDescription: `EliteKids: ${listing.title}`,
        metadata: { kind: 'marketplace', listing_id, buyer_id: buyer.id },
      });
    } else {
      const paymentData = {
        email: req.user?.email || req.user?.username || `${buyer.id}@elitekids.com`,
        amount: Number(listing.price_ngn) * 100,
        reference,
        metadata: { kind: 'marketplace', listing_id, buyer_id: buyer.id },
      };
      checkout = await paystack.initializeTransaction(paymentData);
    }
    if (purchased) {
      return res.json({ success: true, purchased: true, message: 'Already purchased.', listing_id });
    }
    await c.query(
      `INSERT INTO kids_marketplace_purchases (id, listing_id, buyer_type, buyer_id, school_id, amount_ngn, reference, status, gateway)
       VALUES (:id, :listing_id, :buyer_type, :buyer_id, :school_id, :amount, :reference, 'pending', :gateway)`,
      { replacements: { id: crypto.randomUUID(), listing_id, buyer_type: buyer.type, buyer_id: buyer.id, school_id, amount: Number(listing.price_ngn), reference, gateway: gw } }
    );
    // Monnify init-transaction returns checkoutUrl (+ accountNumber for transfer).
    const checkoutUrl = checkout?.checkoutUrl || checkout?.authorization_url;
    return res.status(201).json({ success: true, checkout_url: checkoutUrl, reference, gateway: gw, listing_id });
  } catch (err) {
    console.error('initiatePurchase error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to initiate purchase.' });
  }
}

/** POST /kids/marketplace/purchase/verify — { reference } → activate on success. */
async function verifyPurchase(req, res) {
  try {
    await ensureSchema();
    const { reference } = req.body || {};
    if (!reference) return res.status(400).json({ success: false, message: 'reference is required.' });
    const c = db().content;
    const [purchase] = await c.query(
      `SELECT * FROM kids_marketplace_purchases WHERE reference = :reference LIMIT 1`,
      { replacements: { reference: String(reference) }, type: c.QueryTypes.SELECT }
    );
    if (!purchase) return res.status(404).json({ success: false, message: 'Unknown purchase reference.' });
    if (purchase.status === 'success') return res.json({ success: true, status: 'success', listing_id: purchase.listing_id });

    let txn;
    let paid = false;
    try {
      if (purchase.gateway === 'monnify') {
        const vt = await monnify.verifyTransaction(purchase.reference);
        paid = Boolean(vt && (vt.paymentStatus === 'PAID' || vt.paymentStatus === 'SUCCESS'));
        if (paid) txn = vt;
      } else {
        txn = await paystack.verifyTransaction(purchase.reference);
        paid = Boolean(txn && (txn.status === 'success' || txn.message === 'Verification successful'));
      }
    } catch (err) {
      return res.json({ success: false, status: purchase.status, message: 'Transaction not verified yet.' });
    }
    if (!paid) return res.json({ success: false, status: purchase.status, message: 'Payment not completed.' });

    await c.query(
      `UPDATE kids_marketplace_purchases SET status = 'success', gateway_response = :resp, purchased_at = NOW() WHERE id = :id`,
      { replacements: { resp: JSON.stringify(txn), id: purchase.id } }
    );
    return res.json({ success: true, status: 'success', listing_id: purchase.listing_id });
  } catch (err) {
    console.error('verifyPurchase error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to verify purchase.' });
  }
}

/** Mark a purchase paid given a verified gateway callback reference. */
async function markPaid(reference, detail) {
  const c = db().content;
  const [purchase] = await c.query(
    `SELECT * FROM kids_marketplace_purchases WHERE reference = :reference LIMIT 1`,
    { replacements: { reference: String(reference) }, type: c.QueryTypes.SELECT }
  );
  if (purchase && purchase.status !== 'success') {
    await c.query(
      `UPDATE kids_marketplace_purchases SET status = 'success', gateway_response = :resp, purchased_at = NOW() WHERE id = :id`,
      { replacements: { resp: JSON.stringify(detail), id: purchase.id } }
    );
  }
  return purchase;
}

/** POST /kids/marketplace/webhook — Paystack callback (no user session). */
async function purchaseWebhook(req, res) {
  try {
    await ensureSchema();
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody != null ? req.rawBody : JSON.stringify(req.body || {});
    const ok = await paystack.verifyWebhookSignature(rawBody, signature);
    if (!ok) return res.status(401).json({ status: 'forbidden' });
    const body = req.body || {};
    if (body.event !== 'charge.success') return res.json({ status: 'ignored' });
    const d = body.data || {};
    const reference = d.reference || (d.metadata && d.metadata.reference);
    if (!reference) return res.json({ status: 'ignored', reason: 'no reference' });
    await markPaid(reference, d);
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('purchaseWebhook error:', err.message);
    return res.status(500).json({ status: 'error' });
  }
}

/** POST /kids/marketplace/monnify-webhook — Monnify callback (no user session). */
async function monnifyWebhook(req, res) {
  try {
    await ensureSchema();
    const signature = req.headers['monnify-signature'];
    const rawBody = req.rawBody != null ? req.rawBody : JSON.stringify(req.body || {});
    const ok = await monnify.verifyWebhookSignature(rawBody, signature);
    if (!ok) return res.status(401).json({ status: 'forbidden' });
    const body = req.body || {};
    const eventType = body.eventType || '';
    if (!/SUCCESSFUL|PAID/i.test(eventType) && body.paymentStatus !== 'PAID') {
      return res.json({ status: 'ignored' });
    }
    const d = body.eventData || body || {};
    // Monnify sends the same reference we created (paymentReference).
    const reference = d.paymentReference || d.payment_reference;
    if (!reference) return res.json({ status: 'ignored', reason: 'no reference' });
    const purchase = await markPaid(reference, d);
    return res.json({ status: purchase ? 'ok' : 'not found' });
  } catch (err) {
    console.error('monnifyWebhook error:', err.message);
    return res.status(500).json({ status: 'error' });
  }
}

/** POST /kids/marketplace/review — rate purchased content. */
async function addReview(req, res) {
  try {
    await ensureSchema();
    const { listing_id, rating, comment } = req.body || {};
    if (!listing_id || !rating) return res.status(400).json({ success: false, message: 'listing_id and rating are required.' });
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) return res.status(400).json({ success: false, message: 'rating must be 1-5.' });
    const c = db().content;
    const reviewer = buyerScopeOf(req.user);
    const [owned] = await c.query(
      `SELECT id FROM kids_marketplace_purchases WHERE listing_id = :listing_id AND buyer_id = :buyer_id AND status = 'success' LIMIT 1`,
      { replacements: { listing_id, buyer_id: reviewer.id }, type: c.QueryTypes.SELECT }
    );
    if (!owned) return res.status(403).json({ success: false, message: 'You must purchase before reviewing.' });
    await c.query(
      `INSERT INTO kids_marketplace_reviews (id, listing_id, reviewer_id, rating, comment)
       VALUES (:id, :listing_id, :reviewer_id, :rating, :comment)
       ON DUPLICATE KEY UPDATE rating = :rating, comment = :comment`,
      { replacements: { id: crypto.randomUUID(), listing_id, reviewer_id: reviewer.id, rating: r, comment: comment || null } }
    );
    return res.json({ success: true, message: 'Review saved.' });
  } catch (err) {
    console.error('addReview error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to save review.' });
  }
}

// Seed a few starter listings for the flagship (idempotent).
async function seedMarketplace() {
  try {
    await ensureSchema();
    const c = db().content;
    const [[cnt]] = await c.query(`SELECT COUNT(*) AS total FROM kids_marketplace_listings`);
    if (Number(cnt.total) > 0) return;
    const rows = [
      { title: 'Counting 1-20 Number Quest', category: 'Numbers', subject_code: 'maths', age_band: 'kg', price_ngn: 0, is_free: 1 },
      { title: 'Animal Sounds Pre-Reading Pack', category: 'Literacy', subject_code: 'english', age_band: 'kg', price_ngn: 500, is_free: 0 },
      { title: 'Shapes Sorting Activity Bundle', category: 'Shapes', subject_code: 'maths', age_band: 'nursery', price_ngn: 0, is_free: 1 },
    ];
    for (const r of rows) {
      await c.query(
        `INSERT IGNORE INTO kids_marketplace_listings (id, publisher_type, publisher_id, title, category, subject_code, age_band, price_ngn, is_free, status)
         VALUES (:id, 'school', 'SCH-ELITE', :title, :category, :subject_code, :age_band, :price_ngn, :is_free, 'published')`,
        { replacements: { id: crypto.randomUUID(), ...r } }
      );
    }
    console.log('[kids:marketplace] seeded starter listings');
  } catch (err) {
    console.error('[kids:marketplace] seed error:', err.message);
  }
}

module.exports = {
  listListings,
  getListing,
  createListing,
  updateListing,
  deleteListing,
  initiatePurchase,
  verifyPurchase,
  purchaseWebhook,
  monnifyWebhook,
  addReview,
  seedMarketplace,
};
