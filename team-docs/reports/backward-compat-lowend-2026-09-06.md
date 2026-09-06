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
DONE. PUSHED 2026-09-06 commit 238c429 (origin/main, user-ordered). Auto-deploy
verified:
- backend: healthy 200, systemd restart 05:45:40 (journalctl)
- frontend: runner rebuilt dist 05:47 & rsynced to nginx docroot; live
  index.html carries boot-splash + vite-legacy + polyfills-legacy markers
- live asset HTTP: modern index 200, index-legacy 200, polyfills-legacy 200
- runner job completed clean (Worker_20260906-054329-utc.log "Job completed")

## ROUND 2 (this session) — CSS backward-compat ("no css ever" login)
Symptom reported by user: small device shows raw layout, giant scattered icons,
"like no CSS ever". Root cause: Tailwind v4 emits modern-only CSS — EVERY rule is
wrapped in `@layer` (Chrome 99+) and colors are `oklch()`/`color-mix()` (Chrome
111+). Old WebView without `@layer` parses the whole sheet to ZERO rules →
completely unstyled login. Layer-1 JS fix only fixed the boot, not the CSS.

Implemented (verified locally):
- frontend/scripts/compat-css.mjs — downlevels the built stylesheet:
   1. unwraps every `@layer` wrapper (incl. nested in @media/@supports), source
      order preserved so utilities still override base/theme
   2. converts every oklch()/oklab() token to static rgb()/rgba() (oklab→srgb
      matrix; spot-checked: teal-400→rgb(0,213,190), emerald-600→rgb(0,153,102))
   3. strips ` in oklab` interpolation hints from --tw-gradient-position (solid
      arbitrary hex gradients like login hero are untouched → render fine)
  color-mix() lines left in place (Tailwind emits a static rgb fallback on the
  line before every color-mix; old browsers keep the fallback, modern ignore it)
- vite.config.ts closeBundle plugin writes dist/assets/index-compat.css (202 KB)
- index.html boot script gains ES5 feature-detect (`@layer` probe + CSS.supports
  color-mix) → old/mid browsers redirect the stylesheet href to index-compat.css
  via MutationObserver swap + DOMContentLoaded backup append.
  Coverage: Chrome <99 (no @layer) + Chrome 99–110 (oklch missing) get compat;
  Chrome 111+ keep the modern sheet.
- Verified: build clean (compat css generated @layer=0 oklch=0 braces balanced),
  guard:bundle passed, vitest 229/229, decision scenario-tested
  (old→compat / modern→modern / mid→compat), swap regex tested on real hrefs.

## Status round 2
CODE DONE + verified. PUSHED 2026-09-06 commit 00d65ae (user-ordered push).
- First auto-deploy run (Worker_20260906-060605) FAILED at backend deploy step
  (exit 1 after 126s; stdout uploaded to results service, not retained locally).
  Root cause not fully recoverable; the hermetic backend gate re-ran manually
  right after:
      bash scripts/run-tests.sh --forceExit  ->  606/606 PASSED (84s)
  and live api (PID 639943, restarted at 05:49 by docs deploy) is active+200.
  Conclusion: 06:06 failure was transient (test-suite/db/env hiccup), NOT code.
- Re-trigger: commit fba30e2 → run Worker_20260906-061542 **SUCCEEDED**.
  Backend restarted (PID 659538, 06:18), backend gate green, frontend rebuilt by
  runner at 06:19 (index.html + dist assets), health 200.
- LIVE VERIFIED (kids.elitekids.com.ng):
  - GET /                        → 200, served HTML carries boot-splash +
    legacyCssNeeded + index-compat.css swap logic
  - GET /assets/index-compat.css → 200; content scan: @layer=0, oklch=0 ✓
  - GET /health (127.0.0.1:8484) → 200
## DONE. Round-2 CSS fix is LIVE and verified.

## ROUND 3 (this session) — visibility on low-end (user: invisible tabs/login btn,
"white text and lighter bg everywhere"; directive: keep colorful game-style,
colors are the safe primitive, shadows/gradients may not render)
Root cause analysis (validated against built CSS):
- Alpha* utility colors (bg-white/70, text-white/60 …) are emitted as
  `color-mix(in oklab, var(--color-x) p%, transparent)` inside
  `@supports(color:color-mix(in lab,red,red)){}`. A static rgba fallback line
  pre-exists, BUT 40 non-gated color-mix leftovers remain: the 59 gradient-alpha
  stops (`--tw-gradient-from/via/to: color-mix(...)`) live inside CUSTOM
  PROPERTIES where the @supports fallback does NOT protect them → on browsers
  without color-mix, the whole --tw-gradient-stops chain turns guaranteed-invalid
  → background-image dropped → gradient-filled buttons/chips/pills render as
  transparent → white text on light bg, "invisible" tab+login buttons.
- Gradient direction (--tw-gradient-position) was FINE (kept, hint stripped).
Implemented in frontend/scripts/compat-css.mjs (no new deps):
  1. resolveColorMix() + rewriteColorMixBodies(): statically resolve EVERY
     color-mix() inside declaration bodies → flat comma rgb/rgba, resolving
     var(--color-*) against the @theme :root map. @supports/@media PREAMBLES
     untouched (feature gates keep meaning; gated bodies now plain colors).
     Verified: .text-white/70 → color:rgba(255,255,255,.7);
     .from-[#0F4D92]/5 → rgba(15,77,146,.05); --tw-gradient-to:color-mix →
     flat rgba. Remaining color-mix = only inside @supports conditions (260)
     + shadow-alpha & ::placeholder (40, gated, cosmetic — user OK to drop
     shadows).
  2. addGradientFlatFallback(): every .bg-gradient-to-{t,r,b,l,tr,tl,br,bl}
     now also sets background-color:rgb(15,77,146) → flat brand color keeps
     buttons colored/readable even when gradients or custom properties are
     unsupported; where they ARE supported the gradient paints over it.
Local verification:
- npm run build clean (plugin regenerates index-compat.css, 193KB)
- compat sheet: @layer==0, oklch==0, braces balanced, all alpha stops flat
- node scripts/check-bundle.mjs PASSED, vitest 229/229
## Status round 3: CODE DONE + verified locally. Push pending user order.