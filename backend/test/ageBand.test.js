'use strict';

/**
 * NERDC age-band tests — 6 canonical bands (Q44 rename):
 *   rank 0: Crèche · 1: Playgroup · 2: Nursery 1 · 3: Nursery 2
 *   rank 4: Kindergarten · 5: Primary
 * Legacy vocabulary maps into it: KG1 ≡ Nursery 1, KG2 ≡ Nursery 2,
 * LOWER/UPPER KG ≡ Nursery 1/2, BASIC 1-6 → Primary (rank 5).
 */
const {
  AGE_BANDS,
  BAND_RANKS,
  rankOf,
  classToAgeLevel,
  visibleLevels,
  resolveChildBand,
  ageToBand,
} = require('../src/services/ageBand');

describe('rank model', () => {
  it('exposes the six NERDC bands in ascending order', () => {
    expect(AGE_BANDS).toEqual(['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten', 'Primary']);
    expect(rankOf('Crèche')).toBe(0);
    expect(rankOf('Playgroup')).toBe(1);
    expect(rankOf('Nursery 1')).toBe(2);
    expect(rankOf('Nursery 2')).toBe(3);
    expect(rankOf('Kindergarten')).toBe(4);
    expect(rankOf('Primary')).toBe(5);
    expect(rankOf('Nope')).toBe(-1);
    expect(rankOf('Creche')).toBe(-1); // canonical spelling carries the accent
    expect(Object.keys(BAND_RANKS).sort()).toEqual([...AGE_BANDS].sort());
  });
});

describe('classToAgeLevel — Nigerian school vocabulary', () => {
  it('maps the NERDC band labels exactly', () => {
    expect(classToAgeLevel('Crèche')).toBe('Crèche');
    expect(classToAgeLevel('Playgroup')).toBe('Playgroup');
    expect(classToAgeLevel('Nursery 1')).toBe('Nursery 1');
    expect(classToAgeLevel('Nursery 2')).toBe('Nursery 2');
    expect(classToAgeLevel('Kindergarten')).toBe('Kindergarten');
    expect(classToAgeLevel('Primary')).toBe('Primary');
  });

  it('maps legacy nursery/KG vocabulary to the new labels', () => {
    expect(classToAgeLevel('Pre-Nursery')).toBe('Playgroup');
    expect(classToAgeLevel('Pre Nursery A')).toBe('Playgroup');
    expect(classToAgeLevel('Nursery')).toBe('Nursery 1');
    expect(classToAgeLevel('Nursery A')).toBe('Nursery 1');
    expect(classToAgeLevel('Nu 1')).toBe('Nursery 1');
    expect(classToAgeLevel('NU2')).toBe('Nursery 2');
    expect(classToAgeLevel('Nur-2')).toBe('Nursery 2');
    expect(classToAgeLevel('KG1')).toBe('Nursery 1');
    expect(classToAgeLevel('KG2')).toBe('Nursery 2');
    expect(classToAgeLevel('LOWER KG')).toBe('Nursery 1');
    expect(classToAgeLevel('UPPER KG')).toBe('Nursery 2');
    expect(classToAgeLevel('kindergarten 1')).toBe('Nursery 1');
  });

  it('handles real elite_db class-name mess: case, separators, arm suffixes', () => {
    // Same class, every separator/case/suffix variant seen in elite_db.classes
    for (const v of ['Nur 2', 'Nur2', 'Nur-2', 'Nur 2 A', 'Nur2A', 'NUR-2A', 'Nursery 2A', 'Nursery-2 A', 'Nursery 2 B', 'Nursery 2 blue', 'NURSERY 2']) {
      expect(classToAgeLevel(v)).toBe('Nursery 2');
    }
    for (const v of ['Nur 1', 'Nur1A', 'Nursery 1 Blue', 'Nursery 1 A2', 'Nurs1 C', 'Nursery 1D']) {
      expect(classToAgeLevel(v)).toBe('Nursery 1');
    }
    // Accent folding — including the real 'Crech' typo found in the DB sweep
    expect(classToAgeLevel('Crech')).toBe('Crèche');
    expect(classToAgeLevel('Crèche')).toBe('Crèche');
    expect(classToAgeLevel('CRECHE')).toBe('Crèche');
    // Real rows from the 2026-09-09 classes sweep
    expect(classToAgeLevel('BASIC 7 NS')).toBe('Primary');
    expect(classToAgeLevel('Primary 1 Lions A')).toBe('Primary');
    expect(classToAgeLevel('Primary 1 Fagge')).toBe('Primary');
    expect(classToAgeLevel('Pre Nursery Purple')).toBe('Playgroup');
    expect(classToAgeLevel('PG A')).toBe('Playgroup');
    expect(classToAgeLevel('LKG B')).toBe('Nursery 1');
    expect(classToAgeLevel('UKG A')).toBe('Nursery 2');
    expect(classToAgeLevel('Nursery 3 A')).toBe('Kindergarten');
  });

  it('uses section to disambiguate islamiyya / decorative names', () => {
    // Nursery-section islamiyya classes are early-years...
    expect(classToAgeLevel('Tamheed A', 'Nursery')).toBe('Nursery 1');
    expect(classToAgeLevel('Unnamed Class', 'Nursery')).toBe('Nursery 1');
    // ...the same vocabulary elsewhere is elder → last rank.
    expect(classToAgeLevel('HADANA A', 'Islamiyya')).toBe('Primary');
    expect(classToAgeLevel('RAUDATUL ULA A', 'Islamiyya')).toBe('Primary');
    expect(classToAgeLevel('Raudah', 'Islamiyya')).toBe('Primary');
    expect(classToAgeLevel('Abubakar Assiddiq', 'Islamiyya')).toBe('Primary');
    expect(classToAgeLevel('Class X', 'Primary')).toBe('Primary');
    // No section at all → name-only behavior (null for unusable names).
    expect(classToAgeLevel('Abubakar Assiddiq')).toBeNull();
  });

  it('never maps numbered classes to Crèche', () => {
    expect(classToAgeLevel('Class 1')).not.toBe('Crèche');
    expect(classToAgeLevel('Class 1')).toBe('Nursery 1');
    expect(classToAgeLevel('Year 2')).toBe('Nursery 2');
  });

  it('places elder classes on the LAST rank (Primary)', () => {
    for (const cls of ['JSS1', 'JSS 3', 'SSS2', 'SS 1', 'Senior Secondary', 'Junior Sec', 'Islamiyya', 'Hifz', 'Tarbiyah']) {
      expect(classToAgeLevel(cls)).toBe('Primary');
    }
  });

  it('maps the full Basic ladder to Primary (Basic 1-6 ≡ Primary 1-6)', () => {
    for (let n = 1; n <= 6; n += 1) {
      expect(classToAgeLevel(`Basic ${n}`)).toBe('Primary');
      expect(classToAgeLevel(`BASIC ${n}`)).toBe('Primary');
    }
    expect(classToAgeLevel('Primary 1')).toBe('Primary');
    expect(classToAgeLevel('Primary 6')).toBe('Primary');
    expect(classToAgeLevel('Year 3')).toBe('Primary');
    expect(classToAgeLevel('Year 4')).toBe('Primary');
    expect(classToAgeLevel('Year 5')).toBe('Primary');
  });

  it('returns null for unknown/empty classes', () => {
    expect(classToAgeLevel('')).toBeNull();
    expect(classToAgeLevel(null)).toBeNull();
    expect(classToAgeLevel('Planet X')).toBeNull();
  });
});

