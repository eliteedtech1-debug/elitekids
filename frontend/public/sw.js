/* EliteKids app-shell service worker — v1 (E3-offline)
 * Bootstraps the SPA when the device has no connectivity.
 *   - Navigations: network-first, cached index.html fallback
 *   - Static assets (/assets/*, logo.svg): cache-first (hashed = immutable)
 *   - API calls (nginx-proxied same-origin) are NEVER intercepted.
 */
const CACHE = 'elitekids-shell-v2';
const SHELL_URL = '/index.html';
const ASSET_PREFIXES = ['/assets/', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(SHELL_URL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (ASSET_PREFIXES.every((p) => !url.pathname.startsWith(p))) {
    // Only touch navigations + known static assets; everything else passes through.
    if (req.mode !== 'navigate') return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(SHELL_URL, copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match(SHELL_URL)
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(req, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => Response.error());
    })
  );
});

/* ── E3f: weekend push notifications ─────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'EliteKids', {
      body: data.body || '',
      tag: data.tag || 'elitekids',
      renotify: false,
      data: { url: data.url || '/student' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/student';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf('/student') !== -1) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
