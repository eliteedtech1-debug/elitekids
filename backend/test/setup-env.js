'use strict';

/**
 * Jest setupFiles — runs before each test file loads, and crucially BEFORE
 * the app/models are imported. Setting process.env here wins over backend/.env
 * because dotenv.config() never overrides already-set variables — so tests
 * can never accidentally touch the prod tunnel DBs.
 */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_PORT = String(process.env.TEST_DB_PORT || 3306);
process.env.DB_USERNAME = process.env.TEST_DB_USER || 'root';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'elite_kids_test';
process.env.CONTENT_DB_NAME = process.env.TEST_DB_NAME || 'elite_kids_test';
process.env.AI_DB_NAME = process.env.TEST_DB_NAME || 'elite_kids_test';
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
