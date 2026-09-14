'use strict';

/**
 * Tolerant class-identity matching shared by EliteKids and EliteSMS.
 *
 * Real elite_db.classes.class_name values include "Nursery 2", "Nur 2 A",
 * "Nur2A", "LOWER KG", "UPPER KG", "BASIC 3", "SS1", "JSS 2", "Crech",
 * "Primary 1 Fagge"... Nigerian class labels arrive in many legitimate
 * spellings. Two labels name the same class when their canonical forms are
 * equal after:
 *
 *  1. case-folding and diacritic stripping (Crèche → creche),
 *  2. separator removal (space, dash, underscore, dot, slash, brackets),
 *  3. compound-word aliases (LOWER KG → KG1, UPPER KG → KG2),
 *  4. grade-word/abbreviation expansion (nur → nursery, pry/basic → primary,
 *     kg → kindergarten, ss → secondary, crech → creche, ...),
 *  5. ordinal-word normalization (two → 2).
 *
 * Ordinals and section letters remain identity: "NUR2-A" ≠ "NUR2-B" and
 * "NUR2" ≠ "NUR2A". Callers must try an exact match FIRST and fail closed on
 * ambiguous tolerant matches (see resolveClassIdentity).
 */

// Longest-first so "nursery" wins over "nur", "lowerkg" over "kg", etc.
const GRADE_ALIASES = [
  ['kindergarten', 'kindergarten'],
  ['playgroup', 'playgroup'],
  ['nursery', 'nursery'],
  ['secondary', 'secondary'],
  ['primary', 'primary'],
  ['creche', 'creche'],
  ['lowerkg', 'kindergarten1'],
  ['upperkg', 'kindergarten2'],
  ['crech', 'creche'],
  ['nrs', 'nursery'],
  ['pry', 'primary'],
  ['jss', 'jss'],
  ['kg', 'kindergarten'],
  ['nur', 'nursery'],
  ['sec', 'secondary'],
  ['ss', 'secondary'],
  ['pg', 'playgroup'],
  ['nr', 'nursery'],
].sort((a, b) => b[0].length - a[0].length);

// Nigerian 9-year basic curriculum: Basic 1-6 ≡ Primary 1-6.
const WORD_ALIASES = {
  basic: 'primary',
};

const ORDINAL_WORDS = {
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};

const SEPARATORS = /[\s_\-./\\()[\]]+/g;
const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Canonical comparison string for a class code or class name.
 * "Nursery 2 A" → "nursery2a"; "NUR2-A" → "nursery2a";
 * "LOWER KG" → "kindergarten1"; "BASIC 3" → "primary3"; "Crech" → "creche".
 */
function classCanonical(value) {
  let rest = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(SEPARATORS, '');
  if (!rest) return '';

  let canonical = '';
  // Leading grade word(s), repeatedly (compound forms terminate via digits).
  let matched = true;
  while (matched && rest) {
    matched = false;
    for (const [abbr, full] of GRADE_ALIASES) {
      if (rest.startsWith(abbr)) {
        canonical += full;
        rest = rest.slice(abbr.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const word = rest.match(/^[a-z]+/);
      if (word && WORD_ALIASES[word[0]]) {
        canonical += WORD_ALIASES[word[0]];
        rest = rest.slice(word[0].length);
        matched = true;
      }
    }
  }
  // Ordinal words ("Nursery Two A") normalize to digits ("nursery2a").
  const ordinal = rest.match(/^(one|two|three|four|five|six|seven|eight|nine|ten)(?=[a-z]|$)/);
  if (ordinal) rest = ORDINAL_WORDS[ordinal[1]] + rest.slice(ordinal[1].length);
  return canonical + rest;
}

/** True when two class codes/names identify the same class. */
function sameClassIdentity(a, b) {
  const ca = classCanonical(a);
  const cb = classCanonical(b);
  return !!ca && !!cb && ca === cb;
}

/**
 * Two-tier resolution against a school's real class rows (read-only objects
 * with class_code/class_name). Exact matches win; a single tolerant match
 * resolves; multiple tolerant matches are ambiguous and fail closed.
 *
 * Returns { row, tier } | { ambiguous: [rows] } | null.
 */
function resolveClassIdentity(input, rows) {
  const raw = String(input ?? '').trim();
  if (!raw || !Array.isArray(rows)) return null;
  const lowered = raw.toLowerCase();

  let hit = rows.find((row) => String(row.class_code || '').trim().toLowerCase() === lowered)
    || rows.find((row) => String(row.class_name || '').trim().toLowerCase() === lowered);
  if (hit) return { row: hit, tier: 'exact' };

  const candidates = rows.filter((row) => sameClassIdentity(row.class_code, raw)
    || sameClassIdentity(row.class_name, raw));
  if (candidates.length === 1) return { row: candidates[0], tier: 'canonical' };
  if (candidates.length > 1) return { ambiguous: candidates };
  return null;
}

module.exports = { classCanonical, classTokens: classCanonical, sameClassIdentity, resolveClassIdentity };
