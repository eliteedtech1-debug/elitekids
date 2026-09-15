# PLAY subject sections — browser walk

**Date:** 2026-09-15
**Scope:** the subject-sectioned PLAY grid (`team-docs/reports/play-unit-grouping-progress.md`),
driven in a real browser against the live API.

## Method

1. `npm run build:staging` — the actual production build of the working tree (the change is
   **uncommitted**, so live still serves `17c0755`; this walks the new build, not the deploy).
2. `serve.mjs 34777` — serves `frontend/dist.staging` and mirrors the live nginx vhost
   (`^/(kids|…)(/|$)` → `:8484`, everything else → `index.html`).
3. Headless **Chromium 152** over the raw DevTools Protocol: `play-sections.mjs` opens PLAY and
   reads the grid's direct children **in render order**, classifying each as a subject header /
   jump-ahead offer / game card.
4. Session: a student JWT minted by `mint.mjs` with the backend's own `generateLoginToken`
   (`sessionAuth.js`) — the payload `/students/login` issues. `mint.mjs` writes the token to
   `.token` and prints only its length; `.token` was deleted after the run.
   Child `EK-Q4-TEST-001` (`SCH-ELITE`, Primary). **Read-only GETs only, no DB writes.**
5. Assertions are derived from the live API with the same token, so they are falsifiable:
   catalog rows vs path lessons + path-less rows, one section per covered series, the
   jump-ahead offer once per locked subject.

## Result — all assertions pass, zero errors

| | rendered | expected | match |
|---|---|---|---|
| cards | 1718 | 1718 catalog rows | ✅ |
| sections | 52 | 51 series + 1 path-less group | ✅ |
| jump-ahead offers | 6 | 6 locked subjects | ✅ |

Sections by band: **Crèche 9 · Playgroup 9 · Nursery 1 9 · Nursery 2 9 · Kindergarten 9 ·
Primary 6 · path-less 1**. Card-count distribution per section: **{30, 60, 8}** — 45 early
sections × 30 (1350) + 6 Primary × 60 (360) + 8 path-less = 1718, so no card is lost or
duplicated. **0 console errors, 0 uncaught exceptions, 0 failed requests, 0 non-2xx.**

- Unit order is right: the Crèche section's first cards are `W1 → W2 → W3` (not the API's
  `createdAt DESC` order, which led with Week 9).
- Lock state is right: the 6 Primary headers carry `Locked` and `Primary W1` cards read
  "▶ Play Now" while `W2…W10` read "Locked" — matching the server's 29-of-30 locked units.
  The 45 early-band headers carry no `Locked` badge (all `spillover`, never locked).
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

## Bugs found

Both were in the **walk harness**, not the app; both are fixed in `play-sections.mjs`.

1. **All 1718 cards were counted as section headers.** The classifier tested for an `h3`
   before testing for `.game-card-hover`, and every game card carries its own `<h3>` title.
   Caught because the assertion was falsifiable: `1770 − 1718 = 52 = 51 + 1`, which is exactly
   the expected section count — the arithmetic said the app was right and the harness wrong.
2. **The chip pass matched no chips.** A chip renders `{label}` immediately followed by its
   count badge, so `textContent` is `"All1718"` — the `\b` in `^(All|…)\b` never fires between
   `l` and `1`. Fixed by normalising whitespace and matching `label\d*`.

**No application bug was found by this walk.**

## One finding the walk surfaced (not a defect, not changed)

For a Primary child the 45 early-band "review" sections come **first**, so their own six
lessons and the six jump-ahead offers sit ~1350 cards down the page. This is pre-existing —
the old flat grid was ordered below-band-first too (that is the server's path order, and LEARN
deliberately leads with spill-over recovery). Sectioning makes it easier to escape via the
subject chips (Numbers → 7 headers, not 52), but a child whose grade content is blocked still
lands on toddler content. Reordering PLAY to lead with the child's own band would be a real
improvement and is a deliberate design change, so it is flagged here rather than made silently.

## Artifacts

- `play-sections.mjs` — the walk. `mint.mjs` — the session minter. `run-play-walk.sh` — one-shot
  runner (background processes do not survive between tool calls, and it kills by **port**, never
  `pkill -f`, which would match its own command line).
- `play-sections-p4.json`, `shots-play-sections/play-top.png` — evidence for the run above.
  `*.json` is gitignored repo-wide; screenshots are regenerable from the harness.
- `serve.mjs` / `walk.mjs` reused unchanged from the five-tab walk.
