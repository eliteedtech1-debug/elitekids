'use strict';
/**
 * E6 — Boss Battles: "Guardians of the Storm"
 *
 * Epic boss-battle competition mode with Nigerian/African mythology skin.
 * Teachers select games for raids; lock override during active raid.
 * Real-time dashboard shows per-child damage + response speed.
 *
 * Tables (elite_content):
 *   kids_boss_runs          — individual boss attempt records
 *   kids_boss_raid_games    — teacher-selected games for a raid
 *   kids_boss_raid_state    — aggregate raid state (boss HP, status)
 *
 * IP RULE: ZERO Sony God of War strings. Original characters only.
 */
const crypto = require('crypto');

const dbm = () => require('../models');

const GUARDIANS = [
  { slug: 'sango', name: 'Ṣàngó', title: 'Guardian of Thunder', subject: 'Math', emoji: '⚡', hp_per_question: 10, rage_at: 3 },
  { slug: 'anansi', name: 'Anansi', title: 'The Web-Trickster', subject: 'English', emoji: '🕸️', hp_per_question: 8, rage_at: 4 },
  { slug: 'amina', name: 'Queen Amina', title: 'Fortress Guardian', subject: 'Numbers', emoji: '🏰', hp_per_question: 12, rage_at: 3 },
  { slug: 'baobab', name: 'Great Baobab', title: 'Spirit of Nature', subject: 'Science', emoji: '🌳', hp_per_question: 9, rage_at: 5 },
  { slug: 'mami', name: 'Mami Wata', title: 'Guardian of Waters', subject: 'Colors', emoji: '🌊', hp_per_question: 7, rage_at: 4 },
  { slug: 'elena', name: 'Elegua', title: 'Keeper of Paths', subject: 'Letters', emoji: '🚪', hp_per_question: 10, rage_at: 3 },
];

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_boss_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    class_code VARCHAR(40) NULL,
    lesson_id VARCHAR(50) NOT NULL,
    config_id VARCHAR(50) NULL,
    guardian_slug VARCHAR(30) NULL,
    score TINYINT NOT NULL DEFAULT 0,
    combo_max SMALLINT DEFAULT 0,
    victories SMALLINT DEFAULT 0,
    rage_used TINYINT DEFAULT 0,
    response_time_ms INT DEFAULT 0,
    duration_s INT DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_boss_child (child_admission_no, created_at),
    KEY idx_boss_lesson (lesson_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_boss_raid_games (
    id CHAR(36) NOT NULL PRIMARY KEY,
    raid_id CHAR(36) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    config_id VARCHAR(50) NULL,
    order_index INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_brg_raid_lesson (raid_id, lesson_id, config_id),
    KEY idx_brg_raid (raid_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_boss_raid_state (
    id CHAR(36) NOT NULL PRIMARY KEY,
    school_id VARCHAR(40) NOT NULL,
    class_code VARCHAR(40) NOT NULL,
    guardian_slug VARCHAR(30) NOT NULL,
    title VARCHAR(120) NOT NULL,
    max_hp INT NOT NULL DEFAULT 100,
    current_hp INT NOT NULL DEFAULT 100,
    status VARCHAR(10) NOT NULL DEFAULT 'active',
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_raid_class (school_id, class_code, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_boss_raid_participants (
    id CHAR(36) NOT NULL PRIMARY KEY,
    raid_id CHAR(36) NOT NULL,
    child_admission_no VARCHAR(64) NOT NULL,
    total_damage INT DEFAULT 0,
    questions_answered INT DEFAULT 0,
    questions_correct INT DEFAULT 0,
    avg_response_ms INT NULL,
    status ENUM('not_started','playing','completed') DEFAULT 'not_started',
    UNIQUE KEY uq_brp_raid_child (raid_id, child_admission_no),
    KEY idx_brp_raid (raid_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

// ── Staff: create a raid ────────────────────────────────────────────────────
// POST /kids/boss/raid/create { class_code, guardian_slug?, title?, hours?, lesson_ids: [] }
async function createRaid(req, res) {
  try {
    await ensureSchema();
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    const branchId = req.headers['x-branch-id'] || req.user.branch_id || null;
    const { class_code, guardian_slug, title, hours, lesson_ids } = req.body || {};
    if (!class_code) return res.status(400).json({ success: false, message: 'class_code required.' });

    const guardian = GUARDIANS.find((g) => g.slug === guardian_slug) || GUARDIANS[Math.floor(Math.random() * GUARDIANS.length)];
    const durH = Math.min(Math.max(Number(hours) || 48, 1), 24 * 7);
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + durH * 3600000);
    const id = crypto.randomUUID();

    // Enroll class roster
    const roster = await dbm().sequelize.query(
      `SELECT admission_no FROM students WHERE school_id=:s AND class_code=:c LIMIT 300`,
      { replacements: { s: String(schoolId), c: String(class_code) }, type: dbm().Sequelize.QueryTypes.SELECT },
    );
    if (!roster.length) return res.status(400).json({ success: false, message: 'No students in that class.' });

    const totalQuestions = (lesson_ids || []).length * 10; // estimate 10 questions per game
    const maxHp = Math.max(totalQuestions * guardian.hp_per_question, 100);

    await dbm().content.query(
      `INSERT INTO kids_boss_raid_state (id, school_id, class_code, guardian_slug, title, max_hp, current_hp, status, starts_at, ends_at, created_by)
       VALUES (:id,:s,:c,:g,:ti,:mhp,:mhp,'active',:st,:en,:by)`,
      {
        replacements: {
          id, s: String(schoolId), c: String(class_code), g: guardian.slug,
          ti: String(title || `${guardian.name} Battle`).slice(0, 120),
          mhp: maxHp, st: startsAt, en: endsAt,
          by: String(req.user.id || req.user.email || '').slice(0, 64),
        },
      },
    );

    // Set raid games
    if (Array.isArray(lesson_ids) && lesson_ids.length) {
      let idx = 0;
      for (const item of lesson_ids) {
        const lid = String(item.lesson_id || item).trim();
        const cid = item.config_id ? String(item.config_id).trim() : null;
        if (!lid) continue;
        await dbm().content.query(
          `INSERT INTO kids_boss_raid_games (id, raid_id, lesson_id, config_id, order_index)
           VALUES (:id, :rid, :lid, :cfg, :ord)`,
          { replacements: { id: crypto.randomUUID(), rid: id, lid, cfg: cid, ord: idx++ } },
        );
      }
    }

    // Enroll participants
    for (const r of roster) {
      await dbm().content.query(
        `INSERT IGNORE INTO kids_boss_raid_participants (id, raid_id, child_admission_no)
         VALUES (:id, :rid, :adm)`,
        { replacements: { id: crypto.randomUUID(), rid: id, adm: r.admission_no } },
      );
    }

    return res.status(201).json({
      success: true,
      data: {
        id, guardian: { slug: guardian.slug, name: guardian.name, emoji: guardian.emoji },
        title: title || `${guardian.name} Battle`, max_hp: maxHp,
        enrolled: roster.length, starts_at: startsAt, ends_at: endsAt,
      },
    });
  } catch (err) {
    console.error('boss createRaid error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Staff: get raid dashboard ───────────────────────────────────────────────
// GET /kids/boss/raid/:id/dashboard
async function getRaidDashboard(req, res) {
  try {
    await ensureSchema();
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    const raidId = String(req.params.id || '');

    const [raidRows] = await dbm().content.query(
      `SELECT * FROM kids_boss_raid_state WHERE id=:id AND school_id=:s LIMIT 1`,
      { replacements: { id: raidId, s: String(schoolId) } },
    );
    const raid = (raidRows || [])[0];
    if (!raid) return res.status(404).json({ success: false, message: 'Raid not found.' });

    const guardian = GUARDIANS.find((g) => g.slug === raid.guardian_slug) || GUARDIANS[0];

    // Participants with analytics
    const [parts] = await dbm().content.query(
      `SELECT p.child_admission_no AS adm, p.total_damage, p.questions_answered, p.questions_correct,
              p.avg_response_ms, p.status
       FROM kids_boss_raid_participants p WHERE p.raid_id=:rid`,
      { replacements: { rid: raidId } },
    );

    // Resolve names
    const adms = (parts || []).map((p) => p.adm);
    let nameMap = new Map();
    if (adms.length) {
      const [nameRows] = await dbm().sequelize.query(
        `SELECT admission_no, student_name, surname, first_name FROM students WHERE admission_no IN (:adms) LIMIT 300`,
        { replacements: { adms }, type: dbm().Sequelize.QueryTypes.SELECT },
      ).catch(() => []);
      nameMap = new Map((nameRows || []).map((r) => [r.admission_no, sanitizeName(r)]));
    }

    const individual = (parts || []).map((p) => ({
      name: nameMap.get(p.adm) || 'Friend',
      total_damage: p.total_damage || 0,
      questions_answered: p.questions_answered || 0,
      questions_correct: p.questions_correct || 0,
      avg_response_ms: p.avg_response_ms || null,
      status: p.status || 'not_started',
      completion_pct: p.questions_answered > 0 ? Math.round((p.questions_correct / p.questions_answered) * 100) : 0,
    })).sort((a, b) => b.total_damage - a.total_damage);

    const timeRemaining = raid.ends_at ? Math.max(0, Math.round((new Date(raid.ends_at).getTime() - Date.now()) / 60000)) : null;

    return res.json({
      success: true,
      data: {
        raid: { id: raid.id, title: raid.title, status: raid.status, ends_at: raid.ends_at },
        guardian: { slug: guardian.slug, name: guardian.name, emoji: guardian.emoji, title: guardian.title },
        hp: { current: raid.current_hp, max: raid.max_hp, pct: Math.round((raid.current_hp / raid.max_hp) * 100) },
        individual,
        total_participants: individual.length,
        responded: individual.filter((x) => x.status !== 'not_started').length,
        time_remaining_min: timeRemaining,
      },
    });
  } catch (err) {
    console.error('boss dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Student: get active raid state ──────────────────────────────────────────
// GET /kids/boss/raid/active
async function getActiveRaid(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const schoolId = req.headers['x-school-id'] || u.school_id;
    const adm = String(u.admission_no || '');

    const [stu] = await dbm().sequelize.query(
      `SELECT class_code FROM students WHERE admission_no=:a AND school_id=:s LIMIT 1`,
      { replacements: { a: adm, s: String(schoolId) }, type: dbm().Sequelize.QueryTypes.SELECT },
    ).catch(() => []);
    if (!stu || !stu.class_code) return res.json({ success: true, data: { active: false } });

    const [raids] = await dbm().content.query(
      `SELECT * FROM kids_boss_raid_state
       WHERE school_id=:s AND class_code=:c AND status='active' AND NOW() BETWEEN starts_at AND COALESCE(ends_at, DATE_ADD(NOW(), INTERVAL 7 DAY))
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { s: String(schoolId), c: stu.class_code } },
    );
    const raid = (raids || [])[0];
    if (!raid) return res.json({ success: true, data: { active: false } });

    const guardian = GUARDIANS.find((g) => g.slug === raid.guardian_slug) || GUARDIANS[0];

    // Get raid games
    const [games] = await dbm().content.query(
      `SELECT lesson_id, config_id, order_index FROM kids_boss_raid_games WHERE raid_id=:rid ORDER BY order_index`,
      { replacements: { rid: raid.id } },
    );

    // My participation
    const [myRows] = await dbm().content.query(
      `SELECT total_damage, questions_answered, questions_correct, status
       FROM kids_boss_raid_participants WHERE raid_id=:rid AND child_admission_no=:adm`,
      { replacements: { rid: raid.id, adm } },
    );
    const my = (myRows || [])[0] || {};

    // Top damage dealers
    const [topRows] = await dbm().content.query(
      `SELECT p.child_admission_no AS adm, p.total_damage
       FROM kids_boss_raid_participants p WHERE p.raid_id=:rid
       ORDER BY p.total_damage DESC LIMIT 5`,
      { replacements: { rid: raid.id } },
    );
    const topNames = new Map();
    for (const r of (topRows || [])) {
      const [n] = await dbm().sequelize.query(
        `SELECT student_name, surname, first_name FROM students WHERE admission_no=:a LIMIT 1`,
        { replacements: { a: r.adm }, type: dbm().Sequelize.QueryTypes.SELECT },
      ).catch(() => []);
      topNames.set(r.adm, sanitizeName((n || [])[0]));
    }

    return res.json({
      success: true,
      data: {
        active: true,
        id: raid.id,
        title: raid.title,
        guardian: { slug: guardian.slug, name: guardian.name, emoji: guardian.emoji, title: guardian.title },
        hp: { current: raid.current_hp, max: raid.max_hp, pct: Math.round((raid.current_hp / raid.max_hp) * 100) },
        games: (games || []).map((g) => ({ lesson_id: g.lesson_id, config_id: g.config_id, order_index: g.order_index })),
        my_damage: my.total_damage || 0,
        my_status: my.status || 'not_started',
        top_damage: (topRows || []).map((r) => ({ name: topNames.get(r.adm) || 'Friend', damage: r.total_damage })),
        ends_at: raid.ends_at,
      },
    });
  } catch (err) {
    console.error('boss activeRaid error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Student: submit boss damage ─────────────────────────────────────────────
// POST /kids/boss/raid/:id/damage { lesson_id, config_id?, score, combo_max, rage_used, response_time_ms, duration_s }
async function submitDamage(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const raidId = String(req.params.id || '');
    const adm = String(u.admission_no || '');
    const schoolId = req.headers['x-school-id'] || u.school_id;
    const { lesson_id, config_id, score, combo_max, rage_used, response_time_ms, duration_s } = req.body || {};

    // Verify active raid
    const [raidRows] = await dbm().content.query(
      `SELECT * FROM kids_boss_raid_state WHERE id=:id AND school_id=:s AND status='active' LIMIT 1`,
      { replacements: { id: raidId, s: String(schoolId) } },
    );
    const raid = (raidRows || [])[0];
    if (!raid) return res.status(404).json({ success: false, message: 'No active raid.' });

    const guardian = GUARDIANS.find((g) => g.slug === raid.guardian_slug) || GUARDIANS[0];
    const damage = Math.max(1, Math.round((Number(score) || 0) / 10) * guardian.hp_per_question);
    const actualDamage = Math.min(damage, raid.current_hp); // don't overkill

    // Apply damage
    await dbm().content.query(
      `UPDATE kids_boss_raid_state SET current_hp = GREATEST(0, current_hp - :dmg) WHERE id=:id`,
      { replacements: { dmg: actualDamage, id: raidId } },
    );

    // Update participant
    await dbm().content.query(
      `UPDATE kids_boss_raid_participants
       SET total_damage = total_damage + :dmg,
           questions_answered = questions_answered + 1,
           questions_correct = questions_correct + IF(:score >= 50, 1, 0),
           avg_response_ms = CASE
             WHEN avg_response_ms IS NULL THEN :rt
             ELSE ROUND((avg_response_ms * questions_answered + :rt) / (questions_answered + 1))
           END,
           status = 'playing'
       WHERE raid_id=:rid AND child_admission_no=:adm`,
      { replacements: { dmg: actualDamage, score: Number(score) || 0, rt: Number(response_time_ms) || 0, rid: raidId, adm } },
    );

    // Record boss run
    await dbm().content.query(
      `INSERT INTO kids_boss_runs (child_admission_no, school_id, class_code, lesson_id, config_id, guardian_slug, score, combo_max, rage_used, response_time_ms, duration_s)
       VALUES (:adm, :s, (SELECT class_code FROM students WHERE admission_no=:adm AND school_id=:s LIMIT 1), :lid, :cfg, :g, :sc, :cm, :ru, :rt, :ds)`,
      {
        replacements: {
          adm, s: String(schoolId), lid: lesson_id || null, cfg: config_id || null,
          g: raid.guardian_slug, sc: Number(score) || 0, cm: Number(combo_max) || 0,
          ru: Number(rage_used) || 0, rt: Number(response_time_ms) || 0, ds: Number(duration_s) || 0,
        },
      },
    ).catch(() => {});

    // Check if boss defeated
    const [hpRow] = await dbm().content.query(
      `SELECT current_hp FROM kids_boss_raid_state WHERE id=:id`,
      { replacements: { id: raidId } },
    );
    const hp = ((hpRow || [])[0] || {}).current_hp || 0;
    const defeated = hp <= 0;
    if (defeated) {
      await dbm().content.query(
        `UPDATE kids_boss_raid_state SET status='defeated', current_hp=0 WHERE id=:id`,
        { replacements: { id: raidId } },
      ).catch(() => {});
    }

    return res.json({
      success: true,
      data: {
        damage_dealt: actualDamage,
        boss_hp: hp,
        defeated,
        wisdom: defeated ? `${guardian.name} bows and shares its wisdom: "Knowledge is the greatest weapon!"` : null,
      },
    });
  } catch (err) {
    console.error('boss submitDamage error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Staff: list raids ───────────────────────────────────────────────────────
// GET /kids/boss/raids?class_code=
async function listRaids(req, res) {
  try {
    await ensureSchema();
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    const classCode = req.query.class_code || null;
    let q = `SELECT * FROM kids_boss_raid_state WHERE school_id=:s`;
    const params = { s: String(schoolId) };
    if (classCode) { q += ` AND class_code=:c`; params.c = String(classCode); }
    q += ` ORDER BY created_at DESC LIMIT 20`;
    const [rows] = await dbm().content.query(q, { replacements: params });
    return res.json({ success: true, data: (rows || []).map((r) => ({
      id: r.id, title: r.title, guardian_slug: r.guardian_slug, status: r.status,
      max_hp: r.max_hp, current_hp: r.current_hp, class_code: r.class_code,
      starts_at: r.starts_at, ends_at: r.ends_at,
    }))});
  } catch (err) {
    console.error('boss listRaids error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Staff: set raid games ───────────────────────────────────────────────────
// POST /kids/boss/raid/:id/games { lesson_ids: [{lesson_id, config_id?}] }
async function setRaidGames(req, res) {
  try {
    await ensureSchema();
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    const raidId = String(req.params.id || '');
    const { lesson_ids } = req.body || {};
    if (!Array.isArray(lesson_ids) || !lesson_ids.length) {
      return res.status(400).json({ success: false, message: 'lesson_ids[] required.' });
    }
    const [raidRows] = await dbm().content.query(
      `SELECT id, status FROM kids_boss_raid_state WHERE id=:id AND school_id=:s LIMIT 1`,
      { replacements: { id: raidId, s: String(schoolId) } },
    );
    if (!(raidRows || []).length) return res.status(404).json({ success: false, message: 'Raid not found.' });
    const raid = raidRows[0];
    if (raid.status !== 'active') return res.status(400).json({ success: false, message: 'Only active raids.' });

    await dbm().content.query(`DELETE FROM kids_boss_raid_games WHERE raid_id=:rid`, { replacements: { rid: raidId } });
    let idx = 0;
    for (const item of lesson_ids) {
      const lid = String(item.lesson_id || item).trim();
      const cid = item.config_id ? String(item.config_id).trim() : null;
      if (!lid) continue;
      await dbm().content.query(
        `INSERT INTO kids_boss_raid_games (id, raid_id, lesson_id, config_id, order_index)
         VALUES (:id, :rid, :lid, :cfg, :ord)`,
        { replacements: { id: crypto.randomUUID(), rid: raidId, lid, cfg: cid, ord: idx++ } },
      );
    }
    return res.json({ success: true, data: { set: idx } });
  } catch (err) {
    console.error('boss setRaidGames error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

function sanitizeName(row) {
  if (!row) return 'Friend';
  const first = String(row.first_name || row.student_name || '').trim();
  const last = String(row.surname || '').trim();
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : '';
  return `${first}${initial}` || 'Friend';
}

module.exports = {
  GUARDIANS,
  createRaid, getRaidDashboard, getActiveRaid, submitDamage,
  listRaids, setRaidGames, ensureSchema,
};
