const passport = require('passport');
const {
  login,
  studentLogin,
  superadminLogin,
  verifyToken,
  forgotPassword,
  resetPassword,
  parentSignup,
} = require('../controllers/auth');
const { flagshipIdForAlias, flagshipIdFromHost } = require('../seeders/flagshipKidsSeed');
const db = require('../models');

module.exports = (app) => {
  const authLimiter =
    process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === '1'
      ? (req, res, next) => next()
      : require('express-rate-limit')({
          windowMs: 60 * 1000,
          max: 10,
          standardHeaders: true,
          legacyHeaders: false,
          message: { success: false, error_code: 'RATE_LIMITED', message: 'Too many authentication attempts, please try again later.' },
        });

  // ── Auth ────────────────────────────────────────────────────────────────
  app.post('/users/login', authLimiter, login);
  app.post('/students/login', authLimiter, studentLogin);
  app.post('/superadmin-login', authLimiter, superadminLogin);
  app.get('/verify-token', verifyToken);
  app.post('/auth/forgot-password', authLimiter, forgotPassword);
  app.post('/auth/reset-password', authLimiter, resetPassword);
  app.post('/auth/parent-signup', authLimiter, parentSignup);

  // ── Multi-school selection (port of elite-cbt-api /auth/select-school) ───
  app.post('/auth/select-school', async (req, res) => {
    const { selection_token, school_id } = req.body;
    if (!selection_token || !school_id) {
      return res.status(400).json({ success: false, error_code: 'VALIDATION_ERROR', message: 'selection_token and school_id are required' });
    }
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(selection_token, process.env.JWT_SECRET_KEY);
      if (decoded.phase !== 'school_selection') {
        return res.status(400).json({ success: false, error_code: 'INVALID_SELECTION_TOKEN', message: 'Invalid selection token' });
      }

      const [rows] = await db.sequelize.query(
        `SELECT * FROM users WHERE (email = :email OR username = :email) AND school_id = :school_id LIMIT 1`,
        { replacements: { email: decoded.email, school_id }, type: db.sequelize.QueryTypes.SELECT }
      );
      const user = rows || null;
      if (!user) return res.status(404).json({ success: false, error_code: 'ACCOUNT_NOT_FOUND', message: 'Account not found for this school' });

      const userType = user.user_type || user.role || 'Admin';
      const token = require('../middleware/sessionAuth').generateLoginToken({
        id: user.id,
        user_type: userType,
        email: user.email,
        school_id: user.school_id,
        branch_id: user.branch_id,
      });

      return res.json({
        success: true,
        token: 'Bearer ' + token,
        user: { ...user, user_type: userType },
        sessionInfo: {
          lastActivity: new Date().toISOString(),
          inactivityTimeout: 15 * 60 * 1000,
          warningThreshold: 13 * 60 * 1000,
        },
      });
    } catch (err) {
      return res.status(401).json({ success: false, error_code: 'INVALID_SELECTION_TOKEN', message: 'Invalid or expired selection token' });
    }
  });

  // ── School lookup (public — login page pre-fills school branding) ───────
  // Flagship rule: ANY *.elitekids.com.ng subdomain (kids., games., practice.,
  // elite., bare domain, …) resolves to the flagship school — a user who lands
  // on any flagship subdomain can never miss it.
  app.get('/schools/get-details', async (req, res) => {
    const { query_type, short_name, school_id } = req.query;
    try {
      let school = null;
      const hostFlagshipId = flagshipIdFromHost(req.headers?.host || req.get?.('host'));
      if (query_type === 'select-by-short-name' && short_name) {
        // Alias short_names (elite/kids/practice) OR any request from a flagship
        // subdomain resolve to the flagship school (covers arbitrary subdomains
        // like `games` that aren't hardcoded aliases).
        const flagshipId = flagshipIdForAlias(short_name) || hostFlagshipId;
        const [rows] = await db.sequelize.query(
          `SELECT * FROM school_setup
           WHERE (LOWER(short_name) = LOWER(:short_name) OR school_id = :flagship_id)
           ORDER BY (school_id = :flagship_id) DESC
           LIMIT 1`,
          {
            replacements: { short_name: short_name.trim(), flagship_id: flagshipId || null },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );
        school = rows || null;
      } else if (school_id) {
        const [rows] = await db.sequelize.query(
          `SELECT * FROM school_setup WHERE school_id = :school_id LIMIT 1`,
          {
            replacements: { school_id },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );
        school = rows || null;
      } else if (hostFlagshipId) {
        // No short_name/school_id given but the request came from a flagship
        // subdomain — return the flagship school so lookup always succeeds.
        const [rows] = await db.sequelize.query(
          `SELECT * FROM school_setup WHERE school_id = :flagship_id LIMIT 1`,
          {
            replacements: { flagship_id: hostFlagshipId },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );
        school = rows || null;
      }

      if (!school) return res.json({ success: false, data: [], message: 'School not found' });

      // Auto-enable Kids module for schools on the Elite plan (package_name = 'Elite').
      // The Elite package includes full system access — Kids should never be gated.
      const [pkgRows] = await db.sequelize.query(
        `SELECT sp.package_name FROM rbac_school_packages rsp
         JOIN subscription_packages sp ON rsp.package_id = sp.id
         WHERE rsp.school_id = :school_id AND rsp.is_active = 1
         AND sp.package_name = 'Elite' LIMIT 1`,
        { replacements: { school_id: school.school_id }, type: db.sequelize.QueryTypes.SELECT }
      ).catch(() => []);
      if (pkgRows) {
        console.log(`[kids-access] Auto-enabled Kids for ${school.school_id} (${school.short_name}) — Elite plan detected`);
        school.kids_stand_alone = 1;
      }

      return res.json({ success: true, data: [school] });
    } catch (err) {
      console.error('schools/get-details error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // ── Short-name availability (port of elite-cbt-api /schools/check-shortname)
  app.get('/schools/check-shortname', async (req, res) => {
    const { short_name } = req.query;
    if (!short_name) {
      return res.status(400).json({ success: false, message: 'short_name is required' });
    }
    try {
      const [rows] = await db.sequelize.query(
        `SELECT school_id FROM school_setup WHERE LOWER(short_name) = LOWER(:short_name) LIMIT 1`,
        { replacements: { short_name: short_name.trim() }, type: db.sequelize.QueryTypes.SELECT }
      );
      return res.json({ success: true, available: !rows });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Check failed' });
    }
  });

  // ── School onboarding (protected — Admin) ───────────────────────────────
  app.put('/auth/onboarding', passport.authenticate('jwt', { session: false }), (req, res) => {
    res.json({ success: true, message: 'Onboarding endpoint ready (Sprint 1).' });
  });
};
