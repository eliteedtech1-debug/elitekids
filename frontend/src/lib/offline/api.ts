/**
 * Offline-aware API wrapper — EliteKids offline mode.
 *
 * Wraps the existing apiClient to:
 *   - Queue POST/PUT/PATCH calls when offline (via offlineSync)
 *   - Fall back to IndexedDB cache for GET calls when offline
 *   - Automatically detect online/offline status
 *
 * Usage:
 *   import { offlineApi } from '@/lib/offline/api';
 *   // Same as apiClient but offline-aware
 *   const res = await offlineApi.get('/kids/lessons', { cacheKey: 'lessons-list' });
 *   await offlineApi.post('/kids/progress/game-complete', { ... }, { queueIfOffline: true });
 */

import apiClient, { type ApiError } from '@/lib/api/client';
import { offlineSync } from './sync';
import { offlineContent } from './content';

export interface OfflineApiOptions {
  /** If true, queue this call when offline instead of failing. */
  queueIfOffline?: boolean;
  /** Cache key for GET requests — used for offline fallback. */
  cacheKey?: string;
  /** TTL for cache fallback (ms). Default: 24h. */
  cacheTtl?: number;
}

/**
 * Offline-aware GET — falls back to cached data when offline.
 */
async function offlineGet<T = any>(
  url: string,
  params?: Record<string, unknown>,
  options?: OfflineApiOptions,
): Promise<{ data: T; fromCache: boolean }> {
  // Try network first
  if (navigator.onLine) {
    try {
      const res = await apiClient.get(url, { params });
      // Cache successful responses if a cacheKey was provided
      if (options?.cacheKey) {
        const { offlineDB, STORES } = await import('./db');
        await offlineDB.put(STORES.gameConfigs, options.cacheKey, {
          value: res.data,
          cachedAt: Date.now(),
        });
      }
      return { data: res.data, fromCache: false };
    } catch (err: any) {
      // Network error — try cache
      if (err?.network && options?.cacheKey) {
        return getFromCache<T>(options.cacheKey);
      }
      throw err;
    }
  }

  // Offline — try cache
  if (options?.cacheKey) {
    return getFromCache<T>(options.cacheKey);
  }

  // No cache available — throw friendly error
  throw {
    message: 'error.offline_check',
    status: 0,
    network: true,
  } as ApiError;
}

async function getFromCache<T>(cacheKey: string): Promise<{ data: T; fromCache: boolean }> {
  const { offlineDB, STORES } = await import('./db');
  const cached = await offlineDB.get<{ value: T }>(STORES.gameConfigs, cacheKey);
  if (cached?.value) {
    return { data: cached.value, fromCache: true };
  }
  throw {
    message: 'error.offline_not_cached',
    status: 0,
    network: true,
  } as ApiError;
}

/**
 * Offline-aware POST/PUT/PATCH — queues when offline.
 */
async function offlineMutate<T = any>(
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  body?: Record<string, unknown>,
  options?: OfflineApiOptions,
): Promise<{ data: T; queued: boolean }> {
  if (navigator.onLine) {
    try {
      const res = await apiClient({ method, url, data: body });
      return { data: res.data, queued: false };
    } catch (err: any) {
      if (err?.network && options?.queueIfOffline) {
        // Queue for later
        await offlineSync.enqueue({ endpoint: url, method, body: body || {} });
        return { data: null as any, queued: true };
      }
      throw err;
    }
  }

  // Offline
  if (options?.queueIfOffline) {
    await offlineSync.enqueue({ endpoint: url, method, body: body || {} });
    return { data: null as any, queued: true };
  }

  throw {
    message: 'error.offline_check',
    status: 0,
    network: true,
  } as ApiError;
}

/**
 * Offline-aware DELETE — queues when offline.
 */
async function offlineDelete<T = any>(
  url: string,
  options?: OfflineApiOptions,
): Promise<{ data: T; queued: boolean }> {
  if (navigator.onLine) {
    try {
      const res = await apiClient.delete(url);
      return { data: res.data, queued: false };
    } catch (err: any) {
      if (err?.network && options?.queueIfOffline) {
        await offlineSync.enqueue({ endpoint: url, method: 'DELETE' as any, body: {} });
        return { data: null as any, queued: true };
      }
      throw err;
    }
  }

  if (options?.queueIfOffline) {
    await offlineSync.enqueue({ endpoint: url, method: 'DELETE' as any, body: {} });
    return { data: null as any, queued: true };
  }

  throw {
    message: 'error.offline_check',
    status: 0,
    network: true,
  } as ApiError;
}

/**
 * Save session state for offline resume.
 * Tries network first; if offline, saves to IndexedDB.
 */
async function saveSessionOffline(
  sessionId: string,
  studentId: string,
  itemId: string,
  tier: number,
  savedState: Record<string, unknown>,
): Promise<{ saved: boolean; queued: boolean }> {
  const body = {
    session_id: sessionId,
    student_id: studentId,
    current_item_id: itemId,
    current_tier: tier,
    saved_state: savedState,
  };

  if (navigator.onLine) {
    try {
      await apiClient.post('/kids/session/save', body);
      return { saved: true, queued: false };
    } catch {
      // Fall through to offline save
    }
  }

  // Save locally
  const { offlineDB, STORES } = await import('./db');
  const key = `${studentId}:${sessionId}`;
  await offlineDB.put(STORES.sessionState, key, {
    ...body,
    savedAt: Date.now(),
  });

  // Queue sync
  await offlineSync.enqueue({ endpoint: '/kids/session/save', method: 'POST', body });

  return { saved: true, queued: true };
}

/**
 * Resume session from offline cache.
 */
async function resumeSessionOffline(
  studentId: string,
): Promise<Record<string, unknown> | null> {
  const { offlineDB, STORES } = await import('./db');
  const entries = await offlineDB.getAll<Record<string, unknown>>(STORES.sessionState);
  const match = entries.find((e) => (e.value as Record<string, unknown>)?.student_id === studentId);
  return (match?.value as Record<string, unknown>) || null;
}

/** Offline-aware API surface. */
export const offlineApi = {
  get: offlineGet,
  post: <T = any>(url: string, body?: Record<string, unknown>, opts?: OfflineApiOptions) =>
    offlineMutate<T>('POST', url, body, opts),
  put: <T = any>(url: string, body?: Record<string, unknown>, opts?: OfflineApiOptions) =>
    offlineMutate<T>('PUT', url, body, opts),
  patch: <T = any>(url: string, body?: Record<string, unknown>, opts?: OfflineApiOptions) =>
    offlineMutate<T>('PATCH', url, body, opts),
  delete: offlineDelete,
  saveSession: saveSessionOffline,
  resumeSession: resumeSessionOffline,
  prefetch: offlineContent,
};
