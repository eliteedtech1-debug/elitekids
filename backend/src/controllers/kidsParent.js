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

function normalizeParentPhone(value) {
  return String(value || '').replace(/\\s+/g, '').replace(/^0/, '+234');
}

function toIsoDay(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function denseActivity(rows, days) {
  const byDay = new Map((Array.isArray(rows) ? rows : []).map((row) => [
    toIsoDay(row.date || row.d),
    {
      games: Number(row.games) || 0,
      xp: Number(row.xp) || 0,
      stars: Number(row.stars) || 0,
      average_score: Number(row.average_score) || 0,
    },
  ]));
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const series = [];
  for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    series.push({ date, ...(byDay.get(date) || { games: 0, xp: 0, stars: 0, average_score: 0 }) });
  }
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].games > 0) streak += 1;
    else if (i === series.length - 1) continue; // a zero-activity today does not break yesterday's streak
    else break;
  }
  const totals = series.reduce((acc, day) => ({
    games: acc.games + day.games,
    xp: acc.xp + day.xp,
    stars: acc.stars + day.stars,
    active_days: acc.active_days + (day.games > 0 ? 1 : 0),
  }), { games: 0, xp: 0, stars: 0, active_days: 0 });
  const best = series.filter((day) => day.games > 0).sort((a, b) => b.games - a.games || b.xp - a.xp)[0] || null;
  return { days, series, totals: { ...totals, streak_days: streak, best_day: best } };
}

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

