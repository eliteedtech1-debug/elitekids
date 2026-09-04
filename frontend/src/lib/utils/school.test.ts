import { describe, expect, it } from 'vitest';
import { isFlagshipSchool } from './school';

describe('isFlagshipSchool', () => {
  it('recognizes the approved flagship short-name aliases', () => {
    expect(isFlagshipSchool('', 'elite')).toBe(true);
    expect(isFlagshipSchool('', 'KIDS')).toBe(true);
    expect(isFlagshipSchool('', 'test')).toBe(true);
    expect(isFlagshipSchool('', 'practice')).toBe(true);
  });

  it('recognizes the approved flagship school ids', () => {
    expect(isFlagshipSchool('SCH-ELITE')).toBe(true);
    expect(isFlagshipSchool('SCH-KIDS')).toBe(true);
    expect(isFlagshipSchool('SCH-TEST')).toBe(true);
  });

  it('fails closed for other or missing school context', () => {
    expect(isFlagshipSchool('SCH-OTHER', 'other-school')).toBe(false);
    expect(isFlagshipSchool()).toBe(false);
    expect(isFlagshipSchool('SCH-OTHER', 'elite')).toBe(true);
  });
});
