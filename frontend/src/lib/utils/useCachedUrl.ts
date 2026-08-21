import { useState, useEffect } from 'react';
import { fetchWithCache } from './asset-cache';

/**
 * React hook that returns a cached blob URL for a media URL.
 *
 * Usage:
 *   const src = useCachedUrl(originalUrl);
 *   return <img src={src} />;
 *
 * - On first render: fetches from network, caches in IndexedDB, returns blob URL
 * - On repeat renders: returns cached blob URL instantly (no network)
 * - Falls back to original URL if cache and network both fail
 */
export function useCachedUrl(url: string | undefined | null): string {
  const [resolved, setResolved] = useState<string>(url || '');

  useEffect(() => {
    if (!url) {
      setResolved('');
      return;
    }

    // If it's already a blob URL or data URL, use as-is
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      setResolved(url);
      return;
    }

    let cancelled = false;

    fetchWithCache(url)
      .then((blobUrl) => {
        if (!cancelled) setResolved(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setResolved(url); // fallback to original
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}

/**
 * Hook that returns cached URLs for an array of items.
 * Useful for batch-caching game config assets.
 */
export function useCachedUrls(urls: (string | undefined | null)[]): string[] {
  const [resolved, setResolved] = useState<string[]>(urls.map((u) => u || ''));

  useEffect(() => {
    let cancelled = false;

    const resolveAll = async () => {
      const results = await Promise.allSettled(
        urls.map(async (url) => {
          if (!url) return '';
          if (url.startsWith('blob:') || url.startsWith('data:')) return url;
          try {
            return await fetchWithCache(url);
          } catch {
            return url;
          }
        })
      );

      if (!cancelled) {
        setResolved(results.map((r) => (r.status === 'fulfilled' ? r.value : urls[results.indexOf(r)] || '')));
      }
    };

    resolveAll();
    return () => { cancelled = true; };
  }, [urls.join(',')]);

  return resolved;
}
