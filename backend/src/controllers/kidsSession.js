/**
 * Save / Resume controller — Doc 17: Engagement & Accessibility Layer.
 *
 * Auto-save after each question/interaction.
 * Resume exactly where child left off.
 * Undo affordance for accidental taps.
 * Crash/force-close recovery.
 *
 * Endpoints:
 *   POST /kids/session/save       — save session state (auto-save after each interaction)
 *   GET  /kids/session/resume     — get saved session state for resume
 *   DELETE /kids/session/:id      — delete a session (when completed or abandoned)
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../models');

/**
 * POST /kids/session/save — save session state.
 *
 * Body:
 *   session_id, student_id, current_item_id, current_tier, saved_state
 *
 * saved_state is a free-form JSON blob that captures exactly where the child is:
 *   { question_index, selected_option, drag_positions, time_remaining, ... }
 */
async function saveSession(req, res) {
  try {
    const { session_id, student_id, current_item_id, current_tier, saved_state } = req.body || {};
    if (!session_id || !student_id || !current_item_id || current_tier === undefined) {
      return res.status(400).json({
        success: false,
        message: 'session_id, student_id, current_item_id, and current_tier are required.',
      });
    }

    // Upsert: one active session per student+session_id
    const [record, created] = await db.KidSessionState.findOrCreate({
      where: { student_id, session_id },
      defaults: {
        current_item_id,
        current_tier,
        saved_state: saved_state || {},
      },
    });

    if (!created) {
      await record.update({
        current_item_id,
        current_tier,
        saved_state: saved_state || record.saved_state,
      });
    }

    return res.status(created ? 201 : 200).json({ success: true, data: record });
  } catch (err) {
    console.error('saveSession error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/session/resume?student_id=X&session_id=Y
 * Get saved session state for resume.
 */
async function resumeSession(req, res) {
  try {
    const { student_id, session_id } = req.query;
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const where = { student_id };
    if (session_id) where.session_id = session_id;

    const record = await db.KidSessionState.findOne({
      where,
      order: [['updated_at', 'DESC']],
    });

    if (!record) {
      return res.json({ success: true, data: null, message: 'No saved session found.' });
    }

    return res.json({ success: true, data: record });
  } catch (err) {
    console.error('resumeSession error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * DELETE /kids/session/:id — delete a session (when completed or abandoned).
 */
async function deleteSession(req, res) {
  try {
    const { id } = req.params;
    const record = await db.KidSessionState.findByPk(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    await record.destroy();
    return res.json({ success: true, message: 'Session deleted.' });
  } catch (err) {
    console.error('deleteSession error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  saveSession,
  resumeSession,
  deleteSession,
};
