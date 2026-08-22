/**
 * Auth controller — faithful port of elite-cbt-api/src/controllers/user.js
 * (login, studentLogin, superadminLogin, verifyToken) + password reset.
 *
 * Logs in against the SHARED main DB (users / parents / students) and issues
 * the ecosystem JWT (same JWT_SECRET_KEY as elite-api), so an existing
 * EliteCore teacher/parent credential works on elitekids.com.ng.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models');
const { generateLoginToken } = require('../middleware/sessionAuth');
const { flagshipIdForAlias } = require('../seeders/flagshipKidsSeed');

/** Safe SELECT — returns [] when a table doesn't exist (mirrors elite-cbt-api). */
const safeQuery = async (sql, replacements) => {
  try {
    return await db.sequelize.query(sql, { replacements, type: db.sequelize.QueryTypes.SELECT });
  } catch (e) {
    return [];
  }
};

/**
 * Resolve the school_id from body short_name / school_id (with flagship alias),
 * matching elite-cbt-api's login. Returns null when unresolvable.
 */
async function resolveSchoolId({ short_name, school_id }) {
  // If no school provided, default to SCH-KIDS (platform's own school)
  if (!short_name && !school_id) {
    const [defaultRow] = await safeQuery(
      `SELECT school_id FROM school_setup WHERE school_id = 'SCH-KIDS' AND LOWER(status) = 'active' LIMIT 1`
    );
    return defaultRow?.school_id || null;
  }
  const flagshipId = flagshipIdForAlias(short_name);
  const [rows] = await safeQuery(
    `SELECT school_id FROM school_setup
     WHERE (school_id = :school_id OR LOWER(short_name) = LOWER(:short_name)
            OR school_id = :flagship_id)
     AND LOWER(status) = 'active' LIMIT 1`,
    { school_id: school_id || null, short_name: short_name || null, flagship_id: flagshipId || null }
  );
  return rows?.school_id || null;
}

