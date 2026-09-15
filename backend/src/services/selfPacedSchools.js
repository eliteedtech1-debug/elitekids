'use strict';

/**
 * Self-paced flagship schools — the ONE exception to "a human confirms a
 * jump-ahead".
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A passing checkpoint assessment is only a RECOMMENDATION. The unlock happens
 * when a teacher or admin confirms it (POST /kids/checkpoint/:id/approve),
 * because a child cannot be the judge of whether they have the prerequisite.
 *
 * ── The exception (this file) ───────────────────────────────────────────────
 * The flagship/showcase tenants are self-paced by design: children sign up
 * through a parent with no active teacher, so there is nobody to confirm. There,
 * a checkpoint that meets the threshold confirms itself and the unlock lands
 * immediately.
 *
 * It is an explicit allow-list — not a role check, not a global boolean —
 * because membership grants an *unattended* unlock. It is deliberately NOT a
 * change to the default: a new school inherits teacher confirmation until it is
 * named here (or in KIDS_SELF_PACED_SCHOOLS).
 *
 * The exception does NOT relax any integrity rule. Same threshold, same
 * per-unit coverage requirement, same ban on recording mastery (an exempt row,
 * never a 'test'), same age-band ceiling. Only the confirmer changes — and
 * because no human is throttling attempts, the self-approving path additionally
 * enforces a re-attempt cool-down in the controller.
 */

/** Flagship/showcase tenants. Matches the platform + placement flagship set. */
const DEFAULT_SELF_PACED_SCHOOL_IDS = ['SCH-ELITE', 'SCH-KIDS'];

/** Comma-separated override, e.g. KIDS_SELF_PACED_SCHOOLS=SCH-ELITE,SCH-NEW. */
const ENV_SELF_PACED_SCHOOLS = 'KIDS_SELF_PACED_SCHOOLS';

function selfPacedSchoolIds(env = process.env) {
  const raw = env[ENV_SELF_PACED_SCHOOLS];
  if (raw === undefined || String(raw).trim() === '') {
    return new Set(DEFAULT_SELF_PACED_SCHOOL_IDS);
  }
  return new Set(
    String(raw)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

/** True when this school runs self-paced with no active teacher by design. */
function isSelfPacedSchool(schoolId, env = process.env) {
  return selfPacedSchoolIds(env).has(String(schoolId || '').trim());
}

module.exports = {
  DEFAULT_SELF_PACED_SCHOOL_IDS,
  ENV_SELF_PACED_SCHOOLS,
  selfPacedSchoolIds,
  isSelfPacedSchool,
};
