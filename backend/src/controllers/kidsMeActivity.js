/**
 * Placeholder controller for /kids/me/activity.
 * Stub — no frontend consumer found yet.
 */
async function getMyActivity(req, res) {
  try {
    return res.json({ success: true, data: { sessions: [], totalMinutes: 0 } });
  } catch (err) {
    console.error('getMyActivity error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { getMyActivity };
