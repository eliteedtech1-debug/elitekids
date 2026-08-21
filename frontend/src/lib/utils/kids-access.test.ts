import { describe, it, expect } from 'vitest';
import { hasKidsAccess } from './school';

describe('hasKidsAccess gate (Kids Stand-Alone module)', () => {
  const cases: Array<{ kids_stand_alone: number | null | undefined; nursery_section: number; expected: boolean }> = [
    { kids_stand_alone: 0, nursery_section: 1, expected: false }, // module off → blocked
    { kids_stand_alone: 1, nursery_section: 1, expected: true }, // module on → granted
    { kids_stand_alone: 1, nursery_section: 0, expected: true }, // module on even without nursery section
    { kids_stand_alone: undefined, nursery_section: 1, expected: false }, // missing flag → deny by default
    { kids_stand_alone: null, nursery_section: 1, expected: false }, // null flag → deny by default
  ];

  for (const c of cases) {
    it(`kids_stand_alone=${c.kids_stand_alone} → ${c.expected}`, () => {
      expect(hasKidsAccess({ kids_stand_alone: c.kids_stand_alone })).toBe(c.expected);
    });
  }

  it('grants access when kids_stand_alone=1 even if other flags absent', () => {
    expect(hasKidsAccess({ kids_stand_alone: 1 })).toBe(true);
  });

  it('denies when school is null/undefined', () => {
    expect(hasKidsAccess(null)).toBe(false);
    expect(hasKidsAccess(undefined)).toBe(false);
  });
});
