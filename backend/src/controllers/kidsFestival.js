'use strict';
/**
 * Festival of Guardians — term-end sequential boss fights.
 * Teacher schedules a festival, class fights guardians one by one.
 * Collecting all 6 badges = "Guardian of the Storm" mega badge.
 *
 * Table: kids_festival_state
 * Guardian slugs: sango, anansi, amina, baobab, mami, elena
 */
const crypto = require('crypto');
const dbm = () => require('../models');

const GUARDIANS = [
  { slug: 'sango',   name: 'Ṣàngó',      title: 'Guardian of Thunder',   emoji: '⚡', subject: 'Math',    base_hp: 10 },
  { slug: 'anansi',  name: 'Anansi',      title: 'The Web-Trickster',     emoji: '🕸️', subject: 'English',  base_hp: 8 },
  { slug: 'amina',   name: 'Queen Amina', title: 'Fortress Guardian',     emoji: '🏰', subject: 'Numbers',  base_hp: 12 },
  { slug: 'baobab',  name: 'Great Baobab',title: 'Spirit of Nature',      emoji: '🌳', subject: 'Science',  base_hp: 9 },
  { slug: 'mami',    name: 'Mami Wata',   title: 'Guardian of Waters',    emoji: '🌊', subject: 'Colors',   base_hp: 7 },
  { slug: 'elena',   name: 'Elegua',      title: 'Keeper of Paths',       emoji: '🚪', subject: 'Letters',  base_hp: 10 },
];

