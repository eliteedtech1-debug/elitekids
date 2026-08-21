'use strict';

/**
 * Unit tests for the sharp image pipeline (src/media/image-processor.js).
 * Pure functions + sharp — no DB, no B2, no Redis.
 */
const sharp = require('sharp');
const {
  processImage,
  makeThumbnail,
  replaceKeyExtension,
  THUMB_WIDTH,
  THUMB_QUALITY,
} = require('../../src/media/image-processor');

async function makePng(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 136, b: 0 } },
  })
    .png()
    .toBuffer();
}

describe('image-processor', () => {
  test('processImage re-encodes to webp by default with correct metadata', async () => {
    const src = await makePng(800, 600);
    const out = await processImage(src);

    expect(out.contentType).toBe('image/webp');
    expect(out.extension).toBe('webp');
    expect(out.resized).toBe(false); // no width/height requested → no resize
    expect((await sharp(out.buffer).metadata()).format).toBe('webp');
  });

  test('processImage downscales only when the source is larger than the target', async () => {
    const src = await makePng(800, 600);
    const out = await processImage(src, { width: 200 });

    expect(out.resized).toBe(true);
    expect((await sharp(out.buffer).metadata()).width).toBe(200);
  });

  test('processImage never enlarges small images (withoutEnlargement)', async () => {
    const src = await makePng(50, 40);
    const out = await processImage(src, { width: 200 });

    expect(out.resized).toBe(false);
    expect((await sharp(out.buffer).metadata()).width).toBe(50);
  });

  test('processImage supports jpeg and png output formats', async () => {
    const src = await makePng(64, 64);

    const jpeg = await processImage(src, { format: 'jpeg', quality: 80 });
    expect(jpeg.contentType).toBe('image/jpeg');
    expect(jpeg.extension).toBe('jpg');
    expect((await sharp(jpeg.buffer).metadata()).format).toBe('jpeg');

    const png = await processImage(src, { format: 'png' });
    expect(png.contentType).toBe('image/png');
    expect(png.extension).toBe('png');
    expect((await sharp(png.buffer).metadata()).format).toBe('png');
  });

  test('processImage clamps out-of-range quality instead of throwing', async () => {
    const src = await makePng(64, 64);
    await expect(processImage(src, { format: 'webp', quality: 9999 })).resolves.toBeTruthy();
    await expect(processImage(src, { format: 'webp', quality: NaN })).resolves.toBeTruthy();
  });

  test('makeThumbnail returns a webp no wider than THUMB_WIDTH', async () => {
    const src = await makePng(1200, 900);
    const thumb = await makeThumbnail(src);

    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(THUMB_WIDTH);
    expect(meta.width).toBeLessThan(1200);
  });

  test('replaceKeyExtension swaps the extension, leaves extension-less keys alone', () => {
    expect(replaceKeyExtension('abc-123.png', 'webp')).toBe('abc-123.webp');
    expect(replaceKeyExtension('abc.jpg', 'jpg')).toBe('abc.jpg');
    expect(replaceKeyExtension('no-ext', 'webp')).toBe('no-ext');
  });

  test('thumbnail quality constant stays in 1..100', () => {
    expect(THUMB_QUALITY).toBeGreaterThanOrEqual(1);
    expect(THUMB_QUALITY).toBeLessThanOrEqual(100);
  });
});
