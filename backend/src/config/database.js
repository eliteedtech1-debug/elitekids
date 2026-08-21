/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Database Connection Configuration (mirrors elite-cbt-api/src/config/database.js)
 *
 * MySQL2 connection pool for the MAIN shared school DB. Addon-owned tables
 * live in elite_content / the AI DB via Sequelize (see src/models/index.js).
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

module.exports = {
  getConnection: () => pool.getConnection(),
  query: (sql, params) => pool.query(sql, params),
  queryOne: async (sql, params) => {
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  },
  close: () => pool.end(),
  pool,
};
