'use strict';

/**
 * Server-side age-band helpers (G6 age isolation — hard ceiling).
 *
 * RANK MODEL (product decision — Northern Nigeria equivalence):
 * Schools in the North do not use Creche/KG vocabulary; they use
 * Pre-Nursery, Nursery 1, Nursery 2, then Primary 1-6. The five legacy
 * storage labels (DB enums — unchanged without a migration) collapse into
 * FOUR equivalence RANKS:
 *
 *   rank 0: Creche   ≡ Pre-Nursery              (~ages 2-3)
 *   rank 1: Nursery  ≡ Nursery 1 ≡ KG1          (~age 4)
 *   rank 2: KG2      ≡ Nursery 2                (~age 5)
 *   rank 3: Primary  ≡ Primary 1-6 ≡ elder classes (JSS/SSS/islamiyya/…)
 *
 * Elder or unmappable children land on the LAST rank — or better, on a
 * persisted placement-quiz result (kids_band_placements, see
 * controllers/kidsPlacement.js) which is the highest-precedence source
 * below. No child may ever face an empty dashboard: when a band filter
 * yields nothing, callers widen to the full catalog (remedial door).
 *
 * Risk rule (TECH-SPEC-LEARNING-PATH §5): when class mapping is ambiguous,
 * fall back to the NARROWEST known rank — never widen.
 */

const AGE_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];

/** Equivalence rank per storage label. Two labels can share a rank. */
const BAND_RANKS = { Creche: 0, Nursery: 1, KG1: 1, KG2: 2, Primary: 3 };

function bandIndexOf(band) {
  return AGE_BANDS.indexOf(band);
}

/** Equivalence rank of a band label, or -1 when unknown. */
function rankOf(band) {
  const r = BAND_RANKS[band];
  return Number.isInteger(r) ? r : -1;
}

