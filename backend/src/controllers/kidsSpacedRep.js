'use strict';
/**
 * Spaced Repetition — schedule reviews at optimal intervals.
 * Uses the kids_adaptive_profiles.next_review_at field.
 * This controller provides: get due reviews, mark review complete.
 */
const dbm = () => require('../models');

// GET /kids/reviews/due — lessons due for review today
async function getDueReviews(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const [rows] = await dbm().content.query(
      `SELECT p.subject, p.topic, p.current_difficulty AS difficulty, p.accuracy_7d, p.next_review_at,
              l.id AS lesson_id, l.title AS lesson_title
       FROM kids_adaptive_profiles p
       LEFT JOIN kids_lessons l ON l.subject = p.subject AND l.content_state = 'published'
       WHERE p.child_admission_no=:adm
         AND p.next_review_at <= NOW()
         AND p.next_review_at IS NOT NULL
       ORDER BY p.next_review_at ASC
       LIMIT 20`,
      { replacements: { adm } },
    );
    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('reviews getDue error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// POST /kids/reviews/complete { subject, topic, quality }
// quality: 0-100 (score from review attempt)
async function markReviewComplete(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const { subject, topic, quality } = req.body || {};
    if (!subject || !topic) {
      return res.status(400).json({ success: false, message: 'subject and topic required.' });
    }
    const q = Math.max(0, Math.min(100, Number(quality) || 0));

    // Calculate next interval based on quality (Ebbinghaus)
    let intervalDays;
    if (q >= 80) {
      // Good recall: double the interval
      const [row] = await dbm().content.query(
        `SELECT TIMESTAMPDIFF(DAY, last_practiced_at, next_review_at) AS current_interval
         FROM kids_adaptive_profiles WHERE child_admission_no=:adm AND subject=:sub AND topic=:t LIMIT 1`,
        { replacements: { adm, sub: subject, t: topic } },
      ).catch(() => []);
      const currentInterval = (Array.isArray(row) ? row[0] : row)?.current_interval || 1;
      intervalDays = Math.min(60, currentInterval * 2);
    } else if (q >= 50) {
      // Moderate recall: keep interval
      intervalDays = 1;
    } else {
      // Poor recall: reset to short interval
      intervalDays = 1;
    }

    const nextReview = new Date(Date.now() + intervalDays * 86400000);

    await dbm().content.query(
      `UPDATE kids_adaptive_profiles
       SET next_review_at=:nr, last_practiced_at=NOW()
       WHERE child_admission_no=:adm AND subject=:sub AND topic=:t`,
      { replacements: { nr: nextReview, adm, sub: subject, t: topic } },
    );

    return res.json({ success: true, data: { next_review_at: nextReview, interval_days: intervalDays } });
  } catch (err) {
    console.error('reviews markComplete error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /kids/reviews/stats — review streak and stats
async function getReviewStats(req, res) {
  try {
    const u = req.user || {};
    if (String(u.user_type || '').toLowerCase() !== 'student') {
      return res.status(403).json({ success: false, message: 'Students only.' });
    }
    const adm = String(u.admission_no || '');
    const [total] = await dbm().content.query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN next_review_at <= NOW() THEN 1 ELSE 0 END) AS due
       FROM kids_adaptive_profiles WHERE child_admission_no=:adm`,
      { replacements: { adm } },
    ).catch(() => [[{ total: 0, due: 0 }]]);
    const [streak] = await dbm().content.query(
      `SELECT MAX(streak_days) AS best_streak FROM kids_adaptive_profiles WHERE child_admission_no=:adm`,
      { replacements: { adm } },
    ).catch(() => [[{ best_streak: 0 }]]);

    const t = (Array.isArray(total[0]) ? total[0] : [])[0] || { total: 0, due: 0 };
    const s = (Array.isArray(streak[0]) ? streak[0] : [])[0] || { best_streak: 0 };

    // Compute average accuracy across all adaptive profiles for this child
    const [accRows] = await dbm().content.query(
      `SELECT AVG(accuracy_7d) AS avg_acc FROM kids_adaptive_profiles WHERE child_admission_no=:adm AND accuracy_7d IS NOT NULL`,
      { replacements: { adm } },
    ).catch(() => [[{ avg_acc: 0 }]]);
    const rawAcc = (Array.isArray(accRows[0]) ? accRows[0] : [])[0]?.avg_acc;
    const avgAcc = Number.isFinite(Number(rawAcc)) ? Number(rawAcc) : 0;

    return res.json({
      success: true,
      data: {
        total_reviewed: t.total || 0,
        due_today: t.due || 0,
        streak_days: s.best_streak || 0,
        avg_accuracy: Math.round(avgAcc),
      },
    });
  } catch (err) {
    console.error('reviews getStats error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = { getDueReviews, markReviewComplete, getReviewStats };
