'use strict';
/**
 * Backblaze B2 (S3-compatible) storage client.
 *
 * Three private buckets, one per payload type (mirrors the lms-stack
 * media-service — reuse the same pattern, never fork the semantics):
 *   bot   → B2_BUCKET_BOT   (chat-bot / bot-generated files; reserved)
 *   doc   → B2_BUCKET_DOC   (documents — PDF/DOCX/MD/TXT, stored as-is)
 *   media → B2_BUCKET_MEDIA (images — sharp-processed on upload; videos passthrough)
 *
 * B2 has no event-triggered compute, so every processing step happens in-code
 * before/around the upload (see ../media/media-pipeline.js). This module is
 * intentionally framework-free so the standalone queue worker can import it
 * without booting the API.
 *
 * Env-var driven ONLY — no hardcoded keys. isB2Configured() gates B2 mode;
 * without it, callers fall back to local disk (see ../media/media-pipeline.js).
 */
const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET_ENV = {
  bot: 'B2_BUCKET_BOT',
  doc: 'B2_BUCKET_DOC',
  media: 'B2_BUCKET_MEDIA',
};

/** Error surfaced to callers with a stable `code` for status mapping. */
class StorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StorageError';
    this.code = code; // 'NOT_FOUND' | 'CONFIG' | 'UPSTREAM'
  }
}

/** True when B2 is fully configured → media runs in B2 (async/queued) mode. */
function isB2Configured() {
  return Boolean(
    process.env.B2_ENDPOINT &&
      process.env.B2_KEY_ID &&
      process.env.B2_APPLICATION_KEY &&
      process.env.B2_BUCKET_MEDIA
  );
}

/** Resolve a logical bucket key to its configured bucket name. */
function b2BucketName(bucket) {
  const name = process.env[BUCKET_ENV[bucket]];
  if (!name) throw new StorageError('CONFIG', `B2 bucket not configured: ${bucket}`);
  return name;
}

let s3Client = null;

/** Lazily-created S3 client for B2 (first use, not at boot). */
function b2Client() {
  if (!s3Client) {
    if (!isB2Configured()) throw new StorageError('CONFIG', 'B2 storage is not configured');
    s3Client = new S3Client({
      // B2 accepts virtual-hosted-style requests against
      // <bucket>.s3.<region>.backblazeb2.com — the SDK default, so
      // forcePathStyle stays off.
      endpoint: `https://${process.env.B2_ENDPOINT}`,
      region: process.env.B2_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
      },
    });
  }
  return s3Client;
}

/** Map an SDK error to a stable StorageError. */
function mapError(error) {
  const name = (error && error.name) || '';
  const message = (error && error.message) || 'B2 storage error';
  if (name === 'NoSuchKey' || name === 'NotFound') throw new StorageError('NOT_FOUND', 'File not found');
  throw new StorageError('UPSTREAM', message);
}

/** True when the key is a staged temp object (tmp/<key>), not a final one. */
function isTmpKey(key) {
  return key.startsWith('tmp/');
}

/** Core upload (no processing). */
async function b2Upload(bucket, key, body, contentType) {
  try {
    await b2Client().send(
      new PutObjectCommand({
        Bucket: b2BucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  } catch (error) {
    mapError(error);
  }
}

/** Stream an object; pass `range` as a raw HTTP Range value ("bytes=0-99"). */
async function b2Download(bucket, key, range) {
  try {
    const response = await b2Client().send(
      new GetObjectCommand({
        Bucket: b2BucketName(bucket),
        Key: key,
        Range: range,
      })
    );
    return {
      body: response.Body,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: Number(response.ContentLength || 0),
    };
  } catch (error) {
    mapError(error);
  }
}

/** Object metadata without downloading the body. */
async function b2Head(bucket, key) {
  try {
    const response = await b2Client().send(
      new HeadObjectCommand({ Bucket: b2BucketName(bucket), Key: key })
    );
    return {
      contentLength: Number(response.ContentLength || 0),
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error) {
    mapError(error);
  }
}

/** Delete one object (idempotent — deleting a missing key succeeds on B2). */
async function b2Delete(bucket, key) {
  await b2Client().send(
    new DeleteObjectCommand({ Bucket: b2BucketName(bucket), Key: key })
  );
}

/** Delete several keys in one bucket in parallel. */
async function b2DeleteMany(bucket, keys) {
  await Promise.all(keys.map((key) => b2Delete(bucket, key)));
}

/** List objects (paginated) in one bucket, optionally under a prefix. */
async function b2List(bucket, prefix = '') {
  const out = [];
  let token;
  try {
    do {
      const response = await b2Client().send(
        new ListObjectsV2Command({
          Bucket: b2BucketName(bucket),
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const object of response.Contents || []) {
        if (!object.Key) continue;
        out.push({
          key: object.Key,
          size: Number(object.Size || 0),
          lastModified: object.LastModified || new Date(0),
        });
      }
      token = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (token);
    return out;
  } catch (error) {
    mapError(error);
  }
}

/** Temporary signed URL (direct client access / game asset delivery). */
async function b2SignedUrl(bucket, key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: b2BucketName(bucket),
      Key: key,
    });
    return await getSignedUrl(b2Client(), command, { expiresIn });
  } catch (error) {
    mapError(error);
  }
}

/** Bucket a lesson-content upload lands in: documents → doc, rest → media. */
function bucketForMime(mime) {
  const isDocument =
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'text/plain' ||
    mime === 'text/markdown';
  return isDocument ? 'doc' : 'media';
}

module.exports = {
  StorageError,
  b2Client,
  b2BucketName,
  b2Upload,
  b2Download,
  b2Head,
  b2Delete,
  b2DeleteMany,
  b2List,
  b2SignedUrl,
  bucketForMime,
  isB2Configured,
  isTmpKey,
};
