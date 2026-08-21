/**
 * Pattern Tracking controller — Doc 14: Pattern Tracking & Parent/Teacher Insights.
 *
 * Data collection:
 *   - game_item_responses: per-tap logging with tier, distractor_count, response_time_ms
 *   - engagement_snapshots: session length, drop-off points
 *   - mastery_progress: attempts to mastery, regression flags
 *
 * Presentation Rules (Doc 14):
 *   - Always relative to child's own history
 *   - No composite scores
 *   - Plain-language digest format
 *   - Neutral framing for regression flags
 *
 * Endpoints:
 *   POST /kids/tracking/item-response     — record a single item response
 *   POST /kids/tracking/session-snapshot  — record an engagement snapshot
 *   GET  /kids/tracking/progress          — get mastery progress for a student
 *   GET  /kids/tracking/digest            — plain-language digest for parent/teacher
 */
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const db = require('../models');

/**
 * POST /kids/tracking/item-response — record a single item response.
 *
 * Body:
 *   student_id, item_id, tier, distractor_count, response_time_ms, mode, correct
 */
async function recordItemResponse(req, res) {
  try {
    const { student_id, item_id, tier, distractor_count, response_time_ms, mode, correct } = req.body || {};
    if (!student_id || !item_id || tier === undefined || mode === undefined || correct === undefined) {
      return res.status(400).json({
        success: false,
        message: 'student_id, item_id, tier, mode, and correct are required.',
      });
    }
    if (!['learning', 'practice', 'test'].includes(mode)) {
      return res.status(400).json({ success: false, message: "mode must be 'learning', 'practice', or 'test'." });
    }

    const response = await db.KidGameItemResponse.create({
      student_id,
      item_id,
      tier,
      distractor_count: distractor_count || 0,
      response_time_ms: response_time_ms || 0,
      mode,
      correct: !!correct,
    });

    // Update mastery progress
    await updateMasteryProgress(student_id, item_id, tier);

    return res.status(201).json({ success: true, data: response });
  } catch (err) {
    console.error('recordItemResponse error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * POST /kids/tracking/session-snapshot — record an engagement snapshot.
 *
 * Body:
 *   session_id, student_id, start_time, end_time, drop_off_point, content_format_breakdown
 */
async function recordSessionSnapshot(req, res) {
  try {
    const { session_id, student_id, start_time, end_time, drop_off_point, content_format_breakdown } = req.body || {};
    if (!session_id || !student_id || !start_time) {
      return res.status(400).json({
        success: false,
        message: 'session_id, student_id, and start_time are required.',
      });
    }

    const snapshot = await db.KidEngagementSnapshot.create({
      session_id,
      student_id,
      start_time,
      end_time: end_time || null,
      drop_off_point: drop_off_point || null,
      content_format_breakdown: content_format_breakdown || null,
    });

    return res.status(201).json({ success: true, data: snapshot });
  } catch (err) {
    console.error('recordSessionSnapshot error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/tracking/progress?student_id=X&category=Y (optional)
 * Get mastery progress for a student.
 */
async function getProgress(req, res) {
  try {
    const { student_id, category } = req.query;
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    const where = { student_id };
    if (category) where.category = category;

    const progress = await db.KidMasteryProgress.findAll({ where, order: [['category', 'ASC'], ['item_id', 'ASC']] });

    return res.json({ success: true, data: progress });
  } catch (err) {
    console.error('getProgress error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

/**
 * GET /kids/tracking/digest?student_id=X
 * Plain-language digest for parent/teacher — relative to child's own history only.
 * No composite scores, no comparisons to other children.
 */
async function getDigest(req, res) {
  try {
    const student_id = req.query.student_id;
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'student_id is required.' });
    }

    // Get student info
    const student = await db.KidChild.findOne({ where: { admission_no: student_id } });
    const studentName = student ? student.full_name : 'Your child';

    // Mastery progress
    const mastery = await db.KidMasteryProgress.findAll({
      where: { student_id },
      order: [['category', 'ASC'], ['item_id', 'ASC']],
    });

    // Recent responses (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentResponses = await db.KidGameItemResponse.findAll({
      where: { student_id, created_at: { [Op.gte]: thirtyDaysAgo } },
      order: [['created_at', 'DESC']],
    });

    // Engagement stats
    const sessions = await db.KidEngagementSnapshot.findAll({
      where: { student_id, start_time: { [Op.gte]: thirtyDaysAgo } },
    });

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.end_time).length;
    const avgSessionMinutes = totalSessions > 0
      ? Math.round(sessions.reduce((sum, s) => {
          const duration = s.end_time
            ? (new Date(s.end_time) - new Date(s.start_time)) / 60000
            : 0;
          return sum + duration;
        }, 0) / totalSessions)
      : 0;

    // Items mastered (at least 3 correct responses)
    const masteredItems = mastery.filter((m) => m.attempts_to_mastery > 0 && !m.last_regression_flag_at);
    const itemsInProgress = mastery.filter((m) => m.attempts_to_mastery === 0 || m.last_regression_flag_at);

    // Response accuracy
    const correctCount = recentResponses.filter((r) => r.correct).length;
    const accuracy = recentResponses.length > 0
      ? Math.round((correctCount / recentResponses.length) * 100)
      : 0;

    // Regression flags (items where the child was doing well but recently struggled)
    const regressionItems = mastery.filter((m) => m.last_regression_flag_at);

    // Build plain-language digest
    const lines = [];
    lines.push(`${studentName}'s Learning Summary (last 30 days):`);

    if (totalSessions === 0) {
      lines.push(`${studentName} hasn't played any games yet this month.`);
    } else {
      lines.push(`Played ${totalSessions} time${totalSessions > 1 ? 's' : ''}, averaging ${avgSessionMinutes} minute${avgSessionMinutes > 1 ? 's' : ''} per session.`);
    }

    if (masteredItems.length > 0) {
      lines.push(`Mastered ${masteredItems.length} item${masteredItems.length > 1 ? 's' : ''} across ${[...new Set(masteredItems.map((m) => m.category))].join(', ')}.`);
    }

    if (itemsInProgress.length > 0) {
      lines.push(`Currently learning ${itemsInProgress.length} item${itemsInProgress.length > 1 ? 's' : ''}.`);
    }

    if (recentResponses.length > 0) {
      lines.push(`Overall accuracy: ${accuracy}% (${correctCount} correct out of ${recentResponses.length}).`);
    }

    if (regressionItems.length > 0) {
      // Neutral framing: "could use a refresher" not "is struggling"
      const itemNames = regressionItems.slice(0, 3).map((m) => m.item_id);
      lines.push(`Could use a refresher on: ${itemNames.join(', ')}${regressionItems.length > 3 ? ` and ${regressionItems.length - 3} more` : ''}.`);
    }

    return res.json({
      success: true,
      data: {
        student_name: studentName,
        summary: lines.join(' '),
        mastered_count: masteredItems.length,
        in_progress_count: itemsInProgress.length,
        regression_count: regressionItems.length,
        total_sessions: totalSessions,
        avg_session_minutes: avgSessionMinutes,
        accuracy_pct: accuracy,
        per_category: buildCategoryBreakdown(mastery),
      },
    });
  } catch (err) {
    console.error('getDigest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function updateMasteryProgress(student_id, item_id, tier) {
  try {
    // Count correct responses for this item
    const correctResponses = await db.KidGameItemResponse.count({
      where: { student_id, item_id, correct: true },
    });

    const totalResponses = await db.KidGameItemResponse.count({
      where: { student_id, item_id },
    });

    // Item is "mastered" after 3 correct responses
    const isMastered = correctResponses >= 3;

    // Check for regression: last 3 responses were wrong after previous successes
    let regressionFlag = null;
    if (correctResponses > 0 && totalResponses >= 3) {
      const recent = await db.KidGameItemResponse.findAll({
        where: { student_id, item_id },
        order: [['created_at', 'DESC']],
        limit: 3,
      });
      const allWrong = recent.every((r) => !r.correct);
      if (allWrong) {
        regressionFlag = new Date();
      }
    }

    // Upsert mastery record
    const [record, created] = await db.KidMasteryProgress.findOrCreate({
      where: { student_id, item_id, tier },
      defaults: {
        category: 'Unknown', // will be updated from game config
        attempts_to_mastery: isMastered ? totalResponses : 0,
        last_regression_flag_at: regressionFlag,
      },
    });

    if (!created) {
      const updates = {};
      if (isMastered && record.attempts_to_mastery === 0) {
        updates.attempts_to_mastery = totalResponses;
      }
      if (regressionFlag) {
        updates.last_regression_flag_at = regressionFlag;
      }
      if (Object.keys(updates).length > 0) {
        await record.update(updates);
      }
    }
  } catch (err) {
    console.error('⚠️ updateMasteryProgress failed:', err.message);
  }
}

function buildCategoryBreakdown(mastery) {
  const byCategory = {};
  for (const m of mastery) {
    if (!byCategory[m.category]) {
      byCategory[m.category] = { total: 0, mastered: 0, in_progress: 0 };
    }
    byCategory[m.category].total++;
    if (m.attempts_to_mastery > 0 && !m.last_regression_flag_at) {
      byCategory[m.category].mastered++;
    } else {
      byCategory[m.category].in_progress++;
    }
  }
  return byCategory;
}

module.exports = {
  recordItemResponse,
  recordSessionSnapshot,
  getProgress,
  getDigest,
};
