import { useState, useEffect, ImgHTMLAttributes } from 'react';
import { fetchWithCache } from '@/lib/utils/asset-cache';

/**
 * CachedImg — drop-in replacement for <img> that caches open-source assets in IndexedDB.
 *
 * Usage:
 *   <CachedImg src="https://cdn.jsdelivr.net/..." alt="Cat" className="h-10 w-10" />
 *
 * - First load: fetches from network, caches in IndexedDB, shows image
 * - Repeat loads: serves from IndexedDB instantly (no flicker)
 * - Falls back to original src if cache fails
 */
export default function CachedImg({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [resolvedSrc, setResolvedSrc] = useState(src || '');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolvedSrc('');
      setLoaded(false);
      return;
    }

    // Skip for blob/data URLs or non-HTTP URLs
    if (src.startsWith('blob:') || src.startsWith('data:') || !src.startsWith('http')) {
      setResolvedSrc(src);
      setLoaded(true);
      return;
    }

    let cancelled = false;

    fetchWithCache(src)
      .then((blobUrl) => {
        if (!cancelled) {
          setResolvedSrc(blobUrl);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(src); // fallback to original
          setLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [src]);

  if (!resolvedSrc) return null;

  return (
    <img
      {...props}
      src={resolvedSrc}
      onLoad={() => setLoaded(true)}
      onError={(e) => {
        // If cached URL failed, try original
        if (resolvedSrc !== src && src) {
          setResolvedSrc(src);
        }
        onError?.(e);
      }}
      aria-busy={!loaded}
      style={{
        ...props.style,
        opacity: loaded ? 1 : 0.5,
        backgroundColor: loaded ? props.style?.backgroundColor : '#E7EEF6',
        animation: loaded ? undefined : 'img-loading-pulse 1.5s ease-in-out infinite',
        transition: 'opacity 0.2s ease-in',
      }}
    />
  );
}
