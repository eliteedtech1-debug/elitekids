/**
 * Storage budget guard — EliteKids (#6 Storage Budget Mgmt).
 *
 * IndexedDB prefetch (offline content + asset cache) must never blow past the
 * device's available quota on low-end Android / rural devices. This module
 * centralizes the quota check so every prefetch path (offline content manager,
 * asset cache warmCache, catalog save) consults the same budget rules.
 *
 * Policy (doc: ecce-offline-design.md §storage-budget):
 *   - SOFT_LIMIT: stop prefetching NEW content when usage exceeds this fraction
 *     of the available quota (default 80%).
 *   - HARD_BYTES: absolute ceiling for prefetch regardless of quota (default
 *     200 MB) — protects devices where storage.estimate() is unavailable.
 *   - MIN_FREE_BYTES: always keep this much headroom free (default 50 MB).
 *
 * All checks are best-effort: if the Storage API is unavailable the guard
 * allows the write (legacy devices have no quota to protect).
 */

const SOFT_LIMIT_FRACTION = 0.8;
const HARD_BYTES = 200 * 1024 * 1024; // 200 MB
const MIN_FREE_BYTES = 50 * 1024 * 1024; // 50 MB

export interface StorageBudgetInfo {
  /** Total quota granted by the browser (bytes). 0 = unknown. */
  quotaBytes: number;
  /** Current usage reported by the browser (bytes). 0 = unknown. */
  usageBytes: number;
  /** Whether we have a real estimate (vs. unknown). */
  hasEstimate: boolean;
  /** Whether prefetch should proceed per the budget rules. */
  canPrefetch: boolean;
  /** Reason when canPrefetch is false (for logging/banner). */
  reason?: 'soft-limit' | 'hard-limit' | 'headroom';
}

/** Query the browser for current storage usage/quota. */
export async function getStorageBudget(): Promise<StorageBudgetInfo> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { quotaBytes: 0, usageBytes: 0, hasEstimate: false, canPrefetch: true };
    }
    const est = await navigator.storage.estimate();
    const quota = est.quota ?? 0;
    const usage = est.usage ?? 0;
    return evaluateBudget(quota, usage);
  } catch {
    return { quotaBytes: 0, usageBytes: 0, hasEstimate: false, canPrefetch: true };
  }
}

/** Pure budget evaluation — exported for unit tests. */
export function evaluateBudget(quotaBytes: number, usageBytes: number): StorageBudgetInfo {
  if (quotaBytes <= 0) {
    // Unknown quota — fall back to the absolute ceiling only.
    return {
      quotaBytes: 0,
      usageBytes,
      hasEstimate: false,
      canPrefetch: usageBytes < HARD_BYTES,
      reason: usageBytes >= HARD_BYTES ? 'hard-limit' : undefined,
    };
  }

  const softBytes = quotaBytes * SOFT_LIMIT_FRACTION;
  const remaining = quotaBytes - usageBytes;

  let reason: StorageBudgetInfo['reason'];
  // Strict `>`: exactly at 80% is still allowed; prefetch pauses once usage
  // EXCEEDS the soft fraction (matches the docstring above).
  if (usageBytes > softBytes) {
    reason = 'soft-limit';
  } else if (remaining < MIN_FREE_BYTES) {
    reason = 'headroom';
  }

  return {
    quotaBytes,
    usageBytes,
    hasEstimate: true,
    canPrefetch: !reason,
    reason,
  };
}

/**
 * Convenience check for prefetch paths. Returns true when prefetch may proceed.
 */
export async function canPrefetch(): Promise<boolean> {
  const budget = await getStorageBudget();
  return budget.canPrefetch;
}

/** Human-readable summary for the OfflineBanner / settings UI. */
export function formatBudget(info: StorageBudgetInfo): string {
  const mb = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;
  const base = info.hasEstimate
    ? `${mb(info.usageBytes)} of ${mb(info.quotaBytes)} used`
    : `${mb(info.usageBytes)} used`;
  if (!info.canPrefetch) {
    const why =
      info.reason === 'hard-limit'
        ? 'cache budget reached'
        : info.reason === 'soft-limit'
        ? 'at 80% of storage budget'
        : 'low free storage';
    return `${base} — prefetch paused (${why})`;
  }
  return `${base} — prefetch OK`;
}