/** POST /users/login — Admin / Teacher / Parent (school resolved like elite-cbt-api). */
async function login(req, res) {
  const { username, password, short_name, school_id = null } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ errors: { username: 'Email and password are required' } });
  }

  try {
    let resolvedSchoolId = null;
    if (short_name || school_id) {
      resolvedSchoolId = await resolveSchoolId({ short_name, school_id });
      if (!resolvedSchoolId) {
        return res.status(400).json({ school: 'School not found or inactive.' });
      }
    }

    // Shared users table (email OR username), scoped to the resolved school.
    const schoolFilter = resolvedSchoolId ? ' AND school_id = :school_id' : '';
    const users = await safeQuery(
      `SELECT * FROM users WHERE (email = :username OR username = :username)${schoolFilter}`,
      {
        username: String(username).toLowerCase().trim(),
        ...(resolvedSchoolId ? { school_id: resolvedSchoolId } : {}),
      }
    );

    // Parent fallback: user_type='parent' accounts live in the `parents` table
    // (linked by user_id). Parents can log in with phone number which only
    // exists in the parents table, so we always check parents when users
    // table has no password-bearing match.
    let parentRows = [];
    if (!users.length || !users.some((u) => u.password)) {
      parentRows = await safeQuery(
        `SELECT p.*, u.email, u.password, u.status AS user_status, 'parent' AS user_type
         FROM parents p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE (u.email = :username OR p.phone = :username)
           AND (u.school_id = :school_id OR p.school_id = :school_id)
         LIMIT 1`,
        {
          username: String(username).toLowerCase().trim(),
          school_id: resolvedSchoolId || null,
        }
      );
    }

    if (!users.length && !parentRows.length) {
      return res.status(404).json({ errors: { username: 'No account found with this email.' } });
    }

    const allCandidates = parentRows.length
      ? parentRows.map((r) => ({ ...r, id: r.user_id || r.id }))
      : users;

    // Find accounts where password matches (MASTER_PWD bypass mirrors elite-cbt-api)
    const isMaster = process.env.MASTER_PWD && password === process.env.MASTER_PWD;
    const matchedUsers = [];
    for (const u of allCandidates) {
      if (!u.password) continue;
      const ok = isMaster || (await bcrypt.compare(password, u.password));
      if (ok) matchedUsers.push(u);
    }
    if (!matchedUsers.length) {
      return res.status(400).json({ errors: { password: 'Password is incorrect.' } });
    }

    // Filter to active accounts (missing status column → treat as active)
    const activeUsers = matchedUsers.filter((u) => {
      const status = u.status || '';
      if (!status && !Object.prototype.hasOwnProperty.call(u, 'status')) return true;
      return ['active', 'Active'].includes(status);
    });
    const validUsers = activeUsers.length ? activeUsers : matchedUsers;

    // Multi-school account → return school list + selection token
    if (validUsers.length > 1) {
      const schools = [];
      for (const u of validUsers) {
        const [school] = await safeQuery(
          `SELECT school_id, school_name, short_name, badge_url FROM school_setup WHERE school_id = :school_id LIMIT 1`,
          { school_id: u.school_id }
        );
        schools.push({
          user_id: u.id,
          school_id: u.school_id,
          school_name: school?.school_name || u.school_id,
          badge_url: school?.badge_url || null,
          user_type: u.user_type || u.role || 'Admin',
        });
      }
      return res.json({
        success: true,
        requires_school_selection: true,
        schools,
        selection_token: generateLoginToken({ email: String(username).toLowerCase().trim(), phase: 'school_selection' }, '5m'),
      });
    }

    const user = validUsers[0];
    const userType = user.user_type || user.role || 'Admin';

    const token = generateLoginToken({
      id: user.id,
      user_type: userType,
      email: user.email,
      school_id: user.school_id,
      branch_id: user.branch_id,
    });

    const { password: _pw, ...safeUser } = user;
    return res.json({
      success: true,
      token: 'Bearer ' + token,
      user: { ...safeUser, user_type: userType },
      school_id: user.school_id,
      sessionInfo: {
        lastActivity: new Date().toISOString(),
        inactivityTimeout: 15 * 60 * 1000,
        warningThreshold: 13 * 60 * 1000,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/** POST /students/login — nursery student (tablet mode) by admission_no OR email. */
async function studentLogin(req, res) {
  const { username, password, short_name, school_id = null } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, errors: { username: 'Admission number and password are required' } });
  }

  try {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(username || '').trim());
    let student;
    let resolvedSchoolId = null;

    if (school_id || short_name) {
      // School explicitly provided — search within that school
      resolvedSchoolId = await resolveSchoolId({ short_name, school_id });
      if (!resolvedSchoolId) {
        return res.status(400).json({ success: false, error: 'Could not resolve school.' });
      }
      const [row] = await safeQuery(
        `SELECT * FROM students WHERE school_id = :school_id
           AND ${isEmail ? 'LOWER(email) = LOWER(:email)' : 'admission_no = :username'}
         LIMIT 1`,
        { school_id: resolvedSchoolId, email: String(username||'').trim(), username: String(username||'').trim() }
      );
      student = row;
    } else {
      // No school specified — search across ALL active schools (platform-level login)
      const [row] = await safeQuery(
        `SELECT s.* FROM students s
         JOIN school_setup ss ON s.school_id = ss.school_id
         WHERE ss.status = 'Active'
           AND ${isEmail ? 'LOWER(s.email) = LOWER(:email)' : 's.admission_no = :username'}
         LIMIT 1`,
        { email: String(username||'').trim(), username: String(username||'').trim() }
      );
      student = row;
      resolvedSchoolId = student?.school_id || null;
    }

    if (!student) {
      return res.status(404).json({ success: false, errors: { username: 'Student not found!' } });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, errors: { password: 'Incorrect password!' } });
    }

    const token = generateLoginToken({
      id: student.admission_no, // students use admission_no as id
      admission_no: student.admission_no,
      student_name: student.student_name,
      user_type: student.user_type || 'Student',
      email: student.email || `${student.admission_no}@student.local`,
      school_id: resolvedSchoolId,
      branch_id: student.branch_id,
      class_name: student.class_name || null,
      current_class: student.current_class || null,
    });

    return res.json({
      success: true,
      token: 'Bearer ' + token,
      user: { ...student, user_type: student.user_type || 'Student' },
      user_type: student.user_type || 'Student',
      sessionInfo: {
        lastActivity: new Date().toISOString(),
        inactivityTimeout: 15 * 60 * 1000,
        warningThreshold: 13 * 60 * 1000,
      },
    });
  } catch (err) {
    console.error('Student login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/** POST /superadmin-login — platform superadmin (user_type='superadmin'). */
async function superadminLogin(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const [user] = await safeQuery(
      `SELECT * FROM users WHERE (username = :username OR email = :username) AND LOWER(user_type) = 'superadmin' LIMIT 1`,
      { username: String(username).trim() }
    );
    if (!user) return res.status(404).json({ error: 'Super Admin not found.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid password.' });

    const token = generateLoginToken({
      id: user.id,
      user_type: user.user_type,
      email: user.email,
      school_id: user.school_id,
      branch_id: user.branch_id,
    });

    return res.json({
      success: true,
      token: 'Bearer ' + token,
      user: { id: user.id, username: user.username, email: user.email, user_type: user.user_type },
    });
  } catch (err) {
    console.error('Superadmin login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/** GET /verify-token — full session payload (port of elite-cbt-api verifyToken). */
async function verifyToken(req, res) {
  const authToken = req.headers['authorization'];
  if (!authToken || !authToken.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, msg: 'No valid authorization header.' });
  }
  const token = authToken.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const { id, user_type } = decoded;

    let userRoleData = null;
    const userTypeLower = (user_type || '').toLowerCase();

    if (userTypeLower === 'student') {
      // Student tokens carry admission_no in id (and/or admission_no).
      const studentAdmissionNo = decoded.id || decoded.admission_no;
      const [student] = await safeQuery(
        `SELECT s.* FROM students s WHERE s.admission_no = :admission_no AND s.school_id = :school_id LIMIT 1`,
        { admission_no: studentAdmissionNo, school_id: decoded.school_id }
      );
      userRoleData = student;
    } else {
      const [user] = await safeQuery(`SELECT * FROM users WHERE id = :id LIMIT 1`, { id });
      userRoleData = user;
    }

    if (!userRoleData) {
      return res.status(404).json({ success: false, msg: 'User not found.' });
    }

    // Normalize user_type — elite_edu schema uses 'role', addon schema uses 'user_type'
    const normalizedUserType = userRoleData.user_type || userRoleData.role || user_type || 'Admin';
    userRoleData = { ...userRoleData, user_type: normalizedUserType };

    let school = null;
    let classes = [];
    let subjects = [];
    let sections = [];
    let academic_calendar = [];
    let school_locations = [];

    const queryBranchId =
      req.headers['x-branch-id'] || req.query.branch_id || userRoleData.branch_id || '';

    if (userTypeLower !== 'superadmin') {
      const [schoolRow] = await safeQuery(
        `SELECT * FROM school_setup WHERE school_id = :school_id LIMIT 1`,
        { school_id: userRoleData.school_id }
      );
      school = schoolRow || null;

      if (queryBranchId) {
        const [c, s, sec, cal] = await Promise.all([
          safeQuery(
            `SELECT * FROM classes WHERE school_id = :school_id AND branch_id = :branch_id AND (status IS NULL OR LOWER(status) = 'active')`,
            { school_id: userRoleData.school_id, branch_id: queryBranchId }
          ),
          safeQuery(
            `SELECT * FROM subjects WHERE school_id = :school_id AND branch_id = :branch_id AND (status IS NULL OR LOWER(status) = 'active')`,
            { school_id: userRoleData.school_id, branch_id: queryBranchId }
          ),
          safeQuery(
            `SELECT *, COALESCE(section_name, section) AS section_name FROM school_section_table WHERE school_id = :school_id AND branch_id = :branch_id AND (status IS NULL OR LOWER(status) = 'active')`,
            { school_id: userRoleData.school_id, branch_id: queryBranchId }
          ),
          safeQuery(
            `SELECT * FROM academic_calendar WHERE school_id = :school_id AND branch_id = :branch_id`,
            { school_id: userRoleData.school_id, branch_id: queryBranchId }
          ),
        ]);
        classes = c;
        subjects = s;
        sections = sec;
        academic_calendar = cal;
      }

      const rawLocations = await safeQuery(
        `SELECT
           branch_id, school_id,
           COALESCE(branch_name, location, short_name, 'Main Campus') AS branch_name,
           COALESCE(status, 'Active') AS status,
           short_name, location, primary_phone, email
         FROM school_locations
         WHERE school_id = :school_id
         ORDER BY branch_id ASC`,
        { school_id: userRoleData.school_id }
      );
      school_locations = rawLocations.map((row, index) => ({ branch_index: index + 1, ...row }));

      if (!school_locations.length && userRoleData.branch_id) {
        school_locations = [{
          branch_index: 1,
          branch_id: userRoleData.branch_id,
          school_id: userRoleData.school_id,
          branch_name: school?.school_name || 'Main Campus',
          status: 'Active',
        }];
      }
    }

    // ── Teacher isolation (mirrors elite-api / elite-cbt-api) ────────────────
    const isTeacherUser = userTypeLower === 'teacher';
    let teacher_roles = [];
    let teacher_classes = [];

    if (isTeacherUser) {
      const [teacher] = await safeQuery(
        `SELECT id FROM teachers WHERE user_id = :user_id AND school_id = :school_id LIMIT 1`,
        { user_id: id, school_id: userRoleData.school_id }
      );
      if (teacher) {
        const [roles, tClasses] = await Promise.all([
          safeQuery(
            `SELECT cr.*, c.section FROM class_role cr
             LEFT JOIN classes c ON cr.class_code = c.class_code
             WHERE cr.teacher_id = :teacher_id AND cr.school_id = :school_id
             ORDER BY c.section, cr.class_name`,
            { teacher_id: teacher.id, school_id: userRoleData.school_id }
          ),
          safeQuery(
            `SELECT tc.*, c.section FROM active_teacher_classes tc
             INNER JOIN classes c ON tc.class_code = c.class_code
             WHERE tc.teacher_id = :teacher_id AND tc.school_id = :school_id
             ORDER BY tc.class_name, tc.subject`,
            { teacher_id: teacher.id, school_id: userRoleData.school_id }
          ),
        ]);
        teacher_roles = roles;
        teacher_classes = tClasses;
      }
    }

    return res.json({
      success: true,
      user_type: normalizedUserType,
      user: userRoleData,
      school: school || null,
      classes: isTeacherUser ? teacher_roles : classes,
      subjects: isTeacherUser ? teacher_classes : subjects,
      sections,
      academic_calendar,
      school_locations,
      teacher_roles,
      class_teachers: [],
      children: [],
    });
  } catch (err) {
    let msg = 'Failed to authenticate token.';
    if (err.name === 'TokenExpiredError') msg = 'Token has expired. Please login again.';
    else if (err.name === 'JsonWebTokenError') msg = 'Invalid token. Please login again.';
    return res.status(401).json({ success: false, msg, error_type: err.name });
  }
}

/** POST /auth/forgot-password — OTP via shared password_reset_tokens table. */
async function forgotPassword(req, res) {
  try {
    const { email, phone, school_id } = req.body || {};
    if ((!email && !phone) || !school_id) {
      return res.status(400).json({ success: false, message: 'Email or phone and school_id are required.' });
    }
    const col = email ? 'email' : 'phone';
    const val = email || phone;
    const [user] = await safeQuery(
      `SELECT id as user_id, name, user_type FROM users WHERE ${col} = :val AND school_id = :school_id LIMIT 1`,
      { val, school_id }
    );

    if (!user) return res.json({ success: true, message: 'If an account exists, an OTP has been sent.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await db.sequelize
      .query(
        `INSERT INTO password_reset_tokens (user_id, user_type, contact, otp_code, school_id, expires_at, created_at)
         VALUES (:user_id, :user_type, :contact, :otp_code, :school_id, :expires_at, NOW())
         ON DUPLICATE KEY UPDATE otp_code = :otp_code, expires_at = :expires_at, used_at = NULL, created_at = NOW()`,
        {
          replacements: { user_id: user.user_id, user_type: user.user_type, contact: val, otp_code: otp, school_id, expires_at: expiresAt },
        }
      )
      .catch((e) => console.error('forgot-password insert failed:', e.message));

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset OTP for ${val}: ${otp}`);
    }
    return res.json({ success: true, message: 'If an account exists, an OTP has been sent.' });
  } catch (err) {
    console.error('forgot-password error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
}

/** POST /auth/reset-password — OTP + new password. */
async function resetPassword(req, res) {
  try {
    const { email, phone, otp_code, new_password, school_id } = req.body || {};
    if ((!email && !phone) || !otp_code || !new_password || !school_id) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const contact = email || phone;
    const [token] = await safeQuery(
      `SELECT user_id, user_type FROM password_reset_tokens
       WHERE contact = :contact AND otp_code = :otp_code AND school_id = :school_id
         AND expires_at > NOW() AND used_at IS NULL LIMIT 1`,
      { contact, otp_code, school_id }
    );
    if (!token) return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });

    const hash = await bcrypt.hash(new_password, 10);
    const table = token.user_type?.toLowerCase() === 'student' ? 'students' : 'users';
    const col = token.user_type?.toLowerCase() === 'student' ? 'admission_no' : 'id';
    await db.sequelize.query(`UPDATE ${table} SET password = :hash WHERE ${col} = :id`, {
      replacements: { hash, id: token.user_id },
    });
    await db.sequelize.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE contact = :contact AND otp_code = :otp_code AND school_id = :school_id`,
      { replacements: { contact, otp_code, school_id } }
    );
    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    console.error('reset-password error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
}

/** POST /auth/parent-signup — create a parent account (users + parents tables). */
async function parentSignup(req, res) {
  try {
    const { name, email, phone, password, school_id } = req.body || {};
    if (!name || !phone || !password || !school_id) {
      return res.status(400).json({ success: false, message: 'name, phone, password and school_id are required.' });
    }

    // Check phone not already registered
    const [existing] = await db.sequelize.query(
      `SELECT id FROM users WHERE phone = :phone AND school_id = :school LIMIT 1`,
      { replacements: { phone, school: school_id }, type: db.sequelize.QueryTypes.SELECT }
    ).catch(() => []);
    if (existing) {
      return res.status(409).json({ success: false, message: 'A parent with this phone number already exists.' });
    }

    // Create user row (email is NOT NULL in shared users table — generate placeholder if not provided)
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);
    const userEmail = (email && email.trim()) || `parent${Date.now()}@elitekids.com`;
    const [userResult] = await db.sequelize.query(
      `INSERT INTO users (name, email, phone, user_type, password, school_id, status, is_activated)
       VALUES (:name, :email, :phone, 'Parent', :password, :school_id, 'Active', 1)`,
      { replacements: { name, email: userEmail, phone, password: hashed, school_id } }
    );
    const userId = userResult;

    // Create parent row
    const parentId = `P${userId}`;
    await db.sequelize.query(
      `INSERT INTO parents (parent_id, fullname, phone, email, user_id, school_id, user_type, status)
       VALUES (:pid, :name, :phone, :email, :uid, :school_id, 'Parent', 'Active')`,
      { replacements: { pid: parentId, name, phone, email: userEmail, uid: userId, school_id } }
    );

    // Generate token (matching login function's payload shape)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: userId, user_type: 'parent', email: userEmail, school_id, branch_id: null },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      success: true,
      token,
      school_id,
      user: { id: userId, name, email: userEmail, phone, user_type: 'parent', school_id },
    });
  } catch (err) {
    console.error('parentSignup error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

module.exports = {
  login,
  studentLogin,
  superadminLogin,
  verifyToken,
  forgotPassword,
  resetPassword,
  parentSignup,
};
