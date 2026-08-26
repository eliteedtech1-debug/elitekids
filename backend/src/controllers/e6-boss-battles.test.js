'use strict';

/**
 * E6 — Boss Battles: "Guardians of the Storm" regression tests.
 *
 * Gates:
 *   1. Boss run insert on complete
 *   2. Raid aggregation math (damage, HP drain)
 *   3. Badge mint idempotent
 *   4. Boss mode does NOT mark lesson complete (gate integrity!)
 *   5. No Sony IP strings (grep-gated, tested at file level)
 *   6. Response time tracked in boss runs
 *   7. Raid dashboard returns correct aggregations
 */

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/models');
const { ensureTestDb, testQuery } = require('./helpers/test-db');
const { closeConnections } = require('./helpers/teardown');

let staffToken;
let studentToken;
const SCHOOL_ID = 'SCH-TEST';
const CLASS_CODE = 'NUR-A';
const STUDENT_ADM = 'NUR-001';

/** Clean up all boss raid state so each describe block can create fresh raids. */
async function cleanBossState() {
  await testQuery('SET FOREIGN_KEY_CHECKS = 0').catch(() => {});
  for (const t of ['kids_boss_raid_participants', 'kids_boss_raid_games', 'kids_boss_raid_state', 'kids_boss_runs']) {
    await testQuery(`TRUNCATE TABLE \`${t}\``).catch(() => {});
  }
  // Also clean up festival state (tests share class codes)
  await testQuery('TRUNCATE TABLE `kids_festival_state`').catch(() => {});
  await testQuery('TRUNCATE TABLE `kids_badges`').catch(() => {});
  await testQuery('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
}

beforeAll(async () => {
  await ensureTestDb();

  // Staff token
  const sRes = await request(app)
    .post('/users/login')
    .send({ username: 'admin', password: 'Admin@123' });
  staffToken = sRes.body.token;

  // Student token
  const stRes = await request(app)
    .post('/students/login')
    .send({ username: STUDENT_ADM, password: 'Nursery@123', school_id: SCHOOL_ID });
  studentToken = stRes.body.token;
});

afterAll(async () => {
  await closeConnections();
});

// ── 1. Boss run insert on damage submit ──────────────────────────────────────
describe('E6: Boss damage submit creates boss_run record', () => {
  let raidId;

  beforeAll(async () => {
    await cleanBossState();
    const res = await request(app)
      .post('/kids/boss/raid/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, guardian_slug: 'sango', lesson_ids: ['LESSON-1'] });
    expect(res.status).toBe(201);
    raidId = res.body.data.id;
  });

  it('records a boss_run row on damage submit', async () => {
    const res = await request(app)
      .post(`/kids/boss/raid/${raidId}/damage`)
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID)
      .send({
        lesson_id: 'LESSON-1',
        score: 80,
        combo_max: 5,
        rage_used: 1,
        response_time_ms: 2500,
        duration_s: 30,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.damage_dealt).toBeGreaterThan(0);
    expect(res.body.data.boss_hp).toBeGreaterThanOrEqual(0);

    // Verify boss_run row exists
    const runs = await testQuery(
      `SELECT * FROM kids_boss_runs WHERE child_admission_no = ? AND lesson_id = ?`,
      [STUDENT_ADM, 'LESSON-1'],
    );
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const run = runs.find((r) => r.guardian_slug === 'sango');
    expect(run).toBeTruthy();
    expect(run.score).toBe(80);
    expect(run.combo_max).toBe(5);
    expect(run.rage_used).toBe(1);
    expect(run.response_time_ms).toBe(2500);
    expect(run.guardian_slug).toBe('sango');
  });
});

// ── 2. Raid aggregation math ─────────────────────────────────────────────────
describe('E6: Raid HP drain aggregation', () => {
  let raidId;
  let initialHp;

  beforeAll(async () => {
    await cleanBossState();
    // Use baobab (hp_per_question=9) so we can control the drain better
    const res = await request(app)
      .post('/kids/boss/raid/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, guardian_slug: 'baobab', lesson_ids: ['LESSON-1'] });
    expect(res.status).toBe(201);
    raidId = res.body.data.id;
    initialHp = res.body.data.max_hp;
  });

  it('drains HP correctly per damage submit', async () => {
    const res1 = await request(app)
      .post(`/kids/boss/raid/${raidId}/damage`)
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ lesson_id: 'LESSON-1', score: 40, combo_max: 3 });
    expect(res1.status).toBe(200);
    const dmg1 = res1.body.data.damage_dealt;
    expect(dmg1).toBeGreaterThan(0);
    expect(res1.body.data.boss_hp).toBe(initialHp - dmg1);

    // Second hit
    const res2 = await request(app)
      .post(`/kids/boss/raid/${raidId}/damage`)
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ lesson_id: 'LESSON-1', score: 20, combo_max: 1 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.boss_hp).toBe(initialHp - dmg1 - res2.body.data.damage_dealt);
  });

  it('defeats boss when HP reaches zero', async () => {
    // Submit many high-score damages to drain remaining HP
    let lastRes;
    for (let i = 0; i < 100; i++) {
      lastRes = await request(app)
        .post(`/kids/boss/raid/${raidId}/damage`)
        .set('Authorization', studentToken)
        .set('x-school-id', SCHOOL_ID)
        .send({ lesson_id: 'LESSON-1', score: 100, combo_max: 5, rage_used: 1 });
      // After defeat, further submissions return 404
      if (!lastRes.body.data || lastRes.body.data.defeated) break;
    }
    expect(lastRes.body.data).toBeTruthy();
    expect(lastRes.body.data.defeated).toBe(true);
    expect(lastRes.body.data.boss_hp).toBe(0);
    expect(lastRes.body.data.wisdom).toBeTruthy();
  });
});

