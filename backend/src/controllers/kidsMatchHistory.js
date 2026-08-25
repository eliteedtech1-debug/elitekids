'use strict';
/**
 * Match History — track past competition results + rivalry stats.
 * Table: kids_match_history
 * Called when a competition ends (from e3fArena or direct).
 */
const crypto = require('crypto');
const dbm = () => require('../models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_match_history (
    id CHAR(36) NOT NULL PRIMARY KEY,
    competition_id CHAR(36) NOT NULL,
    school_id VARCHAR(40) NOT NULL,
    class_code VARCHAR(40) NOT NULL,
    comp_type VARCHAR(20) NOT NULL DEFAULT 'tug',
    title VARCHAR(120) NULL,
    team_a_name VARCHAR(60) NULL,
    team_b_name VARCHAR(60) NULL,
    winner_team TINYINT NULL,
    team_a_pts INT NOT NULL DEFAULT 0,
    team_b_pts INT NOT NULL DEFAULT 0,
    participants INT NOT NULL DEFAULT 0,
    ended_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mh_class (school_id, class_code, ended_at),
    KEY idx_mh_comp (competition_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

/**
 * Record a match result (called from e3fArena when competition ends).
 */
async function recordMatch({ competition_id, school_id, class_code, comp_type, title, team_a_name, team_b_name, winner_team, team_a_pts, team_b_pts, participants }) {
  try {
    await ensureSchema();
    // Idempotent: don't duplicate
    const [existing] = await dbm().content.query(
      `SELECT id FROM kids_match_history WHERE competition_id = :cid LIMIT 1`,
      { replacements: { cid: competition_id } },
    );
    if (Array.isArray(existing[0]) ? existing[0].length > 0 : false) return;

    await dbm().content.query(
      `INSERT INTO kids_match_history
        (id, competition_id, school_id, class_code, comp_type, title, team_a_name, team_b_name, winner_team, team_a_pts, team_b_pts, participants)
       VALUES (:id, :cid, :sid, :cc, :ct, :title, :ta, :tb, :wt, :tap, :tbp, :p)`,
      {
        replacements: {
          id: crypto.randomUUID(),
          cid: competition_id,
          sid: school_id,
          cc: class_code,
          ct: comp_type || 'tug',
          title: title || null,
          ta: team_a_name || null,
          tb: team_b_name || null,
          wt: winner_team != null ? winner_team : null,
          tap: team_a_pts || 0,
          tbp: team_b_pts || 0,
          p: participants || 0,
        },
      },
    );
  } catch (err) {
    console.error('matchHistory recordMatch error:', err.message);
  }
}

// ─── GET /kids/match-history?class_code=&limit=20 ────────────────────────────
async function getMatchHistory(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const sid = u.school_id || '';
    const classCode = String(req.query.class_code || '').trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    let query = `SELECT * FROM kids_match_history WHERE school_id = :sid`;
    const replacements = { sid };

    if (classCode) {
      query += ` AND class_code = :cc`;
      replacements.cc = classCode;
    }
    query += ` ORDER BY ended_at DESC LIMIT :lim`;
    replacements.lim = limit;

    const [rows] = await dbm().content.query(query, { replacements });

    return res.json({ success: true, data: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('matchHistory getMatchHistory error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/match-history/rivalry?class_code= ─────────────────────────────
// Team rivalry stats: "Lions lead 3-2 against Eagles"
async function getRivalry(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const sid = u.school_id || '';
    const classCode = String(req.query.class_code || '').trim();

    if (!classCode) {
      return res.json({ success: true, data: [] });
    }

    // Aggregate team vs team results
    const [rows] = await dbm().content.query(
      `SELECT team_a_name, team_b_name,
              COUNT(*) AS total_matches,
              SUM(CASE WHEN winner_team = 0 THEN 1 ELSE 0 END) AS team_a_wins,
              SUM(CASE WHEN winner_team = 1 THEN 1 ELSE 0 END) AS team_b_wins,
              SUM(CASE WHEN winner_team IS NULL THEN 1 ELSE 0 END) AS draws,
              ROUND(AVG(team_a_pts), 0) AS avg_team_a_pts,
              ROUND(AVG(team_b_pts), 0) AS avg_team_b_pts
       FROM kids_match_history
       WHERE school_id = :sid AND class_code = :cc AND comp_type = 'tug'
         AND team_a_name IS NOT NULL AND team_b_name IS NOT NULL
       GROUP BY team_a_name, team_b_name
       ORDER BY total_matches DESC
       LIMIT 10`,
      { replacements: { sid, cc: classCode } },
    );

    return res.json({ success: true, data: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('matchHistory getRivalry error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/match-history/stats ───────────────────────────────────────────
// School-wide match stats
async function getMatchStats(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    const sid = u.school_id || '';

    const [stats] = await dbm().content.query(
      `SELECT COUNT(*) AS total_matches,
              SUM(CASE WHEN comp_type = 'tug' THEN 1 ELSE 0 END) AS tug_matches,
              SUM(CASE WHEN comp_type = 'trophy' THEN 1 ELSE 0 END) AS trophy_matches,
              SUM(participants) AS total_participants,
              MAX(ended_at) AS last_match
       FROM kids_match_history WHERE school_id = :sid`,
      { replacements: { sid } },
    );
    const s = (Array.isArray(stats[0]) ? stats[0] : [])[0] || {};

    return res.json({ success: true, data: s });
  } catch (err) {
    console.error('matchHistory getMatchStats error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { ensureSchema, recordMatch, getMatchHistory, getRivalry, getMatchStats };
