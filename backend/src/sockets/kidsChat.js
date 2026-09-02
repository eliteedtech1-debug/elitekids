'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../models');

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await db.content.query(`
    CREATE TABLE IF NOT EXISTS kids_chat_messages (
      id VARCHAR(50) NOT NULL PRIMARY KEY,
      child_admission_no VARCHAR(50) NOT NULL,
      from_user_id VARCHAR(50) NOT NULL,
      from_role ENUM('parent','student','teacher') NOT NULL,
      text VARCHAR(2000) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_chat_child (child_admission_no),
      INDEX idx_chat_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tableReady = true;
}

async function saveMessage({ childAdmissionNo, fromUserId, fromRole, text }) {
  await ensureTable();
  const id = uuidv4();
  await db.content.query(
    `INSERT INTO kids_chat_messages (id, child_admission_no, from_user_id, from_role, text)
     VALUES (:id, :childAdmissionNo, :fromUserId, :fromRole, :text)`,
    { replacements: { id, childAdmissionNo, fromUserId, fromRole, text } }
  );
  return { id, child_admission_no: childAdmissionNo, from_user_id: fromUserId, from_role: fromRole, text, created_at: new Date().toISOString() };
}

module.exports = { saveMessage };
