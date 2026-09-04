import { describe, expect, it } from 'vitest';
import { isFlagshipSchool } from './school';

describe('isFlagshipSchool', () => {
  it('recognizes the canonical flagship school id', () => {
    expect(isFlagshipSchool('SCH-ELITE')).toBe(true);
    expect(isFlagshipSchool('sch-elite')).toBe(true);
  });

  it('recognizes the approved flagship short-name aliases', () => {
    expect(isFlagshipSchool('', 'elite')).toBe(true);
    expect(isFlagshipSchool('', 'KIDS')).toBe(true);
    expect(isFlagshipSchool('', 'practice')).toBe(true);
  });

  it('fails closed for other or missing school context', () => {
    expect(isFlagshipSchool('SCH-TEST', 'testkids')).toBe(false);
    expect(isFlagshipSchool()).toBe(false);
    expect(isFlagshipSchool('SCH-TEST', 'elite')).toBe(true);
  });
});
