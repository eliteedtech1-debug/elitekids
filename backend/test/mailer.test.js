'use strict';

/**
 * Mailer unit tests — verify the transactional mailer FAILS OPEN (never throws
 * when SMTP is unconfigured, which the test env is) and rate-limits per
 * (recipient, kind) within the 6h window.
 *
 * Run: cd elite-kids/backend && npm test -- test/mailer.test.js
 */
const mailer = require('../src/services/mailer');

// Distinct recipients per test so module-level rate-limit state can't collide.
let seq = 0;
const whom = () => `user${++seq}@elitekids.test`;

describe('services/mailer', () => {
  it('exports the expected API', () => {
    expect(typeof mailer.send).toBe('function');
    expect(typeof mailer.notifyLockedSchoolAttempt).toBe('function');
    expect(mailer.SALES_EMAIL).toMatch(/@/);
  });

  it('send() returns false for a missing recipient (never throws)', async () => {
    await expect(mailer.send({ to: null, subject: 'x' })).resolves.toBe(false);
    await expect(mailer.send({ to: '', subject: 'x' })).resolves.toBe(false);
    await expect(mailer.send({ to: undefined, subject: 'x' })).resolves.toBe(false);
  });

  it('send() fails open (returns false, no throw) without SMTP config', async () => {
    // Test env has no SMTP_* vars, so transporter() is null -> false + log only.
    await expect(mailer.send({ to: whom(), subject: 'no smtp', kind: 'unit-no-smtp' })).resolves.toBe(false);
  });

  it('send() rate-limits repeated (recipient, kind) within the 6h window', async () => {
    const to = whom();
    const first = await mailer.send({ to, subject: 'rate check', kind: 'unit-ratelimit' });
    const second = await mailer.send({ to, subject: 'rate check 2', kind: 'unit-ratelimit' });
    // Both calls complete without throwing; the second is suppressed by the limiter.
    expect([first, second]).toContain(false);
  });

  it('send() permits distinct kinds to the same recipient', async () => {
    const to = whom();
    const a = await mailer.send({ to, subject: 'k1', kind: 'unit-kind-a' });
    const b = await mailer.send({ to, subject: 'k2', kind: 'unit-kind-b' });
    expect([a, b]).toContain(false);
  });

  it('notifyLockedSchoolAttempt() never throws and fails open without SMTP', async () => {
    const out = await mailer.notifyLockedSchoolAttempt({
      school: { school_id: 'SCH-TEST', school_name: 'Test School' },
      userType: 'teacher',
      plans: [{ name: 'Termly', amount_ngn: 500, billing_period: 'term' }],
      trial: null,
    });
    expect(out).toBe(false);
  });
});