const BADGE_NAMES = {
  sango:  { name: 'Voice of Ṣàngó',           emoji: '⚡' },
  anansi: { name: "Anansi's Riddle-Master",   emoji: '🕸️' },
  amina:  { name: "Amina's Shield-Bearer",     emoji: '🏰' },
  baobab: { name: "Baobab's Wisdom-Keeper",   emoji: '🌳' },
  mami:   { name: "Mami Wata's Flow-Master",  emoji: '🌊' },
  elena:  { name: "Elegua's Path-Walker",     emoji: '🚪' },
};
const MEGA_BADGE = { name: 'Guardian of the Storm', emoji: '🌩️' };

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_festival_state (
    id CHAR(36) NOT NULL PRIMARY KEY,
    school_id VARCHAR(40) NOT NULL,
    class_code VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL DEFAULT 'Festival of Guardians',
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    current_guardian_slug VARCHAR(30) NULL,
    current_guardian_hp INT NOT NULL DEFAULT 100,
    current_guardian_max_hp INT NOT NULL DEFAULT 100,
    completed_guardians JSON NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_fs_class (school_id, class_code, status),
    KEY idx_fs_starts (starts_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Boss runs table (if not exists from boss system)
  await c.query(`CREATE TABLE IF NOT EXISTS kids_boss_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    child_admission_no VARCHAR(64) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    class_code VARCHAR(40) NULL,
    lesson_id VARCHAR(50) NOT NULL,
    config_id VARCHAR(50) NULL,
    guardian_slug VARCHAR(30) NULL,
    festival_id CHAR(36) NULL,
    score TINYINT DEFAULT 0,
    combo_max SMALLINT DEFAULT 0,
    victories SMALLINT DEFAULT 0,
    rage_used TINYINT DEFAULT 0,
    response_time_ms INT DEFAULT 0,
    duration_s INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_boss_child (child_admission_no, created_at),
    KEY idx_boss_festival (festival_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  _schemaReady = true;
}

// ─── GET /kids/festival/active?class_code= ───────────────────────────────────
async function getActiveFestival(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const classCode = String(req.query.class_code || req.headers['x-class-code'] || '').trim();

    // For students, resolve class_code from their profile
    let resolvedClass = classCode;
    if (u.user_type === 'student' && !classCode) {
      const [stu] = await dbm().sequelize.query(
        `SELECT class_code FROM elite_db.students WHERE admission_no = :adm LIMIT 1`,
        { replacements: { adm: u.admission_no } },
      );
      const s = stu[0] || {};
      resolvedClass = s.class_code || '';
    }

    const sid = u.school_id || '';

    if (!resolvedClass || !sid) {
      return res.json({ success: true, data: null });
    }

    const [festivals] = await dbm().content.query(
      `SELECT * FROM kids_festival_state
       WHERE school_id = :sid AND class_code = :cc AND status IN ('scheduled','active')
       ORDER BY starts_at DESC LIMIT 1`,
      { replacements: { sid, cc: resolvedClass } },
    );
    const f = (Array.isArray(festivals) ? festivals : [])[0] || null;
    if (!f) return res.json({ success: true, data: null });

    // Build guardian progress
    let completed = [];
    try { completed = f.completed_guardians ? JSON.parse(String(f.completed_guardians)) : []; } catch { completed = []; }
    const guardians = GUARDIANS.map(g => ({
      ...g,
      status: completed.includes(g.slug) ? 'defeated' :
              f.current_guardian_slug === g.slug ? 'active' : 'upcoming',
      hp: f.current_guardian_slug === g.slug ? f.current_guardian_hp : (completed.includes(g.slug) ? 0 : g.base_hp * 10),
      max_hp: g.base_hp * 10,
    }));

    const totalDefeated = completed.length;
    const totalGuardians = GUARDIANS.length;
    const allDefeated = totalDefeated >= totalGuardians;

    return res.json({
      success: true,
      data: {
        id: f.id,
        title: f.title,
        status: f.status,
        starts_at: f.starts_at,
        ends_at: f.ends_at,
        guardians,
        total_defeated: totalDefeated,
        total_guardians: totalGuardians,
        all_defeated: allDefeated,
        mega_badge_earned: allDefeated,
        current_guardian: guardians.find(g => g.status === 'active') || null,
      },
    });
  } catch (err) {
    console.error('festival getActive error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── POST /kids/festival/create { class_code, title?, starts_at?, guardian_order? } ──
async function createFestival(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (!['admin', 'staff', 'teacher'].includes(String(u.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Teachers only.' });
    }

    const { class_code, title, starts_at, guardian_order } = req.body || {};
    if (!class_code) return res.status(400).json({ success: false, message: 'class_code required.' });

    const sid = u.school_id || '';

    // Check no active festival for this class
    const [existing] = await dbm().content.query(
      `SELECT id FROM kids_festival_state
       WHERE school_id = :sid AND class_code = :cc AND status IN ('scheduled','active') LIMIT 1`,
      { replacements: { sid, cc: class_code } },
    );
    if ((existing || []).length > 0) {
      return res.status(400).json({ success: false, message: 'An active or scheduled festival already exists for this class.' });
    }

    const firstGuardian = GUARDIANS[0];
    const festivalId = crypto.randomUUID();
    const startAt = starts_at || new Date().toISOString().slice(0, 19).replace('T', ' ');

    await dbm().content.query(
      `INSERT INTO kids_festival_state
        (id, school_id, class_code, title, status, current_guardian_slug, current_guardian_hp, current_guardian_max_hp, completed_guardians, starts_at, created_by)
       VALUES (:id, :sid, :cc, :title, 'active', :gs, :hp, :mhp, '[]', :starts, :creator)`,
      {
        replacements: {
          id: festivalId,
          sid,
          cc: class_code,
          title: title || 'Festival of Guardians',
          gs: firstGuardian.slug,
          hp: firstGuardian.base_hp * 10,
          mhp: firstGuardian.base_hp * 10,
          starts: startAt,
          creator: u.id || u.admission_no || '',
        },
      },
    );

    return res.json({
      success: true,
      data: {
        id: festivalId,
        title: title || 'Festival of Guardians',
        first_guardian: firstGuardian,
        message: ` Festival begins! Face ${firstGuardian.emoji} ${firstGuardian.name} first!`,
      },
    });
  } catch (err) {
    console.error('festival create error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── POST /kids/festival/:id/damage { score, combo_max, rage_used } ──────────
async function dealDamage(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') return res.status(403).json({ success: false, message: 'Students only.' });

    const festivalId = String(req.params.id || '');
    const { score, combo_max, rage_used, lesson_id, config_id } = req.body || {};
    const sid = u.school_id || '';
    const adm = u.admission_no || '';

    // Get festival state
    const [festivals] = await dbm().content.query(
      `SELECT * FROM kids_festival_state WHERE id = :id LIMIT 1`,
      { replacements: { id: festivalId } },
    );
    const f = (festivals || [])[0];
    if (!f || f.status !== 'active') {
      return res.status(400).json({ success: false, message: 'No active festival.' });
    }

    if (!f.current_guardian_slug) {
      return res.status(400).json({ success: false, message: 'No active guardian.' });
    }

    // Calculate damage: base score + combo bonus + rage multiplier
    let damage = Math.max(1, Math.floor(score / 10));
    if (combo_max >= 5) damage += 3;
    else if (combo_max >= 3) damage += 1;
    if (rage_used) damage = Math.floor(damage * 1.5);

    // Rubber-band: trailing teams get 1.15x (simplified for festival)
    damage = Math.max(1, damage);

    // Apply damage
    let newHp = Math.max(0, f.current_guardian_hp - damage);
    const guardian = GUARDIANS.find(g => g.slug === f.current_guardian_slug);
    let completed = [];
    try { completed = f.completed_guardians ? JSON.parse(String(f.completed_guardians)) : []; } catch { completed = []; }

    // Log boss run
    await dbm().content.query(
      `INSERT INTO kids_boss_runs
        (child_admission_no, school_id, class_code, lesson_id, config_id, guardian_slug, festival_id, score, combo_max, rage_used, response_time_ms)
       VALUES (:adm, :sid, :cc, :lid, :cid, :gs, :fid, :score, :combo, :rage, 0)`,
      {
        replacements: {
          adm, sid, cc: f.class_code,
          lid: lesson_id || '', cid: config_id || '',
          gs: f.current_guardian_slug, fid: festivalId,
          score: score || 0, combo: combo_max || 0, rage: rage_used ? 1 : 0,
        },
      },
    );

    let defeated = false;
    let nextGuardian = null;
    let allDefeated = false;

    if (newHp <= 0) {
      // Guardian defeated!
      defeated = true;
      completed.push(f.current_guardian_slug);
      newHp = 0; // clamp for badge logic

      // Award guardian badge to this student
      const badgeInfo = BADGE_NAMES[f.current_guardian_slug];
      if (badgeInfo) {
        const existingBadge = await dbm().content.query(
          `SELECT id FROM kids_badges WHERE child_admission_no = :adm AND badge_name = :bn LIMIT 1`,
          { replacements: { adm, bn: badgeInfo.name } },
        );
        const exRows = (existingBadge || [])[0] || [];
        if (exRows.length === 0) {
          await dbm().content.query(
            `INSERT INTO kids_badges (id, child_admission_no, school_id, badge_name, badge_emoji, badge_type, awarded_at)
             VALUES (:id, :adm, :sid, :name, :emoji, 'festival', NOW())`,
            { replacements: { id: crypto.randomUUID(), adm, sid, name: badgeInfo.name, emoji: badgeInfo.emoji } },
          );
        }
      }

      // Find next guardian
      const currentIdx = GUARDIANS.findIndex(g => g.slug === f.current_guardian_slug);
      if (currentIdx >= 0 && currentIdx < GUARDIANS.length - 1) {
        nextGuardian = GUARDIANS[currentIdx + 1];
      } else {
        // All guardians defeated!
        allDefeated = true;

        // Award mega badge
        const existingMega = await dbm().content.query(
          `SELECT id FROM kids_badges WHERE child_admission_no = :adm AND badge_name = :bn LIMIT 1`,
          { replacements: { adm, bn: MEGA_BADGE.name } },
        );
        const exMega = (existingMega || [])[0] || [];
        if (exMega.length === 0) {
          await dbm().content.query(
            `INSERT INTO kids_badges (id, child_admission_no, school_id, badge_name, badge_emoji, badge_type, awarded_at)
             VALUES (:id, :adm, :sid, :name, :emoji, 'mega_festival', NOW())`,
            { replacements: { id: crypto.randomUUID(), adm, sid, name: MEGA_BADGE.name, emoji: MEGA_BADGE.emoji } },
          );
        }
      }

      // Update festival state
      if (allDefeated) {
        await dbm().content.query(
          `UPDATE kids_festival_state
           SET status = 'completed', current_guardian_slug = NULL, current_guardian_hp = 0,
               completed_guardians = :cg, ends_at = NOW()
           WHERE id = :id`,
          { replacements: { cg: JSON.stringify(completed), id: festivalId } },
        );
      } else if (nextGuardian) {
        await dbm().content.query(
          `UPDATE kids_festival_state
           SET current_guardian_slug = :gs, current_guardian_hp = :hp, current_guardian_max_hp = :mhp,
               completed_guardians = :cg
           WHERE id = :id`,
          {
            replacements: {
              gs: nextGuardian.slug,
              hp: nextGuardian.base_hp * 10,
              mhp: nextGuardian.base_hp * 10,
              cg: JSON.stringify(completed),
              id: festivalId,
            },
          },
        );
      }
    } else {
      // Guardian still alive — just update HP
      await dbm().content.query(
        `UPDATE kids_festival_state SET current_guardian_hp = :hp WHERE id = :id`,
        { replacements: { hp: newHp, id: festivalId } },
      );
    }

    return res.json({
      success: true,
      data: {
        damage,
        guardian_hp: newHp,
        guardian_max_hp: f.current_guardian_max_hp,
        guardian_defeated: defeated,
        next_guardian: nextGuardian,
        all_defeated: allDefeated,
        guardian_emoji: guardian?.emoji || '⚔️',
        guardian_name: guardian?.name || 'Unknown',
        combo_max: combo_max || 0,
        rage_used: !!rage_used,
        badge_earned: defeated ? BADGE_NAMES[f.current_guardian_slug] : null,
        mega_badge_earned: allDefeated ? MEGA_BADGE : null,
      },
    });
  } catch (err) {
    console.error('festival dealDamage error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/festival/history?class_code= ──────────────────────────────────
async function getFestivalHistory(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const sid = u.school_id || '';
    const classCode = String(req.query.class_code || '').trim();

    let query = `SELECT id, title, status, completed_guardians, starts_at, ends_at, created_by
                 FROM kids_festival_state WHERE school_id = :sid`;
    const replacements = { sid };

    if (classCode) {
      query += ` AND class_code = :cc`;
      replacements.cc = classCode;
    }
    query += ` ORDER BY starts_at DESC LIMIT 10`;

    const [rows] = await dbm().content.query(query, { replacements });
    const festivals = Array.isArray(rows) ? rows : [];

    return res.json({
      success: true,
      data: festivals.map(f => ({
        ...f,
        completed_count: f.completed_guardians ? JSON.parse(f.completed_guardians).length : 0,
        total_guardians: GUARDIANS.length,
      })),
    });
  } catch (err) {
    console.error('festival getHistory error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/festival/guardians — list all guardians ────────────────────────
async function listGuardians(req, res) {
  return res.json({ success: true, data: GUARDIANS });
}

module.exports = {
  ensureSchema,
  getActiveFestival,
  createFestival,
  dealDamage,
  getFestivalHistory,
  listGuardians,
  GUARDIANS,
  BADGE_NAMES,
  MEGA_BADGE,
};
