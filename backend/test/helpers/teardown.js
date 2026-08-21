'use strict';

/**
 * Closes the Sequelize connections + mysql2 pool so Jest can exit cleanly
 * (the app's module-level connections keep the event loop alive otherwise).
 * Each Jest test file gets its own module registry, so this must run in an
 * afterAll within EVERY test file that imports the app.
 */
const db = require('../../src/models');
const { pool } = require('../../src/config/database');
const { closeRedis } = require('../../src/media/media.queue');
const { closeGenerationQueue } = require('../../src/media/generation.queue');

async function closeConnections() {
  const jobs = [];
  if (db && db.sequelize) jobs.push(db.sequelize.close());
  if (db && db.content) jobs.push(db.content.close());
  if (db && db.ai) jobs.push(db.ai.close());
  if (pool && typeof pool.end === 'function') jobs.push(pool.end());
  jobs.push(closeGenerationQueue());
  jobs.push(closeRedis());

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === 'rejected') console.error('teardown close failed:', r.reason?.message);
  }
}

module.exports = { closeConnections };
