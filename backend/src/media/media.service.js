'use strict';
/**
 * MediaService — the API-facing media layer (port of lms-stack
 * media.service.ts). Controllers call this; they never touch Redis/BullMQ/B2
 * directly.
 *
 * Two modes:
 *  - local (dev): B2 unconfigured → bytes written to disk synchronously, URL
 *    usable immediately.
 *  - b2 (prod): bytes staged/enqueued on the kids-media-processing queue →
 *    clients poll GET /media/upload-status/:jobId for the result.
 *
 * Keys are server-generated `<uuid>.<ext>`; anything else is rejected
 * (traversal attempt). Thumbnails land as `<uuid>-thumb.webp` next to the
 * object.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { mediaQueue, redisConnection, enqueueMediaUpload } = require('./media.queue');
const { mediaPublicUrl, storageDir } = require('./media-pipeline');
const { b2DeleteMany, b2List, bucketForMime, isB2Configured, isTmpKey } = require('../storage/b2');

const ALLOWED_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const EXT_BY_MIME = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Keys are server-generated `<uuid>.<ext>`; anything else is rejected. */
const KEY_PATTERN = /^[a-f0-9-]{36}(?:-[a-z0-9]+)?(\.[a-z0-9]+)?$/i;

function isB2Mode() {
  return isB2Configured();
}

function assertSafeKey(key) {
  if (!KEY_PATTERN.test(key)) {
    const err = new Error('Invalid file key');
    err.status = 400;
    throw err;
  }
  return key;
}

function maxBytes() {
  return Number(process.env.MEDIA_MAX_BYTES || 200 * 1024 * 1024);
}

/**
 * Store an uploaded file. Local mode writes to disk and returns the URL
 * synchronously; B2 mode stages/enqueues and returns a jobId to poll.
 */
async function store(file, options) {
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    const err = new Error(`Unsupported content type: ${mime || 'unknown'}`);
    err.status = 400;
    throw err;
  }
  if (!file.buffer || file.buffer.byteLength === 0) {
    const err = new Error('Uploaded file is empty');
    err.status = 400;
    throw err;
  }
  if (file.buffer.byteLength > maxBytes()) {
    const err = new Error(`File exceeds the ${maxBytes()} byte limit`);
    err.status = 400;
    throw err;
  }

  const ext = EXT_BY_MIME[mime];
  const key = `${randomUUID()}${ext ? `.${ext}` : ''}`;

  if (!isB2Mode()) {
    await fs.promises.mkdir(storageDir(), { recursive: true });
    await fs.promises.writeFile(path.join(storageDir(), key), file.buffer);
    return {
      mode: 'local',
      key,
      url: `${process.env.MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:34600'}/media/${key}`,
      filename: file.originalname || 'upload',
      contentType: mime,
      size: file.buffer.byteLength,
    };
  }

  const jobId = await enqueueMediaUpload({
    bucket: bucketForMime(mime),
    key,
    buffer: file.buffer,
    mimeType: mime,
    options,
  });
  return { mode: 'b2', jobId };
}

/** Job status for the upload polling endpoint (B2 mode). */
async function getJobStatus(jobId) {
  const job = await mediaQueue().getJob(jobId);
  if (!job) return { jobId, status: 'unknown' };
  const state = await job.getState();
  const status =
    state === 'completed'
      ? 'completed'
      : state === 'failed'
        ? 'failed'
        : state === 'active'
          ? 'processing'
          : state === 'waiting' || state === 'delayed' || state === 'prioritized'
            ? 'queued'
            : 'unknown';
  return {
    jobId,
    status,
    result: job.returnvalue || undefined,
    error: job.failedReason || undefined,
  };
}

/** List every stored file (admin storage sweep). */
async function list() {
  if (isB2Mode()) {
    const buckets = ['doc', 'media'];
    const objects = await Promise.all(
      buckets.map(async (bucket) => {
        const items = await b2List(bucket);
        return items
          .filter((item) => !isTmpKey(item.key))
          .map((item) => ({
            key: item.key,
            url: mediaPublicUrl(item.key),
            size: item.size,
            createdAt: item.lastModified.toISOString(),
          }));
      })
    );
    const seen = new Set();
    return objects
      .flat()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((entry) => (seen.has(entry.key) ? false : (seen.add(entry.key), true)));
  }

  let entries;
  try {
    entries = await fs.promises.readdir(storageDir());
  } catch {
    return [];
  }
  const files = await Promise.all(
    entries.map(async (key) => {
      const stat = await fs.promises.stat(path.join(storageDir(), key)).catch(() => null);
      if (!stat || !stat.isFile()) return null;
      return {
        key,
        url: `${process.env.MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:34600'}/media/${key}`,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
  );
  return files.filter((entry) => entry !== null);
}

/** Delete one stored file by key (plus its thumbnail variant). */
async function remove(key) {
  const safeKey = assertSafeKey(key);

  if (isB2Mode()) {
    const thumbKey = safeKey.replace(/\.\w+$/, '-thumb.webp');
    await b2DeleteMany('media', [safeKey, thumbKey]);
    await b2DeleteMany('doc', [safeKey]);
    return { deleted: true };
  }

  try {
    await fs.promises.unlink(path.join(storageDir(), safeKey));
  } catch (error) {
    if (error.code === 'ENOENT') {
      const notFound = new Error('File not found');
      notFound.status = 404;
      throw notFound;
    }
    throw error;
  }
  return { deleted: true };
}

module.exports = { store, getJobStatus, list, remove, isB2Mode };
