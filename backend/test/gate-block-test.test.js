'use strict';
// TEMPORARY — intentionally failing test to prove the deploy gate blocks on red.
describe('gate-proof', () => {
  it('is intentionally red (gate must block this deploy)', () => {
    expect(1).toBe(2);
  });
});
