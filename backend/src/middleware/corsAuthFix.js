const cors = require('cors');

/**
 * CORS middleware (port of elite-cbt-api/src/middleware/corsAuthFix.js).
 * Origin policy from ALLOWED_ORIGINS (comma-separated); wildcard subdomains
 * supported ("https://*.elitekids.com.ng"). When unset, cross-origin requests
 * are denied entirely rather than using origin '*' + credentials.
 */
const setupCorsAuthFix = (app) => {
  const configured = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const originMatcher = (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / non-browser clients
    const allowed = configured.some((entry) => {
      if (entry === origin) return true;
      const star = entry.indexOf('*.');
      if (star === -1) return false;
      const suffix = entry.slice(star + 1);
      return origin.endsWith(suffix) && origin.length > suffix.length;
    });
    cb(null, allowed);
  };

  const corsOptions = {
    origin: configured.length > 0 ? originMatcher : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-school-id',
      'x-branch-id',
      'x-admin-needs-branch',
      'x-academic-year',
      'x-term',
      'x-user-id',
      'x-user-type',
    ],
    exposedHeaders: ['Authorization', 'X-Refreshed-Token'],
    credentials: true,
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
};

module.exports = { setupCorsAuthFix };
