'use strict';
/**
 * Parent↔Child Text Chat — Socket.io controller.
 *
 * Features:
 *   - Real-time text messaging between parents and their children
 *   - Message persistence in kids_chat_messages
 *   - Read receipts (read_at field)
 *   - History endpoint for loading past messages
 *
 * Tables: kids_chat_messages (created in elite_content)
 */
const crypto = require('crypto');
const dbm = () => require('../models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_chat_messages (
    id CHAR(36) NOT NULL PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    from_user_id VARCHAR(50) NOT NULL,
    from_role ENUM('parent','student','teacher') NOT NULL DEFAULT 'parent',
    text TEXT NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_chat_child (child_admission_no, created_at),
    KEY idx_chat_from (from_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

/**
 * Save a chat message to the database.
 */
async function saveMessage({ childAdmissionNo, fromUserId, fromRole, text }) {
  await ensureSchema();
  const id = crypto.randomUUID();
  await dbm().content.query(
    `INSERT INTO kids_chat_messages (id, child_admission_no, from_user_id, from_role, text)
     VALUES (:id, :adm, :uid, :role, :text)`,
    { replacements: { id, adm: childAdmissionNo, uid: fromUserId, role: fromRole, text } }
  );
  return {
    id,
    child_admission_no: childAdmissionNo,
    from_user_id: fromUserId,
    from_role: fromRole,
    text,
    read_at: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * GET /kids/chat/:adm/messages?limit=50&before=MSG_ID
 * Load chat history for a child.
 */
async function getMessages(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const adm = String(req.params.adm || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = String(req.query.before || '').trim();

    if (!adm) {
      return res.status(400).json({ success: false, message: 'admission_no required.' });
    }

    // Verify parent owns this child
    const phone = String(u.phone || '');
    if (u.user_type === 'parent') {
      const [owned] = await dbm().content.query(
        `SELECT id FROM kids_parent_links WHERE parent_phone = :phone AND child_admission_no = :adm LIMIT 1`,
        { replacements: { phone, adm } },
      );
      if (!Array.isArray(owned) || owned.length === 0) {
        return res.status(403).json({ success: false, message: 'Not linked to this child.' });
      }
    }

    let query = `SELECT * FROM kids_chat_messages WHERE child_admission_no = :adm`;
    const params = { adm, limit };

    if (before) {
      query += ` AND created_at < (SELECT created_at FROM kids_chat_messages WHERE id = :before)`;
      params.before = before;
    }

    query += ` ORDER BY created_at DESC LIMIT :limit`;

    const [messages] = await dbm().content.query(query, { replacements: params });
    return res.json({ success: true, data: Array.isArray(messages) ? messages.reverse() : [] });
  } catch (err) {
    console.error('chat getMessages error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/chat/:adm/read — mark all messages as read for a child.
 */
async function markRead(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const adm = String(req.params.adm || '').trim();
    const userId = String(u.id || u.user_id || '');

    if (!adm || !userId) {
      return res.status(400).json({ success: false, message: 'admission_no required.' });
    }

    await dbm().content.query(
      `UPDATE kids_chat_messages SET read_at = NOW()
       WHERE child_admission_no = :adm AND from_user_id != :uid AND read_at IS NULL`,
      { replacements: { adm, uid: userId } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('chat markRead error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/chat/:adm/unread — count unread messages for a child.
 */
async function unreadCount(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const adm = String(req.params.adm || '').trim();
    const userId = String(u.id || u.user_id || '');

    if (!adm) {
      return res.status(400).json({ success: false, message: 'admission_no required.' });
    }

    const [result] = await dbm().content.query(
      `SELECT COUNT(*) AS count FROM kids_chat_messages
       WHERE child_admission_no = :adm AND from_user_id != :uid AND read_at IS NULL`,
      { replacements: { adm, uid: userId } }
    );
    const count = (Array.isArray(result) ? result : [])[0]?.count || 0;
    return res.json({ success: true, data: { count } });
  } catch (err) {
    console.error('chat unreadCount error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  ensureSchema,
  saveMessage,
  getMessages,
  markRead,
  unreadCount,
};
