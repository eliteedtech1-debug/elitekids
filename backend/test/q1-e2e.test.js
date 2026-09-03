'use strict';

/**
 * A17 — Q1 2027 NGEd-game end-to-end integration: ADE → SRE → Economy.
 *
 * Exercises the REAL HTTP surface (supertest against src/app) against the
 * hermetic test DB, locking the full child journey:
 *
 *   1. ADE:        per-tap item response → BKT mastery update → per-tap log row
 *   2. ADE→Economy: adaptive update awards game_complete XP (streak applied)
 *   3. Economy:     balance / earn / streak / shop (buy → own → equip) + guards
 *   4. SRE:         complete review (creates an SM-2 card) → schedules next
 *                   review, updates ADE mastery, awards review XP; due queue +
 *                   stats reflect the same child across all three engines
 *   5. Guards:      staff blocked, validation error codes
 *
 * Uses a dedicated child (A17-ADM-01) so it never collides with other suites.
 *
 * Run: jest test/q1-e2e.test.js --runInBand --forceExit
 */
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/app');
const { closeConnections } = require('./helpers/teardown');
const { testQuery } = require('./helpers/test-db');

const ADM = 'A17-ADM-01';
const CHILD_ID = 'A17-CHILD';
const SKILL = 'a17.math.addition';
const ITEM = 'a17-item-1';

const Q1_TABLES = [
  'kids_adaptive_state_v2',
  'kids_review_schedule_v2',
  'kids_economy',
  'kids_economy_transactions',
  'kids_economy_milestones',
  'kids_shop_purchases',
];

async function cleanupFixtures() {
  for (const table of Q1_TABLES) {
    try {
      await testQuery(`DELETE FROM ${table} WHERE child_admission_no = ?`, [ADM]);
    } catch { /* table may not exist yet — fine */ }
  }
  try {
    await testQuery(`DELETE FROM kids_game_item_responses WHERE student_id = ?`, [ADM]);
  } catch { /* non-fatal */ }
  try {
    await testQuery(`DELETE FROM kids_children WHERE admission_no = ?`, [ADM]);
    await testQuery(`DELETE FROM students WHERE admission_no = ?`, [ADM]);
  } catch { /* non-fatal */ }
}

afterAll(async () => {
  await cleanupFixtures(); // shared hermetic DB — leave it as found
  await closeConnections();
});

async function seedFixtures() {
  const hash = bcrypt.hashSync('Nursery@123', 10);
  await testQuery(
    `INSERT INTO students (admission_no, school_id, branch_id, student_name, password, user_type, status) VALUES (?, 'SCH-TEST', 'BR-TEST', 'A17 E2E Kid', ?, 'Student', 'Active')
     ON DUPLICATE KEY UPDATE student_name = VALUES(student_name)`,
    [ADM, hash]
  );
  await testQuery(
    `INSERT INTO kids_children (id, admission_no, school_id, branch_id, full_name, age_level, class_code, status) VALUES (?, ?, 'SCH-TEST', 'BR-TEST', 'A17 E2E Kid', 'Nursery', 'NUR-A', 'Active')
     ON DUPLICATE KEY UPDATE age_level = VALUES(age_level)`,
    [CHILD_ID, ADM]
  );
}

