'use strict';
/**
 * E3f — KidsLive: real-time class audio (teacher broadcast + teacher-controlled
 * student replies). Walkie-talkie model: exactly ONE speaker at a time.
 *
 * Transport modes:
 *   1. PCM relay (legacy, always available): WebSocket binary frames (16kHz mono
 *      Int16 PCM chunks, ~100ms each) through nginx WSS.
 *   2. WebRTC P2P (opt-in via LIVE_WEBRTC=1): signaling over WebSocket, actual
 *      audio media via RTCPeerConnection. Teacher publishes one Opus stream to
 *      all students; floored student publishes mic back to teacher.
 *
 * Protocol (path /kids-live?token=JWT):
 *   server → {type:'welcome', role, floor, live, webrtc:bool}
 *   server → {type:'presence', online:[{adm,name,role,floor}]}
 *   server → {type:'live', on}                       // teacher joined/left
 *   server → {type:'floor', adm, on}                 // roster change for teachers
 *   server → {type:'you-floor', on}                  // personal floor grant
 *   server → {type:'webrtc-start'}                   // teacher began broadcasting (students create PC)
 *   server → {type:'webrtc-stop'}                    // teacher stopped broadcasting
 *   client(staff) → {type:'floor', adm, on}          // grant/revoke student mic
 *   client(staff) → {type:'webrtc-offer', to, sdp}   // SDP offer to student
 *   client(staff) → {type:'webrtc-ice', to, candidate}
 *   client(student) → {type:'webrtc-answer', sdp}    // SDP answer to teacher
 *   client(student) → {type:'webrtc-ice', candidate}
 *   server → {type:'webrtc-offer', from, sdp}        // relayed offer to student
 *   server → {type:'webrtc-answer', from, sdp}       // relayed answer to teacher
 *   server → {type:'webrtc-ice', from, candidate}    // relayed ICE candidate
 *   server → {type:'you-mic', on}                    // student mic grant (add/remove track)
 *   binary frame: PCM chunk (fallback mode only).
 */
const crypto = require('crypto');

