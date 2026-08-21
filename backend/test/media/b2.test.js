'use strict';

/**
 * Unit tests for the B2 storage client (src/storage/b2.js).
 *
 * The @aws-sdk/client-s3 module is mocked so no network/credentials are ever
 * touched. setup-env.js blanks the B2_* vars; this file sets them explicitly
 * for the tests that need a configured client, and restores the blanks after
 * each test.
 */
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

const {
  StorageError,
  b2BucketName,
  b2Upload,
  b2Download,
  b2DeleteMany,
  b2List,
  bucketForMime,
  isB2Configured,
  isTmpKey,
} = require('../../src/storage/b2');
const { __send } = require('@aws-sdk/client-s3');

const B2_VARS = [
  'B2_ENDPOINT',
  'B2_KEY_ID',
  'B2_APPLICATION_KEY',
  'B2_BUCKET_MEDIA',
  'B2_BUCKET_DOC',
  'B2_BUCKET_BOT',
];

const original = {};
beforeAll(() => {
  for (const v of B2_VARS) original[v] = process.env[v];
});
afterEach(() => {
  for (const v of B2_VARS) process.env[v] = original[v];
  __send.mockClear();
});

function configureB2() {
  process.env.B2_ENDPOINT = 's3.us-west-004.backblazeb2.com';
  process.env.B2_KEY_ID = 'keyId';
  process.env.B2_APPLICATION_KEY = 'appKey';
  process.env.B2_BUCKET_MEDIA = 'elite-kids-media';
  process.env.B2_BUCKET_DOC = 'elite-kids-doc';
  // B2_BUCKET_BOT intentionally left unset so the CONFIG-throw path is testable.
  delete process.env.B2_BUCKET_BOT;
}

describe('b2 — pure routing helpers', () => {
  test('bucketForMime routes documents to the doc bucket, everything else to media', () => {
    expect(bucketForMime('application/pdf')).toBe('doc');
    expect(bucketForMime('application/msword')).toBe('doc');
    expect(bucketForMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc');
    expect(bucketForMime('text/plain')).toBe('doc');
    expect(bucketForMime('text/markdown')).toBe('doc');
    expect(bucketForMime('image/png')).toBe('media');
    expect(bucketForMime('video/mp4')).toBe('media');
  });

  test('isTmpKey only matches staged temp objects', () => {
    expect(isTmpKey('tmp/123e4567-e89b-12d3-a456-426614174000.png')).toBe(true);
    expect(isTmpKey('123e4567-e89b-12d3-a456-426614174000.png')).toBe(false);
    expect(isTmpKey('tmpfile.png')).toBe(false);
  });
});

describe('b2 — configuration gate', () => {
  test('isB2Configured is false when any required var is missing', () => {
    configureB2();
    delete process.env.B2_APPLICATION_KEY;
    expect(isB2Configured()).toBe(false);
  });

  test('isB2Configured is true when all required vars are present', () => {
    configureB2();
    expect(isB2Configured()).toBe(true);
  });

  test('b2BucketName resolves the configured bucket and throws CONFIG otherwise', () => {
    configureB2();
    expect(b2BucketName('media')).toBe('elite-kids-media');
    expect(b2BucketName('doc')).toBe('elite-kids-doc');

    try {
      b2BucketName('bot');
      throw new Error('expected b2BucketName to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(StorageError);
      expect(err.code).toBe('CONFIG');
    }
  });
});

describe('b2 — SDK calls (mocked)', () => {
  test('b2Upload sends a PutObjectCommand with bucket/key/body/contentType', async () => {
    configureB2();
    await b2Upload('media', 'abc-123.png', Buffer.from('img'), 'image/png');

    expect(__send).toHaveBeenCalledTimes(1);
    const [command] = __send.mock.calls[0];
    expect(command.name).toBe('PutObjectCommand');
    expect(command.input.Bucket).toBe('elite-kids-media');
    expect(command.input.Key).toBe('abc-123.png');
    expect(command.input.ContentType).toBe('image/png');
  });

  test('b2Download returns the body + content metadata', async () => {
    configureB2();
    __send.mockResolvedValueOnce({ Body: 'stream', ContentType: 'image/png', ContentLength: 42 });

    const result = await b2Download('media', 'abc-123.png');
    expect(result.body).toBe('stream');
    expect(result.contentType).toBe('image/png');
    expect(result.contentLength).toBe(42);
  });

  test('maps NoSuchKey/NotFound to StorageError NOT_FOUND', async () => {
    configureB2();
    __send.mockRejectedValueOnce({ name: 'NoSuchKey', message: 'missing' });

    await expect(b2Download('media', 'gone.png')).rejects.toMatchObject({
      name: 'StorageError',
      code: 'NOT_FOUND',
    });
  });

  test('maps other SDK errors to StorageError UPSTREAM with the upstream message', async () => {
    configureB2();
    __send.mockRejectedValueOnce({ name: 'AccessDenied', message: 'no perms' });

    await expect(b2Upload('media', 'x.png', Buffer.from('x'), 'image/png')).rejects.toMatchObject({
      name: 'StorageError',
      code: 'UPSTREAM',
      message: 'no perms',
    });
  });

  test('b2DeleteMany issues one delete per key', async () => {
    configureB2();
    await b2DeleteMany('media', ['a.png', 'b.png']);

    expect(__send).toHaveBeenCalledTimes(2);
    const keys = __send.mock.calls.map(([command]) => command.input.Key);
    expect(keys).toEqual(['a.png', 'b.png']);
  });

  test('b2List paginates until IsTruncated is false', async () => {
    configureB2();
    __send
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'a.png', Size: 1, LastModified: new Date('2026-01-01T00:00:00Z') },
          { Key: 'b.png', Size: 2, LastModified: new Date('2026-01-02T00:00:00Z') },
        ],
        IsTruncated: true,
        NextContinuationToken: 'tok-1',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'c.png', Size: 3, LastModified: new Date('2026-01-03T00:00:00Z') }],
        IsTruncated: false,
      });

    const items = await b2List('media', 'prefix/');
    expect(items.map((i) => i.key)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(items[0].size).toBe(1);
    expect(items[2].lastModified).toBeInstanceOf(Date);

    // The continuation token must have been passed on the second page.
    expect(__send.mock.calls[1][0].input.ContinuationToken).toBe('tok-1');
    expect(__send.mock.calls[1][0].input.Prefix).toBe('prefix/');
  });
});
