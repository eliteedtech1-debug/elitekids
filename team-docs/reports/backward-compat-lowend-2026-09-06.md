# Backward compatibility — low-end Android (white-screen login) | 2026-09-06

Worker: opencode slave | Brief: support low-end devices / fix white screen on login.

## Root cause
Vite 7 default build target `baseline-widely-available` (~Chrome 107+) → old
Android WebView / Chrome cannot PARSE the shipped JS → React never mounts →
blank white page. Current `data-low-end` CSS mode only runs AFTER React mounts
(useEffect in App.tsx), so it cannot prevent the pre-mount white screen.

Observed today: main chunk `index-*.js` = 701 KB eager (login bundle).

## Fix (layered) — DONE in this session
1. `@vitejs/plugin-legacy@7.0.0` (+ `terser@^5.16.0`) in frontend/
   - v7.0.0 chosen: latest (8.x) requires Vite 8; repo is Vite 7.3.6.
   - vite.config.ts: legacy targets `ChromeAndroid>=47, Android>=5, Chrome>=47,
     Firefox>=54, Safari>=11, iOS>=11`, `polyfills:true, modernPolyfills:true`.
   - Build now emits BOTH modern + legacy bundles:
       modern  index-*.js     714 KB
       legacy  index-legacy..  990 KB (ES5-safe — scan: 0 `?.`, 0 `??`, 0 `=>`)
       polyfills / polyfills-legacy injected
   - index.html has modern-detection snippet (`__vite_is_modern_browser`) +
     SystemJS legacy fallback + `nomodule` path for non-module browsers
     (covers Android 4.x WebView). Full matrix:
       Chrome 107+            → modern
       Chrome 47–106 (module) → auto-fallback to legacy via detection
       no-module browsers     → nomodule legacy bundle
2. index.html inline ES5-safe boot script:
   - instant branded splash (never a blank white screen while 700KB+ parses)
   - synchronous low-end tag: `data-low-end` + `window.__ELITE_KIDS_LOW_END__`
   - 15s watchdog + window.onerror → graceful "update Chrome" card instead of
     permanent white screen if app cannot boot
   - yields to `app:ready` event / `window.__ELITE_KIDS_READY__`
   - added noscript fallback
3. main.tsx: sets `__ELITE_KIDS_READY__` + dispatches `app:ready` after render.
4. lowEnd.ts: honors pre-set window flag first (instant, idempotent), keeps
   existing deep detection as fallback.

## Verification
- `npm run build` (tsc + vite build) clean; dist has 28 legacy chunks + injection
- legacy main chunk ES5 scan clean (`let` hit is UI copy string only)
- `node scripts/check-bundle.mjs` PASSED (no dev-host URLs; VITE_API_URL ok)
- vitest 229/229 passed

## Artifacts to commit (frontend only)
- frontend/vite.config.ts
- frontend/index.html
- frontend/src/main.tsx
- frontend/src/lib/utils/lowEnd.ts
- frontend/package.json (+ @vitejs/plugin-legacy/terser deps)
- frontend/package-lock.json (regenerated)
- frontend/dist/* (rebuilt)

## Status
DONE (code + verified build). PUSH NOT PERFORMED — protocol: no push without
MASTER order. On push to main, auto-deploy rebuilds frontend on runner (npm ci
picks up locked legacy deps) + rsyncs dist to nginx docroot.