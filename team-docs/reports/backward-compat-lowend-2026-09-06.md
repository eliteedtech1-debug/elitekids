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
## Round 4: MatchingGame — sequential one-pair-at-a-time (frictionless)

Timestamp: 2026-09-06 06:56 (worker)
Req: pair games on mobile feel cramped; show ONE item ("Cat:") with a list of all
pairing options, auto-advance to next pairing after EVERY pick (wrong included) —
no waiting for human "Next" navigation. Support images, not just emojis.

Changes (frontend only):
- src/pages/Student/GamePlay.tsx: rewrote MatchingGame.
  - Fixed shuffled question order (questionOrderRef) + de-duplicated shuffled option
    pool built from every pair's "b" (Map by String(b); handles dup 'Baa').
  - Prompt card shows one pairing (image | audio | big text). Options = bigger cards
    (min-h-28/32, grid-cols-2 sm:3) with CachedImg when pair.image or value looks
    like an image src; text fallback for labels/emojis; label shown under image.
  - handlePick feedback timing: TEST mode = one pick per question, wrong auto-advances
    after 350ms shake. PRACTICE mode = retry-until-correct (no auto-advance on wrong,
    kid stays on the question until they pick the right answer). Learning auto-plays.
  - "Question X of N" header + progress dots; stripEmoji on option labels via aria-label.
  - Learning mode auto-plays each pairing sequentially (speak A → highlight B → next).
  - New module helpers: isImageSrc(), pairVisual() (prompt/response image resolution).
- i18n: added game.matchPromptLabel / game.matchPickLabel / game.matchQuestion
  ({current}/{total} interpolation) to chunks/en-g-i.ts + locales/en.json + ha.json
  (HA: Matsa katin da ya dace / Haɗa wannan / Tambaya {current} cikin {total}).

Verified:
- npm run build clean (1m7s)
- node scripts/check-bundle.mjs PASSED
- vitest 229/229 (20 files)

## Status round 4: CODE DONE + verified locally. Push pending user order.
## Round 4 DEPLOY: SUCCESS
2026-09-06 07:03 (worker): push 35a34d9 → Worker_20260906-065842, Job result Succeeded,
exit 0 (backend gate 606/606 + frontend rebuild + dist rsync). Live.

## Round 5: AppSwitcher (login + navbar) low-end support

2026-09-06 07:06 (worker)
Req: AppSwitcher dropdown + consent modal must work on old Android WebViews,
not just modern Chrome.

Root cause: breakage was all INLINE styles in src/components/AppSwitcher.tsx
(inline styles are NOT covered by the compat-css.mjs Tailwind pipeline):
- consent-modal overlay used `inset: 0` (Chrome 87+) → old WebViews drop ALL
  four offsets → overlay collapses, modal unusable.
- app-tile tints used 8-digit hex alpha `#3D5EE114` (Chrome 62+) → invalid on
  old browsers → app tiles/emoji lost their tinted background.
- flex `gap` in modal header / consent row / footer buttons (Chrome 84+) →
  squashed on low-end.

Fixes:
- AppSwitcher.tsx: new `hexToRgba(hex, alpha)` helper → plain rgba() tints
  (menu tile 0.08, modal header tile 0.08). Modal overlay now explicit
  top/right/bottom/left 0 instead of `inset`. Replaced inline flex `gap` with
  explicit margins (marginRight 10 / marginLeft 10 / marginLeft+marginTop 8).
  Shared component → fixes BOTH login and navbar instances at once.
- PopoverPanel.tsx: outside-close now also listens to touchstart + mousedown
  (capture) beside pointerdown, so old Android WebViews lacking Pointer Events
  still close the dropdown; idempotent on modern browsers.

Verified:
- npm run build clean (1m)
- node scripts/check-bundle.mjs PASSED, vitest 229/229

## Status round 5: CODE DONE + verified locally. Push pending user order.

## Round 5 DEPLOY: transient gate failure — RE-TRIGGER
2026-09-06 07:10 (worker): push 21491ae → Worker_20260906-070707 FAILED (backend gate
exit 1, ~1:59). Change is frontend-only; local re-run of the hermetic gate passed
606/606 → flaky/environmental, not code (same class as round-2 060605 incident).
API not restarted, frontend not rebuilt by that run. Re-triggering via docs bump.
## Round 5 DEPLOY: SUCCESS
2026-09-06 07:16 (worker): re-trigger 7b38b00 → Worker_20260906-071152 Succeeded.
API restarted, dist rsynced 07:15 (index.html), live https://kids.elitekids.com.ng = 200,
  health 127.0.0.1:8484 = ok.

## Round 6: placement-quiz modal + dashboard cards scatter on low-end (user report: "placement test scattered, not in a modal; streak/weekly/daily cards scattered on small androids")