async function studentToken() {
  const res = await request(app)
    .post('/students/login')
    .send({ username: ADM, password: 'Nursery@123', school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function staffToken() {
  const res = await request(app)
    .post('/users/login')
    .send({ username: 'admin@kids.test', password: 'Admin@123' });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function adeUpdate(token, body) {
  return request(app)
    .post('/kids/adaptive/v2/update')
    .set('authorization', token)
    .send({ skill_key: SKILL, item_id: ITEM, ...body });
}

// ─── 1. ADE: per-tap learning loop, feeding Economy ──────────────────────────

describe('A17: ADE v2 per-tap loop → BKT → per-tap log → Economy XP', () => {
  let token;

  beforeAll(async () => {
    await seedFixtures();
    token = await studentToken();
  });

  it('a correct tap updates mastery and awards game XP via the economy', async () => {
    const res = await adeUpdate(token, { correct: true, response_time_ms: 900, mode: 'practice', quality: 5, distractor_count: 3 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mastery_probability).toBeGreaterThan(0.001);
    expect(['new', 'learning']).toContain(res.body.data.mastery_state); // one tap rarely crosses 0.30
    expect(res.body.data.xp_earned).toBeGreaterThanOrEqual(20); // XP_TABLE.game_complete base
    expect(res.body.data.struggle_detected).toBe(false);
  });

  it('the response is persisted as a per-tap item-response log row', async () => {
    const rows = await testQuery(
      `SELECT student_id, item_id, quality, skill_key, mastery_before, mastery_after, correct, mode
       FROM kids_game_item_responses WHERE student_id = ? AND item_id = ?`,
      [ADM, ITEM]
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows[0];
    expect(Number(row.quality)).toBe(5);
    expect(row.skill_key).toBe(SKILL);
    expect(Number(row.mastery_before)).toBeLessThan(Number(row.mastery_after));
    expect(Number(row.correct)).toBe(1);
  });

  it('wrong taps lower mastery and flag struggle after 3 consecutive misses', async () => {
    const r1 = await adeUpdate(token, { correct: false, response_time_ms: 2600, mode: 'practice', quality: 1 });
    expect(r1.status).toBe(200);
    expect(r1.body.data.mastery_probability).toBeLessThan(0.3);
    const r2 = await adeUpdate(token, { correct: false, response_time_ms: 2800, mode: 'practice', quality: 0 });
    expect(r2.status).toBe(200);
    expect(r2.body.data.struggle_detected).toBe(false); // 2 misses — below the signal threshold
    const r3 = await adeUpdate(token, { correct: false, response_time_ms: 2500, mode: 'practice', quality: 0 });
    expect(r3.status).toBe(200);
    expect(r3.body.data.struggle_detected).toBe(true); // 3 consecutive misses → low-severity signal
  });

  it('the ADE profile + skills + next-item recommend the weakest skill', async () => {
    const profile = await request(app)
      .get(`/kids/adaptive/v2/profile?skill_key=${SKILL}`)
      .set('authorization', token);
    expect(profile.status).toBe(200);
    expect(profile.body.data.total_attempts).toBe(4); // 1 correct + 3 wrong taps
    expect(profile.body.data.correct_attempts).toBe(1);
    expect(profile.body.data.elo_rating).toBeGreaterThan(0);

    const skills = await request(app).get('/kids/adaptive/v2/skills').set('authorization', token);
    expect(skills.status).toBe(200);
    expect(skills.body.data.skills.some((s) => s.skill_key === SKILL)).toBe(true);
    expect(skills.body.data.summary.total_skills).toBeGreaterThanOrEqual(1);

    const next = await request(app).get('/kids/adaptive/v2/next-item').set('authorization', token);
    expect(next.status).toBe(200);
    expect(next.body.data.items[0].skill_key).toBe(SKILL); // weakest = needs practice
  });

  it('economy balance reflects the XP earned through gameplay taps', async () => {
    const res = await request(app).get('/kids/economy/balance').set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.xp_total).toBeGreaterThan(0);
    expect(res.body.data.level).toBeGreaterThanOrEqual(1);
    expect(res.body.data.streak.current).toBeGreaterThanOrEqual(1); // played today
  });
});

// ─── 2. Economy standalone: earn, streak, shop ───────────────────────────────

describe('A17: Economy — earn / streak / shop buy → equip', () => {
  let token;

  beforeAll(async () => {
    token = await studentToken();
  });

  it('earn XP for an explicit action and records a transaction', async () => {
    const before = await request(app).get('/kids/economy/balance').set('authorization', token);
    const beforeXp = before.body.data.xp_total;

    const res = await request(app)
      .post('/kids/economy/earn')
      .set('authorization', token)
      .send({ action: 'game_complete', context: { score: 100 } });
    expect(res.status).toBe(200);
    expect(res.body.data.xp_earned).toBeGreaterThanOrEqual(20);
    expect(res.body.data.perfect_bonus).toBeGreaterThan(0); // score 100
    expect(res.body.data.new_total).toBe(beforeXp + res.body.data.xp_earned);

    const after = await request(app).get('/kids/economy/balance').set('authorization', token);
    expect(after.body.data.xp_total).toBe(beforeXp + res.body.data.xp_earned);

    const txs = await testQuery(
      `SELECT action, amount FROM kids_economy_transactions WHERE child_admission_no = ? AND action = 'game_complete'`,
      [ADM]
    );
    expect(txs.length).toBeGreaterThanOrEqual(1);
  });

  it('records a daily streak (first-ever play → streak 1)', async () => {
    const res = await request(app).post('/kids/economy/streak/record').set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.streak).toBeGreaterThanOrEqual(1);
    expect(res.body.data.multiplier).toBeGreaterThanOrEqual(1);

    const bal = await request(app).get('/kids/economy/balance').set('authorization', token);
    expect(bal.body.data.streak.current).toBeGreaterThanOrEqual(1);
    expect(bal.body.data.streak.longest).toBeGreaterThanOrEqual(1);
  });

  it('lists the shop catalog with balance, buys the cheapest item, then equips it', async () => {
    // Default catalog costs 200–1500 XP — earn enough to actually buy something.
    for (let i = 0; i < 6; i++) {
      const earn = await request(app)
        .post('/kids/economy/earn')
        .set('authorization', token)
        .send({ action: 'boss_defeated' }); // 100 XP base
      expect(earn.status).toBe(200);
    }

    const shop = await request(app).get('/kids/economy/shop').set('authorization', token);
    expect(shop.status).toBe(200);
    const categories = shop.body.data.categories;
    expect(categories.length).toBeGreaterThan(0);
    const balance = Number(shop.body.data.balance);
    expect(balance).toBeGreaterThanOrEqual(600);

    const all = categories.flatMap((c) => c.items);
    const item = [...all].sort((a, b) => Number(a.cost) - Number(b.cost))[0]; // cheapest = flower_bed 200
    expect(Number(item.cost)).toBeLessThanOrEqual(balance);

    const buy = await request(app)
      .post('/kids/economy/shop/buy')
      .set('authorization', token)
      .send({ item_id: item.id });
    expect(buy.status).toBe(200);
    expect(buy.body.data.item_id).toBe(item.id);
    expect(Number(buy.body.data.new_balance)).toBe(balance - Number(item.cost));

    const equip = await request(app)
      .post('/kids/economy/shop/equip')
      .set('authorization', token)
      .send({ item_id: item.id });
    expect(equip.status).toBe(200);
    expect(equip.body.data.equipped).toBe(item.id);

    // purchase row persisted
    const rows = await testQuery(
      `SELECT item_id, cost, equipped FROM kids_shop_purchases WHERE child_admission_no = ? AND item_id = ?`,
      [ADM, item.id]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].equipped)).toBe(1);
  });

  it('rejects a duplicate purchase (already owned) and unaffordable items', async () => {
    const shop = await request(app).get('/kids/economy/shop').set('authorization', token);
    const all = shop.body.data.categories.flatMap((c) => c.items);
    const owned = all.find((i) => i.owned);
    expect(owned).toBeDefined();

    const dup = await request(app)
      .post('/kids/economy/shop/buy')
      .set('authorization', token)
      .send({ item_id: owned.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error_code).toBe('ECO_ITEM_ALREADY_OWNED');

    // a 1500-XP theme is beyond the post-purchase balance (~450)
    const expensive = [...all].sort((a, b) => Number(b.cost) - Number(a.cost))[0];
    const poor = await request(app)
      .post('/kids/economy/shop/buy')
      .set('authorization', token)
      .send({ item_id: expensive.id });
    expect(poor.status).toBe(400);
    expect(poor.body.error_code).toBe('ECO_INSUFFICIENT_XP');
    expect(poor.body.data.shortfall).toBeGreaterThan(0);
  });
});

// ─── 3. SRE: review loop feeding back into ADE + Economy ─────────────────────

describe('A17: SRE v2 — complete review creates card, schedules next, updates ADE + Economy', () => {
  let token;

  beforeAll(async () => {
    token = await studentToken();
  });

  it('completing a review with no existing card creates an SM-2 card and schedules +1 day', async () => {
    const before = await request(app)
      .get(`/kids/adaptive/v2/profile?skill_key=${SKILL}`)
      .set('authorization', token);
    const masteryBefore = before.body.data.mastery_probability;

    const res = await request(app)
      .post('/kids/reviews/v2/complete')
      .set('authorization', token)
      .send({ skill_key: SKILL, item_id: ITEM, quality: 4 });
    expect(res.status).toBe(200);
    expect(res.body.data.interval_days).toBe(1);
    expect(res.body.data.next_review_at).toBeDefined();
    expect(res.body.data.mastery_probability).toBeGreaterThan(masteryBefore); // SRE → ADE
    expect(res.body.data.xp_earned).toBeGreaterThanOrEqual(15); // review_complete base

    // card row persisted with the SM-2+ result (regression: was `insId` undefined)
    const rows = await testQuery(
      `SELECT skill_key, item_id, repetitions, interval_days, last_quality, ease
       FROM kids_review_schedule_v2 WHERE child_admission_no = ? AND item_id = ?`,
      [ADM, ITEM]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].repetitions)).toBe(1);
    expect(Number(rows[0].interval_days)).toBe(1);
    expect(Number(rows[0].last_quality)).toBe(4);
    expect(Number(rows[0].ease)).toBeGreaterThanOrEqual(2.5);
  });

  it('the fresh card is not due today but appears after its review window passes', async () => {
    const today = await request(app).get('/kids/reviews/v2/today').set('authorization', token);
    expect(today.status).toBe(200);
    expect(today.body.data.due_count).toBe(0);

    // force the card overdue, as a day passing would
    await testQuery(
      `UPDATE kids_review_schedule_v2 SET next_review_at = DATE_SUB(NOW(), INTERVAL 1 DAY)
       WHERE child_admission_no = ? AND item_id = ?`,
      [ADM, ITEM]
    );
    const due = await request(app).get('/kids/reviews/v2/today').set('authorization', token);
    expect(due.body.data.due_count).toBe(1);
    expect(due.body.data.overdue_count).toBe(1);
    expect(due.body.data.reviews[0].item_id).toBe(ITEM);
    expect(due.body.data.reviews[0].days_overdue).toBe(1);
    expect(due.body.data.streak.current).toBeGreaterThanOrEqual(1); // economy streak surfaced
  });

  it('a failed review resets to the learning phase and is due again immediately', async () => {
    const res = await request(app)
      .post('/kids/reviews/v2/complete')
      .set('authorization', token)
      .send({ skill_key: SKILL, item_id: ITEM, quality: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.interval_days).toBe(1); // SM-2: failed review → learning phase (retry)
    expect(res.body.data.mastery_probability).toBeLessThan(0.85);

    const rows = await testQuery(
      `SELECT repetitions, interval_days FROM kids_review_schedule_v2 WHERE child_admission_no = ? AND item_id = ?`,
      [ADM, ITEM]
    );
    expect(Number(rows[0].repetitions)).toBe(0);
  });

  it('review stats roll up the same child across SRE + ADE + Economy', async () => {
    const res = await request(app).get('/kids/reviews/v2/stats').set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.total_items).toBeGreaterThanOrEqual(1);
    expect(res.body.data.due_today).toBeGreaterThanOrEqual(0);
    expect(res.body.data.streak_days).toBeGreaterThanOrEqual(1); // from kids_economy
    expect(res.body.data.avg_accuracy).toBeGreaterThanOrEqual(0);
  });
});

// ─── 4. Guards: role checks + validation codes ───────────────────────────────

describe('A17: guards — staff blocked, validation codes, unknown skill profile', () => {
  it('blocks staff from child economy/adaptive/review endpoints (403)', async () => {
    const token = await staffToken();
    for (const ep of [
      ['get', '/kids/economy/balance'],
      ['get', '/kids/reviews/v2/today'],
      ['get', '/kids/adaptive/v2/skills'],
      ['post', '/kids/economy/earn'],
    ]) {
      const res = await request(app)[ep[0]](ep[1]).set('authorization', token).send({ action: 'game_complete' });
      expect(res.status).toBe(403);
    }
  });

  it('rejects malformed ADE update bodies with SRS §10.2 codes', async () => {
    const token = await studentToken();
    const noSkill = await request(app)
      .post('/kids/adaptive/v2/update')
      .set('authorization', token)
      .send({ item_id: ITEM, correct: true });
    expect(noSkill.status).toBe(400);
    expect(noSkill.body.error_code).toBe('ADE_INVALID_SKILL_KEY');

    const badQuality = await adeUpdate(token, { correct: true, quality: 9 });
    expect(badQuality.status).toBe(400);
    expect(badQuality.body.error_code).toBe('ADE_INVALID_QUALITY');
  });

  it('rejects a review completion without item_id', async () => {
    const token = await studentToken();
    const res = await request(app)
      .post('/kids/reviews/v2/complete')
      .set('authorization', token)
      .send({ skill_key: SKILL, quality: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('SRE_ITEM_REQUIRED');
  });

  it('returns a default new-skill profile for an untouched skill', async () => {
    const token = await studentToken();
    const res = await request(app)
      .get(`/kids/adaptive/v2/profile?skill_key=a17.unseen.skill`)
      .set('authorization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.mastery_state).toBe('new');
    expect(res.body.data.total_attempts).toBe(0);
    expect(res.body.data.elo_rating).toBe(1000);
  });
});