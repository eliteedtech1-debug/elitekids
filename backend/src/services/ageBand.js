'use strict';

/**
 * Server-side age-band helpers — NERDC Standard.
 *
 * Follows the Nigerian Educational Research and Development Council (NERDC)
 * National Policy on Education structure for Early Childhood Care Development
 * and Education (ECCDE):
 *
 *   rank 0: Crèche       (0-2 years)   — Day care, nurturing, sensory play
 *   rank 1: Playgroup     (2-3 years)   — Socialization, basic play, colours
 *   rank 2: Nursery 1     (3-4 years)   — ABC, colours, counting 1-5, shapes
 *   rank 3: Nursery 2     (4-5 years)   — Numbers to 10, reading readiness
 *   rank 4: Kindergarten  (5-6 years)   — Prep for primary, simple arithmetic
 *   rank 5: Primary       (6+ years)    — Primary 1-6, JSS, SS, formal academics
 *
 * Elder or unmappable children land on the LAST rank — or better, on a
 * persisted placement-quiz result (kids_band_placements, see
 * controllers/kidsPlacement.js) which is the highest-precedence source.
 * No child may ever face an empty dashboard: when a band filter
 * yields nothing, callers widen to the full catalog (remedial door).
 *
 * Risk rule (TECH-SPEC-LEARNING-PATH §5): when class mapping is ambiguous,
 * fall back to the NARROWEST known rank — never widen.
 */

/** NERDC standard age bands in ascending order. */
const AGE_BANDS = ['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary'];

/** Equivalence rank per NERDC band label. Each band has a unique rank. */
const BAND_RANKS = {
  'Crèche': 0,
  'Playgroup': 1,
  'Nursery 1': 2,
  'Nursery 2': 3,
  'Kindergarten': 4,
  'Primary': 5,
};

/**
 * The game/content tables still use the legacy five-value technical ladder.
 * These aliases are storage compatibility only; class_name and API output use
 * the six canonical NERDC labels above. Crèche + Playgroup share `Creche`.
 */
const PLATFORM_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];
const PLATFORM_TO_NERDC = {
  Creche: 'Crèche',
  Nursery: 'Nursery 1',
  KG1: 'Nursery 2',
  KG2: 'Kindergarten',
  Primary: 'Primary',
};
const NERDC_TO_PLATFORM = {
  'Crèche': 'Creche',
  Playgroup: 'Creche',
  'Nursery 1': 'Nursery',
  'Nursery 2': 'KG1',
  Kindergarten: 'KG2',
  Primary: 'Primary',
};

function platformBandToNerdc(band) {
  return PLATFORM_TO_NERDC[String(band || '').trim()] || null;
}

function nerdcBandToPlatform(band) {
  const value = String(band || '').trim();
  return NERDC_TO_PLATFORM[value] || (PLATFORM_BANDS.includes(value) ? value : null);
}

/** Rank a canonical NERDC band or a legacy technical storage value. */
function rankForBand(band) {
  const value = String(band || '').trim();
  if (rankOf(value) !== -1) return rankOf(value);
  const canonical = platformBandToNerdc(value);
  return canonical ? rankOf(canonical) : -1;
}

/** Legacy storage age_level values visible at-or-below a canonical band. */
function platformLevelsForNerdc(band) {
  const max = rankForBand(band);
  if (max === -1) return [];
  return PLATFORM_BANDS.filter((value) => rankForBand(value) <= max);
}

function bandIndexOf(band) {
  return AGE_BANDS.indexOf(band);
}

/** Equivalence rank of a band label, or -1 when unknown. */
function rankOf(band) {
  const r = BAND_RANKS[band];
  return Number.isInteger(r) ? r : -1;
}

