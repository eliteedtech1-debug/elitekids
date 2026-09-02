'use strict';
/**
 * E3f — KidsLive: real-time class audio (teacher broadcast + teacher-controlled
 * student replies). Walkie-talkie model: exactly ONE speaker at a time.
 *
 * Roles (same transport, different rooms):
 *   - teacher  → joins a CLASS room  (`<school>:<class>`)   — broadcasts to all
 *                 students in the class, grants/revokes each student's floor.
 *   - student  → joins their CLASS room AND every PARENT room their guardians
 *                 hold (`<school>:parent:<phone>`, resolved from
 *                 kids_parent_links) — replies only when floored in a room.
 *   - parent   → joins their PARENT room (`<school>:parent:<phone>`) — the
 *                 EXACT same controls as a teacher, scoped to their own
 *                 children: broadcast to all of them at once, mute/unmute,
 *                 one-to-one WebRTC call per child.
 *
 * Transport modes:
 *   1. PCM relay (legacy, always available): WebSocket binary frames (16kHz mono
 *      Int16 PCM chunks, ~100ms each) through nginx WSS.
 *   2. WebRTC P2P (opt-in via LIVE_WEBRTC=1): signaling over WebSocket, actual
 *      audio media via RTCPeerConnection. Controller publishes one Opus stream
 *      to all listeners; floored child publishes mic back to the controller.
 *
 * Protocol (path /kids-live?token=JWT):
 *   server → {type:'welcome', role, floor, live, webrtc:bool}
 *   server → {type:'presence', online:[{adm,name,role,floor}]}
 *   server → {type:'live', on}                       // controller joined/left
 *   server → {type:'floor', adm, on}                 // roster change for controllers
 *   server → {type:'you-floor', on}                  // personal floor grant
 *   server → {type:'webrtc-start'}                   // controller began broadcasting (children create PC)
 *   server → {type:'webrtc-stop'}                    // controller stopped broadcasting
 *   client(controller) → {type:'floor', adm, on}     // grant/revoke child mic
 *   client(controller) → {type:'webrtc-offer', to, sdp}   // SDP offer to child
 *   client(controller) → {type:'webrtc-ice', to, candidate}
 *   client(child) → {type:'webrtc-answer', sdp}      // SDP answer to controller
 *   client(child) → {type:'webrtc-ice', candidate}
 *   server → {type:'webrtc-offer', from, sdp}        // relayed offer to child
 *   server → {type:'webrtc-answer', from, sdp}       // relayed answer to controller
 *   server → {type:'webrtc-ice', from, candidate}    // relayed ICE candidate
 *   server → {type:'you-mic', on}                    // child mic grant (add/remove track)
 *   binary frame: PCM chunk (fallback mode only).
 */
const crypto = require('crypto');

let attached = false;

// ── Shared broadcast API for other modules (arena, reactions, notifications) ──
// Other controllers import these to push real-time events through the WebSocket.
const _broadcastFns = { toClass: null, toParent: null };

/**
 * Broadcast a JSON message to ALL connections in a class room.
 * Call from arena, competition, or any module that needs real-time push.
 * @param {string} schoolId
 * @param {string} classCode
 * @param {object} msg - will be JSON-stringified
 */
function broadcastToClass(schoolId, classCode, msg) {
  if (_broadcastFns.toClass) _broadcastFns.toClass(schoolId, classCode, msg);
}

/**
 * Broadcast a JSON message to a specific parent room.
 * @param {string} schoolId
 * @param {string} phone - normalized phone (+234...)
 * @param {object} msg
 */
function broadcastToParent(schoolId, phone, msg) {
  if (_broadcastFns.toParent) _broadcastFns.toParent(schoolId, phone, msg);
}

