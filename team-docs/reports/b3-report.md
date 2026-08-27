# B3 Report — Kids-Web Hardening

Executor: phaseB2 agent (opencode) · 2026-08-23 · Brief: team-docs/briefs-b3.md (detailed legacy) + briefs/b3-kids-web-hardening.md

## Step 0 — kids-web restart diagnosis: ENV-LEVEL (report only)
pm2 kids-web = `npx vite --host --port 5173 --strictPort` (dev server). 4 restarts, 0 unstable,
error log 0 bytes. Out-log shows `[vite] .env changed, restarting server...` — restarts are vite
self-restarts on .env edits/config churn. No code-level crash. Side-finding: stray
`dist-backup-*` dirs inside frontend/ cause harmless page-reload noise in dev.

## Step 1 — Error boundaries: DONE
- NEW `frontend/src/components/ErrorBoundary.tsx` — kid-friendly fallback (gamepad art, retry +
  home buttons ≥44px, role=alert, aria-live).
- Wrapped routes in App.tsx: `/student`, `/student/game/:lessonId`, `/teacher/create-game`.

## Step 2 — Loading states: DONE
- `CachedImg` now renders a skeleton state while loading (bg tint + dedicated
  `img-loading-pulse` keyframes in animations.css, `aria-busy`), central for all game media.
- GamePlay API loading screen already existed; kept.

## Step 3 — Mode-lock UX parity: DONE (verified against backend source)
- Backend `kidsModeLock.js` GET returns `{success:true,data:lock||null}` — confirmed.
- GamePlay: added `lockChecked` gate → gameplay entry waits for lock resolution; URL/
  localStorage mode can no longer race past a late-arriving lock; conflicting pre-selected
  modes fall back to locked_mode with timer reset.
- Game endpoint `data:null` when lock blocks: error branch now shows lock-aware copy
  ("locked to X mode by Y") instead of misleading "Game not found".

## Step 4 — Pre-deploy bundle guard: DONE + caught a real leak
- NEW `frontend/scripts/check-bundle.mjs` + npm script `guard:bundle`. Fails on
  localhost/127.0.0.1 URLs in built dist and on missing VITE_API_URL (empty allowed:
  nginx same-origin topology documented inline).
- First run FAILED: found dormant `'http://localhost:34600'` fallback literal from
  constants.ts BASE_URL dead branch. Fixed BASE_URL to same-origin default ('').
  Vendored workbox worker fallback (`location.href||"http://localhost"`) allowlisted with
  justification. Now PASSES; rebuilt bundle clean.

## Step 5 — JP unit-page smoke matrix: DONE (reports/b3-smoke-matrix.md)
JP = "Jolly Phonics Adventure" series (kids_game_series id `series-jolly-phonics`),
5 units × 3 lessons = 15 pages. Every probe validates CONTENT-TYPE AND BODY:
- Page layer via nginx vhost: 15/15 PASS (text/html with real SPA root div — fallback can't fake it).
- Game-config API direct :8484 (authenticated with ephemeral in-memory JWT for a real
  student record; secret never read into logs): 15/15 PASS, correct templates served
  (tap-recognition/matching/drag-sort/quiz/fill-in-blank per unit design).
- Scenes APIs: shape-valid 15/15, but **no lesson has published scene scripts yet**
  (valid `{success:false}` 404s; frontend handles gracefully by skipping intro).
  → CONTENT GAP for Phase D content factory.
- Script: team-docs/tmp/b3_smoke.py (reusable; takes SMOKE_JWT env).

## Bonus (from summary brief): Accessibility pass
Tap targets now ≥40px with aria-labels: GamePlay intro/play back+sound toggles,
StudentHome refresh+sign-out. Keyboard semantics (role=button/tabIndex/Enter-Space)
added to fill-in-blank slots, puzzle grid slots, puzzle piece bank tiles,
CompanionSelect dismiss bubble. Contrast bumps gray-400→600 for all gameplay
instruction texts (drag/tap hints, skip-story control, word bank labels).

## Verification
- `tsc && vite build`: PASS (rebuilt 3x during run; dist current & served).
- vitest: 31/31 PASS.
- guard:bundle: PASS.
- Live: elitekids.com.ng vhost serves new bundle (200) and body-verified JP pages.

## Files changed (kids-web only, no git commits per rules)
- src/App.tsx · src/components/ErrorBoundary.tsx (new) · src/components/CachedImg.tsx
- src/lib/utils/animations.css · src/lib/utils/constants.ts
- src/pages/Student/GamePlay.tsx · src/pages/Student/StudentHome.tsx
- src/components/CompanionSelect.tsx
- frontend/scripts/check-bundle.mjs (new) · frontend/package.json (guard script)

## Handoffs
- Phase D: publish scene scripts for all 15 JP lessons (only gap left in smoke matrix).
- Ops: consider removing stray frontend/dist-backup-* dirs; kids-web pm2 could migrate
  dev-server → static nginx serving since dist is the deployable artifact anyway.
