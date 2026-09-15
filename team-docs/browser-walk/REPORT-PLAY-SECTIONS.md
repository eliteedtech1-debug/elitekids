# PLAY subject sections — browser walk

**Date:** 2026-09-15
**Scope:** the subject-sectioned PLAY grid (`team-docs/reports/play-unit-grouping-progress.md`),
driven in a real browser against the **live site** and against the same build locally.

## Method

1. `npm run build:staging` — the production build of the working tree.
2. Locally: `serve.mjs 34777` serves `frontend/dist.staging` and mirrors the live nginx vhost
   (`^/(kids|…)(/|$)` → `:8484`, everything else → `index.html`).
   Live: `https://elitekids.com.ng` directly, no local server.
3. Headless **Chromium 152** over the raw DevTools Protocol: `play-sections.mjs` opens PLAY and
   reads the grid's direct children **in render order**, classifying each as a subject header /
   jump-ahead offer / game card.
4. Session: a student JWT minted by `mint.mjs` with the backend's own `generateLoginToken`
   (`sessionAuth.js`) — the payload `/students/login` issues. `mint.mjs` writes the token to
   `.token` and prints only its length; `.token` was deleted after each run. Child
   `EK-Q4-TEST-001` (`SCH-ELITE`, Primary).
5. Assertions are derived from the same API with the same token, so they are falsifiable:
   catalog rows vs path lessons + path-less rows, one section per covered series, the
   jump-ahead offer once per locked subject.

## Result — all assertions pass on LIVE, zero errors

| | rendered | expected | live (release `20260915T151254Z-8fc1e11`) |
|---|---|---|---|
| cards | 1718 | 1718 catalog rows | ✅ |
| sections | 52 | 51 series + 1 path-less group | ✅ |
| jump-ahead offers | 6 | 6 locked subjects | ✅ |

Sections by band: **Crèche 9 · Playgroup 9 · Nursery 1 9 · Nursery 2 9 · Kindergarten 9 ·
Primary 6 · path-less 1**. Card-count distribution per section: **{30, 60, 8}** — 45 early
sections × 30 (1350) + 6 Primary × 60 (360) + 8 path-less = 1718, so no card is lost or
duplicated. **0 console errors, 0 uncaught exceptions, 0 failed requests, 0 non-2xx.**

The same assertions pass on the local staging build, so the result is the change, not the deploy.

- Unit order is right: the Crèche section's first cards are `W1 → W2 → W3` (not the API's
  `createdAt DESC` order, which led with Week 9).
- Lock state is right: the 6 Primary headers carry `Locked` with 60 cards each, and `Primary W1`
  cards read "▶ Play Now" while `W2…W10` read "Locked" — matching the server's 29-of-30 locked
  units. The 45 early-band headers carry no `Locked` badge (all `spillover`, never locked).
- The jump-ahead offer lands on each locked subject exactly once (Basic Science, CCA, English,
  Mathematics, National Values, Pre-Vocational) and nowhere else.

## Subject chips — empty sections are dropped

`emptyHeaders` counts a rendered section header with no card under it; it must be 0 everywhere.

| chip | cards | headers | emptyHeaders |
|---|---:|---:|---:|
| All1718 | 1718 | 52 | **0** |
| Numbers214 | 214 | 7 | **0** |
| Letters62 | 62 | 2 | **0** |
| Colors451 | 451 | 15 | **0** |
| Shapes1 | 1 | 1 | **0** |
| Food210 | 210 | 6 | **0** |

Each chip's card total equals its badge count. `Animals` has no chip because it has 0 matches —
PlayTab hides a chip whose count is 0. So a chip that empties a subject takes its header with it
rather than leaving a header promising content that is not there.

## MID-BAND walk — the assertion a top-band child cannot make

`EK-Q4-TEST-001` is a **Primary** child, and Primary is the *top* band, so the client ceiling
filters nothing: every catalog row passes and the walk only ever proved "51 sections render". The
ceiling itself was untested. Re-run against **`Demo5` @ SCH/25 (Nursery 2)** on live, after the
`Q66` fix made a mid-band child obtainable at all:

| | rendered | expected | match |
|---|---|---|---|
| cards | **1085** | 1085 catalog rows, all at-or-below the band | ✅ |
| sections | **37** | 36 series with a surviving card + 1 path-less group | ✅ |
| offers | **9** | 9 locked subjects | ✅ |

Sections by band: **Crèche 9 · Playgroup 9 · Nursery 1 9 · Nursery 2 9 · Unlocked 1** — and
**no Kindergarten or Primary section at all**, which is the whole point: the ceiling genuinely
excluded the two higher bands. Card distribution **{5, 30}**: 36 × 30 = 1080 plus 5 path-less
= 1085, so nothing is lost or duplicated.

- All **9 Nursery 2 headers carry `Locked`**, each with one jump-ahead offer — and the 27
  earlier-band (spillover) sections correctly carry none and no offer, matching the 9 locked
  series the API reports.
- **0 console errors, 0 uncaught exceptions, 0 failed requests, 0 non-2xx.**
- `readOnly: true` — the streak write was attempted and blocked (see the production-write
  section below), so this ran against a real child's session without writing.