function verifyJwt(token, secret) {
  try {
    const parts = String(token || '').replace(/^Bearer\s+/i, '').split('.');
    if (parts.length !== 3) return null;
    const head = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
    if ((head.alg || '').toLowerCase() !== 'hs256') return null;
    const sig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function sanitizeName(row) {
  if (!row) return 'Friend';
  const first = String(row.first_name || row.student_name || '').trim();
  const last = String(row.surname || '').trim();
  return `${first}${last ? ` ${last.charAt(0).toUpperCase()}.` : ''}` || 'Friend';
}

/**
 * Normalize a phone to the suite form (+234…, lowercase) so parent room keys
 * match regardless of whether the phone came from kids_parent_links (already
 * +234) or the SHARED parents.phone (often 080…). Same rule as kidsParent.js.
 */
function normPhone(p) {
  return String(p || '').replace(/\s+/g, '').replace(/^0/, '+234').toLowerCase();
}

function attach(server) {
  if (attached) return;
  attached = true;
  let WebSocketServer;
  try {
    ({ WebSocketServer } = require('ws'));
  } catch {
    console.error('e3fLive: ws module missing — live audio disabled');
    return;
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  // key → { conns:Set<conn>, speaker:null|string, speakerTimer, pendingOffers:Map<adm,adm> }
  const rooms = new Map();
  const ROOM_CAPACITY = 60;

  // Wire up shared broadcast API for other modules
  _broadcastFns.toClass = (schoolId, classCode, msg) => {
    const key = `${schoolId}:${classCode}`;
    const r = rooms.get(key);
    if (r) broadcast(r, msg);
  };
  _broadcastFns.toParent = (schoolId, phone, msg) => {
    const norm = String(phone || '').replace(/\s+/g, '').replace(/^0/, '+234').toLowerCase();
    const key = `${schoolId}:parent:${norm}`;
    const r = rooms.get(key);
    if (r) broadcast(r, msg);
  };

  function tryJoin(conn, key) {
    let r = rooms.get(key);
    if (!r) {
      r = { conns: new Set(), speaker: null, speakerTimer: null, pendingOffers: new Map() };
      rooms.set(key, r);
    }
    if (r.conns.size >= ROOM_CAPACITY) return null;
    r.conns.add(conn);
    conn.rooms.add(key);
    return r;
  }

  function presence(r, rKey) {
    return [...r.conns].map((c) => ({
      adm: c.adm || c.uid,
      name: c.name,
      role: c.role,
      floor: c.floors.has(rKey),
    }));
  }

  function broadcast(r, obj, except) {
    const data = JSON.stringify(obj);
    for (const c of r.conns) {
      if (c !== except && c.ws.readyState === 1) c.ws.send(data);
    }
  }

  function refreshPresence(r, rKey) {
    if (!r) return;
    broadcast(r, { type: 'presence', online: presence(r, rKey) });
    const liveOn = [...r.conns].some((c) => c.role === 'teacher' || c.role === 'parent');
    broadcast(r, { type: 'live', on: liveOn });
  }

  wss.on('connection', async (ws, req, url) => {
    try {
      const secret = process.env.JWT_SECRET_KEY;
      const payload = verifyJwt(url.searchParams.get('token'), secret);
      if (!payload) {
        ws.close(4001, 'unauthorized');
        return;
      }
      const dbm = require('../models');
      const userType = String(payload.user_type || '').toLowerCase();
      const schoolId = String(payload.school_id || '');
      const webrtcEnabled = process.env.LIVE_WEBRTC === '1' || process.env.LIVE_WEBRTC === 'true';
      // TURN/STUN config sent to clients for WebRTC ICE negotiation
      let iceServers;
      if (webrtcEnabled) {
        const turnUrls = process.env.TURN_URLS; // e.g. turn:turn.example.com:3478?transport=udp
        const turnUser = process.env.TURN_USER;
        const turnPass = process.env.TURN_PASS;
        const stunUrls = process.env.STUN_URLS; // e.g. stun:stun.l.google.com:19302
        iceServers = [];
        if (stunUrls) {
          iceServers.push(...stunUrls.split(',').map((u) => ({ urls: u.trim() })));
        }
        if (turnUrls && turnUser && turnPass) {
          for (const url of turnUrls.split(',')) {
            iceServers.push({ urls: url.trim(), username: turnUser, credential: turnPass });
          }
        }
        if (!iceServers.length) {
          iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
        }
      }

      const conn = {
        ws, role: userType, schoolId,
        rooms: new Set(),   // room keys this connection is in
        floors: new Set(),  // room keys where a student currently holds the floor
        adm: '', name: '',
      };
      let primaryKey = null;

      if (userType === 'student') {
        const adm = String(payload.admission_no || payload.id || '');
        const found = await dbm.sequelize.query(
          `SELECT admission_no, student_name, surname, first_name, class_code FROM students
           WHERE admission_no=:a AND school_id=:s LIMIT 1`,
          { replacements: { a: adm, s: schoolId }, type: dbm.Sequelize.QueryTypes.SELECT },
        );
        const stu = Array.isArray(found) ? found[0] : found;
        if (!stu || !stu.class_code) {
          ws.close(4002, 'no-class');
          return;
        }
        conn.adm = adm;
        conn.name = sanitizeName(stu);
        const classKey = `${schoolId}:${stu.class_code}`;
        if (!tryJoin(conn, classKey)) {
          ws.close(4004, 'room-full');
          return;
        }
        primaryKey = classKey;
        // Auto-join every PARENT room this child is linked to, so guardians can
        // talk to their own children without any client change. Two sources:
        //   1. kids_parent_links (kids-owned mapping, flagship/self-service)
        //   2. the SHARED parents<->students parent_id relationship (canonical
        //      EliteSMS link: students.parent_id -> parents.parent_id -> phone)
        const parentPhones = new Set();
        const parentSchoolIds = new Map(); // phone -> school_id (links may cross schools)
        let links = [];
        try {
          // mysql2 query() resolves [rows, fields] — destructure to get the rows.
          // dbm is the models module (an object, not the kidsParent factory).
          const [rows2] = await dbm.content.query(
            `SELECT parent_phone, school_id FROM kids_parent_links
             WHERE child_admission_no = :adm AND verified = 1`,
            { replacements: { adm } },
          );
          links = rows2 || [];
        } catch (e) { /* kids_parent_links may not exist yet — shared-DB fallback below still runs */ }
        const linkRows = Array.isArray(links) ? links : [];
        for (const l of linkRows) {
          const phone = normPhone(l.parent_phone);
          if (!phone) continue;
          parentPhones.add(phone);
          parentSchoolIds.set(phone, l.school_id || schoolId);
        }
        // Shared-DB canonical relationship (read-only, owned by EliteSMS):
        // students.parent_id -> parents.parent_id -> parents.phone.
        let sharedParents = [];
        try {
          sharedParents = await dbm.sequelize.query(
            `SELECT DISTINCT p.phone, s.school_id
             FROM students s
             JOIN parents p ON p.parent_id IN (s.parent_id, s.guardian_id)
             WHERE s.admission_no = :adm AND s.school_id = :sid
               AND p.phone IS NOT NULL AND p.phone <> ''`,
            { replacements: { adm, sid: schoolId }, type: dbm.Sequelize.QueryTypes.SELECT },
          );
        } catch (e) { /* shared parents/students may be missing parent_id column */ }
        const sharedRows = Array.isArray(sharedParents) ? sharedParents : [];
        for (const sp of sharedRows) {
          const phone = normPhone(sp.phone);
          if (!phone) continue;
          parentPhones.add(phone);
          parentSchoolIds.set(phone, sp.school_id || schoolId);
        }
        for (const phone of parentPhones) {
          const pKey = `${parentSchoolIds.get(phone) || schoolId}:parent:${phone}`;
          tryJoin(conn, pKey); // non-fatal if a parent room is full
        }
      } else if (userType === 'parent') {
        const phone = normPhone(payload.phone);
        if (!phone) {
          ws.close(4005, 'no-phone');
          return;
        }
        conn.adm = `parent:${phone}`;
        conn.name = 'Parent';
        const pKey = `${schoolId}:parent:${phone}`;
        if (!tryJoin(conn, pKey)) {
          ws.close(4004, 'room-full');
          return;
        }
        primaryKey = pKey;
      } else {
        // Teacher/staff can address any class: target via ?class=CLSxxxx
        const cls = String(url.searchParams.get('class') || '').slice(0, 40);
        if (!cls) {
          ws.close(4003, 'class-required');
          return;
        }
        conn.role = 'teacher'; // staff JWTs carry user_type like 'Admin' — classroom role is teacher
        conn.adm = `staff:${payload.id || payload.email || ''}`.slice(0, 64);
        conn.name = 'Teacher';
        const classKey = `${schoolId}:${cls}`;
        if (!tryJoin(conn, classKey)) {
          ws.close(4004, 'room-full');
          return;
        }
        primaryKey = classKey;
      }

      const primaryRoom = rooms.get(primaryKey);
      ws.send(JSON.stringify({
        type: 'welcome', role: conn.role,
        floor: conn.role === 'student' ? false : true,
        live: true,
        you: { name: conn.name },
        online: presence(primaryRoom, primaryKey),
        webrtc: webrtcEnabled,
        iceServers: webrtcEnabled ? iceServers : undefined,
      }));
      for (const rKey of conn.rooms) refreshPresence(rooms.get(rKey), rKey);

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Single-speaker relay with controller preemption (PCM fallback mode),
          // applied independently per room (class room vs parent rooms).
          const isController = conn.role !== 'student';
          for (const rKey of conn.rooms) {
            const r = rooms.get(rKey);
            if (!r) continue;
            if (!isController && !conn.floors.has(rKey)) continue;
            if (!isController && r.speaker && r.speaker !== conn.adm) continue; // preempted
            if (!r.speaker || isController) r.speaker = isController ? `${conn.role}:${conn.adm}` : conn.adm;
            clearTimeout(r.speakerTimer);
            r.speakerTimer = setTimeout(() => { r.speaker = null; }, 2000);
            for (const c of r.conns) {
              if (c !== conn && c.ws.readyState === 1) c.ws.send(data, { binary: true });
            }
          }
          return;
        }
        // Control frames
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        // ── Floor control (teacher OR parent grant/revoke on their own room) ─
        if (msg.type === 'floor' && (conn.role === 'teacher' || conn.role === 'parent')) {
          const target = String(msg.adm || '').slice(0, 64);
          const on = !!msg.on;
          for (const rKey of conn.rooms) {
            const r = rooms.get(rKey);
            if (!r) continue;
            for (const c of r.conns) {
              if (c.role === 'student' && c.adm.toLowerCase() === target.toLowerCase()) {
                if (on) c.floors.add(rKey); else c.floors.delete(rKey);
                if (c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify({ type: 'you-floor', on }));
                  // WebRTC: tell child to add/remove mic track
                  if (webrtcEnabled) {
                    c.ws.send(JSON.stringify({ type: 'you-mic', on }));
                  }
                }
              }
            }
            refreshPresence(r, rKey);
          }
          return;
        }

        // ── WebRTC signaling (only when LIVE_WEBRTC=1) ───────────────────
        if (webrtcEnabled && msg.type === 'webrtc-offer' && (conn.role === 'teacher' || conn.role === 'parent')) {
          // Controller → specific child: relay offer (scoped to controller's rooms)
          const targetAdm = String(msg.to || '').slice(0, 64);
          const sdp = msg.sdp;
          if (!targetAdm || !sdp) return;
          for (const rKey of conn.rooms) {
            const r = rooms.get(rKey);
            if (!r) continue;
            for (const c of r.conns) {
              if (c.role === 'student' && c.adm.toLowerCase() === targetAdm.toLowerCase() && c.ws.readyState === 1) {
                r.pendingOffers.set(targetAdm.toLowerCase(), conn.adm);
                c.ws.send(JSON.stringify({ type: 'webrtc-offer', from: conn.adm, sdp }));
              }
            }
          }
          return;
        }

        if (webrtcEnabled && msg.type === 'webrtc-answer' && conn.role === 'student') {
          // Child → controller: relay answer. When an offer is pending, the
          // answer goes ONLY to that controller (no cross-room leak); without a
          // pending offer (legacy clients), relay to every controller in shared rooms.
          const sdp = msg.sdp;
          if (!sdp) return;
          const admLower = conn.adm.toLowerCase();
          const anyPending = [...conn.rooms].some((rKey) => {
            const r = rooms.get(rKey);
            return r && r.pendingOffers.has(admLower);
          });
          for (const rKey of conn.rooms) {
            const r = rooms.get(rKey);
            if (!r) continue;
            const offerer = r.pendingOffers.get(admLower);
            for (const c of r.conns) {
              if (c === conn || c.ws.readyState !== 1) continue;
              if (c.role !== 'teacher' && c.role !== 'parent') continue;
              if (anyPending && (!offerer || c.adm !== offerer)) continue;
              c.ws.send(JSON.stringify({ type: 'webrtc-answer', from: conn.adm, sdp }));
              if (offerer) r.pendingOffers.delete(admLower);
            }
          }
          return;
        }

        if (webrtcEnabled && msg.type === 'webrtc-ice') {
          // Bidirectional ICE candidate relay (scoped to shared rooms)
          const candidate = msg.candidate;
          if (!candidate) return;
          if (conn.role === 'teacher' || conn.role === 'parent') {
            // Controller → specific child
            const targetAdm = String(msg.to || '').slice(0, 64);
            if (!targetAdm) return;
            for (const rKey of conn.rooms) {
              const r = rooms.get(rKey);
              if (!r) continue;
              for (const c of r.conns) {
                if (c.role === 'student' && c.adm.toLowerCase() === targetAdm.toLowerCase() && c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify({ type: 'webrtc-ice', from: conn.adm, candidate }));
                }
              }
            }
          } else {
            // Child → controllers in shared rooms
            for (const rKey of conn.rooms) {
              const r = rooms.get(rKey);
              if (!r) continue;
              for (const c of r.conns) {
                if (c !== conn && (c.role === 'teacher' || c.role === 'parent') && c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify({ type: 'webrtc-ice', from: conn.adm, candidate }));
                }
              }
            }
          }
          return;
        }

        if (webrtcEnabled && (msg.type === 'webrtc-start' || msg.type === 'webrtc-stop')
            && (conn.role === 'teacher' || conn.role === 'parent')) {
          // Controller started/stopped broadcasting — tell children in all the
          // controller's rooms to create/tear down peer connections
          const kind = msg.type;
          for (const rKey of conn.rooms) {
            const r = rooms.get(rKey);
            if (!r) continue;
            broadcast(r, { type: kind, from: conn.adm }, conn);
          }
          return;
        }

        // ── Emoji reaction relay (any user → class room) ─────────────────
        if (msg.type === 'reaction') {
          const emoji = String(msg.emoji || '').slice(0, 8);
          const target = String(msg.classCode || '').slice(0, 40);
          if (!emoji) return;
          const reactionMsg = { type: 'reaction', emoji, from: conn.name || conn.adm, ts: Date.now() };
          if (target) {
            // Targeted to a specific class (student reaction in competition)
            const rKey = `${conn.schoolId}:${target}`;
            const r = rooms.get(rKey);
            if (r) broadcast(r, reactionMsg, conn);
          } else {
            // Broadcast to all rooms the sender is in
            for (const rKey of conn.rooms) {
              const r = rooms.get(rKey);
              if (r) broadcast(r, reactionMsg, conn);
            }
          }
          return;
        }
      });

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        for (const rKey of conn.rooms) {
          const r = rooms.get(rKey);
          if (!r) continue;
          r.conns.delete(conn);
          if (r.conns.size === 0) {
            clearTimeout(r.speakerTimer);
            rooms.delete(rKey);
          } else {
            refreshPresence(r, rKey);
          }
        }
        conn.rooms.clear();
      };
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    } catch (err) {
      console.error('e3fLive connection error:', err.message);
      try { ws.close(1011, 'error'); } catch {}
    }
  });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { return socket.destroy(); }
    if (!['/kids-live', '/kids/live'].includes(pathname)) return; // not ours — other upgrade handlers/404 proceed
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, new URL(req.url, 'http://x')));
  });

  console.log('e3fLive: kids-live audio intercom attached at /kids/live (teacher + parent roles)');
}

module.exports = { attach, broadcastToClass, broadcastToParent };
