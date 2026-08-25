'use strict';
/**
 * Multi-School Analytics — school admin dashboard.
 * Answers: which classes perform best, which students need help, which games engage most.
 * Implementation: SQL aggregation queries (no BigQuery needed at our scale).
 */
const dbm = () => require('../models');

// ─── GET /kids/analytics/overview ────────────────────────────────────────────
// School-wide summary: total students, games played, avg score, active classes
async function getOverview(req, res) {
  try {
    const u = req.user || {};
    if (!['admin', 'staff'].includes(String(u.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }
    const sid = u.school_id || '';
    if (!sid) return res.status(400).json({ success: false, message: 'school_id required.' });

    // Total students
    const [stuCount] = await dbm().sequelize.query(
      `SELECT COUNT(*) AS total FROM students WHERE school_id = :sid`,
      { replacements: { sid }, type: dbm().sequelize.QueryTypes.SELECT },
    );

    // Games played this week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekStr = weekStart.toISOString().slice(0, 19).replace('T', ' ');

    const [weeklyStats] = await dbm().content.query(
      `SELECT COUNT(*) AS games_played,
              COUNT(DISTINCT child_admission_no) AS active_students,
              ROUND(AVG(score), 1) AS avg_score,
              SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END) AS excellent_games
       FROM kids_progress WHERE created_at >= :weekStart`,
      { replacements: { weekStart: weekStr } },
    );
    const ws = (Array.isArray(weeklyStats[0]) ? weeklyStats[0] : [])[0] || {};

    // Active classes (classes with at least 1 game this week)
    const [activeClasses] = await dbm().content.query(
      `SELECT COUNT(DISTINCT s.class_code) AS count
       FROM kids_progress p
       JOIN elite_db.students s ON s.admission_no = p.child_admission_no AND s.school_id = :sid
       WHERE p.created_at >= :weekStart`,
      { replacements: { sid, weekStart: weekStr } },
    );
    const ac = (Array.isArray(activeClasses[0]) ? activeClasses[0] : [])[0] || {};

    // Total points awarded
    const [totalPts] = await dbm().content.query(
      `SELECT COALESCE(SUM(points), 0) AS total FROM kids_weekly_points WHERE school_id = :sid`,
      { replacements: { sid } },
    );
    const tp = (Array.isArray(totalPts[0]) ? totalPts[0] : [])[0] || {};

    return res.json({
      success: true,
      data: {
        total_students: stuCount?.total || 0,
        active_this_week: ws.active_students || 0,
        games_played_this_week: ws.games_played || 0,
        avg_score_this_week: ws.avg_score || 0,
        excellent_games_this_week: ws.excellent_games || 0,
        active_classes: ac.count || 0,
        total_points: tp.total || 0,
      },
    });
  } catch (err) {
    console.error('analytics getOverview error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/analytics/classes?sort=avg_score ──────────────────────────────
// Class comparison: each class's avg score, games played, active students
async function getClassComparison(req, res) {
  try {
    const u = req.user || {};
    if (!['admin', 'staff'].includes(String(u.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }
    const sid = u.school_id || '';
    const sort = String(req.query.sort || 'avg_score').trim();
    const validSorts = ['avg_score', 'games_played', 'active_students', 'class_code'];
    const orderBy = validSorts.includes(sort) ? sort : 'avg_score';

    const [rows] = await dbm().content.query(
      `SELECT s.class_code,
              COUNT(*) AS games_played,
              COUNT(DISTINCT p.child_admission_no) AS active_students,
              ROUND(AVG(p.score), 1) AS avg_score,
              SUM(CASE WHEN p.score >= 80 THEN 1 ELSE 0 END) AS excellent_games,
              MIN(p.created_at) AS first_play,
              MAX(p.created_at) AS last_play
       FROM kids_progress p
       JOIN elite_db.students s ON s.admission_no = p.child_admission_no AND s.school_id = :sid
       GROUP BY s.class_code
       HAVING games_played > 0
       ORDER BY ${orderBy} DESC
       LIMIT 30`,
      { replacements: { sid } },
    );

    return res.json({ success: true, data: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('analytics getClassComparison error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/analytics/struggling?class_code=&threshold=50 ─────────────────
// Students who need help: avg score below threshold, haven't practiced in 7+ days
async function getStrugglingStudents(req, res) {
  try {
    const u = req.user || {};
    if (!['admin', 'staff'].includes(String(u.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }
    const sid = u.school_id || '';
    const classCode = String(req.query.class_code || '').trim();
    const threshold = Number(req.query.threshold) || 50;

    let query = `SELECT p.child_admission_no,
                        s.student_name, s.surname,
                        s.class_code,
                        COUNT(*) AS games_played,
                        ROUND(AVG(p.score), 1) AS avg_score,
                        MIN(p.score) AS worst_score,
                        MAX(p.created_at) AS last_played,
                        DATEDIFF(NOW(), MAX(p.created_at)) AS days_inactive
                 FROM kids_progress p
                 JOIN elite_db.students s ON s.admission_no = p.child_admission_no AND s.school_id = :sid`;
    const replacements = { sid };

    if (classCode) {
      query += ` WHERE s.class_code = :cc`;
      replacements.cc = classCode;
    }

    query += ` GROUP BY p.child_admission_no
               HAVING avg_score < :threshold OR days_inactive >= 7
               ORDER BY avg_score ASC, days_inactive DESC
               LIMIT 50`;
    replacements.threshold = threshold;

    const [rows] = await dbm().content.query(query, { replacements });

    return res.json({ success: true, data: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('analytics getStruggling error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/analytics/games?sort=plays ────────────────────────────────────
// Game engagement: which games are played most, best/worst scores
async function getGameEngagement(req, res) {
  try {
    const u = req.user || {};
    if (!['admin', 'staff'].includes(String(u.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }

    const [rows] = await dbm().content.query(
      `SELECT l.id AS lesson_id, l.title, l.subject,
              COUNT(*) AS times_played,
              COUNT(DISTINCT p.child_admission_no) AS unique_students,
              ROUND(AVG(p.score), 1) AS avg_score,
              MAX(p.score) AS best_score,
              MIN(p.score) AS worst_score
       FROM kids_progress p
       JOIN kids_lessons l ON l.id = p.lesson_id
       GROUP BY l.id, l.title, l.subject
       ORDER BY times_played DESC
       LIMIT 30`,
    );

    return res.json({ success: true, data: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('analytics getGameEngagement error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ─── GET /kids/analytics/leaderboard?class_code=&period=week ─────────────────
// Top performers across the school
async function getTopPerformers(req, res) {
  try {
    const u = req.user || {};
    if (!['admin', 'staff'].includes(String(u.user_type || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }
    const sid = u.school_id || '';
    const classCode = String(req.query.class_code || '').trim();
    const period = String(req.query.period || 'week').trim();

    // Time filter
    let timeFilter = '';
    if (period === 'week') {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      weekStart.setHours(0, 0, 0, 0);
      timeFilter = `AND p.created_at >= '${weekStart.toISOString().slice(0, 19).replace('T', ' ')}'`;
    } else if (period === 'month') {
      timeFilter = `AND p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
    }

    let query = `SELECT p.child_admission_no,
                        s.student_name, s.surname, s.class_code,
                        COUNT(*) AS games_played,
                        ROUND(AVG(p.score), 1) AS avg_score,
                        SUM(CASE WHEN p.score >= 80 THEN 1 ELSE 0 END) AS excellent_games
                 FROM kids_progress p
                 JOIN elite_db.students s ON s.admission_no = p.child_admission_no AND s.school_id = :sid
                 WHERE 1=1 ${timeFilter}`;
    const replacements = { sid };

    if (classCode) {
      query += ` AND s.class_code = :cc`;
      replacements.cc = classCode;
    }

    query += ` GROUP BY p.child_admission_no
               ORDER BY avg_score DESC, games_played DESC
               LIMIT 20`;

    const [rows] = await dbm().content.query(query, { replacements });

    return res.json({ success: true, data: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('analytics getTopPerformers error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getOverview,
  getClassComparison,
  getStrugglingStudents,
  getGameEngagement,
  getTopPerformers,
};
