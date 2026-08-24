'use strict';
/**
 * E3f — Class Arena: intra-class competitions that make learning fun together.
 *
 * Formats:
 *   • tug    — Tug-of-War: class splits into 2 emoji teams; every Practice/Test
 *              game completion pulls the rope toward your team. Rope position =
 *              share of total points. Teaches group participation.
 *   • trophy — Trophy Race: individual positions 1st/2nd/3rd… during the window.
 *
 * Fair-play rules (v1):
 *   • Only 'practice'/'test' completions score (legacy NULL-mode rows count once,
 *     they were real plays pre-gate).
 *   • Best score per (child × game × day) — replaying the same easy game all day
 *     cannot farm points.
 *   • Window-bounded: only completions between starts_at and ends_at count.
 *
 * Endpoints:
 *   POST /kids/arena/create        requireStaff — open a competition for a class
 *   GET  /kids/arena/list          requireStaff — my school's competitions (+live totals)
 *   POST /kids/arena/:id/end       requireStaff — close early
 *   GET  /kids/arena/active        auth student — my class's active battle + standings
 */
const crypto = require('crypto');
const { Op } = require('sequelize');

const TEAM_PAIRS = [
  ['🦁 Team Lion', '🦅 Team Eagle'],
  ['🐘 Team Elephant', '🦒 Team Giraffe'],
  ['🐬 Team Dolphin', '🦈 Team Shark'],
  ['⚽ Team Kicks', '🏀 Team Hoops'],
];

const dbm = () => require('../models');