**No application bug was found on the mid-band walk either.**

One correction to the harness it forced: `expectedFromApi` compared cards against the raw
catalog, which is right for a top-band child and wrong for every other band — a *correct*
mid-band render would have been reported as a failure. It now applies the band ceiling (and
counts a series as sectioned only when a card survives it), mirroring the client's `BAND_RANKS`.

## PRODUCTION WRITE FOUND — the dashboard is not read-only

The first live run reported `readOnly: false`: opening the student dashboard issued

```
POST https://elitekids.com.ng/kids/economy/streak/record
```

and it **succeeded** (2xx, absent from `badResponses`). That endpoint is real and it writes:

- **Client:** `frontend/src/lib/utils/streak.ts#recordPlayDay` posts to
  `ENDPOINTS.ECONOMY.STREAK_RECORD` = `/kids/economy/streak/record`, called from
  `StudentHome.tsx:365` on every dashboard mount. Its own docstring calls it "the REAL backend
  route (economy streak record — admission comes from the JWT)".
- **Server:** `backend/src/controllers/kidsEconomy.js#recordStreak` runs
  `UPDATE kids_economy SET streak_current, streak_longest = GREATEST(...), streak_freeze_count,
  last_play_date, current_multiplier WHERE child_admission_no = :adm`, and can additionally
  `INSERT` into `kids_economy_milestones`.

**This corrects a claim in the 2026-09-15 session report.** That session recorded:
*"I confirmed the dashboard no longer writes a streak/play-day to the server — recordPlayDay fell
back to localStorage-only after `/kids/streak/record` was removed — so nothing was written to
their records."* The check was made against `/kids/streak/record`; the live path is
`/kids/economy/streak/record`, which was never removed and does persist. The band walks in that
session used two **real children** (admissions 004 @ SCH/28 and 109 @ SCH/11), so those visits
would have advanced those children's streaks and `last_play_date`.

Impact of this run: one row for `EK-Q4-TEST-001`, a purpose-built test child. The write was not
intentional and is reported rather than buried.

**Fix applied:** the harness now aborts that request in the browser. `Fetch.enable` intercepts
only `*streak/record*` (everything else passes through untouched, so nothing can be left paused),
and a paused request is failed inline in the CDP event handler — not in `drain()`, which clears
the queue and would leave the page stalled. The client's `catch` falls back to its
localStorage-only path, which is harmless.

**Re-run on live: `readOnly: true`, `attemptedWrites: ["POST …/streak/record"]`,
`blockedWrites: [same]`, `escaped: []`** — the write was attempted and aborted before leaving the
browser. A live walk is now provably read-only.

## Bugs found

All in the **walk harness**, not the app; all fixed.

1. **All 1718 cards counted as headers** (first staging run). The classifier tested for an `h3`
   before `.game-card-hover`, and every game card carries its own `<h3>` title. Caught because the
   assertion was falsifiable: `1770 − 1718 = 52 = 51 + 1`, i.e. the arithmetic said the app was
   right and the harness wrong.
2. **The chip pass matched no chips.** A chip renders `{label}` immediately followed by its count
   badge, so `textContent` is `"All1718"` — the `\b` in `^(All|…)\b` never fires between `l` and
   `1`. Fixed by normalising whitespace and matching `label\d*`.
3. **The walk was writing to production** (see above). Fixed by aborting the streak write.
4. **The expectation ignored the band ceiling** (found when the walk was first pointed at a
   mid-band child). `expectedFromApi` asserted `cards === catalog rows`, which holds only for a
   top-band child; for Nursery 2 the grid must show strictly fewer rows than the catalog, and a
   series whose units are all above the band must get no section. A correct render would have
   been reported as broken. The expectation now applies the same ceiling the client uses.

**No application bug was found by this walk.**

## One finding the walk surfaced (not a defect, not changed)

For a Primary child the 45 early-band "review" sections come **first**, so their own six subjects
and the six jump-ahead offers sit ~1350 cards down the page. This is pre-existing — the old flat
grid was ordered below-band-first too (that is the server's path order, and LEARN deliberately
leads with spill-over recovery). Sectioning makes it easier to escape via the subject chips
(Numbers → 7 headers, not 52), but a child whose grade content is blocked still lands on toddler
content. Reordering PLAY to lead with the child's own band would be a real improvement and is a
deliberate design change, so it is flagged here rather than made silently.

Separately worth a decision: **a dashboard load counts as a play day** and advances the streak
server-side. Play is not required — opening the app is enough — which inflates streaks and makes
every dashboard visit a write.

## Artifacts

- `play-sections.mjs` — the walk. `mint.mjs` — the session minter. `run-play-walk.sh` — one-shot
  runner; takes an optional app URL (live) and otherwise serves `dist.staging` locally.
  Background processes do not survive between tool calls, and it kills by **port**, never
  `pkill -f`, whose pattern matched and killed the shell on the first attempt.
- `play-sections-live2.json` (live, read-only), `play-sections-p4.json` (staging),
  `shots-play-sections*/play-top.png`. `*.json` is gitignored repo-wide; screenshots are
  regenerable from the harness.
- `serve.mjs` / `walk.mjs` reused unchanged from the five-tab walk.