/**
 * Map a class name (elite_db.classes.class_name / students.class_name /
 * kids_children.class_code) to a NERDC band label — the canonical labels the
 * game engine + kids DB accept (AGE_BANDS).
 *
 * Handles the REAL naming mess found in elite_db.classes (2026-09-09 sweep,
 * see team-docs/reports/q46-classes-universe.txt):
 *   - Case/separator-insensitive: 'Nur2A' ≡ 'Nur 2 A' ≡ 'NUR-2 A' ≡ 'Nursery-2A'
 *   - Arm/stream suffixes stripped: 'Nursery 1 Blue', 'Primary 1 Lions A',
 *     'Nursery 1 A2', 'BASIC 1 NS', 'JSS2 D'
 *   - Accent-folded: 'Crèche' ≡ 'Creche' ≡ 'Crech' (typo exists in real data)
 *   - Legacy vocabulary: LKG/UKG, LOWER/UPPER KG, PG, Pre-Nursery, KG1-3,
 *     Nursery 1-3, Tamheed, Preparatory, Reception
 *   - Elder/secondary: Basic 1-9 (Basic 1-6 ≡ Primary 1-6, 7-9 ≡ JSS),
 *     JSS/SS/SSS, Islamiyya/Hadana/Tahfiz vocabulary
 *
 * `section` (elite_db.classes.section) disambiguates when the name alone is
 * ambiguous: Nursery-section Islamic classes (Tamheed) are EARLY-YEARS, while
 * the same vocabulary in an Islamiyya/Tahfiz section is elder → last rank.
 * Unrecognized decorative names (sahaba-name classes) fall back to the
 * section default: Nursery → Nursery 1, everything secondary/islamic →
 * Primary (elder children land on the LAST rank — never an empty dashboard).
 * Returns null only when neither name nor section is usable.
 */
