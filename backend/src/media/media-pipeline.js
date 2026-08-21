'use strict';
/**
 * Media job processing — the single place where an enqueued upload becomes a
 * stored object. Shared between the BullMQ worker (media.worker.js) and the
 * inline fallback (media.service.js when Redis/B2 is unavailable), so the
 * processing pipeline can't drift.
 *
 * Rule: images are resized/compressed with sharp and get a thumbnail before
 * they reach B2; videos and documents pass through untouched. B2 has no
 * post-upload compute, so all "processing" happens before the PutObject.
 *
 * Local fallback: when B2 is not configured (local dev), bytes are written to
 * the local storage dir instead — same keys, same URLs, synchronous.
 */
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { b2Delete, b2Download, b2Upload, isB2Configured } = require('../storage/b2');
const { makeThumbnail, processImage, replaceKeyExtension } = require('./image-processor');

/** Public URL the web app stores as contentUrl (served by the API). */
function mediaPublicUrl(key) {
  const base = process.env.MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:34600';
  return `${base}/media/${key}`;
}

function storageDir() {
  return process.env.MEDIA_STORAGE_DIR || path.join(process.cwd(), 'uploads');
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function putObject(bucket, key, buffer, contentType) {
  if (isB2Configured()) {
    await b2Upload(bucket, key, buffer, contentType);
  } else {
    await fs.promises.mkdir(storageDir(), { recursive: true });
    await fs.promises.writeFile(path.join(storageDir(), key), buffer);
  }
}

async function deleteObject(bucket, key) {
  if (isB2Configured()) {
    await b2Delete(bucket, key).catch(() => undefined);
  } else {
    await fs.promises.unlink(path.join(storageDir(), key)).catch(() => undefined);
  }
}

/** Main job handler: resolve bytes → process → upload → clean up staging. */
async function processMediaJob(job) {
  const { bucket, key, mimeType, options } = job;

  // Resolve input bytes: inline base64 payload, or the staged tmp object.
  let buffer;
  if (job.bufferBase64) {
    buffer = Buffer.from(job.bufferBase64, 'base64');
  } else if (job.tmpKey) {
    const { body } = await b2Download(bucket, job.tmpKey);
    buffer = await streamToBuffer(body);
  } else {
    throw new Error('Media job has neither bufferBase64 nor tmpKey');
  }

  try {
    if (mimeType && mimeType.startsWith('image/')) {
      return await processImageJob(bucket, key, buffer, options);
    }
    // Video / document: pass through as-is (no compression step yet).
    await putObject(bucket, key, buffer, mimeType || 'application/octet-stream');
    return { key, url: mediaPublicUrl(key), size: buffer.byteLength, contentType: mimeType || 'application/octet-stream' };
  } finally {
    // The staged raw copy is consumed — never leave tmp/ orphans behind.
    if (job.tmpKey) await deleteObject(bucket, job.tmpKey);
  }
}

/** Env-driven sharp defaults (MEDIA_IMAGE_*), overridable per-job. */
function defaultImageOptions(overrides) {
  const base = {};
  if (process.env.MEDIA_IMAGE_MAX_WIDTH) base.width = Number(process.env.MEDIA_IMAGE_MAX_WIDTH);
  if (process.env.MEDIA_IMAGE_QUALITY) base.quality = Number(process.env.MEDIA_IMAGE_QUALITY);
  if (process.env.MEDIA_IMAGE_FORMAT === 'jpeg' || process.env.MEDIA_IMAGE_FORMAT === 'png' || process.env.MEDIA_IMAGE_FORMAT === 'webp') {
    base.format = process.env.MEDIA_IMAGE_FORMAT;
  }
  return { ...base, ...(overrides || {}) };
}

async function processImageJob(bucket, key, buffer, options) {
  const processed = await processImage(buffer, defaultImageOptions(options));
  const outKey = replaceKeyExtension(key, processed.extension);
  await putObject(bucket, outKey, processed.buffer, processed.contentType);

  // Thumbnail from the ORIGINAL bytes so downscaling stays lossless-ish.
  const thumbBuffer = await makeThumbnail(buffer);
  const thumbKey = outKey.replace(/\.[a-z0-9]+$/i, '-thumb.webp');
  await putObject(bucket, thumbKey, thumbBuffer, 'image/webp');

  return {
    key: outKey,
    url: mediaPublicUrl(outKey),
    thumbKey,
    size: processed.buffer.byteLength,
    contentType: processed.contentType,
  };
}

module.exports = { processMediaJob, mediaPublicUrl, storageDir };
