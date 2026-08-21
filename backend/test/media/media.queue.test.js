'use strict';

/**
 * Unit tests for the BullMQ media queue (src/media/media.queue.js) and the
 * job-status mapping in media.service.js.
 *
 * bullmq, ioredis and the S3 SDK are mocked so no Redis/B2 connection is ever
 * made. The inline-size limit is shrunk to 100 bytes BEFORE the module is
 * required so the "large file → staged tmp object" branch is testable with a
 * tiny buffer.
 */
jest.mock('bullmq', () => {
  const add = jest.fn(async () => ({ id: 'job-1' }));
  const getJob = jest.fn(async () => null);
  class Queue {
    constructor(name, opts) {
      this.name = name;
      this.opts = opts;
    }
    add() {
      return add(...arguments);
    }
    getJob() {
      return getJob(...arguments);
    }
  }
  Queue.__add = add;
  Queue.__getJob = getJob;
  return { Queue };
});

jest.mock('ioredis', () => {
  class IORedis {
    constructor() {}
    on() {
      return this;
    }
    quit() {
      return Promise.resolve();
    }
  }
  return IORedis;
});

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn(async () => ({}));
  class S3Client {
    constructor() {}
    send() {
      return send(...arguments);
    }
  }
  const command = (name) =>
    class {
      constructor(input) {
        this.input = input;
        this.name = name;
      }
    };
  return {
    S3Client,
    __send: send,
    PutObjectCommand: command('PutObjectCommand'),
    GetObjectCommand: command('GetObjectCommand'),
    HeadObjectCommand: command('HeadObjectCommand'),
    DeleteObjectCommand: command('DeleteObjectCommand'),
    ListObjectsV2Command: command('ListObjectsV2Command'),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'http://signed.test/url'),
}));

// Must be set before require() — the module reads it once at load time.
process.env.MEDIA_QUEUE_INLINE_BYTES = '100';

const { Queue } = require('bullmq');
const { __send } = require('@aws-sdk/client-s3');
const {
  QUEUE_NAME,
  INLINE_LIMIT_BYTES,
  mediaQueue,
  enqueueMediaUpload,
} = require('../../src/media/media.queue');
const { getJobStatus } = require('../../src/media/media.service');

beforeAll(() => {
  // The large-file branch stages via b2Upload, which requires a configured client.
  process.env.B2_ENDPOINT = 's3.test';
  process.env.B2_KEY_ID = 'k';
  process.env.B2_APPLICATION_KEY = 's';
  process.env.B2_BUCKET_MEDIA = 'elite-kids-media';
});
afterEach(() => {
  Queue.__add.mockClear();
  Queue.__getJob.mockClear();
  __send.mockClear();
});

describe('media.queue', () => {
  test('queue name and inline limit are as configured', () => {
    expect(QUEUE_NAME).toBe('kids-media-processing');
    expect(INLINE_LIMIT_BYTES).toBe(100);
  });

  test('small buffers are enqueued inline (base64 payload, no staging)', async () => {
    const payload = Buffer.from('x'.repeat(50));
    const jobId = await enqueueMediaUpload({
      bucket: 'media',
      key: 'abc-123.png',
      buffer: payload,
      mimeType: 'image/png',
      options: { width: 100 },
    });

    expect(jobId).toBe('job-1');
    expect(Queue.__add).toHaveBeenCalledTimes(1);
    const [name, data] = Queue.__add.mock.calls[0];
    expect(name).toBe('process');
    expect(data.bucket).toBe('media');
    expect(data.key).toBe('abc-123.png');
    expect(data.bufferBase64).toBe(payload.toString('base64'));
    expect(data.tmpKey).toBeUndefined();
    expect(data.options).toEqual({ width: 100 });
    // No staging upload happened for the inline path.
    expect(__send).not.toHaveBeenCalled();
  });

  test('large buffers are staged as tmp/<uuid>.<ext> before enqueueing', async () => {
    const payload = Buffer.from('y'.repeat(150)); // > 100-byte inline limit
    const jobId = await enqueueMediaUpload({
      bucket: 'media',
      key: 'big-1.png',
      buffer: payload,
      mimeType: 'image/png',
    });

    expect(jobId).toBe('job-1');
    // The raw bytes went to B2 first (staging), then the job was enqueued.
    expect(__send).toHaveBeenCalledTimes(1);

    const [, data] = Queue.__add.mock.calls[0];
    expect(data.bufferBase64).toBeUndefined();
    expect(data.tmpKey).toMatch(/^tmp\/[0-9a-f-]{36}\.png$/);
  });
});

describe('media.service getJobStatus (queue mocked)', () => {
  test('unknown job id → status unknown', async () => {
    Queue.__getJob.mockResolvedValueOnce(null);
    expect(await getJobStatus('nope')).toEqual({ jobId: 'nope', status: 'unknown' });
  });

  test('completed job → status completed with the stored result', async () => {
    Queue.__getJob.mockResolvedValueOnce({
      getState: async () => 'completed',
      returnvalue: { url: 'http://127.0.0.1:34600/media/x.webp' },
      failedReason: undefined,
    });
    const status = await getJobStatus('j1');
    expect(status.status).toBe('completed');
    expect(status.result.url).toMatch(/\/media\/x\.webp$/);
    expect(status.error).toBeUndefined();
  });

  test('failed job → status failed with the failure reason', async () => {
    Queue.__getJob.mockResolvedValueOnce({
      getState: async () => 'failed',
      returnvalue: undefined,
      failedReason: 'boom',
    });
    const status = await getJobStatus('j2');
    expect(status.status).toBe('failed');
    expect(status.error).toBe('boom');
  });

  test('waiting/delayed/prioritized jobs → status queued', async () => {
    for (const state of ['waiting', 'delayed', 'prioritized']) {
      Queue.__getJob.mockResolvedValueOnce({ getState: async () => state });
      expect((await getJobStatus('j-' + state)).status).toBe('queued');
    }
  });

  test('active job → status processing', async () => {
    Queue.__getJob.mockResolvedValueOnce({ getState: async () => 'active' });
    expect((await getJobStatus('j3')).status).toBe('processing');
  });
});