let attached = false;

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
  const rooms = new Map(); // key → { conns:Set<conn>, speaker:null|'teacher'|adm, speakerTimer }

  function roomOf(key) {
    let r = rooms.get(key);
    if (!r) {
      r = { conns: new Set(), speaker: null, speakerTimer: null };
      rooms.set(key, r);
    }
    return r;
  }

  function presence(r) {
    return [...r.conns].map((c) => ({
      adm: c.adm || c.uid,
      name: c.name,
      role: c.role,
      floor: !!c.floor,
    }));
  }

  function broadcast(r, obj, except) {
    const data = JSON.stringify(obj);
    for (const c of r.conns) {
      if (c !== except && c.ws.readyState === 1) c.ws.send(data);
    }
  }

  function refreshPresence(r) {
    broadcast(r, { type: 'presence', online: presence(r) });
    const liveOn = [...r.conns].some((c) => c.role === 'teacher');
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
      let conn;
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
        conn = {
          ws, role: 'student', schoolId,
          roomKey: `${schoolId}:${stu.class_code}`,
          adm,
          name: sanitizeName(stu),
          floor: false,
        };
      } else {
        // Staff can address any class: target via ?class=CLSxxxx, else first active arena class fallback
        const cls = String(url.searchParams.get('class') || '').slice(0, 40);
        if (!cls) {
          ws.close(4003, 'class-required');
          return;
        }
        conn = {
          ws, role: 'teacher', schoolId,
          roomKey: `${schoolId}:${cls}`,
          adm: `staff:${payload.id || payload.email || ''}`.slice(0, 64),
          name: 'Teacher',
          floor: true, // teacher may always speak
        };
      }
      const roomKey = conn.roomKey;
      const r = roomOf(roomKey);
      if (r.conns.size >= 60) {
        ws.close(4004, 'room-full');
        return;
      }
      r.conns.add(conn);

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
      ws.send(JSON.stringify({
        type: 'welcome', role: conn.role, floor: conn.floor, live: true,
        you: { name: conn.name }, online: presence(r),
        webrtc: webrtcEnabled,
        iceServers: webrtcEnabled ? iceServers : undefined,
      }));
      refreshPresence(r);

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Single-speaker relay with teacher preemption (PCM fallback mode)
          const isTeacher = conn.role === 'teacher';
          if (!isTeacher && !conn.floor) return;
          if (!isTeacher && r.speaker && r.speaker !== conn.adm) return; // preempted
          if (!r.speaker || isTeacher) r.speaker = isTeacher ? 'teacher' : conn.adm;
          clearTimeout(r.speakerTimer);
          r.speakerTimer = setTimeout(() => { r.speaker = null; }, 2000);
          for (const c of r.conns) {
            if (c !== conn && c.ws.readyState === 1) c.ws.send(data, { binary: true });
          }
          return;
        }
        // Control frames
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        // ── Floor control (teacher grant/revoke) ──────────────────────────
        if (msg.type === 'floor' && conn.role === 'teacher') {
          const target = String(msg.adm || '').slice(0, 64);
          const on = !!msg.on;
          for (const c of r.conns) {
            if (c.role === 'student' && c.adm.toLowerCase() === target.toLowerCase()) {
              c.floor = on;
              if (c.ws.readyState === 1) {
                c.ws.send(JSON.stringify({ type: 'you-floor', on }));
                // WebRTC: tell student to add/remove mic track
                if (webrtcEnabled) {
                  c.ws.send(JSON.stringify({ type: 'you-mic', on }));
                }
              }
            }
          }
          refreshPresence(r);
          return;
        }

        // ── WebRTC signaling (only when LIVE_WEBRTC=1) ───────────────────
        if (webrtcEnabled && msg.type === 'webrtc-offer' && conn.role === 'teacher') {
          // Teacher → specific student: relay offer
          const targetAdm = String(msg.to || '').slice(0, 64);
          const sdp = msg.sdp;
          if (!targetAdm || !sdp) return;
          for (const c of r.conns) {
            if (c.role === 'student' && c.adm.toLowerCase() === targetAdm.toLowerCase() && c.ws.readyState === 1) {
              c.ws.send(JSON.stringify({ type: 'webrtc-offer', from: conn.adm, sdp }));
            }
          }
          return;
        }

        if (webrtcEnabled && msg.type === 'webrtc-answer' && conn.role === 'student') {
          // Student → teacher: relay answer
          const sdp = msg.sdp;
          if (!sdp) return;
          for (const c of r.conns) {
            if (c.role === 'teacher' && c.ws.readyState === 1) {
              c.ws.send(JSON.stringify({ type: 'webrtc-answer', from: conn.adm, sdp }));
            }
          }
          return;
        }

        if (webrtcEnabled && msg.type === 'webrtc-ice') {
          // Bidirectional ICE candidate relay
          const candidate = msg.candidate;
          if (!candidate) return;
          if (conn.role === 'teacher') {
            // Teacher → specific student
            const targetAdm = String(msg.to || '').slice(0, 64);
            if (!targetAdm) return;
            for (const c of r.conns) {
              if (c.role === 'student' && c.adm.toLowerCase() === targetAdm.toLowerCase() && c.ws.readyState === 1) {
                c.ws.send(JSON.stringify({ type: 'webrtc-ice', from: conn.adm, candidate }));
              }
            }
          } else {
            // Student → teacher
            for (const c of r.conns) {
              if (c.role === 'teacher' && c.ws.readyState === 1) {
                c.ws.send(JSON.stringify({ type: 'webrtc-ice', from: conn.adm, candidate }));
              }
            }
          }
          return;
        }

        if (webrtcEnabled && msg.type === 'webrtc-start' && conn.role === 'teacher') {
          // Teacher started broadcasting — tell all students to create peer connections
          broadcast(r, { type: 'webrtc-start', from: conn.adm }, conn);
          return;
        }

        if (webrtcEnabled && msg.type === 'webrtc-stop' && conn.role === 'teacher') {
          // Teacher stopped broadcasting — tell students to tear down peer connections
          broadcast(r, { type: 'webrtc-stop', from: conn.adm }, conn);
          return;
        }
      });

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        r.conns.delete(conn);
        if (r.conns.size === 0) {
          clearTimeout(r.speakerTimer);
          rooms.delete(roomKey);
        } else {
          refreshPresence(r);
        }
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

  console.log('e3fLive: kids-live audio intercom attached at /kids/live');
}

module.exports = { attach };