// Ownership check that honors the canonical SHARED EliteSMS relationship
// (students.parent_id/guardian_id = parent's par_code, resolved via
// parents.user_id or parents.phone) in addition to the kids-owned
// kids_parent_links mapping. Returns true if the parent owns the child through
// either relationship.
async function ownsChild(u, adm) {
  const phone = String(u?.phone || '');
  const uid = String(u?.id || u?.user_id || '');
  const school = String(u?.school_id || '');
  const childAdm = String(adm || '').trim();
  if ((!phone && !uid) || !childAdm) return false;
  const [links] = await dbm().content.query(
    `SELECT id FROM kids_parent_links
     WHERE parent_phone = :phone AND child_admission_no = :adm
       AND (:school = '' OR school_id = :school) LIMIT 1`,
    { replacements: { phone, adm: childAdm, school } },
  ).catch(() => [[], []]);
  if (Array.isArray(links) && links.length > 0) return true;
  try {
    const codes = await dbm().sequelize.query(
      `SELECT parent_id FROM parents
       WHERE parent_id IS NOT NULL AND parent_id <> ''
         AND (
               (LENGTH(:uid) > 0 AND user_id = :uid)
            OR (LENGTH(:phone) > 0 AND phone = :phone)
         )
       LIMIT 10`,
      { replacements: { uid, phone }, type: dbm().sequelize.QueryTypes.SELECT },
    );
    const codeList = [...new Set((Array.isArray(codes) ? codes : []).map((p) => String(p.parent_id || '').trim()).filter(Boolean))];
    if (!codeList.length) return false;
    const rows = await dbm().sequelize.query(
      `SELECT admission_no FROM students
       WHERE admission_no = :adm AND status = 'Active'
         AND (:school = '' OR school_id = :school)
         AND (parent_id IN (:codes) OR guardian_id IN (:codes)) LIMIT 1`,
      { replacements: { adm: childAdm, codes: codeList, school }, type: dbm().sequelize.QueryTypes.SELECT },
    );
    if (Array.isArray(rows) && rows.length > 0) return true;
    // Some shared-school fixtures identify the parent directly by users.id
    // instead of exposing parents.parent_id. Keep that compatible fallback.
    const directRows = await dbm().sequelize.query(
      `SELECT admission_no FROM students
       WHERE admission_no = :adm AND status = 'Active'
         AND (:school = '' OR school_id = :school)
         AND (parent_id = :uid OR guardian_id = :uid) LIMIT 1`,
      { replacements: { adm: childAdm, uid, school }, type: dbm().sequelize.QueryTypes.SELECT },
    );
    return Array.isArray(directRows) && directRows.length > 0;
  } catch (e) { /* shared parents/students may be missing the parent_id column */ }
  return false;
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
    const parentUser = { id: acct.id, phone: cleanPhone || identifier };
    const childIds = await getParentChildIds(parentUser);
    const childRows = [];
    try {
      const [kids] = await dbm().content.query(
        `SELECT admission_no, full_name, school_id
         FROM kids_children WHERE admission_no IN (:children) AND status = 'Active'`,
        { replacements: { children: childIds } },
      );
      for (const child of Array.isArray(kids) ? kids : []) childRows.push({
        admission_no: child.admission_no,
        name: child.full_name || child.admission_no,
        school_id: child.school_id || resolvedSchoolId,
        school_name: child.school_id || resolvedSchoolId,
      });
    } catch (_) { /* child detail enrichment is additive */ }
    const childrenByAdmission = new Map(childRows.map((child) => [String(child.admission_no), child]));
    // A shared EliteSMS child may not have a Kids profile yet. Enrich the
    // login response from the read-only shared students table so flagship
    // parents can see every linked child immediately after signing in.
    if (childIds.length) {
      try {
        const sharedKids = await dbm().sequelize.query(
          `SELECT admission_no, student_name, school_id
           FROM students WHERE admission_no IN (:children) AND status = 'Active'`,
          { replacements: { children: childIds }, type: dbm().sequelize.QueryTypes.SELECT },
        );
        for (const child of Array.isArray(sharedKids) ? sharedKids : []) {
          const admissionNo = String(child.admission_no || '').trim();
          if (admissionNo && !childrenByAdmission.has(admissionNo)) childrenByAdmission.set(admissionNo, {
            admission_no: admissionNo,
            name: child.student_name || admissionNo,
            school_id: child.school_id || resolvedSchoolId,
            school_name: child.school_id || resolvedSchoolId,
          });
        }
      } catch (_) { /* shared-school enrichment is additive */ }
    }
    for (const link of linkRows) {
      const admissionNo = String(link.child_admission_no || '').trim();
      if (admissionNo && !childrenByAdmission.has(admissionNo)) childrenByAdmission.set(admissionNo, {
        admission_no: admissionNo,
        name: link.child_name || admissionNo,
        school_id: link.school_id || resolvedSchoolId,
        school_name: link.school_id || resolvedSchoolId,
      });
    }
    const children = [...childrenByAdmission.values()];
    const token = jwt.sign(
      {
        id: acct.id,
        user_type: 'parent',
        phone: cleanPhone || identifier,
        school_id: resolvedSchoolId,
        children: children.map((child) => child.admission_no),
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      data: {
        token,
        parent_phone: cleanPhone || identifier,
        children,
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
    // Linking is ownership-sensitive: proving the parent password is not
    // enough to attach an arbitrary admission number. The shared students
    // relationship (or an existing Kids link) must identify this child.
    if (!(await ownsChild({ id: credRow.id, phone: cleanPhone, school_id: sid }, adm))) {
      return res.status(403).json({ success: false, message: 'This child is not linked to your account.' });
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
async function getParentChildIds(user) {
  const phone = String(user?.phone || '');
  const uid = String(user?.id || user?.user_id || '');
  const ids = new Set();
  try {
    const [links] = await dbm().content.query(
      `SELECT child_admission_no FROM kids_parent_links
       WHERE parent_phone = :phone AND verified = 1`,
      { replacements: { phone } },
    );
    for (const row of Array.isArray(links) ? links : []) if (row.child_admission_no) ids.add(String(row.child_admission_no));
  } catch (_) {}
  try {
    const rows = await dbm().sequelize.query(
      `SELECT s.admission_no FROM students s
       JOIN parents p ON s.parent_id = p.parent_id OR s.guardian_id = p.parent_id
       WHERE p.user_id = :uid OR p.phone = :phone`,
      { replacements: { uid, phone }, type: dbm().sequelize.QueryTypes.SELECT },
    );
    for (const row of Array.isArray(rows) ? rows : []) if (row.admission_no) ids.add(String(row.admission_no));
  } catch (_) {
    // Older/shared schemas may not have parents.parent_id. In that case the
    // student row itself carries the parent users.id relationship.
    try {
      const rows = await dbm().sequelize.query(
        `SELECT admission_no FROM students
         WHERE status = 'Active' AND (parent_id = :uid OR guardian_id = :uid)`,
        { replacements: { uid }, type: dbm().sequelize.QueryTypes.SELECT },
      );
      for (const row of Array.isArray(rows) ? rows : []) if (row.admission_no) ids.add(String(row.admission_no));
    } catch (_) {}
  }
  try {
    const [rows] = await dbm().content.query(
      `SELECT admission_no FROM kids_children WHERE parent_user_id = :uid AND status = 'Active'`,
      { replacements: { uid } },
    );
    for (const row of Array.isArray(rows) ? rows : []) if (row.admission_no) ids.add(String(row.admission_no));
  } catch (_) {}
  return [...ids];
}

/** GET /kids/parent/children/activity?days=365 — parent-owned activity series. */
async function getChildrenActivity(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });
    const childIds = await getParentChildIds(u);
    let days = parseInt(String(req.query.days || '365'), 10);
    if (!Number.isFinite(days)) days = 365;
    days = Math.max(14, Math.min(400, days));
    if (!childIds.length) return res.json({ success: true, data: { days, children: [] } });
    const [rows] = await dbm().content.query(
      `SELECT child_admission_no, DATE(completed_at) AS date,
              COUNT(*) AS games, COALESCE(SUM(xp), 0) AS xp,
              COALESCE(SUM(stars_earned), 0) AS stars,
              COALESCE(ROUND(AVG(score), 1), 0) AS average_score
       FROM kids_progress
       WHERE child_admission_no IN (:children)
         AND completed_at >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
       GROUP BY child_admission_no, DATE(completed_at)
       ORDER BY child_admission_no, date ASC`,
      { replacements: { children: childIds, days } },
    );
    const grouped = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const adm = String(row.child_admission_no);
      if (!grouped.has(adm)) grouped.set(adm, []);
      grouped.get(adm).push(row);
    }
    return res.json({
      success: true,
      data: {
        days,
        children: childIds.map((childId) => ({ child_admission_no: childId, ...denseActivity(grouped.get(childId) || [], days) })),
      },
    });
  } catch (err) {
    console.error('getChildrenActivity error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/** GET /kids/parent/results — bulk child results with optional date window. */
async function getParentResults(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });
    const childIds = await getParentChildIds(u);
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit || '200'), 10) || 200));
    if (!childIds.length) return res.json({ success: true, data: { children: [], results: [] } });
    const [rows] = await dbm().content.query(
      `SELECT child_admission_no, lesson_id, score, stars_earned, xp, mode, completed_at
       FROM kids_progress WHERE child_admission_no IN (:children)
       ORDER BY completed_at DESC LIMIT ${limit}`,
      { replacements: { children: childIds } },
    );
    return res.json({ success: true, data: { children: childIds, results: Array.isArray(rows) ? rows : [] } });
  } catch (err) {
    console.error('getParentResults error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

async function getChildren(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (u.user_type !== 'parent') return res.status(403).json({ success: false, message: 'Parents only.' });

    const phone = String(u.phone || '');

    // 1) Kids-owned mapping (flagship/self-service link table).
    const [links] = await dbm().content.query(
      `SELECT pl.child_admission_no, pl.child_name, pl.school_id
       FROM kids_parent_links pl
       WHERE pl.parent_phone = :phone AND pl.verified = 1`,
      { replacements: { phone } },
    );
    const linkedChildren = Array.isArray(links) ? links : [];

    // 2) Canonical SHARED EliteSMS relationship — students.parent_id/guardian_id
    //    hold the parent's par_code (parents.parent_id). Mirrors EliteSMS
    //    (user.js: `SELECT * FROM students WHERE parent_id = parent.parent_id`).
    //    Resolve the logged-in parent's code via parents.user_id (or phone), then
    //    return their children. Read-only, sourced from EliteSMS.
    const uid = String(u.id || u.user_id || '');
    let sharedChildren = [];
    try {
      const parentRows = await dbm().sequelize.query(
        `SELECT parent_id FROM parents
         WHERE parent_id IS NOT NULL AND parent_id <> ''
           AND (
                 (LENGTH(:uid) > 0 AND user_id = :uid)
              OR (LENGTH(:phone) > 0 AND phone = :phone)
           )
         LIMIT 10`,
        { replacements: { uid, phone }, type: dbm().sequelize.QueryTypes.SELECT },
      );
      const codes = [...new Set(
        (Array.isArray(parentRows) ? parentRows : [])
          .map((p) => String(p.parent_id || '').trim())
          .filter(Boolean)
      )];
      if (codes.length) {
        sharedChildren = await dbm().sequelize.query(
          `SELECT admission_no AS child_admission_no, student_name AS child_name, school_id
           FROM students
           WHERE status = 'Active' AND (parent_id IN (:codes) OR guardian_id IN (:codes))
           GROUP BY admission_no`,
          { replacements: { codes }, type: dbm().sequelize.QueryTypes.SELECT },
        );
      }
    } catch (e) { /* shared parents/students may be missing the parent_id column — skip */ }
    sharedChildren = Array.isArray(sharedChildren) ? sharedChildren : [];

    // Merge + dedupe by admission_no; kids_parent_links rows take precedence.
    const seen = new Set();
    const children = [];
    for (const row of [...linkedChildren, ...sharedChildren]) {
      const adm = String(row.child_admission_no || '').trim();
      if (!adm || seen.has(adm)) continue;
      seen.add(adm);
      children.push({
        child_admission_no: adm,
        child_name: String(row.child_name || '').trim() || adm,
        school_id: row.school_id || u.school_id || null,
      });
    }

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

    // Verify parent owns this child (kids_parent_links OR shared students.parent_id)
    if (!(await ownsChild(u, adm))) {
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
              MIN(completed_at) AS first_play,
              MAX(completed_at) AS last_play
       FROM kids_progress
       WHERE child_admission_no = :adm AND completed_at >= :weekStart`,
      { replacements: { adm, weekStart: weekStartStr } },
    );
    const stats = (Array.isArray(progress) ? progress : [])[0] || {
      games_played: 0, avg_score: 0, excellent_games: 0, unique_lessons: 0,
    };

    // Get total points (all time)
    const [pts] = await dbm().content.query(
      `SELECT COALESCE(SUM(xp), 0) AS total_points, COUNT(*) AS total_attempts
       FROM kids_progress WHERE child_admission_no = :adm`,
      { replacements: { adm } },
    );
    const ptsRow = (Array.isArray(pts) ? pts : [])[0] || { total_points: 0, total_attempts: 0 };

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
      `SELECT lesson_id, score, mode, completed_at AS created_at
       FROM kids_progress
       WHERE child_admission_no = :adm
       ORDER BY completed_at DESC LIMIT 5`,
      { replacements: { adm } },
    );

    // Get current curriculum progress
    let curriculum = [];
    try {
      [curriculum] = await dbm().content.query(
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
    } catch (_) { /* older content schemas may not include series mapping */ }

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
    if (!(await ownsChild(u, adm))) {
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
async function sendNotification({ parent_phone, type, title, body, child_admission_no, school_id }) {
  try {
    await ensureSchema();
    await dbm().content.query(
      `INSERT INTO kids_parent_notifications (id, parent_phone, type, title, body, child_admission_no)
       VALUES (:id, :phone, :type, :title, :body, :adm)`,
      { replacements: { id: crypto.randomUUID(), phone: parent_phone, type, title, body, adm: child_admission_no || null } },
    );
    // Real-time: push notification to parent's WebSocket connection
    try {
      const { broadcastToParent } = require('./e3fLive');
      const normPhone = String(parent_phone || '').replace(/\s+/g, '').replace(/^0/, '+234').toLowerCase();
      const sid = String(school_id || '').trim();
      if (sid) {
        broadcastToParent(sid, normPhone, {
          type: 'parent-notification',
          notification: { type, title, body, child_admission_no, created_at: new Date().toISOString() },
        });
      }
    } catch { /* non-fatal — notification already saved to DB */ }
  } catch (err) {
    console.error('parent sendNotification error:', err.message);
  }
}

// ─── Helper: notifyOnGameComplete (hook into recordGameComplete) ───────────────
async function notifyOnGameComplete({ child_admission_no, score, lesson_id, school_id }) {
  try {
    await ensureSchema();
    // Find parent links for this child
    const [links] = await dbm().content.query(
      `SELECT parent_phone, school_id FROM kids_parent_links WHERE child_admission_no = :adm AND verified = 1`,
      { replacements: { adm: child_admission_no } },
    );
    const linkRows = Array.isArray(links) ? links : [];
    if (linkRows.length === 0) return;

    // Get child name
    const [stu] = await dbm().sequelize.query(
      `SELECT student_name, surname FROM elite_db.students WHERE admission_no = :adm LIMIT 1`,
      { replacements: { adm: child_admission_no } },
    );
    const s = (Array.isArray(stu[0]) ? stu[0] : [])[0] || {};
    const childName = `${s.student_name || ''} ${s.surname || ''}`.trim() || child_admission_no;

    const emoji = score >= 80 ? '🌟' : score >= 50 ? '✅' : '📝';
    const msg = `${emoji} ${childName} scored ${score}% on a game!`;

    for (const link of linkRows) {
      await sendNotification({
        parent_phone: link.parent_phone,
        type: score >= 80 ? 'achievement' : 'daily_summary',
        title: 'Game Update',
        body: msg,
        child_admission_no,
        school_id: link.school_id || school_id || '',
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

    if (!(await ownsChild(u, adm))) {
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
      `SELECT lesson_id, locked_mode AS mode, locked_by, class_code, created_at
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
       WHERE child_admission_no = :adm AND DATE(completed_at) = :today`,
      { replacements: { adm, today } },
    );
    const stats = (Array.isArray(todayStats) ? todayStats : [])[0] || { games_today: 0, avg_score_today: 0 };

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

    if (!(await ownsChild(u, adm))) {
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
              0 AS total_time_seconds
       FROM kids_progress
       WHERE child_admission_no = :adm AND completed_at >= :ws AND completed_at < :we`,
      { replacements: { adm, ws, we } },
    );
    const weekly = (Array.isArray(progress) ? progress : [])[0] || {
      games_played: 0, avg_score: 0, excellent: 0, needs_work: 0, unique_lessons: 0, total_time_seconds: 0,
    };

    // Per-subject breakdown
    const [subjects] = await dbm().content.query(
      `SELECT p.lesson_id, l.title, l.subject, COUNT(*) AS plays, ROUND(AVG(p.score), 1) AS avg
       FROM kids_progress p
       LEFT JOIN kids_lessons l ON l.id = p.lesson_id
       WHERE p.child_admission_no = :adm AND p.completed_at >= :ws AND p.completed_at < :we
       GROUP BY p.lesson_id, l.title, l.subject
       ORDER BY avg DESC`,
      { replacements: { adm, ws, we } },
    );

    // All-time totals
    const [allTime] = await dbm().content.query(
      `SELECT COALESCE(SUM(xp), 0) AS total_points,
              COUNT(*) AS total_games
       FROM kids_progress WHERE child_admission_no = :adm`,
      { replacements: { adm } },
    );
    const at = (Array.isArray(allTime) ? allTime : [])[0] || { total_points: 0, total_games: 0 };

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
  getChildrenActivity,
  getParentResults,
  getChildProgress,
  getChildAchievements,
  getChildControls,
  getChildReport,
  getNotifications,
  markRead,
  sendNotification,
  notifyOnGameComplete,
};
