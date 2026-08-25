'use strict';

/**
 * E4 — WebRTC P2P Voice signaling regression tests.
 *
 * Gates:
 *   1. Welcome message includes webrtc:true when LIVE_WEBRTC=1
 *   2. Welcome message includes iceServers config
 *   3. WebRTC offer relay (teacher → student)
 *   4. WebRTC answer relay (student → teacher)
 *   5. WebRTC ICE candidate relay (bidirectional)
 *   6. webrtc-start / webrtc-stop broadcast signals
 *   7. Floor control emits you-mic alongside you-floor
 *   8. No WebRTC signals when LIVE_WEBRTC is not set
 */

const request = require('supertest');
const app = require('../src/app');
const { ensureTestDb } = require('./helpers/test-db');
const { closeConnections } = require('./helpers/teardown');
const WebSocket = require('ws');

let staffToken;
let studentToken;
const SCHOOL_ID = 'SCH-TEST';
const CLASS_CODE = 'NUR-A';
const STUDENT_ADM = 'NUR-001';

let server;
let baseUrl;

beforeAll(async () => {
  await ensureTestDb();

  // Staff token
  const sRes = await request(app)
    .post('/users/login')
    .send({ username: 'admin', password: 'Admin@123' });
  staffToken = sRes.body.token;

  // Student token
  const stRes = await request(app)
    .post('/students/login')
    .send({ username: STUDENT_ADM, password: 'Nursery@123', school_id: SCHOOL_ID });
  studentToken = stRes.body.token;

  // Start a test server on a random port
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `ws://127.0.0.1:${addr.port}`;
      require('../src/controllers/e3fLive').attach(server);
      resolve();
    });
  });
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeConnections();
});

/** Helper: connect a WebSocket and wait for the welcome message. */
function connectWs(token, extraQuery = '') {
  return new Promise((resolve, reject) => {
    const qs = extraQuery ? `&${extraQuery.replace(/^\?/, '')}` : '';
    const ws = new WebSocket(`${baseUrl}/kids/live?token=${encodeURIComponent(token)}${qs}`);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.type === 'welcome') {
        clearTimeout(timeout);
        resolve({ ws, welcome: msg });
      }
    });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

