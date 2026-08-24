'use strict';
/**
 * E5 — Competition Engine (enhanced arena with game selection, lock override,
 * real-time analytics dashboard, response time tracking).
 *
 * Builds on existing e3fArena.js foundation (kids_competitions, kids_competition_members).
 * Additive schema + new controller — does NOT modify e3fArena.js.
 *
 * New tables (elite_content):
 *   kids_tournament_games     — teacher-selected games for a competition
 *   kids_competition_analytics — per-child response time + completion tracking
 *
 * Endpoints:
 *   POST /kids/arena/:id/games        requireStaff — set games for competition (lock override)
 *   GET  /kids/arena/:id/games        auth — get competition games (bypasses lock when active)
 *   GET  /kids/arena/:id/dashboard    requireStaff — real-time analytics
 *   POST /kids/arena/:id/participants/:adm/start  auth — mark child started
 *   POST /kids/arena/:id/participants/:adm/progress  auth — track response time
 */
const crypto = require('crypto');
const { Op } = require('sequelize');

const dbm = () => require('../models');

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_tournament_games (
    id CHAR(36) NOT NULL PRIMARY KEY,
    competition_id CHAR(36) NOT NULL,
    lesson_id VARCHAR(50) NOT NULL,
    config_id VARCHAR(50) NULL,
    order_index INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_tg_comp_lesson (competition_id, lesson_id, config_id),
    KEY idx_tg_comp (competition_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_competition_analytics (
    id CHAR(36) NOT NULL PRIMARY KEY,
    competition_id CHAR(36) NOT NULL,
    child_admission_no VARCHAR(64) NOT NULL,
    lesson_id VARCHAR(50) NULL,
    config_id VARCHAR(50) NULL,
    question_index SMALLINT NULL,
    response_time_ms INT NULL,
    correct TINYINT(1) NULL,
    started_at DATETIME NULL,
    answered_at DATETIME NULL,
    completed_at DATETIME NULL,
    total_score INT DEFAULT 0,
    questions_answered INT DEFAULT 0,
    questions_correct INT DEFAULT 0,
    status ENUM('not_started','playing','completed','timed_out') DEFAULT 'not_started',
    UNIQUE KEY uq_ca_comp_child (competition_id, child_admission_no),
    KEY idx_ca_comp (competition_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  _schemaReady = true;
}

// ── Teacher: set games for a competition (lock override) ────────────────────
// POST /kids/arena/:id/games { lesson_ids: [{lesson_id, config_id?}] }
async function setCompetitionGames(req, res) {
  try {
    await ensureSchema();
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    const compId = String(req.params.id || '');
    const { lesson_ids } = req.body || {};
    if (!Array.isArray(lesson_ids) || !lesson_ids.length) {
      return res.status(400).json({ success: false, message: 'lesson_ids[] required (min 1).' });
    }
    // Verify competition exists and is active
    const [compRows] = await dbm().content.query(
      `SELECT id, status FROM kids_competitions WHERE id=:id AND school_id=:s LIMIT 1`,
      { replacements: { id: compId, s: String(schoolId) } },
    );
    const comp = (compRows || [])[0];
    if (!comp) return res.status(404).json({ success: false, message: 'Competition not found.' });
    if (comp.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Can only set games for active competitions.' });
    }
    // Clear existing + insert new
    await dbm().content.query(
      `DELETE FROM kids_tournament_games WHERE competition_id=:cid`,
      { replacements: { cid: compId } },
    );
    let idx = 0;
    for (const item of lesson_ids) {
      const lid = String(item.lesson_id || item).trim();
      const cid = item.config_id ? String(item.config_id).trim() : null;
      if (!lid) continue;
      await dbm().content.query(
        `INSERT INTO kids_tournament_games (id, competition_id, lesson_id, config_id, order_index)
         VALUES (:id, :cid, :lid, :cfg, :ord)`,
        { replacements: { id: crypto.randomUUID(), cid: compId, lid, cfg: cid, ord: idx++ } },
      );
    }
    return res.json({ success: true, data: { set: idx } });
  } catch (err) {
    console.error('arena setGames error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Get competition games (lock override when active) ───────────────────────
// GET /kids/arena/:id/games
async function getCompetitionGames(req, res) {
  try {
    await ensureSchema();
    const compId = String(req.params.id || '');
    const [compRows] = await dbm().content.query(
      `SELECT id, status, comp_type FROM kids_competitions WHERE id=:id LIMIT 1`,
      { replacements: { id: compId } },
    );
    const comp = (compRows || [])[0];
    if (!comp) return res.status(404).json({ success: false, message: 'Competition not found.' });

    const [games] = await dbm().content.query(
      `SELECT tg.lesson_id, tg.config_id, tg.order_index,
              l.title AS lesson_title, l.subject
       FROM kids_tournament_games tg
       LEFT JOIN kids_lessons l ON l.id = tg.lesson_id
       WHERE tg.competition_id=:cid
       ORDER BY tg.order_index`,
      { replacements: { cid: compId } },
    );

    // For each game, check if normally locked and provide config
    const enriched = [];
    for (const g of (games || [])) {
      let configData = null;
      if (g.config_id) {
        const [cfg] = await dbm().content.query(
          `SELECT id, config_json FROM kids_game_configs WHERE id=:cfg LIMIT 1`,
          { replacements: { cfg: g.config_id } },
        );
        configData = (cfg || [])[0] || null;
      }
      enriched.push({
        lesson_id: g.lesson_id,
        config_id: g.config_id,
        order_index: g.order_index,
        lesson_title: g.lesson_title,
        subject: g.subject,
        config: configData ? configData.config_json : null,
        locked: false, // always false during active competition (lock override)
        override: comp.status === 'active',
      });
    }
    return res.json({ success: true, data: { competition: { id: comp.id, status: comp.status, comp_type: comp.comp_type }, games: enriched } });
  } catch (err) {
    console.error('arena getGames error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Staff: real-time analytics dashboard ────────────────────────────────────
// GET /kids/arena/:id/dashboard
async function getDashboard(req, res) {
  try {
    await ensureSchema();
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    const compId = String(req.params.id || '');

    const [compRows] = await dbm().content.query(
      `SELECT * FROM kids_competitions WHERE id=:id AND school_id=:s LIMIT 1`,
      { replacements: { id: compId, s: String(schoolId) } },
    );
    const comp = (compRows || [])[0];
    if (!comp) return res.status(404).json({ success: false, message: 'Competition not found.' });

    // Members
    const [members] = await dbm().content.query(
      `SELECT child_admission_no AS adm, team FROM kids_competition_members WHERE competition_id=:cid`,
      { replacements: { cid: compId } },
    );

    // Analytics per child
    const [analytics] = await dbm().content.query(
      `SELECT child_admission_no AS adm, status, total_score, questions_answered, questions_correct,
              response_time_ms, started_at, completed_at
       FROM kids_competition_analytics WHERE competition_id=:cid`,
      { replacements: { cid: compId } },
    );
    const analyticsByAdm = new Map((analytics || []).map((a) => [a.adm, a]));

    // Contributions (best scores from progress)
    const contribs = await contributionsClean(comp);
    const contribByAdm = new Map(contribs.map((c) => [c.adm, c]));

    // Resolve names
    const adms = (members || []).map((m) => m.adm);
    let nameMap = new Map();
    if (adms.length) {
      const [nameRows] = await dbm().sequelize.query(
        `SELECT admission_no, student_name, surname, first_name FROM students WHERE admission_no IN (:adms) LIMIT 300`,
        { replacements: { adms }, type: dbm().Sequelize.QueryTypes.SELECT },
      ).catch(() => []);
      nameMap = new Map((nameRows || []).map((r) => [r.admission_no, sanitizeName(r)]));
    }

    // Build individual entries
    const individual = (members || []).map((m) => {
      const a = analyticsByAdm.get(m.adm) || {};
      const c = contribByAdm.get(m.adm) || {};
      return {
        name: nameMap.get(m.adm) || 'Friend',
        team: m.team,
        total_score: a.total_score || c.best || 0,
        questions_answered: a.questions_answered || 0,
        questions_correct: a.questions_correct || 0,
        avg_response_ms: a.response_time_ms || null,
        status: a.status || 'not_started',
        completion_pct: a.questions_answered > 0 ? Math.round((a.questions_correct / a.questions_answered) * 100) : 0,
        started_at: a.started_at || null,
        completed_at: a.completed_at || null,
      };
    });

    // Group summary
    const teamA = individual.filter((x) => x.team === 0);
    const teamB = individual.filter((x) => x.team === 1);

    const groupSummary = comp.comp_type === 'tug' ? {
      team_a: {
        total_score: teamA.reduce((n, x) => n + x.total_score, 0),
        avg_response_ms: avgOrNull(teamA.filter((x) => x.avg_response_ms).map((x) => x.avg_response_ms)),
        completed_count: teamA.filter((x) => x.status === 'completed').length,
        playing_count: teamA.filter((x) => x.status === 'playing').length,
        not_started_count: teamA.filter((x) => x.status === 'not_started').length,
        timed_out_count: teamA.filter((x) => x.status === 'timed_out').length,
      },
      team_b: {
        total_score: teamB.reduce((n, x) => n + x.total_score, 0),
        avg_response_ms: avgOrNull(teamB.filter((x) => x.avg_response_ms).map((x) => x.avg_response_ms)),
        completed_count: teamB.filter((x) => x.status === 'completed').length,
        playing_count: teamB.filter((x) => x.status === 'playing').length,
        not_started_count: teamB.filter((x) => x.status === 'not_started').length,
        timed_out_count: teamB.filter((x) => x.status === 'timed_out').length,
      },
      rope_pct: (() => {
        const a = teamA.reduce((n, x) => n + x.total_score, 0);
        const b = teamB.reduce((n, x) => n + x.total_score, 0);
        return a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;
      })(),
    } : null;

    const timeRemaining = comp.ends_at ? Math.max(0, Math.round((new Date(comp.ends_at).getTime() - Date.now()) / 60000)) : null;

    return res.json({
      success: true,
      data: {
        competition: { id: comp.id, title: comp.title, comp_type: comp.comp_type, status: comp.status, ends_at: comp.ends_at },
        group_summary: groupSummary,
        individual: individual.sort((a, b) => b.total_score - a.total_score),
        time_remaining_min: timeRemaining,
        total_participants: individual.length,
        responded: individual.filter((x) => x.status !== 'not_started').length,
      },
    });
  } catch (err) {
    console.error('arena dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Student: mark started + track progress ──────────────────────────────────
// POST /kids/arena/:id/participants/start
async function markStarted(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const compId = String(req.params.id || '');
    const adm = String(u.admission_no || '');
    const schoolId = req.headers['x-school-id'] || u.school_id;

    // Verify active competition in student's class
    const [stu] = await dbm().sequelize.query(
      `SELECT class_code FROM students WHERE admission_no=:a AND school_id=:s LIMIT 1`,
      { replacements: { a: adm, s: String(schoolId) }, type: dbm().Sequelize.QueryTypes.SELECT },
    ).catch(() => []);
    if (!stu || !stu.class_code) return res.status(400).json({ success: false, message: 'No class.' });

    const [comp] = await dbm().content.query(
      `SELECT id FROM kids_competitions WHERE id=:id AND school_id=:s AND class_code=:c AND status='active' LIMIT 1`,
      { replacements: { id: compId, s: String(schoolId), c: stu.class_code } },
    ).catch(() => []);
    if (!(comp || []).length) return res.status(404).json({ success: false, message: 'No active competition.' });

    await dbm().content.query(
      `INSERT INTO kids_competition_analytics (id, competition_id, child_admission_no, started_at, status)
       VALUES (:id, :cid, :adm, NOW(), 'playing')
       ON DUPLICATE KEY UPDATE started_at=COALESCE(started_at, NOW()), status=IF(status='not_started','playing',status)`,
      { replacements: { id: crypto.randomUUID(), cid: compId, adm } },
    );
    return res.json({ success: true, data: { started: true } });
  } catch (err) {
    console.error('arena markStarted error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// POST /kids/arena/:id/participants/progress { lesson_id, config_id?, question_index, response_time_ms, correct }
async function trackProgress(req, res) {
  try {
    await ensureSchema();
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const compId = String(req.params.id || '');
    const adm = String(u.admission_no || '');
    const { lesson_id, config_id, question_index, response_time_ms, correct } = req.body || {};

    await dbm().content.query(
      `UPDATE kids_competition_analytics
       SET questions_answered = questions_answered + 1,
           questions_correct = questions_correct + IF(:correct, 1, 0),
           response_time_ms = CASE
             WHEN response_time_ms IS NULL THEN :rt
             ELSE ROUND((response_time_ms * (questions_answered) + :rt) / (questions_answered + 1))
           END,
           status = 'playing'
       WHERE competition_id=:cid AND child_admission_no=:adm`,
      { replacements: { cid: compId, adm, correct: correct ? 1 : 0, rt: Number(response_time_ms) || 0 } },
    );

    // Also record individual response event
    await dbm().content.query(
      `INSERT INTO kids_competition_analytics (id, competition_id, child_admission_no, lesson_id, config_id, question_index, response_time_ms, correct, answered_at)
       VALUES (:id, :cid, :adm, :lid, :cfg, :qi, :rt, :corr, NOW())
       ON DUPLICATE KEY UPDATE response_time_ms=:rt, correct=:corr, answered_at=NOW()`,
      {
        replacements: {
          id: crypto.randomUUID(), cid: compId, adm,
          lid: lesson_id || null, cfg: config_id || null,
          qi: Number(question_index) || 0, rt: Number(response_time_ms) || 0,
          corr: correct ? 1 : 0,
        },
      },
    ).catch(() => {}); // fire-and-forget for individual events

    return res.json({ success: true, data: { tracked: true } });
  } catch (err) {
    console.error('arena trackProgress error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function sanitizeName(row) {
  if (!row) return 'Friend';
  const first = String(row.first_name || row.student_name || '').trim();
  const last = String(row.surname || '').trim();
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : '';
  return `${first}${initial}` || 'Friend';
}

function avgOrNull(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

module.exports = { setCompetitionGames, getCompetitionGames, getDashboard, markStarted, trackProgress, ensureSchema };
