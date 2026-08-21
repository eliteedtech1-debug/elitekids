'use strict';
/**
 * In-code image processing (sharp) — the media pipeline's "Lambda substitute".
 *
 * B2 offers no event-triggered compute, so every resize/compress/thumbnail
 * step runs here, explicitly, before the finished bytes are uploaded to the
 * media bucket. CommonJS port of lms-stack image-processor.ts.
 */
const sharp = require('sharp');

const THUMB_WIDTH = 300;
const THUMB_QUALITY = 60;

const FORMAT_META = {
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  webp: { contentType: 'image/webp', extension: 'webp' },
};

const clampQuality = (quality) => {
  if (!quality || Number.isNaN(quality)) return 75;
  return Math.min(100, Math.max(1, Math.round(quality)));
};

const clampDimension = (value) => {
  if (!value || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.round(value));
};

/**
 * Auto-orient, optionally downscale, and re-encode an image buffer.
 * Returns the processed buffer + the metadata needed to name/type the object.
 */
async function processImage(input, options = {}) {
  const format = options.format || 'webp';
  const meta = FORMAT_META[format];
  const quality = clampQuality(options.quality);

  const width = clampDimension(options.width);
  const height = clampDimension(options.height);
  // Only actually resize when the source is larger than the target — small
  // images pass through untouched (withoutEnlargement semantics).
  const sourceMeta = await sharp(input).metadata();
  const downscale =
    Boolean(width || height) &&
    ((width !== undefined && (sourceMeta.width || 0) > width) ||
      (height !== undefined && (sourceMeta.height || 0) > height));

  const pipeline = sharp(input).rotate(); // auto-orient via EXIF
  if (downscale) pipeline.resize({ width, height, withoutEnlargement: true });

  let buffer;
  switch (format) {
    case 'jpeg':
      buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      break;
    case 'png':
      // PNG ignores quality (lossless); pass it through harmlessly.
      buffer = await pipeline.png().toBuffer();
      break;
    case 'webp':
    default:
      buffer = await pipeline.webp({ quality }).toBuffer();
      break;
  }

  return {
    buffer,
    contentType: meta.contentType,
    extension: meta.extension,
    resized: downscale,
  };
}

/** Small square-ish thumbnail used by galleries/cover lists. */
async function makeThumbnail(input) {
  return sharp(input)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
}

/** Replace the extension of an object key ("x.jpg" → "x.webp"). */
function replaceKeyExtension(key, extension) {
  return key.replace(/\.[a-z0-9]+$/i, `.${extension}`);
}

module.exports = { THUMB_WIDTH, THUMB_QUALITY, processImage, makeThumbnail, replaceKeyExtension };
