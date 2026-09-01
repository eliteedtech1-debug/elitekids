/**
 * Parental Controls controller — Doc 17: Engagement & Accessibility Layer.
 *
 * Features:
 *   - Daily play-time limit (settable by parent/teacher)
 *   - Time-of-day windows (optional)
 *   - Controls in Parent Dashboard (not visible to child)
 *
 * Endpoints:
 *   GET  /kids/parental-controls        — get parental controls for a student
 *   POST /kids/parental-controls        — set/update parental controls
 *   GET  /kids/parental-controls/check  — check if a student can play right now
 */
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');
const { requireChildOwnership } = require('../services/routesHelper');

/**
 * GET /kids/parental-controls?student_id=X
 * Get parental controls for a student.
 */
async function getParentalControls(req, res) {
  try {
    const studentId = req.query.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    const controls = await db.KidParentalControl.findOne({ where: { student_id: studentId } });
    if (!controls) {
      return res.json({
        success: true,
        data: {
          daily_play_limit_minutes: 30,
          allowed_time_start: null,
          allowed_time_end: null,
          set_by: null,
        },
        message: 'No custom controls set — using defaults.',
      });
    }

    return res.json({ success: true, data: controls });
  } catch (err) {
    console.error('getParentalControls error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/parental-controls — set/update parental controls.
 *
 * Body:
 *   student_id, daily_play_limit_minutes, allowed_time_start (optional), allowed_time_end (optional)
 */
async function setParentalControls(req, res) {
  try {
    const user = req.user;
    const { student_id, daily_play_limit_minutes, allowed_time_start, allowed_time_end } = req.body || {};

    if (!student_id) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    // Only parents of the child or staff can set controls
    const userType = String(user.user_type || user.role || '').toLowerCase();
    if (!userType.includes('admin') && !userType.includes('branchadmin') && !userType.includes('teacher') && !userType.includes('superadmin') && !userType.includes('parent')) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (daily_play_limit_minutes !== undefined && (daily_play_limit_minutes < 0 || daily_play_limit_minutes > 480)) {
      return res.status(400).json({ success: false, message: 'daily_play_limit_minutes must be 0-480.' });
    }

    const updates = {};
    if (daily_play_limit_minutes !== undefined) updates.daily_play_limit_minutes = daily_play_limit_minutes;
    if (allowed_time_start !== undefined) updates.allowed_time_start = allowed_time_start || null;
    if (allowed_time_end !== undefined) updates.allowed_time_end = allowed_time_end || null;
    updates.set_by = String(user.id || user.user_id || '');

    const [record, created] = await db.KidParentalControl.findOrCreate({
      where: { student_id },
      defaults: {
        daily_play_limit_minutes: updates.daily_play_limit_minutes || 30,
        allowed_time_start: updates.allowed_time_start || null,
        allowed_time_end: updates.allowed_time_end || null,
        set_by: updates.set_by,
      },
    });

    if (!created) {
      await record.update(updates);
    }

    return res.status(created ? 201 : 200).json({ success: true, data: record });
  } catch (err) {
    console.error('setParentalControls error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/parental-controls/check?student_id=X
 * Check if a student can play right now.
 *
 * Checks:
 *   1. Time-of-day window (if set)
 *   2. Daily play-time limit (based on today's engagement snapshots)
 */
async function checkPlayAllowed(req, res) {
  try {
    const studentId = req.query.student_id;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const ownership = await requireChildOwnership(req);
    if (!ownership.ok) return res.status(ownership.status).json(ownership.body);

    const controls = await db.KidParentalControl.findOne({ where: { student_id: studentId } });
    if (!controls) {
      return res.json({ success: true, data: { allowed: true, reason: null } });
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check time-of-day window
    if (controls.allowed_time_start && controls.allowed_time_end) {
      const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS
      if (currentTime < controls.allowed_time_start || currentTime > controls.allowed_time_end) {
        return res.json({
          success: true,
          data: {
            allowed: false,
            reason: `Play is only allowed between ${controls.allowed_time_start} and ${controls.allowed_time_end}.`,
          },
        });
      }
    }

    // Check daily play-time limit
    if (controls.daily_play_limit_minutes > 0) {
      // Sum today's session durations
      const todaySessions = await db.KidEngagementSnapshot.findAll({
        where: {
          student_id: studentId,
          start_time: {
            [Op.gte]: new Date(`${today}T00:00:00Z`),
          },
        },
      });

      let totalMinutes = 0;
      for (const session of todaySessions) {
        if (session.end_time) {
          const duration = (new Date(session.end_time) - new Date(session.start_time)) / 60000;
          totalMinutes += duration;
        } else {
          // Session still in progress — estimate from start time
          const duration = (now - new Date(session.start_time)) / 60000;
          totalMinutes += duration;
        }
      }

      if (totalMinutes >= controls.daily_play_limit_minutes) {
        const remaining = Math.max(0, controls.daily_play_limit_minutes - totalMinutes);
        return res.json({
          success: true,
          data: {
            allowed: false,
            reason: `Daily play limit reached (${controls.daily_play_limit_minutes} minutes). Try again tomorrow!`,
            minutes_played_today: Math.round(totalMinutes),
            daily_limit: controls.daily_play_limit_minutes,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          allowed: true,
          reason: null,
          minutes_played_today: Math.round(totalMinutes),
          minutes_remaining: Math.round(controls.daily_play_limit_minutes - totalMinutes),
          daily_limit: controls.daily_play_limit_minutes,
        },
      });
    }

    return res.json({ success: true, data: { allowed: true, reason: null } });
  } catch (err) {
    console.error('checkPlayAllowed error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  getParentalControls,
  setParentalControls,
  checkPlayAllowed,
};
