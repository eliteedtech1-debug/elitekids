'use strict';

/**
 * Who confirms a jump-ahead — resolved most-specific-wins.
 *
 *   child  →  class  →  school  →  platform default
 *
 * The assessment itself never varies: the same games, the same threshold and the
 * same per-unit coverage rule decide eligibility for every school. This module
 * only decides whether a PASS continues to a person for confirmation or unlocks
 * on its own. That lets a school run supervised by default and hand auto-jump to
 * a selected child who already works ahead — or run self-paced and hold one
 * child back under close review.
 *
 * A stored scope always beats the platform default, in BOTH directions:
 *   - auto accepted for a normal school (staff opted in, e.g. a fast learner);
 *   - auto REFUSED for a self-paced flagship child (staff opted that child into
 *     review), which is why the default is consulted last and not first.
 *
 * Fails closed: if the policy table cannot be read, resolution falls through to
 * the platform default, and an unresolvable school is never treated as
 * self-paced (services/selfPacedSchools.js).
 */

const { Op } = require('sequelize');
const { isSelfPacedSchool } = require('./selfPacedSchools');

const SCOPE = Object.freeze({ SCHOOL: 'school', CLASS: 'class', CHILD: 'child' });
/** Most specific first — the order resolution walks. */
const SCOPE_ORDER = Object.freeze([SCOPE.CHILD, SCOPE.CLASS, SCOPE.SCHOOL]);

const text = (value) => String(value == null ? '' : value).trim();

/** Primary key for a scope row, e.g. 'child:NUR-001'. */
function policyRowId(scope, scopeId) {
  return `${scope}:${text(scopeId)}`.slice(0, 64);
}

/**
 * Pure resolution over already-loaded rows. No DB, no env reads beyond the
 * platform default — so the precedence rules are unit-testable.
 */
function resolvePolicy({ schoolId, classCode, admissionNo, rows, env = process.env }) {
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && row.scope && row.scope_id != null) byKey.set(`${row.scope}:${row.scope_id}`, row);
  }

  const candidates = [
    { scope: SCOPE.CHILD, scope_id: text(admissionNo) },
    { scope: SCOPE.CLASS, scope_id: text(classCode) },
    { scope: SCOPE.SCHOOL, scope_id: text(schoolId) },
  ];

  for (const candidate of candidates) {
    if (!candidate.scope_id) continue;
    const row = byKey.get(`${candidate.scope}:${candidate.scope_id}`);
    if (!row) continue;
    return {
      auto_approve: !!row.auto_approve,
      source: candidate.scope,
      scope_id: candidate.scope_id,
      set_by: row.set_by || null,
      note: row.note || null,
    };
  }

  if (isSelfPacedSchool(schoolId, env)) {
    return {
      auto_approve: true,
      source: 'platform_self_paced',
      scope_id: text(schoolId),
      set_by: null,
      note: null,
    };
  }

  return { auto_approve: false, source: 'platform_default', scope_id: null, set_by: null, note: null };
}

/** All rows that could apply to one child — at most three, in one query. */
async function loadPolicyRows(db, { schoolId, classCode, admissionNo }) {
  if (!db.KidCheckpointPolicy) return [];
  const or = [];
  if (text(admissionNo)) or.push({ scope: SCOPE.CHILD, scope_id: text(admissionNo) });
  if (text(classCode)) or.push({ scope: SCOPE.CLASS, scope_id: text(classCode) });
  if (text(schoolId)) or.push({ scope: SCOPE.SCHOOL, scope_id: text(schoolId) });
  if (!or.length) return [];
  try {
    return await db.KidCheckpointPolicy.findAll({ where: { [Op.or]: or } });
  } catch (err) {
    // A missing table is a rollout state, not a reason to fail a child's screen:
    // fall through to the platform default.
    console.warn(`loadPolicyRows unavailable (run database/kids-checkpoint-exams-migration.js): ${err.message}`);
    return [];
  }
}

/**
 * The effective policy for a child. Loads the child row only for what the caller
 * did not already know (so the issue path, which has it, costs no extra query).
 */
async function policyFor(db, { admissionNo, schoolId, classCode, env = process.env }) {
  let resolvedSchool = text(schoolId);
  let resolvedClass = text(classCode);

  if ((!resolvedSchool || !resolvedClass) && text(admissionNo) && db.KidChild) {
    try {
      const child = await db.KidChild.findOne({ where: { admission_no: text(admissionNo) }, attributes: ['school_id', 'class_code'] });
      if (child) {
        if (!resolvedSchool) resolvedSchool = text(child.school_id);
        if (!resolvedClass) resolvedClass = text(child.class_code);
      }
    } catch (err) {
      /* keep whatever the caller supplied */
    }
  }

  const rows = await loadPolicyRows(db, { schoolId: resolvedSchool, classCode: resolvedClass, admissionNo });
  const effective = resolvePolicy({
    schoolId: resolvedSchool,
    classCode: resolvedClass,
    admissionNo,
    rows,
    env,
  });

  return { ...effective, school_id: resolvedSchool || null, class_code: resolvedClass || null, rows };
}

/**
 * How an automatic unlock is labelled in the record. A platform default and a
 * staff-granted policy are both "no human clicked", but they are NOT the same
 * decision — the audit trail must say which one happened.
 */
function autoDecisionLabels(policy) {
  if (policy && policy.source === 'platform_self_paced') {
    return {
      decided_by: 'self:flagship-self-paced',
      note: 'Self-paced flagship exception: confirmed without a teacher (no active teacher by design).',
    };
  }
  const scope = policy ? policy.source : 'policy';
  const setBy = policy && policy.set_by ? ` set by ${policy.set_by}` : '';
  return {
    decided_by: `auto:policy:${scope}`.slice(0, 64),
    note: `Auto-confirmed by the ${scope} jump-ahead policy${setBy} — no human confirmation required for this learner.`,
  };
}

module.exports = {
  SCOPE,
  SCOPE_ORDER,
  policyRowId,
  resolvePolicy,
  loadPolicyRows,
  policyFor,
  autoDecisionLabels,
};
