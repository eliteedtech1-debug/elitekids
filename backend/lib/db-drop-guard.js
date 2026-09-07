'use strict';

/**
 * db-drop-guard — shared production-safety guard for anything that can
 * DROP / TRUNCATE / DELETE in the elite-kids tree.
 *
 * Rule: a destructive statement is only allowed when the target database name
 * ends in _test (throwaway test DB) OR the caller has explicitly opted in via
 * an allowlist for that specific operation. Production DB names are never
 * eligible, even with an allowlist on DROP DATABASE / TRUNCATE.
 *
 * This is the single place the project should route destructive ops through, so
 * a stray env line (e.g. DB_NAME=elite_db on a script that drops tables) cannot
 * silently hit prod.
 */

const PROD_DB_NAMES = new Set([
  'elite_db',
  'elite_content',
  'elite_kids',
  'elite_bot',
  'elite_ai',
]);

/**
 * Normalize a database name for guard checks. Undefined/empty strings are treated
 * as unsafe and will be rejected early by the caller if it cannot proceed safely.
 */
function normalizeDbName(raw) {
  return String(raw || '').trim();
}

/**
 * True when a database name is a known production database (case-insensitive).
 */
function isProdDb(name) {
  return PROD_DB_NAMES.has(normalizeDbName(name).toLowerCase());
}

/**
 * True when a database name is a throwaway test DB (ends in _test).
 * Note: this alone does NOT make it safe if the name also happens to collide
 * with a prod name (defense in depth).
 */
function isTestDb(name) {
  const n = normalizeDbName(name);
  return n.endsWith('_test');
}

/**
 * Validate a database name before a DROP / TRUNCATE / DELETE operation.
 *
 * Throws when:
 *  - the name is empty,
 *  - the name is a production database,
 *  - the name does not end in _test AND the caller has not passed an explicit
 *    allowlist for this operation.
 *
 * Allowed use:
 *  - throwaway test DBs (elite_db_test, elite_kids_test, etc.)
 *  - explicitly opted-in scripts via options.allowedDatabases (opt-in only,
 *    never for DROP DATABASE against a prod name)
 */
function assertDestructiveTarget(options) {
  if (!options || typeof options !== 'object') {
    throw new Error(
      '[db-drop-guard] target database name is required (options.database)'
    );
  }

  const database = normalizeDbName(options.database);
  if (!database) {
    throw new Error('[db-drop-guard] database name is empty — refusing to touch any database');
  }

  const operation = normalizeDbName(options.operation || 'DROP'); // default conservative

  // Prod DBs are never eligible for DROP DATABASE / TRUNCATE, ever.
  if (isProdDb(database) && (operation === 'DROP DATABASE' || operation === 'TRUNCATE')) {
    throw new Error(
      `[db-drop-guard] ${operation} on production database "${database}" is not allowed.`
    );
  }

  if (isProdDb(database)) {
    // For other destructive ops (e.g. DELETE), only allow explicit opt-in.
    const allowed = Array.isArray(options.allowedDatabases)
      ? options.allowedDatabases.map((d) => normalizeDbName(d))
      : [];
    if (!allowed.includes(database)) {
      throw new Error(
        `[db-drop-guard] "${operation}" on production database "${database}" is not allowed ` +
        'unless that database is explicitly listed in options.allowedDatabases.'
      );
    }
  }

  if (!isTestDb(database) && !isProdDb(database)) {
    // Unknown database — conservative: require explicit opt-in for anything non-test.
    const allowed = Array.isArray(options.allowedDatabases)
      ? options.allowedDatabases.map((d) => normalizeDbName(d))
      : [];
    if (!allowed.includes(database)) {
      throw new Error(
        `[db-drop-guard] "${operation}" on non-test database "${database}" is not allowed ` +
        'unless that database is explicitly listed in options.allowedDatabases.'
      );
    }
  }

  return database;
}

/**
 * Wrap a SQL string that targets a specific database/table so the guard can
 * validate the target before execution. This is the safest integration point:
 * callers build the SQL, then pass the resolved database name through the guard,
 * then execute only if the guard passes.
 */
function validateSqlTarget(sql, options) {
  // Basic smell check: refuse SQL that contains multiple statements if we only
  // expect one destructive statement per call. This is a light heuristic, not
  // a full SQL parser.
  const trimmed = String(sql || '').trim();
  const statements = trimmed.split(/;+/).filter((s) => s.trim().length > 0);
  if (statements.length > 1) {
    throw new Error(
      '[db-drop-guard] multi-statement destructive SQL is not allowed — split into single statements'
    );
  }

  // If the SQL is a DROP DATABASE, the target is the database name itself.
  const dropDbMatch = trimmed.match(/^\s*DROP\s+DATABASE\s+IF\s+EXISTS\s+`?(\w+)`?\s*$/i);
  if (dropDbMatch) {
    return assertDestructiveTarget({
      ...options,
      operation: 'DROP DATABASE',
      database: dropDbMatch[1],
    });
  }

  // If the SQL is TRUNCATE TABLE, the target is the table-qualified db name if present.
  const truncateMatch = trimmed.match(/^\s*TRUNCATE\s+TABLE\s+`?(\w+)`?\s*$/i);
  if (truncateMatch) {
    const table = truncateMatch[1];
    const database = normalizeDbName(options.database || '');
    // If the table alone doesn't tell us the DB, rely on options.database.
    return assertDestructiveTarget({
      ...options,
      operation: 'TRUNCATE',
      database: database || table,
    });
  }

  // DELETE / DROP TABLE etc. — rely on options.database for the target DB.
  return assertDestructiveTarget(options);
}

module.exports = {
  PROD_DB_NAMES,
  normalizeDbName,
  isProdDb,
  isTestDb,
  assertDestructiveTarget,
  validateSqlTarget,
};
