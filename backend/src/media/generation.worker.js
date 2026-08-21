'use strict';
/**
 * Content-generation worker — consumes kids-content-generation jobs.
 *
 * Run alongside the API (npm run generation-worker, or via PM2 / screen).
 * Shares generation.queue.js + contentGeneratorService with the API so the
 * pipeline can't drift. Needs Redis + the AI DB; the heavy AI call happens
 * here, never in the request path.
 *
 * Each job generates BOTH a game config AND a scene script for the lesson,
 * updating the generation job row with progress for each stage.
 */
require('dotenv').config();
const { Worker } = require('bullmq');
const db = require('../models');
const { QUEUE_NAME } = require('./generation.queue');
const { redisConnection } = require('./media.queue');
const {
  generateGameConfig,
  persistGameConfig,
  generateSceneScript,
  persistSceneScript,
} = require('../services/contentGeneratorService');

const CONCURRENCY = Math.max(1, Number(process.env.GENERATION_WORKER_CONCURRENCY || 2));

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { jobId, lessonId, school_id, created_by } = job.data;
    const jobRow = await db.KidGenerationJob.findByPk(jobId).catch(() => null);
    const mark = (patch) =>
      jobRow && jobRow.update(patch).catch(() => undefined);

    await mark({ status: 'running' });

    const lesson = await db.KidLesson.findByPk(lessonId);
    if (!lesson) {
      await mark({ status: 'failed', error: `Lesson ${lessonId} not found` });
      throw new Error(`Lesson ${lessonId} not found`);
    }

    // ── Stage 1: Generate game config ──────────────────────────────────────
    await mark({ content_type: 'game_config', template: null });
    let gameResult;
    try {
      gameResult = await generateGameConfig({ lesson, school_id });
      await persistGameConfig({
        lesson_id: lesson.id,
        template: gameResult.config.template,
        age_level: lesson.age_level,
        config: gameResult.config,
        model_provider: gameResult.model_provider,
        model_version: gameResult.model_version,
        created_by,
        school_id,
      });
      await mark({ template: gameResult.config.template });
    } catch (e) {
      console.error(`[generation-worker] game config failed for lesson ${lessonId}: ${e.message}`);
      // Game config failure is non-fatal — continue to scene script
    }

    // ── Stage 2: Generate scene script ─────────────────────────────────────
    await mark({ content_type: 'scene_script' });
    try {
      const sceneResult = await generateSceneScript({ lesson, school_id });
      await persistSceneScript({
        lesson_id: lesson.id,
        scenes: sceneResult.scenes,
        model_provider: sceneResult.model_provider,
        model_version: sceneResult.model_version,
        created_by,
        school_id,
      });
    } catch (e) {
      console.error(`[generation-worker] scene script failed for lesson ${lessonId}: ${e.message}`);
      // Scene script failure is also non-fatal — game config may have succeeded
    }

    // ── Finalize ───────────────────────────────────────────────────────────
    await lesson.update({ content_state: 'pending_human_review' });
    await mark({ status: 'succeeded' });

    return {
      gameConfigTemplate: gameResult?.config?.template || null,
      lessonId,
    };
  },
  {
    connection: redisConnection(),
    concurrency: CONCURRENCY,
  }
);

worker.on('failed', (job, error) => {
  console.error(`[generation-worker] job ${job ? job.id : '<unknown>'} failed:`, error.message);
});

worker.on('error', (error) => {
  console.error('[generation-worker] worker error:', error.message);
});

async function shutdown() {
  console.log('[generation-worker] shutting down…');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

console.log(`[generation-worker] listening on queue "${QUEUE_NAME}" (concurrency ${CONCURRENCY})`);
