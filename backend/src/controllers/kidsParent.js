'use strict';
/**
 * Parent Dashboard — parents track their child's learning progress.
 * Phone + PIN login (simplified OTP for v1).
 *
 * Tables: kids_parent_links, kids_parent_notifications
 */
const crypto = require('crypto');
const dbm = () => require('../models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_parent_links (
    id CHAR(36) NOT NULL PRIMARY KEY,
    parent_phone VARCHAR(20) NOT NULL,
    parent_pin VARCHAR(10) NOT NULL DEFAULT '1234',
    child_admission_no VARCHAR(64) NOT NULL,
    child_name VARCHAR(120) NULL,
    school_id VARCHAR(40) NOT NULL,
    verified TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_parent_child (parent_phone, child_admission_no),
    KEY idx_parent_phone (parent_phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await c.query(`CREATE TABLE IF NOT EXISTS kids_parent_notifications (
    id CHAR(36) NOT NULL PRIMARY KEY,
    parent_phone VARCHAR(20) NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'daily_summary',
    title VARCHAR(120) NULL,
    body TEXT NULL,
    child_admission_no VARCHAR(64) NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pn_parent (parent_phone, read_at),
    KEY idx_pn_child (child_admission_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

// ─── Auth: POST /kids/parent/login { phone, pin } ───────────────────────────
async function login(req, res) {
  try {
    await ensureSchema();
    const { phone, pin } = req.body || {};
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required.' });

    const cleanPhone = String(phone).replace(/\s+/g, '').replace(/^0/, '+234');
    const pinCode = String(pin || '1234');

    // Find parent by phone
    const [links] = await dbm().content.query(
      `SELECT pl.*
       FROM kids_parent_links pl
       WHERE pl.parent_phone = :phone AND pl.parent_pin = :pin AND pl.verified = 1
       LIMIT 10`,
      { replacements: { phone: cleanPhone, pin: pinCode } },
    );
    const rows = Array.isArray(links) ? links : [];
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid phone or PIN.' });
    }

    // Generate ECOSYSTEM JWT for parent — signed with the shared JWT_SECRET_KEY and
    // carrying id + school_id so the cross-app AppSwitcher (/api/apps/access) and the
    // other Elite-suite apps accept it for ?token= handoff. phone + children claims are
    // kept so the kids parent routes (passport lightweight parent session) keep working.
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET_KEY || 'elitekids_jwt_secret_2024';

    // School context: linked children should share one school (v1).
    const schoolIds = [...new Set(rows.map(r => r.school_id).filter(Boolean))];
    const schoolId = schoolIds.length === 1 ? schoolIds[0] : (schoolIds[0] || null);

    // Link to the real parent record (elite_db.parents) for id + branch context.
    let parentId = null;
    let branchId = null;
    if (schoolId) {
      try {
        const [parentRows] = await dbm().sequelize.query(
          `SELECT user_id, branch_id FROM parents WHERE phone = :phone AND school_id = :school_id LIMIT 1`,
          { replacements: { phone: cleanPhone, school_id: schoolId } },
        );
        const p = (Array.isArray(parentRows) ? parentRows : [])[0];
        if (p) {
          parentId = p.user_id || null;
          branchId = p.branch_id || null;
        }
      } catch (err) {
        console.error('parent record lookup skipped:', err.message);
      }
    }

    const token = jwt.sign(
      {
        id: parentId,
        user_type: 'parent',
        phone: cleanPhone,
        school_id: schoolId,
        branch_id: branchId,
        children: rows.map(r => r.child_admission_no),
      },
      JWT_SECRET,
      { expiresIn: '7d' },
    );

    return res.json({
      success: true,
      data: {
        token,
        parent_phone: cleanPhone,
        children: rows.map(r => ({
          admission_no: r.child_admission_no,
          name: r.child_name || r.child_admission_no,
          school_id: r.school_id,
          school_name: r.school_id || '',
        })),
      },
    });
  } catch (err) {
    console.error('parent login error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Register: POST /kids/parent/register { phone, pin, admission_no, school_id } ──
async function register(req, res) {
  try {
    await ensureSchema();
    const { phone, pin, admission_no, school_id } = req.body || {};
    if (!phone || !admission_no || !school_id) {
      return res.status(400).json({ success: false, message: 'phone, admission_no, school_id required.' });
    }

    const cleanPhone = String(phone).replace(/\s+/g, '').replace(/^0/, '+234');
    const pinCode = String(pin || '1234');
    const adm = String(admission_no).trim();
    const sid = String(school_id).trim();

    // Verify child exists in elite_db.students
    const [students] = await dbm().sequelize.query(
      `SELECT student_name, surname FROM elite_db.students WHERE admission_no = :adm AND school_id = :sid LIMIT 1`,
      { replacements: { adm, sid } },
    );
    const stu = (Array.isArray(students) ? students : [])[0];
    const childName = stu ? `${stu.student_name || ''} ${stu.surname || ''}`.trim() : adm;

    // Upsert parent link
    const existing = await dbm().content.query(
      `SELECT id FROM kids_parent_links WHERE parent_phone = :phone AND child_admission_no = :adm LIMIT 1`,
      { replacements: { phone: cleanPhone, adm } },
    );
    const exRows = Array.isArray(existing[0]) ? existing[0] : [];

    if (exRows.length > 0) {
      await dbm().content.query(
        `UPDATE kids_parent_links SET parent_pin = :pin, child_name = :name, verified = 1 WHERE id = :id`,
        { replacements: { pin: pinCode, name: childName, id: exRows[0].id } },
      );
    } else {
      await dbm().content.query(
        `INSERT INTO kids_parent_links (id, parent_phone, parent_pin, child_admission_no, child_name, school_id, verified)
         VALUES (:id, :phone, :pin, :adm, :name, :sid, 1)`,
        { replacements: { id: crypto.randomUUID(), phone: cleanPhone, pin: pinCode, adm, name: childName, sid } },
      );
    }

    return res.json({ success: true, data: { message: 'Account linked!', child_name: childName } });
  } catch (err) {
    console.error('parent register error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/parent/children — list linked children ────────────────────────
async function getChildren(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');
    const [links] = await dbm().content.query(
      `SELECT pl.child_admission_no, pl.child_name, pl.school_id
       FROM kids_parent_links pl
       WHERE pl.parent_phone = :phone AND pl.verified = 1`,
      { replacements: { phone } },
    );
    const children = Array.isArray(links) ? links : [];
    return res.json({ success: true, data: children });
  } catch (err) {
    console.error('parent getChildren error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/parent/child/:adm/progress — child weekly summary ─────────────
async function getChildProgress(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');
    const adm = String(req.params.adm || '').trim();

    // Verify parent owns this child
    const [owned] = await dbm().content.query(
      `SELECT id FROM kids_parent_links WHERE parent_phone = :phone AND child_admission_no = :adm LIMIT 1`,
      { replacements: { phone, adm } },
    );
    if (!Array.isArray(owned) || owned.length === 0) {
      return res.status(403).json({ success: false, message: 'Not linked to this child.' });
    }

    // Get this week's stats from kids_progress
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().slice(0, 19).replace('T', ' ');

    const [progress] = await dbm().content.query(
      `SELECT COUNT(*) AS games_played,
              ROUND(AVG(score), 1) AS avg_score,
              SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END) AS excellent_games,
              COUNT(DISTINCT lesson_id) AS unique_lessons,
              MIN(created_at) AS first_play,
              MAX(created_at) AS last_play
       FROM kids_progress
       WHERE child_admission_no = :adm AND created_at >= :weekStart`,
      { replacements: { adm, weekStart: weekStartStr } },
    );
    const stats = (Array.isArray(progress[0]) ? progress[0] : [])[0] || {
      games_played: 0, avg_score: 0, excellent_games: 0, unique_lessons: 0,
    };

    // Get total points (all time)
    const [pts] = await dbm().content.query(
      `SELECT COALESCE(SUM(points), 0) AS total_points, COALESCE(SUM(attempts), 0) AS total_attempts
       FROM kids_weekly_points WHERE child_admission_no = :adm`,
      { replacements: { adm } },
    );
    const ptsRow = (Array.isArray(pts[0]) ? pts[0] : [])[0] || { total_points: 0, total_attempts: 0 };

    // Get badges earned this week
    const [badges] = await dbm().content.query(
      `SELECT badge_name, badge_emoji, awarded_at
       FROM kids_badges
       WHERE child_admission_no = :adm
       ORDER BY awarded_at DESC LIMIT 10`,
      { replacements: { adm } },
    );

    // Get recent activity (last 5 games)
    const [recent] = await dbm().content.query(
      `SELECT lesson_id, config_id, score, mode, created_at
       FROM kids_progress
       WHERE child_admission_no = :adm
       ORDER BY created_at DESC LIMIT 5`,
      { replacements: { adm } },
    );

    // Get current curriculum progress
    const [curriculum] = await dbm().content.query(
      `SELECT s.title AS subject_name, COUNT(DISTINCT l.id) AS total_lessons,
              SUM(CASE WHEN p.score IS NOT NULL AND p.score >= 50 THEN 1 ELSE 0 END) AS completed_lessons
       FROM kids_game_series s
       LEFT JOIN kids_lessons l ON l.series_id = s.id AND l.content_state = 'published'
       LEFT JOIN kids_progress p ON p.lesson_id = l.id AND p.child_admission_no = :adm AND p.mode = 'test'
       WHERE s.subject_code IS NOT NULL
       GROUP BY s.id, s.title
       ORDER BY s.title`,
      { replacements: { adm } },
    );

    return res.json({
      success: true,
      data: {
        week: {
          games_played: stats.games_played || 0,
          avg_score: stats.avg_score || 0,
          excellent_games: stats.excellent_games || 0,
          unique_lessons: stats.unique_lessons || 0,
        },
        all_time: {
          total_points: ptsRow.total_points || 0,
          total_attempts: ptsRow.total_attempts || 0,
        },
        badges: Array.isArray(badges) ? badges : [],
        recent_activity: Array.isArray(recent) ? recent : [],
        curriculum_progress: Array.isArray(curriculum) ? curriculum : [],
      },
    });
  } catch (err) {
    console.error('parent getChildProgress error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/parent/child/:adm/achievements — badges + trophies ────────────
async function getChildAchievements(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');
    const adm = String(req.params.adm || '').trim();

    // Verify ownership
    const [owned] = await dbm().content.query(
      `SELECT id FROM kids_parent_links WHERE parent_phone = :phone AND child_admission_no = :adm LIMIT 1`,
      { replacements: { phone, adm } },
    );
    if (!Array.isArray(owned) || owned.length === 0) {
      return res.status(403).json({ success: false, message: 'Not linked to this child.' });
    }

    // Get all badges
    const [badges] = await dbm().content.query(
      `SELECT badge_name, badge_emoji, badge_type, awarded_at
       FROM kids_badges
       WHERE child_admission_no = :adm
       ORDER BY awarded_at DESC`,
      { replacements: { adm } },
    );

    // Get competition results
    const [comps] = await dbm().content.query(
      `SELECT ca.total_score, ca.questions_correct, ca.status,
              c.title AS comp_title, c.comp_type, c.ended_at
       FROM kids_competition_analytics ca
       JOIN kids_competitions c ON c.id = ca.competition_id
       WHERE ca.child_admission_no = :adm AND ca.status = 'completed'
       ORDER BY c.ended_at DESC LIMIT 10`,
      { replacements: { adm } },
    );

    // Get boss run history
    const [bossRuns] = await dbm().content.query(
      `SELECT score, combo_max, victories, guardian_slug, created_at
       FROM kids_boss_runs
       WHERE child_admission_no = :adm
       ORDER BY created_at DESC LIMIT 10`,
      { replacements: { adm } },
    );

    return res.json({
      success: true,
      data: {
        badges: Array.isArray(badges) ? badges : [],
        competitions: Array.isArray(comps) ? comps : [],
        boss_runs: Array.isArray(bossRuns) ? bossRuns : [],
      },
    });
  } catch (err) {
    console.error('parent getChildAchievements error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/parent/notifications — parent notification inbox ───────────────
async function getNotifications(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');
    const [notifs] = await dbm().content.query(
      `SELECT id, type, title, body, child_admission_no, read_at, created_at
       FROM kids_parent_notifications
       WHERE parent_phone = :phone
       ORDER BY created_at DESC LIMIT 50`,
      { replacements: { phone } },
    );
    return res.json({ success: true, data: Array.isArray(notifs) ? notifs : [] });
  } catch (err) {
    console.error('parent getNotifications error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── POST /kids/parent/notifications/:id/read ────────────────────────────────
async function markRead(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const notifId = String(req.params.id || '');
    await dbm().content.query(
      `UPDATE kids_parent_notifications SET read_at = NOW() WHERE id = :id AND parent_phone = :phone`,
      { replacements: { id: notifId, phone: String(u.phone || '') } },
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('parent markRead error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Helper: sendNotification (called from other controllers) ─────────────────
async function sendNotification({ parent_phone, type, title, body, child_admission_no }) {
  try {
    await ensureSchema();
    await dbm().content.query(
      `INSERT INTO kids_parent_notifications (id, parent_phone, type, title, body, child_admission_no)
       VALUES (:id, :phone, :type, :title, :body, :adm)`,
      { replacements: { id: crypto.randomUUID(), phone: parent_phone, type, title, body, adm: child_admission_no || null } },
    );
  } catch (err) {
    console.error('parent sendNotification error:', err.message);
  }
}

// ─── Helper: notifyOnGameComplete (hook into recordGameComplete) ───────────────
async function notifyOnGameComplete({ child_admission_no, score, lesson_id }) {
  try {
    await ensureSchema();
    // Find parent links for this child
    const [links] = await dbm().content.query(
      `SELECT parent_phone FROM kids_parent_links WHERE child_admission_no = :adm AND verified = 1`,
      { replacements: { adm: child_admission_no } },
    );
    const phones = Array.isArray(links) ? links.map(l => l.parent_phone) : [];
    if (phones.length === 0) return;

    // Get child name
    const [stu] = await dbm().sequelize.query(
      `SELECT student_name, surname FROM elite_db.students WHERE admission_no = :adm LIMIT 1`,
      { replacements: { adm: child_admission_no } },
    );
    const s = (Array.isArray(stu[0]) ? stu[0] : [])[0] || {};
    const childName = `${s.student_name || ''} ${s.surname || ''}`.trim() || child_admission_no;

    const emoji = score >= 80 ? '🌟' : score >= 50 ? '✅' : '📝';
    const msg = `${emoji} ${childName} scored ${score}% on a game!`;

    for (const phone of phones) {
      await sendNotification({
        parent_phone: phone,
        type: score >= 80 ? 'achievement' : 'daily_summary',
        title: 'Game Update',
        body: msg,
        child_admission_no,
      });
    }
  } catch (err) {
    console.error('parent notifyOnGameComplete error:', err.message);
  }
}

module.exports = {
  ensureSchema,
  login,
  register,
  getChildren,
  getChildProgress,
  getChildAchievements,
  getNotifications,
  markRead,
  sendNotification,
  notifyOnGameComplete,
};
