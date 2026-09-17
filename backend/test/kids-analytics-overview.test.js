'use strict';

/**
 * Regression test for `GET /kids/analytics/overview` — Q77.
 *
 * The handler read `kids_weekly_points` through `dbm().content` (the KIDS
 * database), but that table is owned by the weekly leaderboard, which creates
 * its two tables in the SHARED database (kidsLeaderboard.ensureSchema runs
 * `CREATE TABLE IF NOT EXISTS` on `db.sequelize`). Against the kids DB the
 * lookup threw `ER_NO_SUCH_TABLE`, and because the handler wraps everything in
 * a single try/catch that returns 500 before `res.json`, that ONE lookup failed
 * the ENTIRE overview for every school — every field, not just total_points.
 *
 * The ownership invariant is asserted directly as well, because that is the
 * part a future reader is most likely to "simplify" back into the bug: the
 * table genuinely does not exist in the kids database.
 */

const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');

afterAll(async () => {
  await closeConnections();
});

async function loginAs(username, password, school_id) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id });
  return res.body.token; // 'Bearer <jwt>'
}

describe('GET /kids/analytics/overview', () => {
  it('returns the overview instead of 500ing on the weekly-points lookup', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123', 'SCH-TEST');
    const res = await request(app)
      .get('/kids/analytics/overview')
      .set('authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Every field the overview documents must be present — the single try/catch
    // used to take ALL of them down together, not just total_points.
    expect(Object.keys(res.body.data).sort()).toEqual([
      'active_classes',
      'active_this_week',
      'avg_score_this_week',
      'excellent_games_this_week',
      'games_played_this_week',
      'total_points',
      'total_students',
    ]);
    // Each is consumed as a number by the dashboard. (COUNT() arrives as a
    // string from mysql2, so assert coercibility rather than the raw type.)
    for (const value of Object.values(res.body.data)) {
      expect(Number.isFinite(Number(value))).toBe(true);
    }
  });

  it('reads kids_weekly_points from the SHARED database, where the leaderboard creates it', async () => {
    const db = require('../src/models');

    // The table is created lazily by the weekly leaderboard, so ensure the
    // schema the way every leaderboard handler does rather than depending on
    // another spec having run first.
    await require('../src/controllers/kidsLeaderboard').ensureSchema();

    // The shared connection: the table exists (it is what the endpoint reads).
    const shared = await db.sequelize.query(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_weekly_points'`,
      { type: db.Sequelize.QueryTypes.SELECT }
    );
    expect(Number(shared[0].n)).toBe(1);

    // The kids connection: it does NOT. This is the invariant that made the
    // original `dbm().content` lookup throw, so it must stay true — if this
    // ever becomes 1 the table has moved and the endpoint must move with it.
    const kids = await db.content.query(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kids_weekly_points'`,
      { type: db.Sequelize.QueryTypes.SELECT }
    );
    expect(Number(kids[0].n)).toBe(0);
  });
});
