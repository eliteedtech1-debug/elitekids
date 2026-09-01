/**
 * Flagship kids school seeder (mirrors elite-cbt-api/src/seeders/flagshipSchoolSeed.js).
 *
 * Creates the platform's own demo school (short_name = 'kids',
 * URL: kids.elitekids.com.ng) where parents/teachers can try the nursery
 * learning app. Idempotent — safe to run on every boot.
 */
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../models');

const FLAGSHIP_SCHOOL_ID = 'SCH-KIDS';
const FLAGSHIP_SHORT_NAME = 'elite';
// Short names that resolve to the flagship school (primary + back-compat aliases)
const FLAGSHIP_ALIASES = ['kids', 'practice'];
// The canonical model-school display name (owned by Elite EduTech Systems Ltd)
const FLAGSHIP_NAME = 'Elite EduTech Systems Ltd — Model School';

/** Subdomains + base domains that count as the flagship kids portal. */
const FLAGSHIP_SUBDOMAINS = ['elite', 'kids', 'practice'];
const FLAGSHIP_BASE_DOMAINS = ['elitekids.com.ng', 'elitekids.com'];

/** Domain fragments used to recognise the flagship base domains. */
const FLAGSHIP_DOMAINS = ['elitekids'];

/** Map an alias short_name to the flagship school id (or null if not an alias). */
function flagshipIdForAlias(shortName) {
  const sn = String(shortName || '').trim().toLowerCase();
  if (!sn) return null;
  if (sn === FLAGSHIP_SHORT_NAME || FLAGSHIP_ALIASES.includes(sn)) return FLAGSHIP_SCHOOL_ID;
  return null;
}

/** Map an alias short_name to the flagship school id (or null if not an alias). */
function flagshipIdForAlias(shortName) {
  const sn = String(shortName || '').trim().toLowerCase();
  if (!sn) return null;
  if (sn === FLAGSHIP_SHORT_NAME || FLAGSHIP_ALIASES.includes(sn)) return FLAGSHIP_SCHOOL_ID;
  return null;
}

/**
 * Is this request coming from the flagship kids portal? (Used to gate
 * self-registration into SCH-KIDS only — not a security boundary.)
 */
function isFlagshipRequest(req) {
  const DEV_ALLOWED = ['localhost', '127.0.0.1'];
  const candidates = [
    req.headers?.['x-forwarded-host'],
    req.headers?.host,
    req.get?.('host'),
    req.headers?.origin,
    req.headers?.referer,
  ].filter(Boolean);

  return candidates.some((raw) => {
    const clean = String(raw)
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();
    if (!clean) return false;
    if (DEV_ALLOWED.includes(clean.split('.')[0])) return true;
    if (FLAGSHIP_BASE_DOMAINS.includes(clean)) return true;
    return (
      FLAGSHIP_DOMAINS.some((d) => clean.includes(d)) &&
      FLAGSHIP_SUBDOMAINS.includes(clean.split('.')[0])
    );
  });
}

