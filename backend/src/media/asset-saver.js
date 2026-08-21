'use strict';
/**
 * Asset Saver — extracts open-source media URLs from game config JSON,
 * downloads them, and saves to our B2 bucket. Replaces CDN URLs with
 * stored URLs in the config.
 *
 * Called when a game is published so kids load from our bucket, not CDN.
 */
const { createHash } = require('crypto');
const { b2Upload, isB2Configured } = require('../storage/b2');
const { mediaPublicUrl, storageDir } = require('./media-pipeline');
const fs = require('fs');
const path = require('path');

/** Allowed CDN origins for open-source assets. */
const ALLOWED_ORIGINS = [
  'cdn.jsdelivr.net',
  'twemoji.maxcdn.com',
  'cdnjs.cloudflare.com',
  'fonts.gstatic.com',
];

/** Check if a URL is from a trusted open-source CDN. */
function isOpensourceUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return ALLOWED_ORIGINS.some((o) => u.hostname.includes(o));
  } catch {
    return false;
  }
}

/** Build a deterministic B2 key from a source URL. */
function urlToKey(url, label, category) {
  const hash = createHash('md5').update(url).digest('hex').slice(0, 12);
  const safeLabel = (label || 'asset').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const cat = (category || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  // Determine extension from URL
  let ext = 'png';
  if (url.includes('.jpg') || url.includes('.jpeg')) ext = 'jpg';
  else if (url.includes('.webp')) ext = 'webp';
  else if (url.includes('.gif')) ext = 'gif';
  else if (url.includes('.svg')) ext = 'svg';
  else if (url.includes('.mp3')) ext = 'mp3';
  else if (url.includes('.wav')) ext = 'wav';
  return `opensource/${cat}/${safeLabel}-${hash}.${ext}`;
}

/** Download a URL and return its buffer + content-type. */
async function fetchAsset(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType: ct };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Save a buffer to B2 or local disk. Returns the stored URL. */
async function saveToStorage(key, buffer, contentType) {
  if (isB2Configured()) {
    await b2Upload('media', key, buffer, contentType);
    return mediaPublicUrl(key);
  }
  // Local fallback
  const dir = path.join(storageDir(), 'opensource');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, key), buffer);
  return `${process.env.MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:34600'}/media/${key}`;
}

/**
 * Recursively walk a JSON value and collect all open-source URLs.
 * Returns [{ url, label, category }]
 */
function extractUrls(obj, labelPrefix = '', category = 'misc') {
  const urls = [];
  if (!obj || typeof obj !== 'object') return urls;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      urls.push(...extractUrls(item, `${labelPrefix}_${i}`, category));
    });
    return urls;
  }

  // Check string values that look like URLs
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && isOpensourceUrl(value)) {
      const label = obj.label || obj.name || obj.text || obj.title || labelPrefix || key;
      const cat = obj.category || category;
      urls.push({ url: value, label, category: cat });
    } else if (typeof value === 'object' && value !== null) {
      urls.push(...extractUrls(value, labelPrefix || key, obj.category || category));
    }
  }
  return urls;
}

/**
 * Save all open-source assets from a game config to our bucket.
 * Replaces CDN URLs with stored URLs in the config (mutates in place).
 *
 * Returns { saved: number, failed: number, urlMap: Map<oldUrl, newUrl> }
 */
async function saveGameAssets(configJson) {
  const extracted = extractUrls(configJson);
  if (extracted.length === 0) return { saved: 0, failed: 0, urlMap: new Map() };

  const urlMap = new Map();
  let saved = 0;
  let failed = 0;

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < extracted.length; i += 5) {
    const batch = extracted.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async ({ url, label, category }) => {
        if (urlMap.has(url)) return urlMap.get(url); // already processed
        const key = urlToKey(url, label, category);
        const asset = await fetchAsset(url);
        if (!asset) { failed++; return url; }
        const storedUrl = await saveToStorage(key, asset.buffer, asset.contentType);
        urlMap.set(url, storedUrl);
        saved++;
        return storedUrl;
      })
    );
    // Merge results into urlMap
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value !== batch[idx].url) {
        urlMap.set(batch[idx].url, r.value);
      }
    });
  }

  // Replace URLs in the config JSON (deep clone to avoid mutating the original)
  replaceUrls(configJson, urlMap);

  return { saved, failed, urlMap };
}

/** Deep-replace all CDN URLs in a JSON value with stored URLs. */
function replaceUrls(obj, urlMap) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => replaceUrls(item, urlMap));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && urlMap.has(value)) {
      obj[key] = urlMap.get(value);
    } else if (typeof value === 'object' && value !== null) {
      replaceUrls(value, urlMap);
    }
  }
}

module.exports = { saveGameAssets, extractUrls, isOpensourceUrl, replaceUrls };
