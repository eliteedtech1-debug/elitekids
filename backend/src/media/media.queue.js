'use strict';
/**
 * BullMQ media-processing queue (mirrors lms-stack media-service/src/media.queue.ts).
 *
 * Uploads are enqueued — never processed in the request path — so the HTTP
 * layer stays fast and image work retries on failure and scales horizontally
 * with worker processes. Processing lives in media-pipeline.js and is shared
 * with the standalone worker (src/media/media.worker.js).
 *
 * Staging strategy (small vs large):
 *  - buffer ≤ MEDIA_QUEUE_INLINE_BYTES (default 8 MB) → carried base64 in the
 *    job payload (fine for child avatars, lesson covers, game assets);
 *  - larger files → raw bytes PUT to `tmp/<key>` in the target bucket first
 *    and the job carries `tmpKey`; the worker downloads, processes, uploads
 *    the finished object and deletes the temp copy.
 *
 * Graceful degradation: the queue is only ever touched in B2 mode, and callers
 * treat a failed add() (Redis down) as "fall back to inline processing", so
 * local dev without Redis/B2 keeps working.
 */
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { randomUUID } = require('crypto');
const { b2Upload } = require('../storage/b2');

const QUEUE_NAME = 'kids-media-processing';
const INLINE_LIMIT_BYTES = Number(process.env.MEDIA_QUEUE_INLINE_BYTES || 8 * 1024 * 1024);

let connection = null;
let queue = null;

/** Redis connection shared by the queue (and worker processes). */
function redisConnection() {
  if (!connection) {
    const url =
      process.env.REDIS_URL ||
      `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
    connection = new IORedis(url, {
      maxRetriesPerRequest: null, // required for BullMQ blocking commands
      enableReadyCheck: false,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT || 5000),
      // Bounded reconnect: when REDIS_MAX_RETRIES is set (tests set 0), give up
      // after that many failed attempts. Returning null makes ioredis close the
      // connection and REJECT pending commands instead of queueing them forever
      // — so BullMQ add() throws, the enqueue callers hit their inline fallback,
      // and the connection shuts down cleanly (no event-loop leak). Unset in
      // prod → NaN → infinite backoff, exactly today's behavior.
      retryStrategy: (times) => {
        const max = Number(process.env.REDIS_MAX_RETRIES);
        if (Number.isFinite(max) && times > max) return null;
        return Math.min(times * 200, 2000);
      },
    });
    connection.on('error', (error) => {
      // BullMQ retries internally; just surface the failure for ops.
      console.error('[kids-media-queue] redis error:', error.message);
    });
  }
  return connection;
}

/** Lazily-created BullMQ queue (only touched in B2 mode / generation mode). */
function mediaQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

/**
 * Stage + enqueue a media upload. Returns the job id (or null when the queue
 * is unavailable — callers then fall back to inline processing).
 */
async function enqueueMediaUpload({ bucket, key, buffer, mimeType, options }) {
  let data;
  if (buffer.byteLength <= INLINE_LIMIT_BYTES) {
    data = {
      bucket,
      key,
      mimeType,
      options,
      bufferBase64: buffer.toString('base64'),
    };
  } else {
    const tmpKey = `tmp/${randomUUID()}${(key.match(/\.[a-z0-9]+$/i) || [''])[0]}`;
    // Stage the raw bytes in B2 first — no base64 bloat, no 10 MB Redis cap.
    await b2Upload(bucket, tmpKey, buffer, mimeType);
    data = { bucket, key, mimeType, options, tmpKey };
  }
  const job = await mediaQueue().add('process', data);
  return job.id || null;
}

/**
 * Close the media queue + shared Redis connection if they were created
 * (idempotent, safe to call when nothing was ever opened). Used by tests so
 * the open BullMQ/Redis handles don't keep the Jest event loop alive.
 */
async function closeRedis() {
  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
  if (connection) {
    await connection.quit().catch(() => undefined);
    connection = null;
  }
}

module.exports = { QUEUE_NAME, INLINE_LIMIT_BYTES, redisConnection, mediaQueue, enqueueMediaUpload, closeRedis };