async function ensureFlagshipKidsSchool() {
  try {
    const existing = await db.sequelize
      .query(
        `SELECT school_id, school_name, short_name FROM school_setup WHERE school_id = :sid OR short_name IN (:aliases) LIMIT 1`,
        { replacements: { sid: FLAGSHIP_SCHOOL_ID, aliases: [FLAGSHIP_SHORT_NAME, ...FLAGSHIP_ALIASES] }, type: db.sequelize.QueryTypes.SELECT }
      )
      .catch(() => []);
    if (existing.length) {
      // Idempotent rebrand: keep SCH-KIDS id, adopt the `elite` short name and
      // the model-school display name (owned by Elite EduTech Systems Ltd).
      const sid = existing[0].school_id;
      if (String(existing[0].short_name || '') !== FLAGSHIP_SHORT_NAME
          || String(existing[0].school_name || '') !== FLAGSHIP_NAME) {
        await db.sequelize.query(
          `UPDATE school_setup SET short_name = :sn, school_name = :name, updated_at = NOW() WHERE school_id = :sid`,
          { replacements: { sn: FLAGSHIP_SHORT_NAME, name: FLAGSHIP_NAME, sid } }
        ).catch((e) => console.error('⚠️ Flagship rebrand skipped:', e.message));
      }
      return { school_id: sid, created: false };
    }

    const t = await db.sequelize.transaction();
    const branch_id = `BRN${Date.now()}`.slice(0, 20);

    await db.sequelize
      .query(
        `INSERT INTO school_setup
           (school_id, school_name, short_name, school_motto, status, nursery_section,
            kids_stand_alone, is_onboarding, school_url, state, created_at, updated_at)
         VALUES (:sid, :name, :sn, :motto, 'Active', 1, 1, 1, :url, 'Federal Capital Territory', NOW(), NOW())`,
        {
          replacements: {
            sid: FLAGSHIP_SCHOOL_ID,
            name: FLAGSHIP_NAME,
            sn: FLAGSHIP_SHORT_NAME,
            motto: 'Learn, play and grow — one game at a time.',
            url: `https://${FLAGSHIP_SHORT_NAME}.elitekids.com.ng`,
          },
          transaction: t,
        }
      )
      .catch((e) => {
        throw new Error(`school_setup insert failed: ${e.message}`);
      });

    await db.sequelize
      .query(
        `INSERT INTO school_locations (branch_id, school_id, branch_name, address, status, created_at, updated_at)
         VALUES (:bid, :sid, :branch_name, 'Online', 'Active', NOW(), NOW())`,
        {
          replacements: { bid: branch_id, sid: FLAGSHIP_SCHOOL_ID, branch_name: `${FLAGSHIP_NAME} - Online` },
          transaction: t,
        }
      )
      .catch(() => { /* school_locations may not exist — skip gracefully */ });

    await t.commit();
    return { school_id: FLAGSHIP_SCHOOL_ID, created: true };
  } catch (err) {
    console.error('⚠️ Flagship kids school seed skipped:', err.message);
    return { school_id: FLAGSHIP_SCHOOL_ID, created: false, error: err.message };
  }
}

async function ensureFlagshipKidsAdmin() {
  try {
    const [admin] = await db.sequelize
      .query(
        `SELECT id FROM users WHERE school_id = :sid AND LOWER(email) = 'admin@elitekids.ng' LIMIT 1`,
        { replacements: { sid: FLAGSHIP_SCHOOL_ID }, type: db.sequelize.QueryTypes.SELECT }
      )
      .catch(() => []);
    if (admin) return { created: false };

    const hash = await bcrypt.hash('Admin@2026', 10);
    await db.sequelize
      .query(
        `INSERT INTO users (name, email, password, role, user_type, school_id, branch_id,
           status, is_activated, activated_at, activation_method, must_change_password, first_login_completed, createdAt, updatedAt)
         VALUES (:name, :email, :pwd, 'Admin', 'Admin', :sid, :bid, 'active', 1, NOW(), 'manual_admin', 0, 1, NOW(), NOW())`,
        {
          replacements: {
            name: 'Elite Kids Admin',
            email: 'admin@elitekids.ng',
            pwd: hash,
            sid: FLAGSHIP_SCHOOL_ID,
            bid: 'BRN',
          },
        }
      )
      .catch((e) => console.error('⚠️ Flagship kids admin seed skipped:', e.message));

    return { created: true };
  } catch (err) {
    console.error('⚠️ Flagship kids admin seed skipped:', err.message);
    return { created: false };
  }
}

module.exports = {
  ensureFlagshipKidsSchool,
  ensureFlagshipKidsAdmin,
  FLAGSHIP_SCHOOL_ID,
  FLAGSHIP_SHORT_NAME,
  FLAGSHIP_ALIASES,
  flagshipIdForAlias,
  isFlagshipRequest,
};
