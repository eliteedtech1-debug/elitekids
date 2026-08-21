'use strict';

/**
 * Regression test for generation.worker.js — it must consume the
 * kids-content-generation queue (where enqueueLessonGeneration adds jobs), NOT
 * the kids-media-processing queue. The bug: QUEUE_NAME was imported from
 * media.queue.js, so the worker listened on the wrong queue and generation
 * jobs were silently never processed.
 *
 * bullmq / ioredis / models / contentGeneratorService are mocked — the worker
 * only touches them at construction / inside the job handler.
 */
jest.mock('bullmq', () => {
  const Worker = jest.fn(() => ({ on: jest.fn(), close: jest.fn() }));
  return { Worker };
});

jest.mock('ioredis', () => {
  return class IORedis {
    constructor() {}
    on() {
      return this;
    }
  };
});

jest.mock('../../src/models', () => ({ KidGenerationJob: {}, KidLesson: {} }));
jest.mock('../../src/services/contentGeneratorService', () => ({
  generateGameConfig: jest.fn(),
  persistGameConfig: jest.fn(),
}));

require('../../src/media/generation.worker');
const { Worker } = require('bullmq');

describe('generation.worker', () => {
  test('listens on the kids-content-generation queue', () => {
    expect(Worker).toHaveBeenCalled();
    const [queueName] = Worker.mock.calls[0];
    expect(queueName).toBe('kids-content-generation');
  });

  test('uses the shared Redis connection with a bounded concurrency', () => {
    const [, , options] = Worker.mock.calls[0];
    expect(options.concurrency).toBeGreaterThanOrEqual(1);
    expect(options.connection).toBeTruthy();
  });
});