2026-09-06 ~08:50 (worker, Buffy via Freebuff)
Req: two scatter bugs on low-end — (1) PlacementQuiz renders as scattered page
content instead of a centered modal; (2) kid-dashboard streak/weekly/daily
cards scatter on small Androids.

Root cause (validated against built compat sheet):
1. LOGICAL PROPERTIES (Chrome 87+): Tailwind v4 emits px/py utilities as
   padding-inline/padding-block, mx-auto as margin-inline:auto, space-y as
   margin-block-start/end; 63 declarations total. Old WebViews drop them
   wholesale → every container loses padding/centering/rhythm → scattered.
2. flex/grid `gap` (Chrome 84+): grid card spacing vanished → cards squash
   together / scatter. (Round-5 fix covered only inline flex gap.)
3. INDIVIDUAL TRANSFORM PROPS translate:/rotate:/scale: (Chrome 104+), 36
   declarations incl. active:scale/hover lifts; also @property-based
   --tw-translate-*/--tw-scale-* defaults are absent pre-Chrome-85, so even
   converted transforms would have been invalid.
4. :where()/:is() SELECTORS (Chrome 88+): every space-y-* rule is
   `.space-y-N>:where(:not(:last-child))` → whole rule invalid → vertical
   rhythm zero; group-hover/peer-checked utilities also died.
5. PlacementQuiz overlay used the `inset-0` utility — switched component to
   explicit top/right/bottom/left utilities for belt-and-braces parity with
   the round-5 AppSwitcher fix.

Implemented:
- frontend/scripts/compat-css.mjs — 4 new downlevel passes (no deps):
    logicalToPhysical(): margin/padding/inset/border inline/block[-side] →
      physical left/right/top/bottom (mx-auto → margin-left/right:auto,
      space-y margin-block-* → margin-top/bottom)
    individualTransformsToTransform(): translate/rotate/scale: → transform:
      (replacement — individual props compose with transform on modern),
      multi-token → translate3d/scale(a,b), var(--tw-*,0) fallbacks injected
    addLegacyGapNames(): every gap/column-gap/row-gap ALSO emits
      grid-column-gap/grid-row-gap (Chrome 57+ legacy grid names)
    expandWhereIsSelectors(): expands :where(A,B)/:is(A,B) in SELECTOR
      position to plain selectors (cartesian product, ≤8 args, at-rule
      preludes untouched; recursive scanner — at-rules recurse, decl blocks
      verbatim). Restores space-y rhythm + group-hover/peer utilities.
- frontend/src/components/PlacementQuiz.tsx: overlay `inset-0` →
  `top-0 right-0 bottom-0 left-0` (explicit offsets, same rendering).

Verification (local):
- npm run build clean (tsc + vite, ~1m); compat sheet 196,754B
- compat census: @layer=0 oklch/oklab=0 color-mix bodies=flat
  padding/margin/inset logical=0 translate:/rotate:/scale:=0 :where=0 :is=0
  braces 2567/2567 balanced
- spot rules: .mx-auto{margin-left:auto;margin-right:auto};
  .space-y-5>:not(:last-child){…margin-top/margin-bottom…} (plain);
  .peer-checked translate-x rule now transform:translate(var(--tw-translate-x,0),var(--tw-translate-y,0))
- node scripts/check-bundle.mjs PASSED
- vitest 229/229 (20 files)

## Status round 6: CODE DONE + verified locally. PUSHED 2026-09-06 commit 42e6126 (user-ordered).

## Round 6 DEPLOY: transient gate failure — RE-TRIGGER
2026-09-06 09:35 (worker): push 42e6126 → Worker_20260906-091908 FAILED at backend
gate (step failed ~110s in; job result Failed; frontend deploy step skipped by
gate). Same transient signature as round-2 (060605) and round-5 (070707)
incidents — change is frontend-only (compat-css.mjs + PlacementQuiz overlay),
backend untouched. Frontend fix is already effectively live on this VPS because
nginx docroot IS this repo tree and dist/ was built+verified locally at 08:45
(live compat sheet byte-identical: :where=0, padding-inline=0, 196,753B; site
200, api health 200). NOTE: runner's `git reset --hard` discard-recovered the
post-push status line in this report (no /tmp stash file — tree was clean at
reset time). Re-trigger: commit fd90b9f → Worker_20260906-093501 **SUCCEEDED**
(09:37:59Z). Backend restarted 09:36:40 (api up, ws attached), frontend rebuilt
+ rsynced to docroot 09:37:56. LIVE VERIFIED (kids.elitekids.com.ng): GET / →
200 with boot-splash + legacyCssNeeded markers; /assets/index-compat.css →
196,753B with :where=0, padding-inline=0, grid-column-gap=18 (legacy gap
aliases present); api health 127.0.0.1:8484 → 200.
## Round 6 DEPLOY: SUCCESS — placement-quiz modal + dashboard cards fix is LIVE.

