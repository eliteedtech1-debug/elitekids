'use strict';
/**
 * Parent Dashboard — parents track their child's learning progress.
 * Phone + PIN login (simplified OTP for v1).
 *
 * Tables: kids_parent_links, kids_parent_notifications
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const dbm = () => require('../models');
const { flagshipShortNameFromHost } = require('../seeders/flagshipKidsSeed');

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

// ─── Auth: POST /kids/parent/login { phone (or email/username), password }
// UNIFIED LOGIN (suite rule, PIN DELETED): validates ONLY the SAME credential
// as EliteSMS - the shared users/parents tables in DB_NAME + bcrypt password
// (MASTER_PWD bypass mirrors EliteSMS). The kids `kids_parent_links.parent_pin`
// is dead: not accepted as input, not used for auth. School context comes from
// short_name/school_id or the parent's linked school. Token is the ecosystem
// JWT (JWT_SECRET_KEY) so switching apps needs no re-login.
async function login(req, res) {
  try {
    await ensureSchema();
    const { phone, email, username, password, short_name, school_id } = req.body || {};
    const identifier = String((phone || email || username) || '').trim();
    const pass = String(password || '');
    if (!identifier || !pass) {
      return res.status(400).json({ success: false, message: 'Phone/email/username and password are required.' });
    }
    const cleanPhone = String(phone || '').replace(/\s+/g, '').replace(/^0/, '+234');

    let resolvedSchoolId = school_id || null;
    if (short_name && !resolvedSchoolId) {
      const schools = await dbm().sequelize.query(
        `SELECT school_id FROM school_setup
         WHERE (LOWER(short_name) = LOWER(:sn) OR school_id = :sn) AND status = 'Active' LIMIT 1`,
        { replacements: { sn: short_name }, type: dbm().sequelize.QueryTypes.SELECT }
      );
      resolvedSchoolId = (Array.isArray(schools) ? schools[0] : null)?.school_id || null;
    }

    // kids_parent_links is now a LINK table only, not an auth source
    const [links] = await dbm().content.query(
      `SELECT * FROM kids_parent_links WHERE parent_phone = :phone AND verified = 1 LIMIT 20`,
      { replacements: { phone: cleanPhone } }
    );
    const linkRows = Array.isArray(links) ? links : [];

    if (!resolvedSchoolId && linkRows.length) {
      const sids = [...new Set(linkRows.map(r => r.school_id).filter(Boolean))];
      resolvedSchoolId = sids.length === 1 ? sids[0] : (sids[0] || null);
    }
    if (!resolvedSchoolId && !short_name) {
      // Flagship rule: ANY *.elitekids.com.ng subdomain (kids., games., …)
      // resolves to the flagship school — a parent arriving on any flagship
      // URL logs into the same school and can never miss it.
      const hostFlagshipSn = flagshipShortNameFromHost(req.headers?.host || req.get?.('host'));
      if (hostFlagshipSn) {
        const fsSchools = await dbm().sequelize.query(
          `SELECT school_id FROM school_setup
           WHERE LOWER(short_name) = LOWER(:sn) AND status = 'Active' LIMIT 1`,
          { replacements: { sn: hostFlagshipSn }, type: dbm().sequelize.QueryTypes.SELECT }
        );
        resolvedSchoolId = (Array.isArray(fsSchools) ? fsSchools[0] : null)?.school_id || null;
      }
    }
    if (!resolvedSchoolId) {
      return res.status(400).json({ success: false, message: 'School not found or inactive.' });
    }

    // Credential check against the SHARED database - identical to EliteSMS
    const rows = await dbm().sequelize.query(
      `SELECT u.id, u.email, u.username, u.password, u.status, u.user_type, u.school_id
       FROM users u LEFT JOIN parents p ON p.user_id = u.id
       WHERE (LOWER(u.email) = LOWER(:id) OR LOWER(u.username) = LOWER(:id) OR p.phone = :id OR p.phone = :clean)
         AND (u.school_id = :school_id OR p.school_id = :school_id)
       LIMIT 5`,
      { replacements: { id: identifier, clean: cleanPhone, school_id: resolvedSchoolId },
        type: dbm().sequelize.QueryTypes.SELECT }
    );
    const creds = Array.isArray(rows) ? rows : [];

    const isMaster = !!(process.env.MASTER_PWD && pass === process.env.MASTER_PWD);
    const matched = [];
    for (const c of creds) {
      if (isMaster || (c.password && bcrypt.compareSync(pass, c.password))) matched.push(c);
    }
    if (!matched.length) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email/username or password.' });
    }
    const acct = matched[0];
    if (acct.status && String(acct.status).toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account is not active. Please contact admin.' });
    }

    if (!process.env.JWT_SECRET_KEY) {
      return res.status(500).json({ success: false, message: 'JWT_SECRET_KEY is not configured.' });
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: acct.id,
        user_type: 'parent',
        phone: cleanPhone || identifier,
        school_id: resolvedSchoolId,
        children: linkRows.map(r => r.child_admission_no).filter(Boolean),
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      data: {
        token,
        parent_phone: cleanPhone || identifier,
        children: linkRows.map(r => ({
          admission_no: r.child_admission_no,
          name: r.child_name || r.child_admission_no || '',
          school_id: r.school_id,
          school_name: r.school_id || '',
        })),
      },
    });
  } catch (err) {
    console.error('parent login error:', err.message, err.stack);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── Register: POST /kids/parent/register { phone, password, admission_no, school_id } ──
async function register(req, res) {
  try {
    await ensureSchema();
    const { phone, admission_no, school_id } = req.body || {};
    if (!phone || !admission_no || !school_id) {
      return res.status(400).json({ success: false, message: 'phone, admission_no, school_id required.' });
    }

    const cleanPhone = String(phone).replace(/\s+/g, '').replace(/^0/, '+234');
    const adm = String(admission_no).trim();
    const sid = String(school_id).trim();

    // UNIFIED REGISTRATION (suite rule, PIN DELETED): parents must be EXISTING
    // shared accounts (users/parents in DB_NAME) who prove the SHARED password.
    // No PIN credential is created or used; this merely LINKS the child.
    // No token is returned - auth goes through the unified login, and app
    // switches need no re-login.
    const pass = String((req.body && req.body.password) || '');
    if (!pass) {
      return res.status(400).json({ success: false, message: 'Password required - link your child with your EliteSMS password.' });
    }
    const bcryptReg = require('bcryptjs');
    const credRows = await dbm().sequelize.query(
      `SELECT u.id, u.password, u.status FROM users u LEFT JOIN parents p ON p.user_id = u.id WHERE (p.phone = :clean OR p.phone = :id) AND (u.school_id = :sid OR p.school_id = :sid) LIMIT 1`,
      { replacements: { clean: cleanPhone, id: String(phone).trim(), sid }, type: dbm().sequelize.QueryTypes.SELECT }
    );
    const credRow = (Array.isArray(credRows) ? credRows : [])[0];
    const isMaster = !!(process.env.MASTER_PWD && pass === process.env.MASTER_PWD);
    if (!credRow || !(isMaster || (credRow.password && bcryptReg.compareSync(pass, credRow.password)))) {
      return res.status(401).json({ success: false, message: 'No matching EliteSMS parent account or wrong password.' });
    }
    await dbm().content.query(
      `INSERT INTO kids_parent_links (id, parent_phone, parent_pin, child_admission_no, child_name, school_id, verified) VALUES (UUID(), :phone, '', :adm, '', :sid, 1) ON DUPLICATE KEY UPDATE school_id = VALUES(school_id), verified = 1`,
      { replacements: { phone: cleanPhone, adm, sid } }
    );
    return res.json({ success: true, data: { message: 'Child linked. Log in with your EliteSMS phone/email + password.' } });

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

// ─── GET /kids/parent/child/:adm/controls — merged controls + mode lock ─────
async function getChildControls(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');
    const adm = String(req.params.adm || '').trim();

    const [owned] = await dbm().content.query(
      `SELECT id FROM kids_parent_links WHERE parent_phone = :phone AND child_admission_no = :adm LIMIT 1`,
      { replacements: { phone, adm } },
    );
    if (!Array.isArray(owned) || owned.length === 0) {
      return res.status(403).json({ success: false, message: 'Not linked to this child.' });
    }

    // Parental controls
    const [controls] = await dbm().content.query(
      `SELECT daily_play_limit_minutes, allowed_time_start, allowed_time_end
       FROM kids_parental_controls WHERE student_id = :adm LIMIT 1`,
      { replacements: { adm } },
    );
    const ctrl = (Array.isArray(controls) ? controls : [])[0] || {
      daily_play_limit_minutes: 30, allowed_time_start: null, allowed_time_end: null,
    };

    // Active mode locks
    const [locks] = await dbm().content.query(
      `SELECT lesson_id, mode, locked_by, class_code, created_at
       FROM kids_mode_locks
       WHERE (child_admission_no = :adm OR child_admission_no = '*')
       ORDER BY created_at DESC LIMIT 10`,
      { replacements: { adm } },
    );

    // Today's play stats
    const today = new Date().toISOString().split('T')[0];
    const [todayStats] = await dbm().content.query(
      `SELECT COUNT(*) AS games_today,
              ROUND(AVG(score), 1) AS avg_score_today
       FROM kids_progress
       WHERE child_admission_no = :adm AND DATE(created_at) = :today`,
      { replacements: { adm, today } },
    );
    const stats = (Array.isArray(todayStats[0]) ? todayStats[0] : [])[0] || { games_today: 0, avg_score_today: 0 };

    return res.json({
      success: true,
      data: {
        controls: ctrl,
        mode_locks: Array.isArray(locks) ? locks : [],
        today: stats,
      },
    });
  } catch (err) {
    console.error('parent getChildControls error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/parent/child/:adm/report?week=YYYY-MM-DD — printable weekly report ──
async function getChildReport(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');
    const adm = String(req.params.adm || '').trim();

    const [owned] = await dbm().content.query(
      `SELECT id FROM kids_parent_links WHERE parent_phone = :phone AND child_admission_no = :adm LIMIT 1`,
      { replacements: { phone, adm } },
    );
    if (!Array.isArray(owned) || owned.length === 0) {
      return res.status(403).json({ success: false, message: 'Not linked to this child.' });
    }

    // Parse week param (default: current week)
    const weekStr = String(req.query.week || '').trim();
    let weekStart, weekEnd;
    if (weekStr && /^\d{4}-\d{2}-\d{2}$/.test(weekStr)) {
      weekStart = new Date(weekStr + 'T00:00:00Z');
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
    } else {
      const now = new Date();
      weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      weekStart.setHours(0, 0, 0, 0);
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
    }
    const ws = weekStart.toISOString().slice(0, 19).replace('T', ' ');
    const we = weekEnd.toISOString().slice(0, 19).replace('T', ' ');

    // Weekly summary
    const [progress] = await dbm().content.query(
      `SELECT COUNT(*) AS games_played,
              ROUND(AVG(score), 1) AS avg_score,
              SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END) AS excellent,
              SUM(CASE WHEN score < 50 THEN 1 ELSE 0 END) AS needs_work,
              COUNT(DISTINCT lesson_id) AS unique_lessons,
              SUM(time_spent_seconds) AS total_time_seconds
       FROM kids_progress
       WHERE child_admission_no = :adm AND created_at >= :ws AND created_at < :we`,
      { replacements: { adm, ws, we } },
    );
    const weekly = (Array.isArray(progress[0]) ? progress[0] : [])[0] || {
      games_played: 0, avg_score: 0, excellent: 0, needs_work: 0, unique_lessons: 0, total_time_seconds: 0,
    };

    // Per-subject breakdown
    const [subjects] = await dbm().content.query(
      `SELECT p.lesson_id, l.title, l.subject, COUNT(*) AS plays, ROUND(AVG(p.score), 1) AS avg
       FROM kids_progress p
       LEFT JOIN kids_lessons l ON l.id = p.lesson_id
       WHERE p.child_admission_no = :adm AND p.created_at >= :ws AND p.created_at < :we
       GROUP BY p.lesson_id, l.title, l.subject
       ORDER BY avg DESC`,
      { replacements: { adm, ws, we } },
    );

    // All-time totals
    const [allTime] = await dbm().content.query(
      `SELECT COALESCE(SUM(points), 0) AS total_points,
              COUNT(*) AS total_games
       FROM kids_weekly_points WHERE child_admission_no = :adm`,
      { replacements: { adm } },
    );
    const at = (Array.isArray(allTime[0]) ? allTime[0] : [])[0] || { total_points: 0, total_games: 0 };

    // Badges this week
    const [badges] = await dbm().content.query(
      `SELECT badge_name, badge_emoji, awarded_at
       FROM kids_badges
       WHERE child_admission_no = :adm AND awarded_at >= :ws AND awarded_at < :we`,
      { replacements: { adm, ws, we } },
    );

    // Child info
    const [childInfo] = await dbm().content.query(
      `SELECT child_name FROM kids_parent_links WHERE child_admission_no = :adm LIMIT 1`,
      { replacements: { adm } },
    );
    const childName = (Array.isArray(childInfo) ? childInfo : [])[0]?.child_name || adm;

    return res.json({
      success: true,
      data: {
        child_name: childName,
        admission_no: adm,
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
        summary: weekly,
        subjects: Array.isArray(subjects) ? subjects : [],
        all_time: at,
        badges: Array.isArray(badges) ? badges : [],
      },
    });
  } catch (err) {
    console.error('parent getChildReport error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  ensureSchema,
  login,
  register,
  getChildren,
  getChildProgress,
  getChildAchievements,
  getChildControls,
  getChildReport,
  getNotifications,
  markRead,
  sendNotification,
  notifyOnGameComplete,
};
