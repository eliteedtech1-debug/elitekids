'use strict';

const {
  DEFAULT_DATABASES,
  ensureTestSuffix,
  resolveDatabaseNames,
  assertResolvedDatabaseNames,
} = require('../src/config/databaseNames');

describe('EliteKids database naming contract', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUseTestDatabases = process.env.USE_TEST_DATABASES;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalUseTestDatabases === undefined) delete process.env.USE_TEST_DATABASES;
    else process.env.USE_TEST_DATABASES = originalUseTestDatabases;
  });

  test('uses KIDS_DB_NAME as the Kids-owned database', () => {
    process.env.NODE_ENV = 'production';
    const names = resolveDatabaseNames({
      DB_NAME: 'sms_school',
      KIDS_DB_NAME: 'kids_school',
      CONTENT_DB_NAME: 'legacy_content',
      AI_DB_NAME: 'kids_ai',
      NODE_ENV: 'production',
      JEST_WORKER_ID: '',
    });

    expect(names.KIDS_DB_NAME).toBe('kids_school');
    expect(names.DB_NAME).toBe('sms_school');
    expect(names.DB_NAME).not.toBe(names.KIDS_DB_NAME);
  });

  test('normalizes every configured database to *_test in development', () => {
    process.env.NODE_ENV = 'development';
    const names = resolveDatabaseNames({
      DB_NAME: 'elite_db',
      KIDS_DB_NAME: 'elite_kids',
      CONTENT_DB_NAME: 'elite_content',
      AI_DB_NAME: 'elite_bot',
    });

    expect(names).toEqual({
      DB_NAME: 'elite_db_test',
      KIDS_DB_NAME: 'elite_kids_test',
      CONTENT_DB_NAME: 'elite_content_test',
      AI_DB_NAME: 'elite_bot_test',
    });
    expect(() => assertResolvedDatabaseNames(names)).not.toThrow();
  });

  test('preserves an explicitly isolated name and rejects an empty Kids name', () => {
    expect(ensureTestSuffix('elite_kids_test')).toBe('elite_kids_test');
    process.env.NODE_ENV = 'test';
    const names = resolveDatabaseNames({ ...DEFAULT_DATABASES, KIDS_DB_NAME: '' });
    expect(names.KIDS_DB_NAME).toBe('elite_kids_test');
    expect(() => assertResolvedDatabaseNames(names)).not.toThrow();
  });
});
