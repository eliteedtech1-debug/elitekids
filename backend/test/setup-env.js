'use strict';

/**
 * Jest setupFiles — runs before each test file loads, and crucially BEFORE
 * the app/models are imported. Setting process.env here wins over backend/.env
 * because dotenv.config() never overrides already-set variables — so tests
 * can never accidentally touch the prod tunnel DBs.
 */

// Load test-only env from backend/.env.test (git-ignored) when present, so DB
// credentials live in the env file only — never in commands or the repo.
// Explicit process.env (e.g. CI-provided TEST_DB_*) always wins.
const fs = require('fs');
const path = require('path');
const envTestPath = path.join(__dirname, '..', '.env.test');
if (fs.existsSync(envTestPath)) {
  const lines = fs.readFileSync(envTestPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = String(process.env.TEST_DB_PORT || 3306);
process.env.DB_USERNAME = process.env.TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
const legacyTestDb = process.env.TEST_DB_NAME === 'elite_kids_test' ? undefined : process.env.TEST_DB_NAME;
process.env.DB_NAME = process.env.TEST_SHARED_DB_NAME || legacyTestDb || 'elite_db_test';
process.env.CONTENT_DB_NAME = process.env.TEST_CONTENT_DB_NAME || 'elite_content_test';
process.env.AI_DB_NAME = process.env.TEST_AI_DB_NAME || process.env.TEST_CONTENT_DB_NAME || 'elite_content_test';
process.env.KIDS_DB_NAME = process.env.TEST_KIDS_DB_NAME || process.env.TEST_CONTENT_DB_NAME || 'elite_content_test';
process.env.JWT_SECRET_KEY = 'test-jwt-secret';
process.env.ALLOWED_ORIGINS = 'http://localhost:34601';
process.env.DISABLE_RATE_LIMIT = '1';

// Media storage: force LOCAL (disk) mode so tests never touch B2 or Redis.
// src/models + passport call dotenv.config(), which loads backend/.env with
// the REAL B2/Redis values — but dotenv never overrides already-set vars, so
// blanking them here is hermetic. Media tests override these per-file where
// they deliberately exercise the B2/queue code paths (with mocked SDKs).
process.env.B2_ENDPOINT = '';
process.env.B2_KEY_ID = '';
process.env.B2_APPLICATION_KEY = '';
process.env.B2_BUCKET_MEDIA = '';
process.env.B2_BUCKET_DOC = '';
process.env.B2_BUCKET_BOT = '';
process.env.MEDIA_PUBLIC_BASE_URL = 'http://127.0.0.1:34600';

// Redis: fail fast + never reconnect in tests. The generation queue's
// graceful degradation needs BullMQ add() to REJECT when Redis is down; the
// bounded retry strategy in media.queue.js closes the connection after this
// many failed attempts, so tests never hang on a dead Redis and the ioredis
// reconnect timers can't keep Jest workers alive.
process.env.REDIS_MAX_RETRIES = '0';
