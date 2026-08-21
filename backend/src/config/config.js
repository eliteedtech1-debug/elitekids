// Role access levels (mirrors elite-cbt-api/src/config/config.js)
var config = (module.exports = {});

const userRoles = (config.userRoles = {
  guest: 1,
  user: 2,
  admin: 4,
  branchAdmin: 4, // branchadmin has same privileges as admin
  superAdmin: 8,
});

// ── Role helpers (used across controllers/middleware) ──────────────────────
// Maps elite-api user_type strings → normalized role levels.
const STAFF_TYPES = ['admin', 'branchadmin', 'superadmin', 'developer', 'exam_officer'];
const ADMIN_TYPES = ['admin', 'branchadmin', 'superadmin', 'developer'];

/** True if user_type is any staff role (admin/branchadmin/teacher/superadmin/exam_officer). */
function isStaffRole(userType) {
  const t = String(userType || '').toLowerCase();
  return STAFF_TYPES.some((r) => t.includes(r)) || t.includes('teacher');
}

/** True if user_type is admin-level (admin/branchadmin/superadmin/developer). */
function isAdminRole(userType) {
  const t = String(userType || '').toLowerCase();
  return ADMIN_TYPES.some((r) => t.includes(r));
}

/** True if user_type is a student. */
function isStudentRole(userType) {
  return String(userType || '').toLowerCase() === 'student';
}

/** True if user_type is a parent. */
function isParentRole(userType) {
  return String(userType || '').toLowerCase() === 'parent';
}

config.isStaffRole = isStaffRole;
config.isAdminRole = isAdminRole;
config.isStudentRole = isStudentRole;
config.isParentRole = isParentRole;
config.STAFF_TYPES = STAFF_TYPES;
config.ADMIN_TYPES = ADMIN_TYPES;

config.accessLevels = {
  guest: userRoles.guest | userRoles.user | userRoles.admin | userRoles.superAdmin,
  user: userRoles.user | userRoles.admin | userRoles.superAdmin,
  admin: userRoles.admin | userRoles.superAdmin,
  superAdmin: userRoles.superAdmin,
};
