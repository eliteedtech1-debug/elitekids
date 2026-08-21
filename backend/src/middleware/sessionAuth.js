const jwt = require('jsonwebtoken');

/**
 * Generate a JWT login token with the SAME payload shape as elite-api /
 * elite-cbt-api so tokens are interchangeable across the ecosystem.
 * Students use admission_no as id; staff/parents use their user id.
 */
const generateLoginToken = (user, expiresIn = '1h') => {
  const now = new Date();
  const payload = {
    id: user.id,
    user_type: user.user_type,
    email: user.email,
    school_id: user.school_id,
    branch_id: user.branch_id,
    lastActivity: now.toISOString(),
    iat: Math.floor(now.getTime() / 1000),
    sessionCreated: now.toISOString(),
    renewalCount: 0,
    // Multi-school selection flow (mirrors elite-cbt-api): when the caller
    // passes { email, phase: 'school_selection' } the claim survives in the
    // token so /auth/select-school can distinguish it from a normal session.
    ...(user.phase ? { phase: user.phase } : {}),
  };

  // Students carry admission_no + name (used by the passport strategy + child linking)
  if (String(user.user_type || '').toLowerCase() === 'student') {
    payload.admission_no = user.admission_no || user.id;
    if (user.student_name) payload.student_name = user.student_name;
  }

  return jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn });
};

module.exports = { generateLoginToken };
