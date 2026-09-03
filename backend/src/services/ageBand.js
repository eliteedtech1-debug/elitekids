'use strict';

/**
 * Server-side age-band helpers (G6 age isolation — hard ceiling).
 *
 * classToAgeLevel() is a faithful port of the mapping that previously lived
 * client-side (frontend/src/pages/Student/StudentHome.tsx:106). Moving it to
 * the backend means isolation holds even if a client is edited: a child can
 * never RECEIVE a lesson above their band.
 *
 * Risk rule (TECH-SPEC-LEARNING-PATH §5): when class mapping is ambiguous,
 * fall back to the NARROWEST known band — never widen.
 */

const AGE_BANDS = ['Creche', 'Nursery', 'KG1', 'KG2', 'Primary'];

function bandIndexOf(band) {
  return AGE_BANDS.indexOf(band);
}

/** Map a class name (students.class_name / kids_children.class_code) to a band. */
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

  if (/creche|pre.?nursery|pre.?school/.test(normalized)) return 'Creche';
  if (/nursery|nurs/.test(normalized)) return 'Nursery';
  if (/\bkg1\b|kindergarten.?1|\bkg.?1\b/.test(normalized)) return 'KG1';
  if (/\bkg2\b|kindergarten.?2|\bkg.?2\b/.test(normalized)) return 'KG2';
  if (/\bkg3\b|kindergarten.?3|\bkg.?3\b/.test(normalized)) return 'Primary';

  const basicMatch = normalized.match(/\bbasic\s*(\d+)/);
  if (basicMatch) {
    const num = parseInt(basicMatch[1], 10);
    if (num <= 1) return 'KG1';
    if (num <= 2) return 'KG2';
    return 'Primary';
  }

  if (/\bjss\s*\d|\bjunior\s*sec|\bjunior\b/.test(normalized)) return 'Primary';
  if (/\bsss\s*\d|\bsenior\s*sec|\bsenior\b/.test(normalized)) return 'Primary';
  if (/hadana|hifz|huffaz|halkat/.test(normalized)) return 'Primary';
  if (/islamiyya|islamic|madrasa|madrasah|tarbiyah/.test(normalized)) return 'Primary';
  if (/quran|koran|tajweed/.test(normalized)) return 'Primary';

  const levelMatch = normalized.match(/\b(?:level|class|grade|form|std|standard|year|stage)\s*(\d+)/);
  if (levelMatch) {
    const num = parseInt(levelMatch[1], 10);
    if (num <= 1) return 'Creche';
    if (num <= 2) return 'Nursery';
    if (num <= 3) return 'KG1';
    if (num <= 4) return 'KG2';
    return 'Primary';
  }

  // Explicit keywords beat a trailing bare number: "Primary 2" is a Primary
  // class, not a KG2 class (client port improvement — old ordering let the
  // bare-number fallback shadow these).
  if (/primar|basic|element|junior/.test(normalized)) return 'Primary';
  if (/nurs|toddler|baby|infant/.test(normalized)) return 'Nursery';
  if (/pre/.test(normalized)) return 'Creche';

  const bareNum = normalized.match(/(\d+)\s*$/);
  if (bareNum) {
    const num = parseInt(bareNum[1], 10);
    if (num <= 1) return 'KG1';
    if (num <= 2) return 'KG2';
    return 'Primary';
  }

  return null;
}

/** Visible bands = the child's band and everything below (strict ceiling). */
function visibleLevels(band) {
  const idx = bandIndexOf(band);
  if (idx === -1) return null;
  return AGE_BANDS.slice(0, idx + 1);
}

/**
 * Resolve a child row (kids_children) to an effective band.
 * class-code mapping wins when present; otherwise age_level. When both exist
 * and disagree we pick the NARROWER so isolation can never widen.
 * Returns null when nothing is known (caller leaves legacy behavior).
 */
function resolveChildBand(childRow) {
  if (!childRow) return null;
  const mapped = classToAgeLevel(childRow.class_code);
  const level = AGE_BANDS.includes(childRow.age_level) ? childRow.age_level : null;
  const candidates = [mapped, level].filter((b) => AGE_BANDS.includes(b));
  if (candidates.length === 0) return null;
  return candidates.reduce((narrowest, b) =>
    bandIndexOf(b) < bandIndexOf(narrowest) ? b : narrowest
  );
}

module.exports = {
  AGE_BANDS,
  bandIndexOf,
  classToAgeLevel,
  visibleLevels,
  resolveChildBand,
};
