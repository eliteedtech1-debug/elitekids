/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Database Connection Configuration
 *
 * MySQL2 connection pools:
 *   1. `pool`     → main shared school DB (DB_NAME, e.g. elite_db) — users,
 *                   students, teachers, parents, school_setup. READ/use only;
 *                   never create tables here.
 *   2. `kidsPool` → dedicated kids DB (KIDS_DB_NAME, e.g. elite_kids) — kids_*
 *                   content tables (lessons, game configs, scene scripts, …).
 *                   The Sequelize layer (src/models/index.js) binds kids models
 *                   to this DB via `db.content` (aliased to `kidsSequelize`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USERNAME || process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'elite_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

pool.getConnection()
  .then((connection) => {
    console.log('✅ Main DB connected successfully');
    connection.release();
  })
  .catch((err) => {
    console.error('❌ Main DB connection failed:', err.message);
  });

// Dedicated kids-domain DB (KIDS_DB_NAME, e.g. elite_kids) — C1. Raw-SQL
// access for kids tables; mirrors the main pool. Never points at elite_db.
const kidsPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USERNAME || process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.KIDS_DB_NAME || 'elite_kids',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

kidsPool.getConnection()
  .then((connection) => {
    console.log('✅ Kids DB connected successfully');
    connection.release();
  })
  .catch((err) => {
    console.error('❌ Kids DB connection failed:', err.message);
  });

module.exports = {
  getConnection: () => pool.getConnection(),
  query: (sql, params) => pool.query(sql, params),
  queryOne: async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  },
  getKidsConnection: () => kidsPool.getConnection(),
  kidsQuery: (sql, params) => kidsPool.query(sql, params),
  close: () => pool.end(),
  closeKids: () => kidsPool.end(),
  pool,
  kidsPool,
};
