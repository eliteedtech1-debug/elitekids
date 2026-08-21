'use strict';

/**
 * Media routes integration tests — LOCAL (disk) storage mode.
 *
 * setup-env.js blanks the B2_* vars so media.service runs on a throwaway temp
 * dir; B2/Redis are never touched. Auth comes from the hermetic test DB
 * fixtures (see test/helpers/test-db.js).
 *
 * Run: cd elite-kids/backend && npm test -- test/media/routes.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');

const app = require('../../src/app');
const { closeConnections } = require('../helpers/teardown');

let tempDir;
let png;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kids-media-routes-'));
  process.env.MEDIA_STORAGE_DIR = tempDir;
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://127.0.0.1:34600';
  png = await sharp({
    create: { width: 128, height: 96, channels: 3, background: '#aa44ff' },
  })
    .png()
    .toBuffer();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  await closeConnections();
});

async function loginAs(username, password) {
  const res = await request(app)
    .post('/users/login')
    .send({ username, password, school_id: 'SCH-TEST' });
  expect(res.status).toBe(200);
  return res.body.token;
}

describe('media routes (local mode)', () => {
  test('POST /media/upload requires auth (401 without a token)', async () => {
    const res = await request(app)
      .post('/media/upload')
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  test('POST /media/upload blocks parents with the staff-only gate (403)', async () => {
    const token = await loginAs('parent@kids.test', 'Parent@123');
    const res = await request(app)
      .post('/media/upload')
      .set('authorization', token)
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Access denied/i);
  });

  test('full round trip: upload → serve → list → delete → gone', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');

    // ── upload ────────────────────────────────────────────────────────────
    const up = await request(app)
      .post('/media/upload')
      .set('authorization', token)
      .attach('file', png, { filename: 'lesson-cover.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.success).toBe(true);
    expect(up.body.mode).toBe('local');
    expect(up.body.url).toMatch(/^http:\/\/127\.0\.0\.1:34600\/media\/[0-9a-f-]{36}\.png$/);

    // bytes actually landed on disk
    const stat = await fs.promises.stat(path.join(tempDir, up.body.key));
    expect(stat.isFile()).toBe(true);

    // ── public serving ────────────────────────────────────────────────────
    const got = await request(app).get(`/media/${up.body.key}`);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toMatch(/image\/png/);
    const body = Buffer.isBuffer(got.body) ? got.body : Buffer.from(got.body);
    expect(body.equals(png)).toBe(true);

    // ── list ──────────────────────────────────────────────────────────────
    const listRes = await request(app).get('/media/files').set('authorization', token);
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.some((e) => e.key === up.body.key)).toBe(true);

    // ── delete ────────────────────────────────────────────────────────────
    const del = await request(app)
      .delete(`/media/files/${up.body.key}`)
      .set('authorization', token);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const gone = await request(app).get(`/media/${up.body.key}`);
    expect(gone.status).toBe(404);

    // deleting again 404s
    const del2 = await request(app)
      .delete(`/media/files/${up.body.key}`)
      .set('authorization', token);
    expect(del2.status).toBe(404);
  });

  test('upload rejects an unsupported content type with 400', async () => {
    const token = await loginAs('admin@kids.test', 'Admin@123');
    const res = await request(app)
      .post('/media/upload')
      .set('authorization', token)
      .attach('file', Buffer.from('MZ fake exe'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unsupported content type/);
  });

  test('GET /media/:key rejects a malformed key with 400', async () => {
    const res = await request(app).get('/media/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid file key/);
  });
});