/** Helper: send JSON over ws. */
function sendJson(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/** Helper: wait for a specific message type. */
function waitForMsg(ws, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const handler = (data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.type === type) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

// ── 1. Welcome includes webrtc flag ─────────────────────────────────────────
describe('E4: WebRTC welcome flag', () => {
  it('includes webrtc:true when LIVE_WEBRTC=1', async () => {
    const orig = process.env.LIVE_WEBRTC;
    process.env.LIVE_WEBRTC = '1';
    try {
      const { ws, welcome } = await connectWs(studentToken, `class=${CLASS_CODE}`);
      expect(welcome.webrtc).toBe(true);
      expect(welcome.iceServers).toBeDefined();
      expect(Array.isArray(welcome.iceServers)).toBe(true);
      expect(welcome.iceServers.length).toBeGreaterThan(0);
      ws.close();
    } finally {
      if (orig === undefined) delete process.env.LIVE_WEBRTC;
      else process.env.LIVE_WEBRTC = orig;
    }
  });
});

// ── 2. ICE servers include TURN config ──────────────────────────────────────
describe('E4: ICE server configuration', () => {
  it('sends TURN credentials when env vars set', async () => {
    const origTurn = process.env.TURN_URLS;
    const origUser = process.env.TURN_USER;
    const origPass = process.env.TURN_PASS;
    process.env.LIVE_WEBRTC = '1';
    process.env.TURN_URLS = 'turn:1.2.3.4:3478?transport=udp';
    process.env.TURN_USER = 'testuser';
    process.env.TURN_PASS = 'testpass';
    try {
      const { ws, welcome } = await connectWs(studentToken, `class=${CLASS_CODE}`);
      expect(welcome.webrtc).toBe(true);
      const turnServer = welcome.iceServers.find((s) => Array.isArray(s.urls) ? s.urls.some(u => u.includes('turn:')) : (s.urls || '').includes('turn:'));
      expect(turnServer).toBeTruthy();
      expect(turnServer.username).toBe('testuser');
      expect(turnServer.credential).toBe('testpass');
      ws.close();
    } finally {
      if (origTurn === undefined) delete process.env.TURN_URLS; else process.env.TURN_URLS = origTurn;
      if (origUser === undefined) delete process.env.TURN_USER; else process.env.TURN_USER = origUser;
      if (origPass === undefined) delete process.env.TURN_PASS; else process.env.TURN_PASS = origPass;
    }
  });
});

// ── 3. WebRTC signaling relay ───────────────────────────────────────────────
describe('E4: WebRTC offer/answer/ICE relay', () => {
  let teacherWs, studentWs;

  beforeAll(async () => {
    process.env.LIVE_WEBRTC = '1';
    const teacherConn = await connectWs(staffToken, `class=${CLASS_CODE}`);
    teacherWs = teacherConn.ws;

    const studentConn = await connectWs(studentToken);
    studentWs = studentConn.ws;

    // Wait for presence update so teacher sees student
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => {
    if (teacherWs) teacherWs.close();
    if (studentWs) studentWs.close();
  });

  it('relays webrtc-offer from teacher to student', async () => {
    const p = waitForMsg(studentWs, 'webrtc-offer');
    sendJson(teacherWs, {
      type: 'webrtc-offer',
      to: STUDENT_ADM,
      sdp: { type: 'offer', sdp: 'v=0\r\nfake-sdp' },
    });
    const msg = await p;
    expect(msg.type).toBe('webrtc-offer');
    expect(msg.from).toBeTruthy();
    expect(msg.sdp).toBeTruthy();
  });

  it('relays webrtc-answer from student to teacher', async () => {
    const p = waitForMsg(teacherWs, 'webrtc-answer');
    sendJson(studentWs, {
      type: 'webrtc-answer',
      sdp: { type: 'answer', sdp: 'v=0\r\nfake-answer' },
    });
    const msg = await p;
    expect(msg.type).toBe('webrtc-answer');
    expect(msg.from).toBeTruthy();
  });

  it('relays ICE candidates bidirectionally', async () => {
    // Teacher → Student
    const p1 = waitForMsg(studentWs, 'webrtc-ice');
    sendJson(teacherWs, {
      type: 'webrtc-ice',
      to: STUDENT_ADM,
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 1.2.3.4 1234 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    });
    const ice1 = await p1;
    expect(ice1.type).toBe('webrtc-ice');
    expect(ice1.candidate).toBeTruthy();

    // Student → Teacher
    const p2 = waitForMsg(teacherWs, 'webrtc-ice');
    sendJson(studentWs, {
      type: 'webrtc-ice',
      candidate: { candidate: 'candidate:2 1 UDP 2130706431 5.6.7.8 5678 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    });
    const ice2 = await p2;
    expect(ice2.type).toBe('webrtc-ice');
    expect(ice2.candidate).toBeTruthy();
  });
});

// ── 4. Broadcast start/stop ─────────────────────────────────────────────────
describe('E4: WebRTC broadcast signals', () => {
  let teacherWs, studentWs;

  beforeAll(async () => {
    process.env.LIVE_WEBRTC = '1';
    const teacherConn = await connectWs(staffToken, `class=${CLASS_CODE}`);
    teacherWs = teacherConn.ws;
    const studentConn = await connectWs(studentToken);
    studentWs = studentConn.ws;
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => {
    if (teacherWs) teacherWs.close();
    if (studentWs) studentWs.close();
  });

  it('student receives webrtc-start when teacher starts broadcasting', async () => {
    const p = waitForMsg(studentWs, 'webrtc-start');
    sendJson(teacherWs, { type: 'webrtc-start' });
    const msg = await p;
    expect(msg.type).toBe('webrtc-start');
  });

  it('student receives webrtc-stop when teacher stops broadcasting', async () => {
    const p = waitForMsg(studentWs, 'webrtc-stop');
    sendJson(teacherWs, { type: 'webrtc-stop' });
    const msg = await p;
    expect(msg.type).toBe('webrtc-stop');
  });
});

// ── 5. Floor control + you-mic ──────────────────────────────────────────────
describe('E4: Floor control with mic grant', () => {
  let teacherWs, studentWs;

  beforeAll(async () => {
    process.env.LIVE_WEBRTC = '1';
    const teacherConn = await connectWs(staffToken, `class=${CLASS_CODE}`);
    teacherWs = teacherConn.ws;
    const studentConn = await connectWs(studentToken);
    studentWs = studentConn.ws;
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => {
    if (teacherWs) teacherWs.close();
    if (studentWs) studentWs.close();
  });

  it('floor grant also sends you-mic in WebRTC mode', async () => {
    const pFloor = waitForMsg(studentWs, 'you-floor');
    const pMic = waitForMsg(studentWs, 'you-mic');
    sendJson(teacherWs, { type: 'floor', adm: STUDENT_ADM, on: true });
    const [floorMsg, micMsg] = await Promise.all([pFloor, pMic]);
    expect(floorMsg.type).toBe('you-floor');
    expect(floorMsg.on).toBe(true);
    expect(micMsg.type).toBe('you-mic');
    expect(micMsg.on).toBe(true);
  });

  it('floor revoke also sends you-mic off in WebRTC mode', async () => {
    const pFloor = waitForMsg(studentWs, 'you-floor');
    const pMic = waitForMsg(studentWs, 'you-mic');
    sendJson(teacherWs, { type: 'floor', adm: STUDENT_ADM, on: false });
    const [floorMsg, micMsg] = await Promise.all([pFloor, pMic]);
    expect(floorMsg.type).toBe('you-floor');
    expect(floorMsg.on).toBe(false);
    expect(micMsg.type).toBe('you-mic');
    expect(micMsg.on).toBe(false);
  });
});

// ── 6. No WebRTC when disabled ──────────────────────────────────────────────
describe('E4: No WebRTC when LIVE_WEBRTC not set', () => {
  it('welcome includes webrtc:false when env not set', async () => {
    const orig = process.env.LIVE_WEBRTC;
    delete process.env.LIVE_WEBRTC;
    try {
      const { ws, welcome } = await connectWs(studentToken, `class=${CLASS_CODE}`);
      expect(welcome.webrtc).toBe(false);
      expect(welcome.iceServers).toBeUndefined();
      ws.close();
    } finally {
      if (orig !== undefined) process.env.LIVE_WEBRTC = orig;
    }
  });
});