describe('visibleLevels — strict ceiling', () => {
  it('gives each band itself plus everything below', () => {
    expect(visibleLevels('Crèche')).toEqual(['Crèche']);
    expect(visibleLevels('Playgroup')).toEqual(['Crèche', 'Playgroup']);
    expect(visibleLevels('Nursery 1')).toEqual(['Crèche', 'Playgroup', 'Nursery 1']);
    expect(visibleLevels('Nursery 2')).toEqual(['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2']);
    expect(visibleLevels('Kindergarten')).toEqual(['Crèche', 'Playgroup', 'Nursery 1', 'Nursery 2', 'Kindergarten']);
    expect(visibleLevels('Bogus')).toBeNull();
  });

  it('last rank sees everything', () => {
    expect(visibleLevels('Primary')).toEqual(AGE_BANDS);
  });
});

describe('resolveChildBand — narrowest rank wins', () => {
  it('picks the narrower of class_code vs age_level', () => {
    expect(resolveChildBand({ class_code: 'JSS1', age_level: 'Nursery 1' })).toBe('Nursery 1');
    expect(resolveChildBand({ class_code: 'Nursery 1', age_level: 'Primary' })).toBe('Nursery 1');
    expect(resolveChildBand({ class_code: 'NUR-A', age_level: 'Nursery 2' })).toBe('Nursery 2'); // NUR-A unmappable → age_level wins
    expect(resolveChildBand({ class_code: null, age_level: 'Kindergarten' })).toBe('Kindergarten');
    expect(resolveChildBand({ class_code: 'Primary 1', age_level: 'Primary' })).toBe('Primary');
  });

  it('returns null when nothing is usable', () => {
    expect(resolveChildBand(null)).toBeNull();
    expect(resolveChildBand({ class_code: '??', age_level: 'Bogus' })).toBeNull();
  });
});

describe('ageToBand — tour declaration ladder', () => {
  it('maps 1-2→Crèche, 3→Playgroup, 4→Nursery 1, 5→Nursery 2, 6→Kindergarten, 7+→Primary', () => {
    expect(ageToBand(1)).toBe('Crèche');
    expect(ageToBand(2)).toBe('Crèche');
    expect(ageToBand(3)).toBe('Playgroup');
    expect(ageToBand(4)).toBe('Nursery 1');
    expect(ageToBand(5)).toBe('Nursery 2');
    expect(ageToBand(6)).toBe('Kindergarten');
    expect(ageToBand(7)).toBe('Primary');
    expect(ageToBand(12)).toBe('Primary');
    expect(ageToBand(0)).toBeNull();
    expect(ageToBand(null)).toBeNull();
    expect(ageToBand('x')).toBeNull();
  });
});
