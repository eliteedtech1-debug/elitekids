'use strict';

const {
  isFlagshipPilotEnabled,
  isPilotValidationComplete,
} = require('../src/services/featureFlags');

describe('flagship pilot policy', () => {
  test('is disabled by default and cannot be enabled for non-flagship schools', () => {
    expect(isFlagshipPilotEnabled('SCH-ELITE', { KIDS_FLAGSHIP_PILOT_ENABLED: 'false' })).toBe(false);
    expect(isFlagshipPilotEnabled('SCH-OTHER', {
      KIDS_FLAGSHIP_PILOT_ENABLED: 'true',
      KIDS_FLAGSHIP_PILOT_SCHOOLS: 'SCH-OTHER',
    })).toBe(false);
  });

  test('requires both the flag and explicit flagship allow-list', () => {
    expect(isFlagshipPilotEnabled('SCH-ELITE', {
      KIDS_FLAGSHIP_PILOT_ENABLED: 'true',
    })).toBe(false);
    expect(isFlagshipPilotEnabled('SCH-ELITE', {
      KIDS_FLAGSHIP_PILOT_ENABLED: 'true',
      KIDS_FLAGSHIP_PILOT_SCHOOLS: 'SCH-ELITE',
    })).toBe(true);
    expect(isFlagshipPilotEnabled('SCH-KIDS', {
      KIDS_FLAGSHIP_PILOT_ENABLED: 'true',
      KIDS_FLAGSHIP_PILOT_SCHOOLS: 'SCH-ELITE',
    })).toBe(false);
  });

  test('requires every adult validation assertion', () => {
    const complete = { played: true, story_checked: true, game_checked: true, safety_checked: true };
    expect(isPilotValidationComplete(complete)).toBe(true);
    expect(isPilotValidationComplete({ ...complete, game_checked: false })).toBe(false);
    expect(isPilotValidationComplete({ played: true })).toBe(false);
  });
});