function classToAgeLevel(className, section) {
  if (!className) return null;
  const raw = String(className).trim();
  if (!raw) return null;

  // 1. Accent-fold FIRST so 'Crèche' survives the punctuation strip below.
  const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Normalize: lowercase, punctuation → space, glued digit-letters split
  //    ('Nursery2A' → 'nursery 2 a'), whitespace collapsed.
  let norm = folded
    .toLowerCase()
    // Synthetic code columns (elite_db.classes.class_code 'CLS0610') are not
    // class names — strip before the bare-number ladder reads '0610'.
    .replace(/\bcls\s*\d+\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/(\d)(?=[a-z])/g, '$1 ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!norm) return null;

  // 3. Drop arm/stream suffix tokens (colors, NS, A/B/C/D, A2/B2). Keyword
  //    and number tokens are never dropped; proper-name tokens (Dala,
  //    Fagge, Lions) are harmless because keyword rules anchor on their own
  //    words.
  const NOISE = /^(blue|green|orange|purple|red|yellow|white|pink|grey|gray|gold|ns)$/;
  const kept = norm.split(' ').filter((t) =>
    t && !NOISE.test(t) && !/^[a-f]$/.test(t) && !/^[a-z]\d+$/.test(t)
  );
  if (kept.length) norm = kept.join(' ');

  const sec = section ? String(section).trim().toLowerCase() : '';
  // Nursery-section islamiyya classes are early-years; elsewhere elder.
  const islamiyyaIsElder = sec !== 'nursery';

  // ── Primary (rank 5) — elder/secondary vocabulary first ──
  if (/\bjss\b|\bjss\s*\d|\bsss\b|\bsss\s*\d|\bss\s*\d|junior\s*sec|senior\s*sec|secondary|college|polytechnic|tertiary/.test(norm)) return 'Primary';
  if (/\bbasic\s*\d+/.test(norm)) return 'Primary'; // Basic 1-6 ≡ Primary 1-6; Basic 7-9 ≡ JSS — all last rank
  if (/\bprimar|elementary/.test(norm)) return 'Primary';
  if (islamiyyaIsElder && /\bhadana|hifz|huffaz|halkat|islamiyya|islamic|madrasa|madrasah|tarbiyah|quran|koran|tajweed|saff|raudat|raudah|fasl|khatma/.test(norm)) return 'Primary';

  // ── Playgroup (rank 1) — pre-* family BEFORE generic kindergarten ──
  if (/play\s*group|playgroup|\bpg\b|pre\s*nursery|pre\s*school|pre\s*kindergarten|pre\s*kg/.test(norm)) return 'Playgroup';

  // ── Kindergarten (rank 4) — numbered KG-style forms stay narrow ──
  if (/\bkindergarten\s*1\b/.test(norm)) return 'Nursery 1'; // ≡ KG1
  if (/\bkindergarten\s*2\b/.test(norm)) return 'Nursery 2'; // ≡ KG2
  if (/kindergarten|kindergarden|reception|\bprep\b|preparator/.test(norm)) return 'Kindergarten';

  // ── Nursery 2 (rank 3) — numbered forms BEFORE generic keywords ──
  if (/\b(?:nursery|nurs|nur|nu)\s*[-]?\s*2\b/.test(norm)) return 'Nursery 2';
  if (/\bkg\s*2\b|upper\s*kg|up\s*kg|ukg/.test(norm)) return 'Nursery 2';

  // ── Nursery 3 (third nursery year ≈ KG) ──
  if (/\b(?:nursery|nurs|nur|nu)\s*[-]?\s*3\b/.test(norm)) return 'Kindergarten';

  // ── Nursery 1 (rank 2) ──
  if (/\b(?:nursery|nurs|nur|nu)\s*[-]?\s*1\b/.test(norm)) return 'Nursery 1';
  if (/\bkg\s*1\b|lower\s*kg|low\s*kg|lkg/.test(norm)) return 'Nursery 1';

  // ── Crèche (rank 0) — accent-folded above, so the 'Crech' typo matches too ──
  if (/creche|crech|day\s*care|daycare|baby|infant|toddler/.test(norm)) return 'Crèche';

  // Generic nursery / kg (no number) → Nursery 1 (rank 2, most common).
  if (/nursery|nurs|\bnu\b/.test(norm)) return 'Nursery 1';
  if (/\bkg\b/.test(norm)) return 'Nursery 1';

  // ── Generic numbered ladder: Class/Year/Grade/Std/Level/Form N ──
  // NERDC equivalence: Basic/Year/Class 1 ≈ Nursery 1, 2 ≈ Nursery 2,
  // ≥3 ≈ Primary (Basic 1-6 ≡ Primary 1-6).
  const levelMatch = norm.match(/\b(?:level|class|grade|form|std|standard|year|stage)\s*(\d+)/);
  if (levelMatch) {
    const num = parseInt(levelMatch[1], 10);
    if (num <= 1) return 'Nursery 1';
    if (num === 2) return 'Nursery 2';
    return 'Primary';
  }

  // Bare trailing number ("A 2") — same ladder.
  const bareNum = norm.match(/(\d+)\s*$/);
  if (bareNum) {
    const num = parseInt(bareNum[1], 10);
    if (num <= 1) return 'Nursery 1';
    if (num === 2) return 'Nursery 2';
    return 'Primary';
  }

  if (/pre/.test(norm)) return 'Playgroup';

  // ── Section fallback for unrecognized decorative names ──
  if (sec === 'nursery') return 'Nursery 1';
  if (/^(primary|jss|junior secondary|senior secondary|ss|islamiyya|tahfiz)$/.test(sec)) return 'Primary';

  return null;
}

/**
 * Visible labels for a band ceiling: every NERDC band whose rank is
 * at-or-below the child's rank.
 */
function visibleLevels(band) {
  const r = rankOf(band);
  if (r === -1) return null;
  return AGE_BANDS.filter((b) => rankOf(b) <= r);
}

/**
 * Resolve a child row (kids_children) to an effective NERDC band.
 * class-code mapping wins when present; otherwise age_level. When both exist
 * and disagree we pick the NARROWEST RANK so isolation can never widen.
 * Returns null when nothing is known (caller leaves legacy behavior).
 */
function resolveChildBand(childRow) {
  if (!childRow) return null;
  const mapped = classToAgeLevel(childRow.class_code);
  const level = AGE_BANDS.includes(childRow.age_level)
    ? childRow.age_level
    : platformBandToNerdc(childRow.age_level);
  const candidates = [mapped, level].filter((b) => b && rankOf(b) !== -1);
  if (candidates.length === 0) return null;
  return candidates.reduce((narrowest, b) =>
    rankOf(b) < rankOf(narrowest) ? b : narrowest
  );
}

/** Map a declared age (from the tour's "How old are you?" step) to a NERDC band.
 *  Kid-friendly ladder: 1-2 → Crèche, 3 → Playgroup, 4 → Nursery 1,
 *  5 → Nursery 2, 6 → Kindergarten, ≥7 → Primary. */
function ageToBand(ageYears) {
  const age = Number(ageYears);
  if (!Number.isFinite(age) || age <= 0) return null;
  if (age <= 2) return 'Crèche';
  if (age === 3) return 'Playgroup';
  if (age === 4) return 'Nursery 1';
  if (age === 5) return 'Nursery 2';
  if (age === 6) return 'Kindergarten';
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
  let student = null;
  let child = null;

  // Load authoritative identity first. This prevents a stale flagship placement
  // row from overriding a real school's class_name for the same admission no.
  try { student = await db.Student.findOne({ where: { admission_no: admission } }); } catch { /* optional shared mirror */ }
  try {
    child = await db.KidChild.findOne({ where: { admission_no: admission } });
  } catch (err) {
    // Optional local profile. Sequelize falls over on schemas that predate the
    // model's newest columns (e.g. allow_anonymous_comparison) — fall back to a
    // raw read of just the columns the band resolver needs so isolation still
    // works without forcing a schema ALTER.
    try {
      const { content } = db;
      const [rows] = await content.query(
        'SELECT admission_no, school_id, branch_id, class_code, age_level FROM kids_children WHERE admission_no = ? LIMIT 1',
        { replacements: [admission] }
      );
      child = rows && rows[0] ? rows[0] : null;
    } catch { child = null; }
  }
  const identitySchoolId = String(student?.school_id || child?.school_id || '').trim();

  // 0. Placement measurement is accepted only for the same flagship identity.
  try {
    const { content } = db;
    const [rows] = await content.query(
      'SELECT band, school_id FROM kids_band_placements WHERE child_admission_no = ? LIMIT 1',
      { replacements: [admission] }
    );
    const placement = rows && rows[0] ? rows[0] : null;
    const placementSchool = String(placement?.school_id || '').trim();
    const placementAllowed = ['SCH-ELITE', 'SCH-KIDS'].includes(identitySchoolId)
      && placementSchool === identitySchoolId;
    const placed = placementAllowed ? placement.band : null;
    const placedNerdc = AGE_BANDS.includes(placed) ? placed : platformBandToNerdc(placed);
    if (placedNerdc && rankOf(placedNerdc) !== -1) return placedNerdc;
  } catch { /* table may not exist yet — fall through */ }

  // 1. SMS students row — class_name is authoritative for every real school.
  // current_class/class_code are compatibility fallbacks for older mirrors.
  if (student) {
    const band = classToAgeLevel(student.class_name)
      || classToAgeLevel(student.current_class)
      || classToAgeLevel(student.class_code);
    if (band) return band;
  }
  // 2. kids_children row for flagship/self-service children with no SMS row.
  const direct = resolveChildBand(child);
  if (direct) return direct;
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
  PLATFORM_BANDS,
  PLATFORM_TO_NERDC,
  NERDC_TO_PLATFORM,
  platformBandToNerdc,
  nerdcBandToPlatform,
  bandIndexOf,
  rankOf,
  rankForBand,
  platformLevelsForNerdc,
  classToAgeLevel,
  visibleLevels,
  resolveChildBand,
  ageToBand,
  resolveBandForAdmission,
};
