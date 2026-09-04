/**
 * Route helpers (mirrors elite-cbt-api/src/services/routesHelper.js).
 *
 * Admin roles: admin, branchadmin, superadmin, developer
 * Staff roles: admin, branchadmin, superadmin, developer, teacher, exam_officer
 */
const { isStaffRole, isAdminRole } = require('../config/config');

/**
 * Q3 class-scope guard. Collaboration and teacher-intelligence routes must
 * never trust a caller-supplied class_id by itself.
 */
async function hasClassAccess(user, classId) {
  if (!user || !String(classId || '').trim()) return false;
  const role = normaliseUserType(user);
  const classCode = String(classId).trim();
  if (isAdminRole(role) && role.includes('superadmin')) return true;

  const db = require('../models');
  const schoolId = String(user.school_id || '').trim();
  if (!schoolId) return false;

  try {
    if (role === 'student') {
      const rows = await db.sequelize.query(
        `SELECT 1 FROM students
         WHERE admission_no = :adm AND school_id = :school AND class_code = :classCode
         LIMIT 1`,
        {
          replacements: {
            adm: String(user.admission_no || user.id || ''),
            school: schoolId,
            classCode,
          },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );
      return Array.isArray(rows) && rows.length > 0;
    }

    if (role.includes('parent')) {
      const [rows] = await db.content.query(
        `SELECT 1 FROM kids_children
         WHERE school_id = :school AND class_code = :classCode
           AND ((parent_user_id IS NOT NULL AND parent_user_id = :parentId)
             OR (parent_phone IS NOT NULL AND parent_phone = :phone))
         LIMIT 1`,
        {
          replacements: {
            school: schoolId,
            classCode,
            parentId: String(user.id || user.user_id || ''),
            phone: String(user.phone || ''),
          },
        }
      );
      return Array.isArray(rows) && rows.length > 0;
    }

    if (role === 'teacher') {
      const teacherRows = await db.sequelize.query(
        `SELECT 1
         FROM active_teacher_classes tc
         JOIN teachers t ON t.id = tc.teacher_id
         WHERE t.user_id = :userId AND tc.school_id = :school AND tc.class_code = :classCode
         LIMIT 1`,
        {
          replacements: { userId: String(user.id || user.user_id || ''), school: schoolId, classCode },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      ).catch(() => []);
      if (Array.isArray(teacherRows) && teacherRows.length > 0) return true;

      const roleRows = await db.sequelize.query(
        `SELECT 1
         FROM class_role cr
         JOIN teachers t ON t.id = cr.teacher_id
         WHERE t.user_id = :userId AND cr.school_id = :school AND cr.class_code = :classCode
         LIMIT 1`,
        {
          replacements: { userId: String(user.id || user.user_id || ''), school: schoolId, classCode },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      ).catch(() => []);
      return Array.isArray(roleRows) && roleRows.length > 0;
    }

    // Other staff may inspect classes in their own school. Require the class
    // to exist in the shared school data rather than trusting the query string.
    const rows = await db.sequelize.query(
      `SELECT 1 FROM students WHERE school_id = :school AND class_code = :classCode LIMIT 1`,
      {
        replacements: { school: schoolId, classCode },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    // Fail closed for privacy-sensitive Q3 data.
    return false;
  }
}

async function requireClassAccess(req, classId) {
  if (!req?.user) return { ok: false, status: 401, body: { success: false, message: 'Authentication required.' } };
  const allowed = await hasClassAccess(req.user, classId);
  return allowed
    ? { ok: true }
    : { ok: false, status: 403, body: { success: false, message: 'You do not have access to this class.' } };
}

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
 * Three linkage paths are checked:
 *   1. kids_parent_links  (phone-based login → parent_phone → child_admission_no)
 *   2. kids_children      (ecosystem JWT → parent_user_id → admission_no)
 *   3. students.parent_id = parents.parent_id  (EliteSMS parent → student link)
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

  // Path 3: EliteSMS parent link (users.id → parents.user_id → parents.parent_id → students.parent_id → students.admission_no)
  if (parentId) {
    const [rows] = await db.sequelize.query(
      `SELECT 1 FROM parents p
       JOIN students s ON s.parent_id = p.parent_id
       WHERE p.user_id = :uid AND s.admission_no = :adm LIMIT 1`,
      { replacements: { uid: parentId, adm: requested } },
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
  hasClassAccess,
  requireClassAccess,
};
