/**
 * Asset Cache — IndexedDB-based cache for open-source media (Twemoji images, sounds).
 *
 * Strategy:
 *   1. On first load: fetch from network → store in IndexedDB as Blob
 *   2. On repeat loads: serve from IndexedDB (instant, no network)
 *   3. Background refresh: re-fetch in background to keep cache fresh
 *
 * The cache is keyed by the original CDN URL, so the same asset from
 * different game configs shares one cache entry.
 */

const DB_NAME = 'elitekids-asset-cache';
const DB_VERSION = 1;
const STORE_NAME = 'assets';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry {
  url: string;
  blob: Blob;
  contentType: string;
  cachedAt: number;
}

let dbInstance: IDBDatabase | null = null;

/** Open (or create) the IndexedDB database. Singleton. */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.warn('IndexedDB asset cache failed to open:', request.error);
      reject(request.error);
    };
  });
}

/** Get a cached asset by URL. Returns null if not cached or expired. */
export async function getCachedAsset(url: string): Promise<{ blob: Blob; contentType: string } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);

      req.onsuccess = () => {
        const entry: CacheEntry | undefined = req.result;
        if (!entry) return resolve(null);

        // Check expiry
        if (Date.now() - entry.cachedAt > CACHE_MAX_AGE_MS) {
          // Expired — delete in background, return null so caller fetches fresh
          deleteFromCache(url).catch(() => {});
          return resolve(null);
        }

        resolve({ blob: entry.blob, contentType: entry.contentType });
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Store an asset in the cache. */
export async function cacheAsset(url: string, blob: Blob, contentType: string): Promise<void> {
  try {
    const db = await openDB();
    const entry: CacheEntry = { url, blob, contentType, cachedAt: Date.now() };

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // non-blocking
    });
  } catch {
    // Non-blocking — cache failure shouldn't break the app
  }
}

/** Delete a cached asset. */
async function deleteFromCache(url: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // non-blocking
  }
}

/**
 * Fetch an asset with cache-first strategy.
 * Returns a blob URL that can be used as <img src="">.
 *
 * 1. Check IndexedDB → if hit and fresh, return blob URL immediately
 * 2. Fetch from network → cache → return blob URL
 * 3. If network fails and stale cache exists, return stale blob URL
 */
export async function fetchWithCache(url: string): Promise<string> {
  // Check cache first
  const cached = await getCachedAsset(url);
  if (cached) {
    // Return cached blob URL
    const blobUrl = URL.createObjectURL(cached.blob);

    // Background refresh: re-fetch if more than 1 day old
    const entry = await getCacheEntry(url);
    const age = entry ? Date.now() - entry.cachedAt : 0;
    if (age > 24 * 60 * 60 * 1000) {
      refreshInBackground(url).catch(() => {});
    }

    return blobUrl;
  }

  // Not cached — fetch from network
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const blob = await resp.blob();
    const ct = resp.headers.get('content-type') || blob.type || 'application/octet-stream';

    // Cache for next time
    await cacheAsset(url, blob, ct);

    return URL.createObjectURL(blob);
  } catch (err) {
    // Network failed — try stale cache as fallback
    const stale = await getStaleCacheEntry(url);
    if (stale) {
      console.warn('Serving stale cache for:', url);
      return URL.createObjectURL(stale.blob);
    }
    // No cache at all — return original URL as last resort
    return url;
  }
}

/** Get the raw cache entry (with cachedAt timestamp). */
async function getCacheEntry(url: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Get stale cache entry (ignoring expiry). */
async function getStaleCacheEntry(url: string): Promise<CacheEntry | null> {
  return getCacheEntry(url);
}

/** Background refresh — fetch and update cache without blocking. */
async function refreshInBackground(url: string): Promise<void> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const ct = resp.headers.get('content-type') || blob.type || 'application/octet-stream';
    await cacheAsset(url, blob, ct);
  } catch {
    // Silent — background refresh failure is fine
  }
}

/**
 * Warm the cache with a list of URLs.
 * Called after login to pre-fetch assets for the student's games.
 * Processes in batches of 5 to avoid overwhelming the network.
 */
export async function warmCache(urls: string[]): Promise<{ cached: number; failed: number }> {
  let cached = 0;
  let failed = 0;

  // Only cache URLs we don't already have
  const uncached: string[] = [];
  for (const url of urls) {
    const existing = await getCachedAsset(url);
    if (!existing) uncached.push(url);
  }

  if (uncached.length === 0) return { cached: 0, failed: 0 };

  // Batch fetch
  for (let i = 0; i < uncached.length; i += 5) {
    const batch = uncached.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const ct = resp.headers.get('content-type') || blob.type || 'application/octet-stream';
          await cacheAsset(url, blob, ct);
          cached++;
        } catch {
          failed++;
        }
      })
    );
  }

  return { cached, failed };
}

/**
 * Extract all image/sound URLs from a game config JSON.
 * Used by warmCache to pre-fetch assets for a lesson.
 */
export function extractCacheableUrls(obj: any): string[] {
  const urls: string[] = [];
  if (!obj || typeof obj !== 'object') return urls;

  if (Array.isArray(obj)) {
    obj.forEach((item) => urls.push(...extractCacheableUrls(item)));
    return urls;
  }

  for (const [, value] of Object.entries(obj)) {
    if (typeof value === 'string' && isCacheableUrl(value)) {
      urls.push(value);
    } else if (typeof value === 'object' && value !== null) {
      urls.push(...extractCacheableUrls(value));
    }
  }

  return [...new Set(urls)]; // dedup
}

function isCacheableUrl(url: string): boolean {
  if (!url.startsWith('http')) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname.includes('cdn.jsdelivr.net') ||
      u.hostname.includes('twemoji.maxcdn.com') ||
      u.hostname.includes('cdnjs.cloudflare.com') ||
      u.hostname.includes('fonts.gstatic.com') ||
      u.hostname.includes('.elitekids.com.ng') // our own B2/media bucket
    );
  } catch {
    return false;
  }
}

/**
 * Get total cache size (for UI display).
 */
export async function getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();

      req.onsuccess = async () => {
        const count = req.result;
        // Estimate size by sampling a few entries
        let sizeBytes = 0;
        if (count > 0) {
          const cursorReq = store.openCursor();
          let sampled = 0;
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor && sampled < 10) {
              const entry = cursor.value as CacheEntry;
              sizeBytes += entry.blob?.size || 0;
              sampled++;
              cursor.continue();
            } else {
              // Extrapolate
              if (sampled > 0 && count > sampled) {
                sizeBytes = Math.round((sizeBytes / sampled) * count);
              }
              resolve({ count, sizeBytes });
            }
          };
          cursorReq.onerror = () => resolve({ count, sizeBytes: 0 });
        } else {
          resolve({ count: 0, sizeBytes: 0 });
        }
      };

      req.onerror = () => resolve({ count: 0, sizeBytes: 0 });
    });
  } catch {
    return { count: 0, sizeBytes: 0 };
  }
}

/**
 * Clear the entire cache.
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // non-blocking
  }
}
