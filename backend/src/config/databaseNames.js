'use strict';

/**
 * Canonical EliteKids database naming contract.
 *
 * Ownership:
 *   DB_NAME       -> EliteSMS shared school database (read-only here)
 *   KIDS_DB_NAME  -> EliteKids-owned database (all kids_* models)
 *   AI_DB_NAME    -> EliteKids AI/audit database
 *
 * Development and test processes are never allowed to resolve a live database
 * name. A configured name such as `elite_kids` is normalized to
 * `elite_kids_test`; an already isolated name is left unchanged.
 */

const TEST_SUFFIX = '_test';
const DEFAULT_DATABASES = Object.freeze({
  DB_NAME: 'elite_db',
  KIDS_DB_NAME: 'elite_kids',
  CONTENT_DB_NAME: 'elite_content', // legacy compatibility only; not the Kids model target
  AI_DB_NAME: 'elite_bot',
});

function shouldIsolateDatabases(env = process.env) {
  return env.NODE_ENV === 'test'
    || env.NODE_ENV === 'development'
    || Boolean(env.JEST_WORKER_ID)
    || env.USE_TEST_DATABASES === 'true';
}

function ensureTestSuffix(value) {
  const name = String(value || '').trim();
  if (!name) return name;
  return name.endsWith(TEST_SUFFIX) ? name : `${name}${TEST_SUFFIX}`;
}

function resolveDatabaseName(value, fallback, env = process.env) {
  const name = String(value || fallback || '').trim();
  return shouldIsolateDatabases(env) ? ensureTestSuffix(name) : name;
}

function resolveDatabaseNames(env = process.env) {
  const effectiveEnv = { ...process.env, ...env };
  return {
    DB_NAME: resolveDatabaseName(effectiveEnv.DB_NAME, DEFAULT_DATABASES.DB_NAME, effectiveEnv),
    KIDS_DB_NAME: resolveDatabaseName(effectiveEnv.KIDS_DB_NAME, DEFAULT_DATABASES.KIDS_DB_NAME, effectiveEnv),
    CONTENT_DB_NAME: resolveDatabaseName(effectiveEnv.CONTENT_DB_NAME, DEFAULT_DATABASES.CONTENT_DB_NAME, effectiveEnv),
    AI_DB_NAME: resolveDatabaseName(effectiveEnv.AI_DB_NAME, DEFAULT_DATABASES.AI_DB_NAME, effectiveEnv),
  };
}

function assertDatabaseName(name, label = 'database') {
  const value = String(name || '').trim();
  if (!value) throw new Error(`${label} must not be empty.`);
  if (shouldIsolateDatabases() && !value.endsWith(TEST_SUFFIX)) {
    throw new Error(`${label} must end with ${TEST_SUFFIX} during development or tests.`);
  }
  return value;
}

function assertResolvedDatabaseNames(names = resolveDatabaseNames()) {
  for (const [label, value] of Object.entries(names)) {
    assertDatabaseName(value, label);
  }
  if (names.DB_NAME === names.KIDS_DB_NAME) {
    throw new Error('DB_NAME and KIDS_DB_NAME must be different databases.');
  }
  return names;
}

module.exports = {
  TEST_SUFFIX,
  DEFAULT_DATABASES,
  shouldIsolateDatabases,
  ensureTestSuffix,
  resolveDatabaseName,
  resolveDatabaseNames,
  assertDatabaseName,
  assertResolvedDatabaseNames,
};
