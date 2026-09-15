# Student dashboard — browser walk (five tabs)

**Date:** 2026-09-15
**Scope:** the five-tab student dashboard from `STUDENT-TAB-RESTRUCTURE.md`, driven in a real browser against the live API.

## Method (all artifacts in this folder, nothing committed)

1. `npm run build:staging` — the actual production build output.
2. `serve.mjs <port>` — serves `frontend/dist.staging` and mirrors the live nginx
   vhost (`^/(kids|schools|users|students|auth|verify-token|media|health)(/|$)` → `:8484`,
   everything else → `index.html`), so the walk exercises the same origin shape as production.
3. Headless **Chromium 152** driven over the raw DevTools Protocol (node's built-in
   `WebSocket`/`fetch` — no new dependencies): `walk.mjs` clicks each tab and records
   anchors, rendered panel signals, console errors, uncaught exceptions, failed requests,
   non-2xx API responses and a screenshot per tab.
4. Session: a student JWT minted with the backend's own `JWT_SECRET_KEY` for the existing
   test child `EK-Q4-TEST-001` (`SCH-ELITE`, Primary band, 362 published lessons) — the same
   payload shape `/students/login` issues. **No database writes**; the first-run
   tour/companion overlays are hidden in the DOM for screenshots, never completed.

## Result — five tabs, zero overlap

| Tab | Renders | Anchor | Leaks? |
|-----|---------|--------|--------|
| HOME | first-time welcome card → PLAY, streak/garden | — | none |
| PLAY | subject chips + 362 game cards + "Up Next"/Locked sections | `#games-grid-anchor` | none |
| LEARN | learning path (units, "You are here", review time) | `#welcome-learning-path` | none |
| REVIEW | RevisionCard ("Weekly Review", Start) + ReviewZone (SRS stats) | `#review-zone` | none |
| ME | MY PROGRESS stats, weekly goal/first-time card, "Your games", TROPHY BOARD, badge shelf | — | none |

- Tab bar renders exactly `Home · Play (362) · Learn · Review · Me`.
- No tab renders another tab's panel; HOME renders no other tab's content.
- **0 console errors, 0 uncaught exceptions, 0 failed requests** after the fixes below.

## Bugs found and fixed

1. **HOME tab was a blank screen for a brand-new student** (found: `main` contained only the
   collab rail + tab bar). Cause: opening the dashboard records a play day, so
   `StreakReminder` correctly stays quiet ("already played today"), and `GardenScene` renders
   nothing while the garden is empty. Net: a new child saw an empty tab and had to find PLAY
   unaided. **Fix:** `HomeTab` renders a first-time welcome card with a "Pick my first game"
   CTA that switches to PLAY (verified: CTA click → PLAY with 362 cards).
2. **ME showed a "My Team" heading with nothing under it** for a child with no
   `class_code`/`team_id` (TeamsTab's three boards all need one or the other).
   **Fix:** `MeTab` renders the Teams section only when the child has a class or team.
3. **429/404 storm from the offline prefetch** (`81×404 + 259×429` in the first walk).
   `offlineContent.prefetchAll` swept the whole catalog on every dashboard load — 362 lessons
   × 2 requests (game + scenes) ≈ 700 calls against the API's **300 req/min per-IP** limit.
   A whole school shares one IP, so the class rate-limits itself and the child's own game
   payloads fail to open. **Fix:** skip already-cached lessons, cap the sweep per visit
   (24), stop dead on a 429 and pause prefetching for a minute; the inline warm loop in
   `StudentHome` is capped at 12 and shares the same back-off.
   **Verified:** 0 non-2xx responses in the re-run.

## Noted, deliberately not changed

- PLAY mounts all 362 cards and LEARN ~1700 controls in one DOM (heavy on low-end tablets).
  Real, pre-existing, and a perf/architecture change rather than a tab bug.
- The first-run language/companion overlays cover the dashboard (expected onboarding).
- `GardenScene` legitimately renders nothing while the garden is empty; `StreakReminder`
  legitimately stays quiet once the day is recorded. Both are covered by the new HOME card.
- **Residual risk:** after the fix a dashboard load costs ~70 API calls. Thirty kids opening
  the app inside the same minute still exceeds 300 req/min per IP — the remaining exposure is
  server-side (or needs client jitter). Flagged for the master, not changed here.

## Welcome spotlight now points at ME

Verified in the same harness (`spotlight-budget.mjs`), without DB writes: CDP `Fetch`
interception answers `/kids/onboarding/status/*` as completed and `/kids/progress/child/*`
with a played game, which is exactly what makes a returning student's spotlight appear.

- The hint no longer says "Learning path" — it shows the **Me** chip
  (`mentionsLearningPath: false`), and the weekly goal card is still the highlighted target
  (`#welcome-goal-card`).
- "Set my goal" switches to the ME tab and scrolls the card into view:
  `goalCardPresent: true, meTabActive: true, scrolledToGoal: true`.
- The ring now keeps looking for the card for a few seconds, so it can land on it after the
  tab switch (it previously measured only on mount, when the card did not exist yet).

## API-call budget for a whole class

Measured per dashboard load against the real API (`budget.json`), own-backend calls only
(the `/api/apps` calls go to elite-api on another host and are not rate limited here):

| | before | after |
|---|---|---|
| Per lesson payload sweep | 362 × 2 = 724 calls, every load | 6 lessons × 2, deferred 20–60s, cursor walk-forward |
| Inline cache-warm loop | 12 calls + every asset of 12 lessons | 1 call, 1 lesson's assets (≤8) |
| Catalog metadata | 1718 IndexedDB writes + quota reads per load | only the lessons actually scanned (≤6) |
| Live-feed polling | 3 endpoints every 30s = **6 req/min** | 1 every 3 min + the path every 9 min = **~0.3 req/min** |
| Onboarding status | every load | cached after first completion |
| Progress | fetched twice per returning load | fetched once |
| Team membership | every load | only when the ME tab opens |
| **Measured per load** | **~40 calls** | **15 calls** (45s window incl. the deferred sweep; 180s idle afterwards: **1** call) |

**Honest limit:** 15 calls per child × 30 children opening at once ≈ 450 requests in a
minute, and the backend allows 300/min **per IP** with the whole school behind one IP. So the
client is now ~20 children/minute, not a full class. Closing that last gap is server work, not
client work: key the limiter by school/user for authenticated kids, raise the allowance, or add
one bootstrap endpoint that returns catalog + path + economy + progress + reviews in a single
response. Cheapest remaining client wins if wanted: `/kids/subscription/status` is requested
twice per load, and `/kids/boss/raid` loads with the dashboard even though a raid is a PLAY activity.

## Artifacts

- `walk.mjs` / `probe.mjs` / `serve.mjs` — the harness (temporary, team-docs only).
- `report.json` — per-tab evidence (panels, headings, counts, logs, screenshot sizes).
- `budget.json` — per-load / per-idle API call counts, spotlight diagnostics.
- `spotlight-budget.mjs` — request counting + spotlight flow verification.
- `probe.json` — the focused HOME/PLAY/ME probe used to find bug 1.
- `shots/{home,play,path,review,me}.png` — 824×1830 screenshots of each tab.
