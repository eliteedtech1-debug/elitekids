import { describe, it, expect } from 'vitest';
import { evaluateBudget } from './storage-budget';

describe('evaluateBudget (#6 storage budget guard)', () => {
  // 1 GB quota
  const GB = 1024 * 1024 * 1024;

  it('allows prefetch when usage is well under the soft limit', () => {
    const r = evaluateBudget(GB, 100 * 1024 * 1024); // 100 MB / 1 GB
    expect(r.canPrefetch).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it('blocks at the 80% soft limit', () => {
    const r = evaluateBudget(GB, 850 * 1024 * 1024); // 850 MB / 1 GB
    expect(r.canPrefetch).toBe(false);
    expect(r.reason).toBe('soft-limit');
  });

  it('trusts a known generous quota (hard ceiling applies only when quota is unknown)', () => {
    // 10 GB quota with 250 MB used is comfortably under the 80% soft limit —
    // a real quota always wins over the hard ceiling fallback.
    const r = evaluateBudget(10 * GB, 250 * 1024 * 1024);
    expect(r.canPrefetch).toBe(true);
    expect(r.hasEstimate).toBe(true);
  });

  it('blocks when free headroom drops below 50 MB (but still under soft limit)', () => {
    // 200 MB quota → 80% soft limit = 160 MB. 155 MB used is under soft
    // limit but leaves only 45 MB free → headroom guard stops prefetch.
    const r = evaluateBudget(200 * 1024 * 1024, 155 * 1024 * 1024);
    expect(r.canPrefetch).toBe(false);
    expect(r.reason).toBe('headroom');
  });

  it('allows writes when quota is unknown and usage is under hard ceiling', () => {
    const r = evaluateBudget(0, 50 * 1024 * 1024);
    expect(r.canPrefetch).toBe(true);
    expect(r.hasEstimate).toBe(false);
  });

  it('blocks when quota is unknown but usage exceeds hard ceiling', () => {
    const r = evaluateBudget(0, 300 * 1024 * 1024);
    expect(r.canPrefetch).toBe(false);
    expect(r.reason).toBe('hard-limit');
  });

  it('exactly at the soft limit boundary is allowed (80% is the cutoff)', () => {
    const r = evaluateBudget(GB, 0.8 * GB);
    expect(r.canPrefetch).toBe(true);
  });
});
