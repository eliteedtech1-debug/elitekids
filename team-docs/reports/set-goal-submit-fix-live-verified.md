# Set-Goal submit failure — root cause + fix + live verification

**Date:** 2026-09-03 · **Author:** Buffy (worker) · **Scope:** user report "fix submit set goal failure" (goal card on the first screen after student login)

## TL;DR

- The goal-save **API was never broken** — `POST /kids/goals/:admissionNo` returns 200 and persists (verified live, 3×).
- The real bug: **the WelcomeSpotlight's full-screen scrim swallowed the child's first tap.** When the spotlight is up and the goal picker auto-opens underneath it, a child's first tap (on Set or on a target number) hits the scrim → the spotlight just closes, the tap never reaches the card → looks exactly like "submit doesn't work".
- **Fix (1 line):** keep the goal-card wrapper at `z-50` while the spotlight is shown → the ringed card sits above the scrim and the first tap lands on it. The spotlight stays fully dismissible everywhere else.
- **Verified on live** with a real browser (playwright + chromium): first tap through the scrim now opens the picker → POST 200 → card shows 0/5 + success toast.

## Root cause chain

1. `WelcomeSpotlight` renders `fixed inset-0 z-40` with a full-screen `<button>` scrim (`absolute inset-0`).
2. `StudentHome` auto-opens the goal picker when spotlight shows (`autoOpenPicker`, only for `set_by='auto'` + `done===0` kids — i.e. exactly the first-run experience).
3. Any first tap inside the goal card area hit the scrim (`z-40`) because the card wrapper had no z-index → swallowed; spotlight closed; user had to tap Set AGAIN → most users read that as "submit failed".
4. Confirmed empirically pre-fix: raw coordinate tap on Set with scrim up → `elementFromPoint` at button center = scrim button; picker did not open.

## Fix

`frontend/src/pages/Student/StudentHome.tsx` — goal-card wrapper:

```tsx
<div id="welcome-goal-card" className={`mb-4 ${showWelcomeSpotlight ? 'relative z-50' : ''}`}>
```

## Live verification (playwright, elitekids.com.ng)

| Step | Pre-fix | Post-fix |
|---|---|---|
| Goal card renders on landing (path tab) | ✅ | ✅ |
| Tap Set THROUGH spotlight scrim | ✗ swallowed | ✅ picker opens |
| Choose "Goal: 5 games this week" | — | ✅ |
| POST /kids/goals/Demo2 | — | **200** `{target:5, set_by:'child', status:'active'}` |
| Card updates + toast | — | ✅ "Goal saved! Go play! 🎯", 0/5 |

Screenshots: `team-docs/tmp/goal-check-{1-home,2-picker,3-after-save}.png`
Repro script: `team-docs/tmp/goal-browser-check.js` (session via server-minted `generateLoginToken`, Demo2/SCH/25)

## Verification method notes (for future sessions)

- Mint student session server-side: `require('dotenv').config(); require('./src/middleware/sessionAuth').generateLoginToken({id:'Demo2', admission_no:'Demo2', user_type:'Student', school_id:'SCH/25', class_name:'JSS1'}, '30m')` from `backend/`. school_id is `SCH/25` (slash!) — JWT auth re-checks `students` row by `(admission_no, school_id)`, wrong school_id → 401 → FE interceptor hard-redirects to /login.
- Playwright package: `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`; browser cache `~/.cache/ms-playwright/chromium-1234`.
- Tap with raw `page.mouse.click` coordinates — locator `.click()` retries hit-target checks and hangs when overlays animate.

## Incidental findings (non-blocking, documented)

1. **Dead FE endpoint:** `ENDPOINTS.STREAK.RECORD = '/kids/streak/record'` (endpoints.ts:305) — no backend route (real one is `/kids/economy/streak/record`, which the FE also defines). Only caller is `recordPlayDay()` in `lib/utils/streak.ts`, which has **zero call sites** — dormant legacy. Harmless 404 in console when streak module self-checks; candidate for deletion.
2. **`/kids/lessons/:id/game` + `/scenes` 404s** for a handful of UUID/global lessons during prefetch ("No published scenes") — content-state issue for those lessons, not a code bug; separate content task.
3. **`kids_learning_goals` lives in `elite_content`** DB (not `elite_db`) — note for future DB probes; prod has exactly 2 goal rows (Demo2, DKG/1/0001), both now `set_by='child'` target 5 from this verification (child-raised from auto-1 → allowed by design).

## Gates at time of fix

- tsc clean · vitest 117/117 · build OK (this box serves repo `dist/` directly, so the verified bundle = the fixed build)
- Backend untouched — zero-risk FE-only change.

## G7 status (badge_url artwork)

`frontend/public/logo.svg` is still the only brand asset in the tree; **no Elite EduTech artwork file was found** in `frontend/public` or `backend/uploads`. G7 remains **blocked on the asset owner** — the swap itself is a one-line DB update once a URL exists.

## Q1 backend sweep (deploy health, post-push)

Re-run in this session — see checkpoint in `takeover-progress.md`. Result: **94/94 PASS** across 6 q1-* suites (`--runInBand`, TEST_DB envs mapped from `backend/.env.test`).
