'use strict';

/**
 * Media service tests — LOCAL (disk) storage mode. setup-env.js blanks the
 * B2_* vars, so store() writes bytes to a throwaway temp dir instead of
 * enqueueing to Redis/B2. No app boot, no DB.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

let tempDir;
beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kids-media-svc-'));
  process.env.MEDIA_STORAGE_DIR = tempDir;
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://127.0.0.1:34600';
});
afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

const { store, list, remove } = require('../../src/media/media.service');

async function png() {
  return sharp({
    create: { width: 120, height: 80, channels: 3, background: '#3366ff' },
  })
    .png()
    .toBuffer();
}

async function fakeFile(overrides = {}) {
  return {
    mimetype: 'image/png',
    buffer: await png(),
    originalname: 'lesson-cover.png',
    ...overrides,
  };
}

describe('media.service (local mode)', () => {
  test('store writes bytes to disk and returns a local URL', async () => {
    const result = await store(await fakeFile());

    expect(result.mode).toBe('local');
    expect(result.key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(result.url).toBe(`http://127.0.0.1:34600/media/${result.key}`);
    expect(result.contentType).toBe('image/png');
    expect(result.filename).toBe('lesson-cover.png');
    expect(result.size).toBeGreaterThan(0);

    const stat = await fs.promises.stat(path.join(tempDir, result.key));
    expect(stat.isFile()).toBe(true);
  });

  test('store rejects unsupported content types with 400', async () => {
    await expect(store(await fakeFile({ mimetype: 'application/x-msdownload' }))).rejects.toMatchObject({
      status: 400,
      message: /Unsupported content type/,
    });
  });

  test('store rejects an empty upload with 400', async () => {
    await expect(
      store({ mimetype: 'image/png', buffer: Buffer.alloc(0), originalname: 'x.png' })
    ).rejects.toMatchObject({ status: 400, message: /empty/i });
  });

  test('store rejects oversized uploads with 400', async () => {
    process.env.MEDIA_MAX_BYTES = '100';
    try {
      await expect(store(await fakeFile())).rejects.toMatchObject({
        status: 400,
        message: /exceeds.*limit/i,
      });
    } finally {
      delete process.env.MEDIA_MAX_BYTES;
    }
  });

  test('list returns the stored file with its public URL', async () => {
    const { key } = await store(await fakeFile());

    const entries = await list();
    const entry = entries.find((e) => e.key === key);
    expect(entry).toBeTruthy();
    expect(entry.url).toBe(`http://127.0.0.1:34600/media/${key}`);
    expect(entry.size).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
  });

  test('remove deletes the file; removing it again 404s', async () => {
    const { key } = await store(await fakeFile());

    await expect(remove(key)).resolves.toEqual({ deleted: true });
    await expect(fs.promises.stat(path.join(tempDir, key))).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(remove(key)).rejects.toMatchObject({ status: 404, message: /not found/i });
  });

  test('remove rejects unsafe or malformed keys with 400', async () => {
    await expect(remove('../../etc/passwd')).rejects.toMatchObject({
      status: 400,
      message: /Invalid file key/,
    });
    await expect(remove('no-extension')).rejects.toMatchObject({ status: 400 });
  });
});