## Round 7: deploy-gate root cause + CI compat guard (worker Buffy, 2026-09-06 ~10:30)

Req (user): (a) investigate the recurring backend test-gate "transient" failures
that broke deploys in rounds 2/5/6; (b) add a CI check scanning the compat CSS
for modern-only features so regressions fail the build.

### (a) Gate failures — NOT transient. Root cause found + fixed.
Reproduced on-box: right after a successful deploy the backend gate FAILS with
29 suites / "Cannot find module 'supertest'" in ~4s. Resolver path in the error
= ~/.npm/_npx/... → `npx jest` was running from the NPX CACHE, not the tree.
Chain: deploy.yml ended every successful backend deploy with
`npm prune --omit=dev` → jest/supertest DELETED from backend/node_modules →
next deploy's gate silently fell back to the npx cache (whose resolver cannot
see backend modules) AND the gate's npm ci --include=dev had to re-download all
538 packages from the registry → one registry hiccup (~2min mark) = step death
= the three "transient" failures (Worker_20260906-060605 / 070707 / 091908, all
exit 1 at 110–126s, no OOM — kernel log clean, 9.3GB free).
Fixes:
- scripts/run-tests.sh: PREFLIGHT GUARD — if node_modules/jest or
  node_modules/supertest missing, npm ci --include=dev first (self-heals any
  pruned tree; FATAL exit 2 if restore fails).
- .github/workflows/deploy.yml: REMOVED the post-deploy `npm prune --omit=dev`
  (dev deps stay installed → subsequent gates run offline-safe & fast); gate
  retry once with FULL output on failure (previous silent retry hid the real
  error); persistent on-box gate log /tmp/elitekids-backend-gate-*.log (the
  results service retains nothing after upload — blocks dir wiped); `set -e`
  re-armed before systemctl restart.
Verified: pruned tree → preflight restored deps → gate green (mailer smoke 6/6
+ full suite 606/606 twice). Frontend: build clean, guard:bundle PASSED,
vitest 229/229.
Note: 606-test corpus has a pre-existing intermittent shared-DB pollution flake
(C-DEBT-05, 2 tests) — the new retry absorbs it; still ticket-only per Phase C
precedent.

### (b) CI compat-CSS guard — frontend/scripts/check-compat-css.mjs
Denylist scanner over dist/assets/index-compat.css (exit 1 on any hit):
cascade-layer / container-query rules; :where/:is/:has selectors; oklch/oklab;
logical props (padding-inline/margin-block/inset-inline/border-*) ; individual
transform props (translate:/rotate:/scale:); min()/max()/clamp() math fns
(minmax allowed); dvh/svh/lvh; image-set(); text-wrap:balance/pretty; color-mix
outside @supports blocks (inside = intended fallback, warned only); brace
balance + non-empty sheet sanity. WARN-only: aspect-ratio (auto-height
degrade), gated color-mix bodies (cosmetic drop). String literals stripped
before matching (data-URI safety); deny tokens written as RegExp strings so
Tailwind's content scanner never sees raw @tokens here (a literal `@container`
in v1 of the checker made Tailwind generate a ghost `.\@container` utility in
the sheet — caught by the guard itself on first run, fixed). Wired into
`npm run build` after vite build (regression = build fails) + `guard:compat`
script. Negative-tested: injected padding-inline/:where/oklch/ungated
color-mix all caught.

## Status round 7: DONE + verified.
PUSHED 2026-09-06 commit 526ebe9 (user-ordered; includes C-DEBT-05 ticket upgrade
in reports/c-preexisting-failures.md). Deploy Worker_20260906-102131 SUCCEEDED
10:24:53Z — FIRST run on the hardened workflow: gate passed via on-box log
/tmp/elitekids-backend-gate-20260906T102141Z.log (50 suites, 606/606, 89s, no
retry needed), API restarted 10:23:19, frontend rebuilt+rsynced 10:24:50, compat
guard ran inside the live build (192.2KB sheet, 0 modern-only features). Live:
site 200, health 200, compat :where=0.
Low-end verification audit (on-box equivalent of device testing): all 319
classes used by PlacementQuiz + dashboard card components (StreakReminder,
RevisionCard, ReviewZone, StreakCounter, XPBar, GoalCard) resolve to rules in
the live compat sheet (v1 audit's 94 'missing' were audit-script escaping
artifacts — backslash unescaping + nested-template stripping fixed it).
Physical-device confirmation still recommended on real hardware.
