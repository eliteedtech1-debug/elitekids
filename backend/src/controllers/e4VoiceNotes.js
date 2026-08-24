'use strict';
/**
 * E4 Phase 0 — Teacher Voice Notes (async class audio).
 *
 * A teacher records a ≤90s audio message in the staff console; every kid in the
 * class gets a web-push nudge (E3f-PUSH rails) and can play it from the app,
 * anywhere, anytime. This is the always-works companion to the realtime
 * intercom (e3fLive): no WebSocket needed, plays offline-cached metadata even
 * on flaky home networks.
 *
 * Endpoints:
 *   POST /kids/voice-notes        requireStaff — upload audio (multipart 'audio')
 *   GET  /kids/voice-notes        auth student — my class/school notes (newest 20)
 *   GET  /kids/voice-notes/mine   requireStaff — notes I sent (+delivery counts)
 *   GET  /kids/voice-notes/:id/audio  auth student — stream bytes (Range OK),
 *                                     first byte marks played_at
 *
 * Storage: files live in backend/spool/voice-notes (NEVER web-served statically);
 * every byte route is auth-gated + school-scoped. Magic-byte sniffed — extension lies are rejected.
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const webpush = require('web-push');

const dbm = () => require('../models');

const SPOOL_DIR = path.join(__dirname, '..', '..', 'spool', 'voice-notes');
const MAX_BYTES = 2 * 1024 * 1024; // 2MB ≈ 90s of opus mono at typical bitrates
const MAX_SECONDS = 95;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

function voiceNoteUploadMW(req, res, next) {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Audio too large (max 2MB).' : 'Upload failed.';
      return res.status(400).json({ success: false, message: msg });
    }
    return next();
  });
}

async function ensureSchema() {
  const c = dbm().content;
  await c.query(`CREATE TABLE IF NOT EXISTS kids_voice_notes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    school_id VARCHAR(40) NOT NULL,
    class_code VARCHAR(40) NULL,
    staff_user_id VARCHAR(64) NULL,
    title VARCHAR(120) NULL,
    duration_s SMALLINT NULL,
    mime VARCHAR(20) NULL,
    byte_size INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_vn_school (school_id, class_code, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await c.query(`CREATE TABLE IF NOT EXISTS kids_voice_notes_log (
    id CHAR(36) NOT NULL PRIMARY KEY,
    note_id CHAR(36) NOT NULL,
    child_admission_no VARCHAR(64) NOT NULL,
    delivered_at DATETIME NULL,
    played_at DATETIME NULL,
    UNIQUE KEY uq_vnlog_note_child (note_id, child_admission_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  fs.mkdirSync(SPOOL_DIR, { recursive: true });
}

// Extension-agnostic magic sniffing (MediaRecorder emits webm/opus on Android/
// Chrome, mp4/aac on iOS Safari — we accept what real devices actually send).
function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm'; // EBML
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'mp4'; // 'ftyp'@4
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'ogg'; // 'OggS'
  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

const MIME_BY_KIND = { webm: 'audio/webm', mp4: 'audio/mp4', ogg: 'audio/ogg', mp3: 'audio/mpeg' };

function configurePush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:ops@elitekids.com.ng',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    return true;
  } catch {
    return false;
  }
}

/** Fire-and-forget fan-out: push nudge to a school/class, log deliveries. */
async function fanoutPush(note, schoolId, classCode) {
  try {
    if (!configurePush()) return { skipped: 'not-configured' };
    const c = dbm().content;
    let subs;
    if (classCode) {
      const seq = dbm().sequelize;
      const roster = await seq.query(
        `SELECT admission_no FROM students WHERE school_id=:s AND class_code=:c LIMIT 300`,
        { replacements: { s: String(schoolId), c: String(classCode) }, type: dbm().Sequelize.QueryTypes.SELECT },
      );
      const adms = (roster || []).map((r) => r.admission_no);
      if (!adms.length) return { delivered: 0, failed: 0, reason: 'empty-roster' };
      [subs] = await c.query(
        `SELECT id, endpoint, p256dh, auth_key, child_admission_no FROM kids_push_subscriptions
         WHERE school_id=:s AND child_admission_no IN (:adms)`,
        { replacements: { s: String(schoolId), adms } },
      );
    } else {
      [subs] = await c.query(
        `SELECT id, endpoint, p256dh, auth_key, child_admission_no FROM kids_push_subscriptions WHERE school_id=:s`,
        { replacements: { s: String(schoolId) } },
      );
    }
    let delivered = 0;
    let failed = 0;
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          JSON.stringify({
            title: '🎙️ Message from Teacher!',
            body: note.title || 'Tap to listen to your teacher\u2019s voice note.',
            url: '/student',
            tag: `voice-note-${note.id}`,
          }),
          { TTL: 7 * 24 * 3600 },
        );
        delivered++;
        if (s.child_admission_no) {
          await c.query(
            `INSERT IGNORE INTO kids_voice_notes_log (id, note_id, child_admission_no, delivered_at)
             VALUES (:id, :nid, :adm, NOW())`,
            { replacements: { id: crypto.randomUUID(), nid: note.id, adm: s.child_admission_no } },
          );
        }
      } catch (err) {
        failed++;
        const sc = err && err.statusCode;
        if (sc === 404 || sc === 410) {
          await c.query(`DELETE FROM kids_push_subscriptions WHERE id=:id`, { replacements: { id: s.id } });
        }
      }
    }
    console.log(`e4Voice: note ${note.id} push delivered=${delivered} failed=${failed}`);
    return { delivered, failed };
  } catch (err) {
    console.error('e4Voice fanout:', err.message);
    return { error: err.message };
  }
}

