'use strict';
/**
 * Content-generation queue — turns a newly created lesson into validated Game
 * Config JSON off the request path (the createLesson endpoint used to kick a
 * raw setTimeout; the queue replaces that so generation retries, scales, and
 * is observable via kids_generation_jobs).
 *
 * Job contract: worker reads the lesson + school from the job payload, runs
 * generateGameConfig → persistGameConfig (schema-validated, safety-pipelined),
 * then flips the lesson to pending_human_review. Every step records progress
 * on the kids_generation_jobs row so the UI can show "generating…".
 *
 * Graceful degradation: enqueueLessonGeneration returns { queued:false } when
 * Redis is unavailable (local dev) — callers fall back to the inline path.
 */
const { Queue } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const { redisConnection } = require('./media.queue');

const QUEUE_NAME = 'kids-content-generation';

let queue = null;

function generationQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 2000 },
      },
    });
  }
  return queue;
}

/**
 * Record the job (kids_generation_jobs) and enqueue it. Returns
 * { queued:true, jobId } or { queued:false } when the queue is unavailable
 * (caller should fall back to inline generation).
 */
async function enqueueLessonGeneration({ lesson, school_id, created_by }) {
  const jobRow = await db.KidGenerationJob.create({
    id: uuidv4(),
    lesson_id: lesson.id,
    content_type: 'game_config',
    template: null,
    status: 'queued',
    model_version: process.env.AI_MODEL || 'gemini-2.5-flash',
  });
  try {
    await generationQueue().add(
      'generate-game-config',
      { jobId: jobRow.id, lessonId: lesson.id, school_id, created_by },
      { jobId: jobRow.id } // job id = the DB row id, so UI can poll either
    );
    return { queued: true, jobId: jobRow.id };
  } catch (error) {
    // Redis down → the caller runs the inline fallback; mark the row failed so
    // the UI doesn't show a stuck "queued" job.
    console.warn('⚠️ Generation queue unavailable, caller will fall back inline:', error.message);
    await jobRow
      .update({ status: 'failed', error: error.message })
      .catch(() => undefined);
    return { queued: false };
  }
}

/**
 * Close the generation queue if it was created (idempotent). Tests call this
 * so the BullMQ clients don't keep the Jest event loop alive. The shared
 * Redis template connection is closed by media.queue's closeRedis().
 */
async function closeGenerationQueue() {
  if (queue) {
    await queue.close().catch(() => undefined);
    queue = null;
  }
}

module.exports = { QUEUE_NAME, generationQueue, enqueueLessonGeneration, closeGenerationQueue };
