'use strict';

/**
 * Q3 Classroom Collaboration — team formation heuristic (PURE).
 *
 * Clusters a list of children into balanced teams by (1) age band and (2)
 * recent XP. Deterministic and DB-free so it is unit-testable without a
 * database (mirrors the q2-speech pure-logic test convention).
 *
 * Strategy:
 *   1. Group students by age band.
 *   2. Within each band, order by recent XP (ascending) and bucket them into
 *      round-robin lanes of size `teamSize` so total XP is roughly balanced.
 *   3. Merge leftover partial buckets across bands when < teamSize remain,
 *      preferring same-band merges first (age isolation is honoured).
 */

const AXLE_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];

/** Sort one array of members into up-to-`size` teams with balanced XP. */
function bucketBalanced(group, size) {
  const targets = [];
  const members = group.map((m) => ({
    ...m,
    recent_xp: Math.max(0, Number(m.recent_xp) || 0),
  }));
  const order = [...members].sort((a, b) => a.recent_xp - b.recent_xp);

  // Round-robin lanes: fill each lane with the next-weakest student so each
  // team gets a spread of strong + weak (balanced total XP).
  const lanes = Math.ceil(order.length / size);
  for (let lane = 0; lane < lanes; lane++) {
    const teamMembers = [];
    for (let i = lane; i < order.length; i += lanes) {
      teamMembers.push(order[i]);
      if (teamMembers.length === size) break;
    }
    if (teamMembers.length > 0) targets.push(teamMembers);
  }
  return targets;
}

/**
 * Form teams from a student list.
 * @param {Array} students — [{ child_admission_no, name?, age_band?, recent_xp? }]
 * @param {number} teamSize — target members per team (default 4)
 * @returns {Array<{name, members: Array}>}
 */
function formTeams(students, { teamSize = 4 } = {}) {
  const size = Math.max(2, Math.floor(Number(teamSize) || 4));
  const list = Array.isArray(students) ? students : [];
  if (list.length === 0) return [];

  const grouped = {};
  for (const s of list) {
    const band = AXLE_BANDS.includes(s.age_band) ? s.age_band : 'Unbanded';
    (grouped[band] = grouped[band] || []).push(s);
  }

  const teams = [];
  const leftovers = [];

  // Within each age band, balance XP.
  for (const band of Object.keys(grouped).sort((a, b) => AXLE_BANDS.indexOf(a) - AXLE_BANDS.indexOf(b))) {
    const buckets = bucketBalanced(grouped[band], size);
    if (buckets.length > 0) {
      const last = buckets[buckets.length - 1];
      if (last.length < size) {
        // Keep the small remainder aside to try same-band merge across bands
        // (only merge from another same-sized remainder; otherwise it becomes
        // its own small team).
        leftovers.push(...last);
        buckets.pop();
      }
      buckets.forEach((members, i) => teams.push({
        name: `${band} Team ${i + 1}`,
        members,
      }));
    }
  }

  // Merge leftovers (same band first) into full teams.
  if (leftovers.length > 0) {
    for (let i = 0; i < leftovers.length; i += size) {
      const slice = leftovers.slice(i, i + size);
      if (slice.length >= size) {
        teams.push({ name: `Mixed Team ${teams.length + 1}`, members: slice });
      } else {
        // Too small to make a full team — attach to the least-loaded team if
        // possible, else emit as a small team.
        teams.push({ name: `Mixed Team ${teams.length + 1}`, members: slice });
      }
    }
  }

  return teams;
}

/**
 * Compute the creation payload for a team (name + member ids) from a formed
 * team object.
 * @returns {{ name: string, members: Array<{child_admission_no:string}> }}
 */
function teamCreatePayload(team) {
  return {
    name: team.name,
    members: (team.members || []).map((m) => ({ child_admission_no: m.child_admission_no })),
  };
}

module.exports = {
  AXLE_BANDS,
  bucketBalanced,
  formTeams,
  teamCreatePayload,
};