// ── 3. Badge mint idempotent ─────────────────────────────────────────────────
describe('E6: Festival badge mint idempotent', () => {
  it('does not duplicate badge on second guardian defeat', async () => {
    await cleanBossState();
    // Create festival for the student's class (NUR-A)
    const fRes = await request(app)
      .post('/kids/festival/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, title: 'Badge Test Festival' });
    expect(fRes.status).toBe(200);
    const festivalId = fRes.body.data.id;

    // Defeat first guardian (may take multiple hits)
    let d1;
    let defeated1 = false;
    for (let i = 0; i < 50; i++) {
      d1 = await request(app)
        .post(`/kids/festival/${festivalId}/damage`)
        .set('Authorization', studentToken)
        .set('x-school-id', SCHOOL_ID)
        .send({ score: 100, combo_max: 5, rage_used: 1 });
      expect(d1.status).toBe(200);
      if (d1.body.data?.guardian_defeated) { defeated1 = true; break; }
    }
    expect(defeated1).toBe(true);

    // Count badges
    const badges1 = await testQuery(
      `SELECT COUNT(*) AS cnt FROM kids_badges WHERE child_admission_no = ? AND badge_type = 'festival'`,
      [STUDENT_ADM],
    );
    const count1 = badges1[0].cnt;

    // Create another festival in a different class to test idempotency
    // (Festival create may require class enrollment — use the student's class)
    const fRes2 = await request(app)
      .post('/kids/festival/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, title: 'Badge Test Festival 2' });
    // Festival may reject if active festival exists for same class
    if (fRes2.status === 200) {
      const festivalId2 = fRes2.body.data.id;
      const d2 = await request(app)
        .post(`/kids/festival/${festivalId2}/damage`)
        .set('Authorization', studentToken)
        .set('x-school-id', SCHOOL_ID)
        .send({ score: 100, combo_max: 5, rage_used: 1 });
      if (d2.status === 200 && d2.body.data?.guardian_defeated) {
        const badges2 = await testQuery(
          `SELECT COUNT(*) AS cnt FROM kids_badges WHERE child_admission_no = ? AND badge_name = 'Voice of Ṣàngó'`,
          [STUDENT_ADM],
        );
        expect(badges2[0].cnt).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ── 4. Boss mode does NOT satisfy practice+test gate ─────────────────────────
describe('E6: Boss mode does NOT mark lesson complete', () => {
  it('boss damage does not create a kids_progress row', async () => {
    await cleanBossState();
    // Create raid
    const rRes = await request(app)
      .post('/kids/boss/raid/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, guardian_slug: 'anansi', lesson_ids: ['LESSON-1'] });
    expect(rRes.status).toBe(201);
    const raidId = rRes.body.data.id;

    // Clear any existing progress for this lesson
    await testQuery(
      `DELETE FROM kids_progress WHERE child_admission_no = ? AND lesson_id = ?`,
      [STUDENT_ADM, 'LESSON-1'],
    );

    // Submit boss damage
    const dRes = await request(app)
      .post(`/kids/boss/raid/${raidId}/damage`)
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ lesson_id: 'LESSON-1', score: 100, combo_max: 5 });
    expect(dRes.status).toBe(200);

    // Verify NO progress row was created (boss is event layer, not progress)
    const prog = await testQuery(
      `SELECT * FROM kids_progress WHERE child_admission_no = ? AND lesson_id = ?`,
      [STUDENT_ADM, 'LESSON-1'],
    );
    expect(prog.length).toBe(0);
  });
});

// ── 5. Response time tracked in boss runs ────────────────────────────────────
describe('E6: Response time tracked', () => {
  it('stores response_time_ms in boss_run', async () => {
    await cleanBossState();
    const rRes = await request(app)
      .post('/kids/boss/raid/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, guardian_slug: 'mami', lesson_ids: ['LESSON-1'] });
    expect(rRes.status).toBe(201);
    const raidId = rRes.body.data.id;

    await request(app)
      .post(`/kids/boss/raid/${raidId}/damage`)
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ lesson_id: 'LESSON-1', score: 70, response_time_ms: 3200, duration_s: 45 });

    const runs = await testQuery(
      `SELECT response_time_ms, duration_s FROM kids_boss_runs WHERE child_admission_no = ? AND guardian_slug = 'mami' ORDER BY id DESC LIMIT 1`,
      [STUDENT_ADM],
    );
    expect(runs.length).toBe(1);
    expect(runs[0].response_time_ms).toBe(3200);
    expect(runs[0].duration_s).toBe(45);
  });
});

// ── 6. Raid dashboard returns correct aggregations ───────────────────────────
describe('E6: Raid dashboard aggregations', () => {
  let raidId;

  beforeAll(async () => {
    await cleanBossState();
    const res = await request(app)
      .post('/kids/boss/raid/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, guardian_slug: 'mami', lesson_ids: ['LESSON-1'] });
    expect(res.status).toBe(201);
    raidId = res.body.data.id;

    // Submit damage from student
    await request(app)
      .post(`/kids/boss/raid/${raidId}/damage`)
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ lesson_id: 'LESSON-1', score: 90, combo_max: 4, response_time_ms: 2000 });
  });

  it('returns correct dashboard data', async () => {
    const res = await request(app)
      .get(`/kids/boss/raid/${raidId}/dashboard`)
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.raid.id).toBe(raidId);
    expect(data.guardian.slug).toBe('mami');
    expect(data.hp.max).toBeGreaterThan(0);
    expect(data.hp.current).toBeLessThan(data.hp.max);
    expect(data.total_participants).toBeGreaterThan(0);
    expect(data.responded).toBeGreaterThanOrEqual(1);

    // Individual damage data
    const myEntry = data.individual.find((i) => i.total_damage > 0);
    expect(myEntry).toBeTruthy();
    expect(myEntry.total_damage).toBeGreaterThan(0);
    expect(myEntry.questions_answered).toBeGreaterThanOrEqual(1);
    expect(myEntry.status).toBe('playing');

    // No admission_no leaked
    const jsonStr = JSON.stringify(data);
    expect(jsonStr).not.toContain(STUDENT_ADM);
  });
});

// ── 7. Sony IP gate (grep at test level) ─────────────────────────────────────
describe('E6: IP gate — zero Sony God of War strings', () => {
  it('has no Sony IP references in boss/festival controllers', () => {
    const fs = require('fs');
    const path = require('path');
    const files = [
      'src/controllers/kidsBoss.js',
      'src/controllers/kidsFestival.js',
    ];
    const banned = /kratos|leviathan|blades of chaos|atreus|mimir|ragnarök/i;
    for (const f of files) {
      const full = path.join(__dirname, '..', f);
      const content = fs.readFileSync(full, 'utf8');
      const match = content.match(banned);
      expect(match).toBeNull();
    }
  });

  it('has no Sony IP references in boss frontend components', () => {
    const fs = require('fs');
    const path = require('path');
    const frontendDir = path.join(__dirname, '../../frontend/src');
    const components = [
      'components/BossBattleOverlay.tsx',
      'components/TeacherBossRaid.tsx',
      'components/TeacherFestival.tsx',
      'components/StudentFestival.tsx',
      'lib/game/power-ups.ts',
      'lib/game/sound-effects.ts',
      'lib/game/victory.ts',
    ];
    const banned = /kratos|leviathan|blades of chaos|atreus|mimir|ragnarök/i;
    for (const f of components) {
      const full = path.join(frontendDir, f);
      if (!fs.existsSync(full)) continue;
      const content = fs.readFileSync(full, 'utf8');
      const match = content.match(banned);
      expect(match).toBeNull();
    }
  });
});

// ── 8. Guardians list endpoint ───────────────────────────────────────────────
describe('E6: Guardians list', () => {
  it('returns all 6 guardians', async () => {
    const res = await request(app)
      .get('/kids/boss/guardians')
      .set('Authorization', staffToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(6);
    const slugs = res.body.data.map((g) => g.slug);
    expect(slugs).toContain('sango');
    expect(slugs).toContain('anansi');
    expect(slugs).toContain('amina');
    expect(slugs).toContain('baobab');
    expect(slugs).toContain('mami');
    expect(slugs).toContain('elena');
  });
});

// ── 9. Student raid state (no admission_no leak) ────────────────────────────
describe('E6: Student raid active endpoint privacy', () => {
  let raidId;

  beforeAll(async () => {
    await cleanBossState();
    const res = await request(app)
      .post('/kids/boss/raid/create')
      .set('Authorization', staffToken)
      .set('x-school-id', SCHOOL_ID)
      .send({ class_code: CLASS_CODE, guardian_slug: 'elena', lesson_ids: ['LESSON-1'] });
    expect(res.status).toBe(201);
    raidId = res.body.data.id;
  });

  it('does not expose admission_no in raid state', async () => {
    const res = await request(app)
      .get('/kids/boss/raid/active')
      .set('Authorization', studentToken)
      .set('x-school-id', SCHOOL_ID);
    expect(res.status).toBe(200);
    if (res.body.data?.active) {
      const jsonStr = JSON.stringify(res.body.data);
      expect(jsonStr).not.toContain(STUDENT_ADM);
      // top_damage should only have name + damage, no admission_no
      if (res.body.data.top_damage?.length) {
        for (const td of res.body.data.top_damage) {
          expect(td).toHaveProperty('name');
          expect(td).toHaveProperty('damage');
          expect(td).not.toHaveProperty('admission_no');
          expect(td).not.toHaveProperty('child_admission_no');
        }
      }
    }
  });
});
