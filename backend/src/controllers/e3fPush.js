'use strict';
/**
 * E3f — Weekend push notifications.
 * Web-push (VAPID) reminders so kids know the Weekend Challenge is live and
 * get nudged toward the Trophy Board leaderboard.
 *
 *  - GET  /kids/push/public-key   → { publicKey }          (auth)
 *  - POST /kids/push/subscribe    → upsert subscription   (auth student)
 *  - Scheduler (in-process): Sat/Sun ≥08:00Z, once per ISO week, blast all subs.
 *    FORCE_PUSH_TEST=1 node … blastWeekendPush(true) for an immediate dry-run.
 */
const crypto = require('crypto');
const webpush = require('web-push');
const { Sequelize } = require('sequelize');

let schedulerStarted = false;
let configured = false;

function configure() {
  if (configured) return true;
  const pk = process.env.VAPID_PUBLIC_KEY;
  const sk = process.env.VAPID_PRIVATE_KEY;
  if (!pk || !sk) {
    console.error('e3fPush: VAPID keys missing in env — push disabled');
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ops@elitekids.com.ng', pk, sk);
  configured = true;
  return true;
}

const db = () => require('../models');

async function ensureSchema() {
  const c = db().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_push_subscriptions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    endpoint VARCHAR(500) NOT NULL,
    p256dh TEXT NULL,
    auth_key TEXT NULL,
    child_admission_no VARCHAR(64) NULL,
    school_id VARCHAR(40) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_kids_push_endpoint (endpoint)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_push_log (
    week_key VARCHAR(20) NOT NULL PRIMARY KEY,
    sent_at DATETIME NULL,
    delivered INT NOT NULL DEFAULT 0,
    failed INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const isoYear = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4));
  week1Thu.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const weekNo = 1 + Math.round((t - week1Thu) / (7 * 86400000));
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

// GET /kids/push/public-key
async function getPublicKey(req, res) {
  if (!configure()) return res.status(503).json({ success: false, message: 'Push not configured.' });
  return res.json({ success: true, data: { publicKey: process.env.VAPID_PUBLIC_KEY } });
}

// POST /kids/push/subscribe { endpoint, keys:{p256dh, auth} }
async function subscribe(req, res) {
  try {
    if (!configure()) return res.status(503).json({ success: false, message: 'Push not configured.' });
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ success: false, message: 'endpoint and keys.p256dh/keys.auth are required.' });
    }
    const u = req.user || {};
    await ensureSchema();
    await db().content.query(
      `INSERT INTO kids_push_subscriptions (id, endpoint, p256dh, auth_key, child_admission_no, school_id)
       VALUES (:id, :endpoint, :p256dh, :auth, :adm, :school)
       ON DUPLICATE KEY UPDATE p256dh=:p256dh, auth_key=:auth, child_admission_no=:adm, school_id=:school`,
      {
        replacements: {
          id: crypto.randomUUID(),
          endpoint: String(endpoint).slice(0, 500),
          p256dh: String(keys.p256dh),
          auth: String(keys.auth),
          adm: String(u.admission_no || u.id || '').slice(0, 64),
          school: String(u.school_id || '').slice(0, 40),
        },
      },
    );
    return res.json({ success: true, data: { subscribed: true } });
  } catch (err) {
    console.error('push subscribe error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

const WEEKEND_TITLE = "🎉 It's the Weekend!";
const WEEKEND_BODY = 'Your Weekend Challenge is ready! Play it now and climb the Trophy Board leaderboard 🏆';

/** Send to every subscription; cleans dead endpoints; once-per-week guard unless force. */
async function blastWeekendPush(force = false) {
  if (!configure()) return { skipped: 'not-configured' };
  await ensureSchema();
  const now = new Date();
  const isDue = (now.getUTCDay() === 6 || now.getUTCDay() === 0) && now.getUTCHours() >= 8;
  if (!isDue && !force && process.env.FORCE_PUSH_TEST !== '1') return { skipped: 'not-due' };

  const weekKey = isoWeekKey(now);
  const c = db().content;
  // Once per ISO week (insert wins the lock; re-ranks are no-ops)
  const [, meta] = await c.query(
    `INSERT IGNORE INTO kids_push_log (week_key) VALUES (:wk)`,
    { replacements: { wk: weekKey } },
  );
  const inserted = Array.isArray(meta) ? meta.affectedRows : (meta && meta.affectedRows) || 0;
  if (!inserted && !force && process.env.FORCE_PUSH_TEST !== '1') return { skipped: 'already-sent', weekKey };

  const [subs] = await c.query(`SELECT id, endpoint, p256dh, auth_key FROM kids_push_subscriptions`);
  let delivered = 0;
  let failed = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        JSON.stringify({ title: WEEKEND_TITLE, body: WEEKEND_BODY, url: '/student', tag: 'weekend-challenge' }),
        { TTL: 3 * 24 * 3600 },
      );
      delivered++;
    } catch (err) {
      failed++;
      const sc = err && err.statusCode;
      if (sc === 404 || sc === 410) {
        await c.query(`DELETE FROM kids_push_subscriptions WHERE id=:id`, { replacements: { id: s.id } });
      }
    }
  }
  await c.query(
    `UPDATE kids_push_log SET sent_at=NOW(), delivered=:d, failed=:f WHERE week_key=:wk`,
    { replacements: { d: delivered, f: failed, wk: weekKey } },
  );
  console.log(`e3fPush: weekend blast ${weekKey} delivered=${delivered} failed=${failed}`);
  return { weekKey, delivered, failed };
}

/** Called once from routes registration — single in-process scheduler. */
function startPushScheduler() {
  if (schedulerStarted || process.env.PUSH_SCHEDULER === 'off') return;
  schedulerStarted = true;
  setInterval(() => {
    blastWeekendPush(false).catch((e) => console.error('push-scheduler:', e.message));
  }, 10 * 60 * 1000); // check every 10 min; weekly guard makes this cheap
  console.log('e3fPush: weekend push scheduler armed (Sat/Sun ≥08:00Z, once per ISO week)');
}

module.exports = { getPublicKey, subscribe, blastWeekendPush, startPushScheduler };