async function ensureSchema() {
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_competitions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    school_id VARCHAR(40) NOT NULL,
    branch_id VARCHAR(40) NULL,
    class_code VARCHAR(40) NOT NULL,
    comp_type VARCHAR(10) NOT NULL DEFAULT 'tug',
    title VARCHAR(120) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'active',
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    team_a_name VARCHAR(60) NULL,
    team_b_name VARCHAR(60) NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_arena_class (school_id, class_code, status),
    KEY idx_arena_status (status, ends_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_competition_members (
    id CHAR(36) NOT NULL PRIMARY KEY,
    competition_id CHAR(36) NOT NULL,
    child_admission_no VARCHAR(64) NOT NULL,
    team TINYINT NULL COMMENT '0=A, 1=B, NULL=individual',
    UNIQUE KEY uq_arena_member (competition_id, child_admission_no),
    KEY idx_arena_member_comp (competition_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function sanitizeName(row) {
  if (!row) return 'Friend';
  const first = String(row.first_name || row.student_name || '').trim();
  const last = String(row.surname || '').trim();
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : '';
  return `${first}${initial}` || 'Friend';
}

/** Best-score-per-(child,game,day) contributions inside the window, folded to per-child totals. */
async function contributionsClean(comp) {
  const [rows] = await dbm().content.query(
    `SELECT k.adm AS adm, m.team AS team, SUM(k.best) AS best, COUNT(*) AS plays
     FROM (
       SELECT p.child_admission_no AS adm, p.lesson_id AS lid, DATE(p.completed_at) AS d,
              MAX(p.score) AS best
       FROM kids_progress p
       WHERE p.completed_at BETWEEN :start AND :end
         AND (p.mode IN ('practice','test') OR p.mode IS NULL)
       GROUP BY p.child_admission_no, p.lesson_id, DATE(p.completed_at)
     ) k
     JOIN kids_competition_members m
       ON m.competition_id = :cid AND m.child_admission_no = k.adm
     GROUP BY k.adm, m.team`,
    { replacements: { start: comp.starts_at, end: comp.ends_at, cid: comp.id } },
  );
  return (rows || []).map((r) => ({ adm: r.adm, team: r.team, best: Number(r.best) || 0, plays: Number(r.plays) || 0 }));
}

function displayNameMap(adms) {
  if (!adms.length) return new Map();
  const seq = dbm().sequelize;
  return seq
    .query(
      `SELECT admission_no, student_name, surname, first_name FROM students
       WHERE admission_no IN (:adms) LIMIT 500`,
      { replacements: { adms }, type: dbm().Sequelize.QueryTypes.SELECT },
    )
    .then((rows) => new Map(rows.map((r) => [r.admission_no, sanitizeName(r)])))
    .catch(() => new Map());
}

// ── Staff: create ──────────────────────────────────────────────────────────
async function createCompetition(req, res) {
  try {
    await ensureSchema();
    const { class_code, comp_type, title, hours } = req.body || {};
    const ctype = ['tug', 'trophy'].includes(comp_type) ? comp_type : null;
    if (!class_code || !ctype) {
      return res.status(400).json({ success: false, message: 'class_code and comp_type (tug|trophy) are required.' });
    }
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const branch_id = req.headers['x-branch-id'] || req.user.branch_id || null;

    // Enroll every current member of the class
    const roster = await dbm().sequelize
      .query(
        `SELECT admission_no FROM students WHERE school_id=:s AND class_code=:c LIMIT 300`,
        { replacements: { s: String(school_id), c: String(class_code) }, type: dbm().Sequelize.QueryTypes.SELECT },
      );
    if (!roster.length) {
      return res.status(400).json({ success: false, message: 'No students found in that class.' });
    }

    const durH = Math.min(Math.max(Number(hours) || 48, 1), 24 * 14);
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + durH * 3600000);
    const id = crypto.randomUUID();
    const [teamA, teamB] = TEAM_PAIRS[Math.floor(Math.random() * TEAM_PAIRS.length)];

    await dbm().content.query(
      `INSERT INTO kids_competitions (id, school_id, branch_id, class_code, comp_type, title, status, starts_at, ends_at, team_a_name, team_b_name, created_by)
       VALUES (:id,:s,:b,:c,:t,:ti,'active',:st,:en,:ta,:tb,:by)`,
      {
        replacements: {
          id, s: String(school_id), b: branch_id ? String(branch_id) : null, c: String(class_code), t: ctype,
          ti: String(title || (ctype === 'tug' ? 'Class Tug-of-War' : 'Trophy Race')).slice(0, 120),
          st: startsAt, en: endsAt,
          ta: ctype === 'tug' ? teamA : null, tb: ctype === 'tug' ? teamB : null,
          by: String(req.user.admission_no || req.user.id || req.user.email || '').slice(0, 64),
        },
      },
    );

    // Balanced-ish split: alphabetical order, alternate teams
    const adms = roster.map((r) => r.admission_no).sort();
    for (const [i, adm] of adms.entries()) {
      await dbm().content.query(
        `INSERT IGNORE INTO kids_competition_members (id, competition_id, child_admission_no, team)
         VALUES (:id, :cid, :adm, :team)`,
        {
          replacements: {
            id: crypto.randomUUID(),
            cid: id,
            adm,
            team: ctype === 'tug' ? i % 2 : null,
          },
        },
      );
    }

    return res.status(201).json({
      success: true,
      data: {
        id, comp_type: ctype, title: title || (ctype === 'tug' ? 'Class Tug-of-War' : 'Trophy Race'),
        enrolled: adms.length, team_a_name: teamA || null, team_b_name: teamB || null,
        starts_at: startsAt, ends_at: endsAt,
      },
    });
  } catch (err) {
    console.error('arena create error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Staff: list with live totals ───────────────────────────────────────────
async function listCompetitions(req, res) {
  try {
    await ensureSchema();
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const [comps] = await dbm().content.query(
      `SELECT * FROM kids_competitions WHERE school_id=:s ORDER BY created_at DESC LIMIT 50`,
      { replacements: { s: String(school_id) } },
    );
    const out = [];
    for (const comp of comps || []) {
      const contribs = await contributionsClean(comp);
      let summary;
      if (comp.comp_type === 'tug') {
        const a = contribs.filter((x) => x.team === 0).reduce((n, x) => n + x.best, 0);
        const b = contribs.filter((x) => x.team === 1).reduce((n, x) => n + x.best, 0);
        summary = { team_a_pts: a, team_b_pts: b };
      } else {
        summary = { leaders: contribs.sort((x, y) => y.best - x.best).slice(0, 3).map((x) => x.adm) };
      }
      out.push({
        id: comp.id, title: comp.title, class_code: comp.class_code, comp_type: comp.comp_type,
        status: comp.status, starts_at: comp.starts_at, ends_at: comp.ends_at,
        team_a_name: comp.team_a_name, team_b_name: comp.team_b_name,
        participants: contribs.length, ...summary,
      });
    }
    return res.json({ success: true, data: out });
  } catch (err) {
    console.error('arena list error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Staff: end early ───────────────────────────────────────────────────────
async function endCompetition(req, res) {
  try {
    const school_id = req.headers['x-school-id'] || req.user.school_id;
    const [, meta] = await dbm().content.query(
      `UPDATE kids_competitions SET status='ended', ends_at=NOW() WHERE id=:id AND school_id=:s AND status='active'`,
      { replacements: { id: String(req.params.id || ''), s: String(school_id) } },
    );
    const n = (meta && meta.affectedRows) || 0;
    if (!n) return res.status(404).json({ success: false, message: 'Active competition not found.' });
    return res.json({ success: true, data: { ended: true } });
  } catch (err) {
    console.error('arena end error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Student: my class's active battle ──────────────────────────────────────
async function getActive(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const school_id = req.headers['x-school-id'] || u.school_id;
    const me = String(u.admission_no || '');
    const [stuRows] = await dbm().sequelize.query(
      `SELECT class_code FROM students WHERE admission_no=:a AND school_id=:s LIMIT 1`,
      { replacements: { a: me, s: String(school_id) }, type: dbm().Sequelize.QueryTypes.SELECT },
    );
    const classCode = stuRows && stuRows.class_code;
    if (!classCode) return res.json({ success: true, data: { active: false } });

    const [compRows] = await dbm().content.query(
      `SELECT * FROM kids_competitions
       WHERE school_id=:s AND class_code=:c AND status='active' AND NOW() BETWEEN starts_at AND ends_at
       ORDER BY created_at DESC LIMIT 1`,
      { replacements: { s: String(school_id), c: classCode } },
    );
    const comp = compRows && compRows[0];
    if (!comp) return res.json({ success: true, data: { active: false } });

    const [memberRows] = await dbm().content.query(
      `SELECT child_admission_no AS adm, team FROM kids_competition_members WHERE competition_id=:cid`,
      { replacements: { cid: comp.id } },
    );
    const members = memberRows || [];
    const contribs = await contributionsClean(comp);

    // Fold contributions onto members (so non-contributors still show as 0)
    const byAdm = new Map(contribs.map((x) => [x.adm, x]));
    const rows = (members || []).map((m) => {
      const c = byAdm.get(m.adm);
      return { adm: m.adm, team: m.team, pts: c ? c.best : 0, plays: c ? c.plays : 0 };
    });

    const names = await displayNameMap(rows.map((r) => r.adm));
    const decorated = rows
      .map((r) => ({ ...r, name: names.get(r.adm) || 'Friend', me: r.adm === me }))
      .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));

    let payload;
    if (comp.comp_type === 'tug') {
      const a = decorated.filter((x) => x.team === 0);
      const b = decorated.filter((x) => x.team === 1);
      const pa = a.reduce((n, x) => n + x.pts, 0);
      const pb = b.reduce((n, x) => n + x.pts, 0);
      const myRow = decorated.find((x) => x.me);
      payload = {
        active: true, comp_type: 'tug', id: comp.id, title: comp.title,
        team_a: { name: comp.team_a_name || 'Team A', pts: pa, players: a.length, top: a.slice(0, 5) },
        team_b: { name: comp.team_b_name || 'Team B', pts: pb, players: b.length, top: b.slice(0, 5) },
        rope_pct: pa + pb > 0 ? Math.round((pa / (pa + pb)) * 100) : 50,
        my_team: myRow ? myRow.team : null,
        my_pts: myRow ? myRow.pts : 0,
        enrolled: decorated.length, playing: byAdm.size,
        ends_at: comp.ends_at,
      };
    } else {
      const myRank = decorated.findIndex((x) => x.me) + 1;
      payload = {
        active: true, comp_type: 'trophy', id: comp.id, title: comp.title,
        ranking: decorated.slice(0, 10), my_rank: myRank || null,
        my_pts: (decorated.find((x) => x.me) || {}).pts || 0,
        enrolled: decorated.length, playing: byAdm.size,
        ends_at: comp.ends_at,
      };
    }
    return res.json({ success: true, data: payload });
  } catch (err) {
    console.error('arena active error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { createCompetition, listCompetitions, endCompetition, getActive };
