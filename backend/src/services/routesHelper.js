/**
 * Route helpers (mirrors elite-cbt-api/src/services/routesHelper.js).
 *
 * Admin roles: admin, branchadmin, superadmin, developer
 * Staff roles: admin, branchadmin, superadmin, developer, teacher, exam_officer
 */
const { isStaffRole, isAdminRole } = require('../config/config');

/**
 * Normalise a user object's user_type to lowercase for consistent comparison.
 * Returns the normalised user_type string.
 */
function normaliseUserType(user) {
  return String((user && (user.user_type || user.role)) || '').toLowerCase();
}

/** Role gate: bitwise access-level check against req.user.user_type. */
const allowOnly = (accessLevel, handler) => (req, res) => {
  const { config } = require('../config/config');
  const userType = normaliseUserType(req.user);
  const roleBit =
    userType.includes('superadmin') || userType.includes('developer')
      ? config.userRoles.superAdmin
      : userType.includes('admin') || userType.includes('branchadmin')
        ? config.userRoles.admin
        : userType.includes('teacher')
          ? config.userRoles.user
          : userType.includes('parent')
            ? config.userRoles.user
            : config.userRoles.guest;

  if ((accessLevel & roleBit) !== roleBit) {
    return res.status(403).json({ success: false, message: 'Access denied for this role.' });
  }
  return handler(req, res);
};

/**
 * Convenience middleware: require any staff role.
 * Staff = admin | branchadmin | superadmin | developer | teacher | exam_officer
 */
function requireStaff(req, res, next) {
  const userType = normaliseUserType(req.user);
  if (!isStaffRole(userType)) {
    return res.status(403).json({ success: false, message: 'Staff access required.' });
  }
  next();
}

/**
 * Convenience middleware: require admin-level role.
 * Admin = admin | branchadmin | superadmin | developer
 */
function requireAdmin(req, res, next) {
  const userType = normaliseUserType(req.user);
  if (!isAdminRole(userType)) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

/** Parent/child data guard: a student may only act on their own admission_no. */
const denyForeignChildData = (req) => {
  const user = req.user;
  if (!user) return { status: 401, body: { success: false, message: 'Authentication required.' } };

  const requested =
    req.params?.admission_no ||
    req.params?.admissionNo ||
    req.body?.child_admission_no ||
    req.query?.admission_no ||
    req.query?.admissionNo;

  const isStudent = String(user.user_type || '').toLowerCase() === 'student';
  if (requested && isStudent) {
    const mine = String(user.admission_no || user.id || '');
    if (String(requested).trim() !== mine) {
      return {
        status: 403,
        body: { success: false, message: 'You can only access your own data' },
      };
    }
  }
  return null;
};

module.exports = {
  allowOnly,
  denyForeignChildData,
  requireStaff,
  requireAdmin,
  isStaffRole,
  isAdminRole,
  normaliseUserType,
};
