'use strict';

/**
 * Equivalence-rank age-band tests (Northern Nigeria mapping):
 *   rank 0: Creche ≡ Pre-Nursery · rank 1: Nursery ≡ Nursery 1 ≡ KG1
 *   rank 2: KG2 ≡ Nursery 2 · rank 3: Primary ≡ Primary 1-6 ≡ elder classes
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
  it('collapses the five labels into four equivalence ranks', () => {
    expect(rankOf('Creche')).toBe(0);
    expect(rankOf('Nursery')).toBe(1);
    expect(rankOf('KG1')).toBe(1);
    expect(rankOf('KG2')).toBe(2);
    expect(rankOf('Primary')).toBe(3);
    expect(rankOf('Nope')).toBe(-1);
    expect(Object.keys(BAND_RANKS).sort()).toEqual([...AGE_BANDS].sort());
  });
});

describe('classToAgeLevel — Northern Nigeria vocabulary', () => {
  it('maps Pre-Nursery / Nursery 1 / Nursery 2 / Primary 1-6', () => {
    expect(classToAgeLevel('Pre-Nursery')).toBe('Creche');
    expect(classToAgeLevel('Pre Nursery A')).toBe('Creche');
    expect(classToAgeLevel('Nursery 1')).toBe('Nursery');
    expect(classToAgeLevel('Nu 1')).toBe('Nursery');
    expect(classToAgeLevel('Nursery 2')).toBe('KG2');
    expect(classToAgeLevel('NU2')).toBe('KG2');
    expect(classToAgeLevel('Primary 1')).toBe('Primary');
    expect(classToAgeLevel('Primary 6')).toBe('Primary');
  });

  it('keeps KG1/KG2 equivalent to Nursery 1/Nursery 2', () => {
    expect(rankOf(classToAgeLevel('KG1'))).toBe(1); // same rank as Nursery 1
    expect(rankOf(classToAgeLevel('KG1'))).toBe(rankOf(classToAgeLevel('Nursery 1')));
    expect(rankOf(classToAgeLevel('KG2'))).toBe(2); // same rank as Nursery 2
    expect(rankOf(classToAgeLevel('KG2'))).toBe(rankOf(classToAgeLevel('Nursery 2')));
  });

  it('never maps numbered classes to Creche', () => {
    expect(classToAgeLevel('Class 1')).not.toBe('Creche');
    expect(rankOf(classToAgeLevel('Class 1'))).toBe(1);
    expect(classToAgeLevel('Year 2')).toBe('KG2');
  });

  it('places elder classes on the LAST rank (Primary)', () => {
    for (const cls of ['JSS1', 'JSS 3', 'SSS2', 'Senior Secondary', 'Junior Sec', 'Islamiyya', 'Hifz', 'Tarbiyah']) {
      expect(classToAgeLevel(cls)).toBe('Primary');
    }
  });

  it('maps Basic 1-6 upward', () => {
    expect(rankOf(classToAgeLevel('Basic 1'))).toBe(1);
    expect(rankOf(classToAgeLevel('Basic 2'))).toBe(2);
    expect(classToAgeLevel('Basic 3')).toBe('Primary');
    expect(classToAgeLevel('Basic 5')).toBe('Primary');
  });

  it('returns null for unknown/empty classes', () => {
    expect(classToAgeLevel('')).toBeNull();
    expect(classToAgeLevel(null)).toBeNull();
    expect(classToAgeLevel('Planet X')).toBeNull();
  });
});

describe('visibleLevels — equivalence ceiling', () => {
  it('includes both rank-1 labels when the ceiling is rank 1', () => {
    expect(visibleLevels('Nursery')).toEqual(['Creche', 'Nursery', 'KG1']);
  });

  it('gives a KG2 child Nursery-2 content plus everything below', () => {
    expect(visibleLevels('KG2')).toEqual(['Creche', 'Nursery', 'KG1', 'KG2']);
  });

  it('last rank sees everything', () => {
    expect(visibleLevels('Primary')).toEqual(AGE_BANDS);
  });

  it('returns null for unknown bands', () => {
    expect(visibleLevels('Meh')).toBeNull();
  });
});

describe('resolveChildBand — narrowest rank wins', () => {
  it('picks the narrower of class_code vs age_level', () => {
    expect(resolveChildBand({ class_code: 'JSS1', age_level: 'Nursery' })).toBe('Nursery');
    expect(resolveChildBand({ class_code: 'Nursery 1', age_level: 'Primary' })).toBe('Nursery');
  });

  it('returns null when nothing is usable', () => {
    expect(resolveChildBand(null)).toBeNull();
    expect(resolveChildBand({ class_code: '??', age_level: 'Bogus' })).toBeNull();
  });
});

describe('ageToBand — tour declaration ladder', () => {
  it('maps 3→Creche, 4→Nursery(1), 5→KG1(1), 6→KG2(2), 7+→Primary', () => {
    expect(ageToBand(3)).toBe('Creche');
    expect(rankOf(ageToBand(4))).toBe(1);
    expect(rankOf(ageToBand(5))).toBe(1);
    expect(ageToBand(6)).toBe('KG2');
    expect(ageToBand(12)).toBe('Primary');
    expect(ageToBand(0)).toBeNull();
  });
});
