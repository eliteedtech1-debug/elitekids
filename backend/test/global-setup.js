'use strict';

/**
 * Jest globalSetup — runs once before the suite (separate process).
 * Creates + seeds the hermetic test database on the LOCAL MySQL only.
 */
const { ensureTestDb } = require('./helpers/test-db');

module.exports = async () => {
  try {
    const result = await ensureTestDb();
    console.log(`\n✅ Test DB ready: ${result.db}\n`);
  } catch (err) {
    console.error('❌ Test DB setup failed:', err.message);
    throw err;
  }
};
