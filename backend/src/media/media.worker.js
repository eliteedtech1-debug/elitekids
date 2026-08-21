'use strict';
/**
 * Standalone media-processing worker (mirrors lms-stack media.worker.ts).
 *
 * Run alongside the API when B2 mode is active:
 *   npm run media-worker
 * or via PM2 / screen (`screen -dmS kids-media-worker npm run media-worker`).
 * It shares the queue + pipeline modules with the API so job shapes can never
 * drift. No HTTP bootstrap here on purpose — a worker needs Redis + B2 only.
 */
require('dotenv').config();
const { Worker } = require('bullmq');
const { QUEUE_NAME, redisConnection } = require('./media.queue');
const { processMediaJob } = require('./media-pipeline');

const CONCURRENCY = Math.max(1, Number(process.env.MEDIA_WORKER_CONCURRENCY || 5));

const worker = new Worker(QUEUE_NAME, async (job) => processMediaJob(job.data), {
  connection: redisConnection(),
  concurrency: CONCURRENCY,
});

worker.on('completed', (job, result) => {
  console.log(`[media-worker] job ${job.id} completed:`, result);
});

worker.on('failed', (job, error) => {
  console.error(`[media-worker] job ${job ? job.id : '<unknown>'} failed:`, error.message);
});

worker.on('error', (error) => {
  // e.g. transient Redis disconnects — BullMQ reconnects; just log it.
  console.error('[media-worker] worker error:', error.message);
});

async function shutdown() {
  console.log('[media-worker] shutting down…');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

console.log(`[media-worker] listening on queue "${QUEUE_NAME}" (concurrency ${CONCURRENCY})`);
