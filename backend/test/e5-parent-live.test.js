'use strict';

/**
 * E5 — Parent live-audio role regression tests.
 *
 * Parents must be able to talk to their own children exactly like teachers do:
 * broadcast to all children at once (webrtc-start/stop), mute/unmute a child
 * (floor → you-floor/you-mic), and run a one-to-one WebRTC call per child
 * (offer/answer). The child's client code is UNCHANGED — the server
 * auto-joins the student into their guardians' parent rooms via
 * kids_parent_links.
 *
 * Gates:
 *   1. Parent WS connect (parent token, no class) → welcome role 'parent'
 *   2. Child shows up in the parent room presence
 *   3. Parent webrtc-start reaches their linked child
 *   4. Parent floor grant reaches child (you-floor + you-mic)
 *   5. Parent webrtc-offer reaches child; child answer reaches parent
 */

const request = require('supertest');
const app = require('../src/app');
const { ensureTestDb } = require('./helpers/test-db');
const { closeConnections } = require('./helpers/teardown');
const WebSocket = require('ws');

const SCHOOL_ID = 'SCH-TEST';
const CLASS_CODE = 'NUR-A';
const STUDENT_ADM = 'NUR-001';
const PARENT_PHONE = '08012345678'; // fixture parent U2
const PARENT_PHONE_NORM = '+2348012345678'; // normalized as stored in kids_parent_links

let parentToken;
let studentToken;
let server;
let baseUrl;

beforeAll(async () => {
  await ensureTestDb();

  // kids_parent_links lives in the content DB and is created at runtime by
  // kidsParent.ensureSchema() — create idempotently so the link row exists
  // before the student/parent WS connections resolve their rooms.
  const dbm = require('../src/models');
  await dbm().content.query(`CREATE TABLE IF NOT EXISTS kids_parent_links (
    id CHAR(36) NOT NULL PRIMARY KEY,
    parent_phone VARCHAR(20) NOT NULL,
    parent_pin VARCHAR(10) NOT NULL DEFAULT '',
    child_admission_no VARCHAR(64) NOT NULL,
    child_name VARCHAR(120) NULL,
    school_id VARCHAR(40) NOT NULL,
    verified TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_parent_child (parent_phone, child_admission_no),
    KEY idx_parent_phone (parent_phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await dbm().content.query(
    `INSERT INTO kids_parent_links (id, parent_phone, parent_pin, child_admission_no, child_name, school_id, verified)
     VALUES (UUID(), :phone, '', :adm, 'Test Child', :sid, 1)
     ON DUPLICATE KEY UPDATE verified = 1`,
    { replacements: { phone: PARENT_PHONE_NORM, adm: STUDENT_ADM, sid: SCHOOL_ID } }
  );

  // Parent token — unified login with the shared EliteSMS credential
  const pRes = await request(app)
    .post('/kids/parent/login')
    .send({ phone: PARENT_PHONE, password: 'Parent@123', school_id: SCHOOL_ID });
  expect(pRes.status).toBe(200);
  parentToken = pRes.body.data.token;

  // Student token
  const stRes = await request(app)
    .post('/students/login')
    .send({ username: STUDENT_ADM, password: 'Nursery@123', school_id: SCHOOL_ID });
  studentToken = stRes.body.token;

  process.env.LIVE_WEBRTC = '1';
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

// ── 1. Parent connects with a parent token ──────────────────────────────────
describe('E5: Parent role connect', () => {
  it('welcomes a parent with role=parent (no class param needed)', async () => {
    const { ws, welcome } = await connectWs(parentToken);
    expect(welcome.role).toBe('parent');
    expect(welcome.floor).toBe(true); // parent may always speak
    expect(welcome.webrtc).toBe(true);
    ws.close();
  });

  it('rejects a connection without a valid token', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${baseUrl}/kids/live?token=not-a-jwt`);
        ws.on('close', (code) => (code === 4001 ? resolve() : reject(new Error(`unexpected close ${code}`))));
        ws.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3000);
      })
    ).resolves.toBeUndefined();
  });
});

// ── 2. Parent controls their own child (broadcast / floor / WebRTC) ─────────
describe('E5: Parent ↔ child live control', () => {
  it('child shows up in the parent room presence', async () => {
    const parentConn = await connectWs(parentToken);
    const presenceP = waitForMsg(parentConn.ws, 'presence');
    const childConn = await connectWs(studentToken, `class=${CLASS_CODE}`);
    const msg = await presenceP;
    expect(msg.type).toBe('presence');
    expect(msg.online.some((p) => p.adm === STUDENT_ADM && p.role === 'student')).toBe(true);
    parentConn.ws.close();
    childConn.ws.close();
  });

  it('parent broadcast (webrtc-start) reaches their child', async () => {
    const parentConn = await connectWs(parentToken);
    const childConn = await connectWs(studentToken, `class=${CLASS_CODE}`);
    await new Promise((r) => setTimeout(r, 150));
    const p = waitForMsg(childConn.ws, 'webrtc-start');
    sendJson(parentConn.ws, { type: 'webrtc-start' });
    const msg = await p;
    expect(msg.type).toBe('webrtc-start');
    expect(msg.from).toContain('parent:');
    parentConn.ws.close();
    childConn.ws.close();
  });

  it('parent floor grant mutes/unmutes their child (you-floor + you-mic)', async () => {
    const parentConn = await connectWs(parentToken);
    const childConn = await connectWs(studentToken, `class=${CLASS_CODE}`);
    await new Promise((r) => setTimeout(r, 150));

    const pFloor = waitForMsg(childConn.ws, 'you-floor');
    const pMic = waitForMsg(childConn.ws, 'you-mic');
    sendJson(parentConn.ws, { type: 'floor', adm: STUDENT_ADM, on: true });
    const [floorMsg, micMsg] = await Promise.all([pFloor, pMic]);
    expect(floorMsg.on).toBe(true);
    expect(micMsg.on).toBe(true);

    const pFloorOff = waitForMsg(childConn.ws, 'you-floor');
    const pMicOff = waitForMsg(childConn.ws, 'you-mic');
    sendJson(parentConn.ws, { type: 'floor', adm: STUDENT_ADM, on: false });
    const [floorOff, micOff] = await Promise.all([pFloorOff, pMicOff]);
    expect(floorOff.on).toBe(false);
    expect(micOff.on).toBe(false);

    parentConn.ws.close();
    childConn.ws.close();
  });

  it('parent WebRTC offer reaches child and child answer reaches parent', async () => {
    const parentConn = await connectWs(parentToken);
    const childConn = await connectWs(studentToken, `class=${CLASS_CODE}`);
    await new Promise((r) => setTimeout(r, 150));

    const pOffer = waitForMsg(childConn.ws, 'webrtc-offer');
    sendJson(parentConn.ws, {
      type: 'webrtc-offer',
      to: STUDENT_ADM,
      sdp: { type: 'offer', sdp: 'v=0\r\nfake-parent-sdp' },
    });
    const offerMsg = await pOffer;
    expect(offerMsg.type).toBe('webrtc-offer');
    expect(offerMsg.from).toContain('parent:');

    const pAnswer = waitForMsg(parentConn.ws, 'webrtc-answer');
    sendJson(childConn.ws, { type: 'webrtc-answer', sdp: { type: 'answer', sdp: 'v=0\r\nfake-child-answer' } });
    const answerMsg = await pAnswer;
    expect(answerMsg.type).toBe('webrtc-answer');
    expect(answerMsg.from).toBe(STUDENT_ADM);

    parentConn.ws.close();
    childConn.ws.close();
  });
});
