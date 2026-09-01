// Passport JWT strategy — validates the SHARED ecosystem token against the
// main school DB (mirrors elite-cbt-api/src/config/passport.js).
require('dotenv').config();

const { Strategy, ExtractJwt } = require('passport-jwt');
const db = require('../models');

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};

module.exports = (passport) => {
  if (!process.env.JWT_SECRET_KEY) {
    console.error('❌ CRITICAL ERROR: JWT_SECRET_KEY is not defined!');
    console.error('   It must equal elite-api\'s JWT_SECRET_KEY — ecosystem tokens are shared.');
    return;
  }

  opts.secretOrKey = process.env.JWT_SECRET_KEY;

  passport.use(
    new Strategy(opts, async (jwt_payload, done) => {
      try {
        const { user_type, id } = jwt_payload;
        if (!user_type) return done(null, false);

        // ── Role priority: a genuine TEACHER record can only authenticate as
        //    teacher (mirrors elite-cbt-api) ───────────────────────────────
        if (id) {
          let teacherRecord = [];
          try {
            teacherRecord = await db.sequelize.query(
              `SELECT * FROM teachers WHERE user_id = :user_id LIMIT 1`,
              { replacements: { user_id: id }, type: db.Sequelize.QueryTypes.SELECT }
            );
          } catch (_) { /* teachers table may not exist — skip */ }

          if (teacherRecord.length > 0) {
            const teacherRole = String(teacherRecord[0].user_type || teacherRecord[0].role || '').toLowerCase();
            if (teacherRole === 'teacher' && user_type.toLowerCase() !== 'teacher') {
              console.warn(`⚠️ User ${id} has a TEACHER record but tried to authenticate as ${user_type}. Blocking...`);
              return done(null, false);
            }
          }
        }

        // ── Student auth (tablet mode): admission_no + school_id ──────────
        if (user_type.toLowerCase() === 'student') {
          const { admission_no, school_id } = jwt_payload;
          if (!admission_no) return done(null, false);
          const [student] = await db.sequelize.query(
            `SELECT * FROM students WHERE admission_no = :admission_no AND school_id = :school_id LIMIT 1`,
            { replacements: { admission_no, school_id }, type: db.Sequelize.QueryTypes.SELECT }
          );
          return student ? done(null, student) : done(null, false);
        }

        // ── Parent auth ──────────────────────────────────────────────────
        if (user_type.toLowerCase() === 'parent') {
          const { phone, children, id: parentId, school_id: parentSchoolId } = jwt_payload;
          // kidsParent.js tokens carry phone + children — lightweight session, but
          // keep id/school_id so subscription scope (kidsSubscription) can resolve
          // the parent (flagship parent payments need user.id).
          if (phone) {
            return done(null, {
              user_type: 'parent',
              phone,
              children: children || [],
              ...(parentId ? { id: parentId } : {}),
              ...(parentSchoolId ? { school_id: parentSchoolId } : {}),
            });
          }
          // Email/username parent tokens (/users/login) carry id — resolve the full
          // row so school/branch context survives (mode-lock b1 contract).
          if (!jwt_payload.id) return done(null, false);
          const [userRow] = await db.sequelize.query(
            `SELECT * FROM users WHERE id = :id LIMIT 1`,
            { replacements: { id: jwt_payload.id }, type: db.Sequelize.QueryTypes.SELECT }
          );
          if (userRow) {
            const normalized = { ...userRow, user_type: userRow.user_type || userRow.role || 'parent' };
            return done(null, normalized);
          }
          const [parentRow] = await db.sequelize.query(
            `SELECT p.*, 'parent' AS user_type FROM parents p WHERE p.user_id = :id LIMIT 1`,
            { replacements: { id: jwt_payload.id }, type: db.Sequelize.QueryTypes.SELECT }
          ).catch(() => []);
          if (parentRow) return done(null, parentRow);
          return done(null, false);
        }

        // ── Non-student auth (Admin / Teacher) ─────────────────────────
        if (!id) return done(null, false);

        const [userRow] = await db.sequelize.query(
          `SELECT * FROM users WHERE id = :id LIMIT 1`,
          { replacements: { id }, type: db.Sequelize.QueryTypes.SELECT }
        );
        if (userRow) {
          const normalized = { ...userRow, user_type: userRow.user_type || userRow.role || 'Admin' };
          return done(null, normalized);
        }

        // ── Parent fallback: parents live in the `parents` table ──────────
        const [parentRow] = await db.sequelize.query(
          `SELECT p.*, 'parent' AS user_type FROM parents p WHERE p.user_id = :id LIMIT 1`,
          { replacements: { id }, type: db.Sequelize.QueryTypes.SELECT }
        ).catch(() => []);
        if (parentRow) return done(null, parentRow);

        console.error('❌ User not found for id:', id);
        return done(null, false);
      } catch (err) {
        console.error('❌ Passport JWT Strategy Error:', err.message);
        return done(err, false);
      }
    })
  );
};
