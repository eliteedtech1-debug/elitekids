const passport = require('passport');

/**
 * conditionalAuth — attempts JWT auth but lets the request through even if it
 * fails (semi-public routes like school lookup).
 */
const conditionalAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (user) req.user = user;
    next();
  })(req, res, next);
};

/** authBypass — completely skips authentication (dev / debug routes only). */
const authBypass = (req, res, next) => next();

module.exports = { conditionalAuth, authBypass };
