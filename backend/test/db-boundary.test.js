'use strict';

const { testQuery, TEST_DB, TEST_KIDS_DB } = require('./helpers/test-db');

afterAll(async () => {
  // The global test teardown closes application connections; testQuery opens and
  // closes its own short-lived connection for each assertion.
});

describe('test database ownership boundary', () => {
  it('routes shared-table SQL to elite_db_test', async () => {
    const rows = await testQuery('SELECT DATABASE() AS database_name FROM students LIMIT 1');
    expect(rows).toHaveLength(1);
    expect(rows[0].database_name).toBe(TEST_DB);
  });

  it('routes Kids-table SQL to elite_kids_test', async () => {
    const rows = await testQuery('SELECT DATABASE() AS database_name FROM kids_children LIMIT 1');
    expect(rows).toHaveLength(1);
    expect(rows[0].database_name).toBe(TEST_KIDS_DB);
  });

  it('keeps the two ownership databases distinct', () => {
    expect(TEST_DB).toBe('elite_db_test');
    expect(TEST_KIDS_DB).toBe('elite_kids_test');
    expect(TEST_DB).not.toBe(TEST_KIDS_DB);
  });
});