/** Map a class name (students.class_name / kids_children.class_code) to a band label. */
function classToAgeLevel(className) {
  if (!className) return null;
  const raw = String(className).trim();
  const normalized = raw
    .toLowerCase()
    .replace(/cls\d+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  // ── Rank 0 — Creche ≡ Pre-Nursery (checked first: "pre-nursery" contains "nursery") ──
  if (/creche|pre ?nursery|pre ?school|day ?care/.test(normalized)) return 'Creche';

  // Explicit Primary keywords beat trailing numbers ("Primary 2" is Primary).
  if (/primar|element/.test(normalized)) return 'Primary';

  // Basic 1-6 ladder: Basic 1 ≈ rank 1, Basic 2 ≈ rank 2, Basic 3+ ≈ Primary.
  const basicMatch = normalized.match(/\bbasic\s*(\d+)/);
  if (basicMatch) {
    const num = parseInt(basicMatch[1], 10);
    if (num <= 1) return 'Nursery'; // rank 1
    if (num <= 2) return 'KG2'; // rank 2
    return 'Primary'; // rank 3
  }

  // ── Rank 2 — Nursery 2 ≡ KG2 (numbered forms BEFORE generic keywords) ──
  if (/\b(?:nursery|nurs|nu)\s*2\b/.test(normalized)) return 'KG2';
  if (/\bkg\s*2\b|kindergarten\s*2/.test(normalized)) return 'KG2';

  // ── Rank 1 — Nursery 1 ≡ KG1 ──
  if (/\b(?:nursery|nurs|nu)\s*1\b/.test(normalized)) return 'Nursery';
  if (/\bkg\s*1\b|kindergarten\s*1/.test(normalized)) return 'KG1';

  // Generic nursery / kg (no number) → rank 1.
  if (/nursery|nurs|\bnu\b|toddler|baby|infant/.test(normalized)) return 'Nursery';
  if (/\bkg\b|kindergarten/.test(normalized)) return 'KG1';

  // ── Elder classes → LAST rank (never an empty dashboard) ──
  if (/\bjss\s*\d|\bsss\s*\d|\bss\s*\d|junior|senior|secondary|college|polytechnic|tertiary/.test(normalized)) return 'Primary';
  if (/hadana|hifz|huffaz|halkat|islamiyya|islamic|madrasa|madrasah|tarbiyah|quran|koran|tajweed/.test(normalized)) return 'Primary';

  // Generic numbered ladder: Class/Year/Grade/Std/Level/Form N.
  // "Class N" ≈ rank N (Class 1 ≈ Nursery 1/KG1, Class 2 ≈ Nursery 2/KG2,
  // Class 3+ ≈ Primary). No numbered class ever maps to Creche — Pre-Nursery
  // is explicit vocabulary only.
  const levelMatch = normalized.match(/\b(?:level|class|grade|form|std|standard|year|stage)\s*(\d+)/);
  if (levelMatch) {
    const num = parseInt(levelMatch[1], 10);
    if (num <= 1) return 'Nursery'; // rank 1
    if (num <= 2) return 'KG2'; // rank 2
    return 'Primary'; // rank 3
  }

  // Bare trailing number ("A 2") — same ladder.
  const bareNum = normalized.match(/(\d+)\s*$/);
  if (bareNum) {
    const num = parseInt(bareNum[1], 10);
    if (num <= 1) return 'Nursery'; // rank 1
    if (num <= 2) return 'KG2'; // rank 2
    return 'Primary'; // rank 3
  }

  if (/pre/.test(normalized)) return 'Creche';

  return null;
}

/**
 * Visible labels for a band ceiling: every storage label whose equivalence
 * rank is at-or-below the child's rank (both rank-1 labels included when the
 * ceiling is rank 1, etc.).
 */
function visibleLevels(band) {
  const r = rankOf(band);
  if (r === -1) return null;
  return AGE_BANDS.filter((b) => rankOf(b) <= r);
}

/**
 * Resolve a child row (kids_children) to an effective band.
 * class-code mapping wins when present; otherwise age_level. When both exist
 * and disagree we pick the NARROWEST RANK so isolation can never widen.
 * Returns null when nothing is known (caller leaves legacy behavior).
 */
function resolveChildBand(childRow) {
  if (!childRow) return null;
  const mapped = classToAgeLevel(childRow.class_code);
  const level = AGE_BANDS.includes(childRow.age_level) ? childRow.age_level : null;
  const candidates = [mapped, level].filter((b) => b && rankOf(b) !== -1);
  if (candidates.length === 0) return null;
  return candidates.reduce((narrowest, b) =>
    rankOf(b) < rankOf(narrowest) ? b : narrowest
  );
}

/** Map a declared age (from the tour's "How old are you?" step) to a band.
 *  Kid-friendly ladder: 3 → Creche, 4 → Nursery (rank 1), 5 → KG1,
 *  6 → KG2 (rank 2), ≥7 → Primary (last rank). */
function ageToBand(ageYears) {
  const age = Number(ageYears);
  if (!Number.isFinite(age) || age <= 0) return null;
  if (age <= 3) return 'Creche';
  if (age === 4) return 'Nursery';
  if (age === 5) return 'KG1';
  if (age === 6) return 'KG2';
  return 'Primary';
}

/**
 * Full-resolution chain for one admission (async — may hit the DB):
 *   0. kids_band_placements row (placement quiz result — measured, wins)
 *   1. kids_children row (kids-app-native children)
 *   2. elite_db.students row (SMS-imported kids — class_name/class_code)
 *   3. kids_age_declarations row (child's own "How old are you?" tour pick)
 *
 * The class mapping (step 2) deliberately outranks the tour declaration: an
 * elder class (JSS1, SSS2, …) must place a child on the last rank / remedial
 * path even if they tapped a young age in the tour.
 * Returns null only when nothing is known → callers keep isolate-by-default.
 */
async function resolveBandForAdmission(admissionNo) {
  const admission = String(admissionNo || '').trim();
  if (!admission) return null;
  // Lazy require: models/index.js is heavy and ageBand is imported early.
  const db = require('../models');
  // 0. Placement quiz result — explicit measurement beats every other source.
  try {
    const { content } = db;
    const [rows] = await content.query(
      'SELECT band FROM kids_band_placements WHERE child_admission_no = ? LIMIT 1',
      { replacements: [admission] }
    );
    const placed = rows && rows[0] ? rows[0].band : null;
    if (placed && rankOf(placed) !== -1) return placed;
  } catch { /* table may not exist yet — fall through */ }
  // 1. kids_children row.
  try {
    const child = await db.KidChild.findOne({ where: { admission_no: admission } });
    const direct = resolveChildBand(child);
    if (direct) return direct;
  } catch { /* kids_children unavailable — fall through */ }
  // 2. SMS students row — class mapping wins over a young tour declaration.
  try {
    const st = await db.Student.findOne({ where: { admission_no: admission } });
    if (st) {
      const band = classToAgeLevel(st.class_name) || classToAgeLevel(st.class_code);
      if (band) return band;
    }
  } catch { /* students mirror unavailable — fall through */ }
  // 3. Tour declaration.
  try {
    const { content } = db;
    const [rows] = await content.query(
      'SELECT age_years FROM kids_age_declarations WHERE child_admission_no = ? LIMIT 1',
      { replacements: [admission] }
    );
    const declared = rows && rows[0] ? ageToBand(rows[0].age_years) : null;
    if (declared) return declared;
  } catch { /* table may not exist yet — fall through */ }
  return null;
}

module.exports = {
  AGE_BANDS,
  BAND_RANKS,
  bandIndexOf,
  rankOf,
  classToAgeLevel,
  visibleLevels,
  resolveChildBand,
  ageToBand,
  resolveBandForAdmission,
};
