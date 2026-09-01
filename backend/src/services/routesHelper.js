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

/**
 * Extract the student/child identifier from the request (params, body, or query).
 * Returns the trimmed string or null.
 */
function extractStudentId(req) {
  const raw =
    req.params?.admission_no ||
    req.params?.admissionNo ||
    req.params?.student_id ||
    req.body?.child_admission_no ||
    req.body?.student_id ||
    req.query?.admission_no ||
    req.query?.admissionNo ||
    req.query?.student_id;
  return raw ? String(raw).trim() : null;
}

/** Parent/child data guard: a student may only act on their own admission_no. */
const denyForeignChildData = (req) => {
  const user = req.user;
  if (!user) return { status: 401, body: { success: false, message: 'Authentication required.' } };

  const requested = extractStudentId(req);
  const isStudent = String(user.user_type || '').toLowerCase() === 'student';
  if (requested && isStudent) {
    const mine = String(user.admission_no || user.id || '');
    if (requested !== mine) {
      return {
        status: 403,
        body: { success: false, message: 'You can only access your own data' },
      };
    }
  }
  return null;
};

/**
 * Parent-child ownership guard: a parent may only act on their own linked children.
 * Returns { ok: true } or a 403 response object.
 *
 * Two linkage paths are checked:
 *   1. kids_parent_links  (phone-based login → parent_phone → child_admission_no)
 *   2. kids_children      (ecosystem JWT → parent_user_id → admission_no)
 *
 * Admins and teachers bypass the check.
 */
async function requireChildOwnership(req) {
  const user = req.user;
  if (!user) return { ok: false, status: 401, body: { success: false, message: 'Authentication required.' } };

  const userType = String(user.user_type || user.role || '').toLowerCase();

  // Admin / teacher / staff — bypass
  if (isAdminRole(userType) || isStaffRole(userType)) return { ok: true };

  // Not a parent — skip (student guard handles students separately)
  if (!userType.includes('parent')) return { ok: true };

  const requested = extractStudentId(req);
  if (!requested) return { ok: true }; // no child identifier in request

  // Lazy-load db to avoid circular require at module load
  const db = require('../models');
  const phone = String(user.phone || '').trim();
  const parentId = String(user.id || user.user_id || '');

  // Path 1: kids_parent_links (phone-based)
  if (phone) {
    const [links] = await db.sequelize.query(
      `SELECT 1 FROM kids_parent_links
       WHERE parent_phone = :phone AND child_admission_no = :adm AND verified = 1 LIMIT 1`,
      { replacements: { phone, adm: requested } },
    );
    if (Array.isArray(links) && links.length > 0) return { ok: true };
  }

  // Path 2: kids_children (ecosystem JWT — parent_user_id)
  if (parentId) {
    const [rows] = await db.sequelize.query(
      `SELECT 1 FROM kids_children
       WHERE parent_user_id = :pid AND admission_no = :adm LIMIT 1`,
      { replacements: { pid: parentId, adm: requested } },
    );
    if (Array.isArray(rows) && rows.length > 0) return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    body: { success: false, message: 'This child is not linked to your account.' },
  };
}

module.exports = {
  allowOnly,
  denyForeignChildData,
  requireChildOwnership,
  extractStudentId,
  requireStaff,
  requireAdmin,
  isStaffRole,
  isAdminRole,
  normaliseUserType,
};
