'use strict';

/**
 * Media pipeline tests — LOCAL (disk) storage mode. processMediaJob is the
 * exact code the BullMQ worker runs; here it writes to a throwaway temp dir.
 * No Redis, no B2, no DB.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

let tempDir;
beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kids-media-pl-'));
  process.env.MEDIA_STORAGE_DIR = tempDir;
  process.env.MEDIA_PUBLIC_BASE_URL = 'http://127.0.0.1:34600';
});
afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

const { processMediaJob } = require('../../src/media/media-pipeline');

describe('media-pipeline (local mode)', () => {
  test('processes an inline image: re-encodes, downscales, and writes a thumbnail', async () => {
    const src = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#22cc88' },
    })
      .png()
      .toBuffer();

    const result = await processMediaJob({
      bucket: 'media',
      key: 'abc-123.png',
      mimeType: 'image/png',
      options: { width: 300 },
      bufferBase64: src.toString('base64'),
    });

    expect(result.contentType).toBe('image/webp');
    expect(result.key).toBe('abc-123.webp');
    expect(result.url).toBe('http://127.0.0.1:34600/media/abc-123.webp');
    expect(result.thumbKey).toBe('abc-123-thumb.webp');

    const [meta, thumbMeta] = await Promise.all([
      sharp(await fs.promises.readFile(path.join(tempDir, 'abc-123.webp'))).metadata(),
      sharp(await fs.promises.readFile(path.join(tempDir, 'abc-123-thumb.webp'))).metadata(),
    ]);
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(300);
    expect(thumbMeta.format).toBe('webp');
    expect(thumbMeta.width).toBeLessThanOrEqual(300);
  });

  test('passes non-image content (video/document) through unchanged', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake content');

    const result = await processMediaJob({
      bucket: 'doc',
      key: 'doc-1.pdf',
      mimeType: 'application/pdf',
      bufferBase64: pdf.toString('base64'),
    });

    expect(result.contentType).toBe('application/pdf');
    expect(result.key).toBe('doc-1.pdf');
    expect(result.size).toBe(pdf.byteLength);

    const stored = await fs.promises.readFile(path.join(tempDir, 'doc-1.pdf'));
    expect(stored.equals(pdf)).toBe(true);
    // No thumbnail is produced for non-images.
    await expect(fs.promises.stat(path.join(tempDir, 'doc-1-thumb.webp'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('rejects a job with neither bufferBase64 nor tmpKey', async () => {
    await expect(
      processMediaJob({ bucket: 'media', key: 'x.png', mimeType: 'image/png' })
    ).rejects.toThrow(/neither bufferBase64 nor tmpKey/);
  });
});