// POST /kids/voice-notes (requireStaff, multipart field 'audio')
async function createVoiceNote(req, res) {
  try {
    await ensureSchema();
    const f = req.file;
    if (!f) return res.status(400).json({ success: false, message: "Field 'audio' is required." });
    const kind = sniffAudio(f.buffer);
    if (!kind) return res.status(400).json({ success: false, message: 'Unsupported audio format.' });
    const durationS = Math.round(Number(req.body.duration_s) || 0);
    if (durationS > MAX_SECONDS) {
      return res.status(400).json({ success: false, message: 'Voice notes are capped at 90 seconds.' });
    }
    const schoolId = req.headers['x-school-id'] || req.user.school_id;
    if (!schoolId) return res.status(400).json({ success: false, message: 'school_id could not be resolved.' });
    const rawClass = String(req.body.class_code || '').trim();
    const classCode = rawClass ? rawClass.toUpperCase().slice(0, 40) : null;

    const id = crypto.randomUUID();
    const note = {
      id,
      title: String(req.body.title || '').trim().slice(0, 120) || null,
      duration_s: Math.min(Math.max(durationS, 0), MAX_SECONDS) || null,
    };
    await dbm().content.query(
      `INSERT INTO kids_voice_notes (id, school_id, class_code, staff_user_id, title, duration_s, mime, byte_size)
       VALUES (:id,:s,:c,:by,:ti,:du,:mi,:bs)`,
      {
        replacements: {
          id,
          s: String(schoolId),
          c: classCode,
          by: String(req.user.admission_no || req.user.id || req.user.email || '').slice(0, 64),
          ti: note.title,
          du: note.duration_s,
          mi: kind,
          bs: f.buffer.length,
        },
      },
    );
    fs.writeFileSync(path.join(SPOOL_DIR, `${id}.bin`), f.buffer);

    // Respond first; push fan-out happens in background.
    fanoutPush(note, schoolId, classCode).catch(() => {});
    return res.status(201).json({
      success: true,
      data: { id, title: note.title, duration_s: note.duration_s, class_code: classCode, kind },
    });
  } catch (err) {
    console.error('e4Voice create:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

async function resolveStudentScope(user) {
  const seq = dbm().sequelize;
  const key = String(user.admission_no || user.id || '');
  const rows = await seq.query(
    `SELECT admission_no, school_id, class_code FROM students
     WHERE admission_no=:k OR id=:k LIMIT 1`,
    { replacements: { k: key }, type: dbm().Sequelize.QueryTypes.SELECT },
  );
  return (rows && rows[0]) || null;
}

// GET /kids/voice-notes — student's feed (class-scoped when they have a class)
async function listVoiceNotes(req, res) {
  try {
    await ensureSchema();
    const me = await resolveStudentScope(req.user || {});
    if (!me || !me.school_id) return res.json({ success: true, data: [] });
    const [rows] = await dbm().content.query(
      `SELECT id, title, duration_s, class_code, created_at FROM kids_voice_notes
       WHERE school_id=:s AND (class_code IS NULL OR class_code=:c)
       ORDER BY created_at DESC LIMIT 20`,
      { replacements: { s: String(me.school_id), c: me.class_code || '__none__' } },
    );
    const ids = (rows || []).map((r) => r.id);
    let playedSet = new Set();
    if (ids.length) {
      const [logs] = await dbm().content.query(
        `SELECT note_id FROM kids_voice_notes_log
         WHERE child_admission_no=:me AND played_at IS NOT NULL AND note_id IN (:ids)`,
        { replacements: { me: me.admission_no, ids } },
      );
      playedSet = new Set((logs || []).map((l) => l.note_id));
    }
    return res.json({
      success: true,
      data: (rows || []).map((r) => ({
        id: r.id,
        title: r.title,
        duration_s: r.duration_s,
        class_code: r.class_code,
        created_at: r.created_at,
        played: playedSet.has(r.id),
      })),
    });
  } catch (err) {
    console.error('e4Voice list:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /kids/voice-notes/mine — staff: what did I send + reach
async function listMyVoiceNotes(req, res) {
  try {
    await ensureSchema();
    const mine = String(req.user.admission_no || req.user.id || req.user.email || '').slice(0, 64);
    const [rows] = await dbm().content.query(
      `SELECT n.id, n.title, n.class_code, n.duration_s, n.created_at,
              COUNT(l.id) AS reached,
              SUM(l.played_at IS NOT NULL) AS played_count
       FROM kids_voice_notes n
       LEFT JOIN kids_voice_notes_log l ON l.note_id = n.id
       WHERE n.staff_user_id=:me
       GROUP BY n.id ORDER BY n.created_at DESC LIMIT 30`,
      { replacements: { me: mine } },
    );
    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('e4Voice mine:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

// GET /kids/voice-notes/:id/audio — authed byte stream w/ Range support
function streamVoiceNoteAudio(req, res) {
  (async () => {
    try {
      await ensureSchema();
      const [rows] = await dbm().content.query(
        `SELECT id, school_id, mime FROM kids_voice_notes WHERE id=:id LIMIT 1`,
        { replacements: { id: String(req.params.id || '') } },
      );
      const note = (rows || [])[0];
      if (!note) return res.status(404).json({ success: false, message: 'Not found.' });
      const mySchool = req.headers['x-school-id'] || (req.user || {}).school_id;
      const me = (req.user || {}).user_type === 'student' ? await resolveStudentScope(req.user) : null;
      const scoped = me ? me.school_id : mySchool;
      if (!scoped || String(scoped) !== String(note.school_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
      }

      const filePath = path.join(SPOOL_DIR, `${note.id}.bin`);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        return res.status(404).json({ success: false, message: 'Audio missing.' });
      }

      // First byte from a student marks played_at (upsert keeps delivered_at).
      if (me && me.admission_no) {
        dbm().content.query(
          `INSERT INTO kids_voice_notes_log (id, note_id, child_admission_no, delivered_at, played_at)
           VALUES (:id, :nid, :adm, NOW(), NOW())
           ON DUPLICATE KEY UPDATE played_at=COALESCE(played_at, NOW())`,
          { replacements: { id: crypto.randomUUID(), nid: note.id, adm: me.admission_no } },
        ).catch(() => {});
      }

      const range = String(req.headers.range || '');
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const mime = MIME_BY_KIND[note.mime] || 'application/octet-stream';
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) {
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          return res.status(416).end();
        }
        res.status(206);
        res.setHeader('Content-Length', end - start + 1);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.setHeader('Content-Length', stat.size);
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error('e4Voice stream:', err.message);
      if (!res.headersSent) return res.status(500).json({ success: false, message: 'Server error.' });
    }
  })();
}

module.exports = { voiceNoteUploadMW, createVoiceNote, listVoiceNotes, listMyVoiceNotes, streamVoiceNoteAudio };
