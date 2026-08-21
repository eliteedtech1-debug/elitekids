/**
 * Express app factory — middleware, passport, health, routes, error handlers.
 *
 * Separated from src/index.js so tests (Jest + Supertest) can import the app
 * directly without booting the server or touching any database schema.
 */
const express = require('express');
const passport = require('passport');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { setupCorsAuthFix } = require('./middleware/corsAuthFix');

const app = express();

app.set('trust proxy', 1);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());

// Rate limiting is skipped under test (NODE_ENV=test) or when explicitly
// disabled — otherwise the 10/min auth limit makes integration suites flaky.
const RATE_LIMIT_DISABLED = process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === '1';

if (!RATE_LIMIT_DISABLED) {
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
  });
  app.use(globalLimiter);
}

app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

setupCorsAuthFix(app);

app.use(passport.initialize());
require('./config/passport')(passport);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'ok', service: 'elite-kids-api' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
require('./routes/user.js')(app);
require('./routes/kids.js')(app);
require('./routes/media.js')(app);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
});

module.exports = app;
