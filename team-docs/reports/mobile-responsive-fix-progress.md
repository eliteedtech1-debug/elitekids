# MOBILE RESPONSIVENESS FIX — progress (Buffy, 2026-09-03)

Brief (user): "fix mobile responsiveness of kids dashboard — the last test is scrolling horizontally and push". Clarified via ask_user: the StudentHome dashboard page (stats/weekly recap/streak section) scrolls horizontally on mobile.

## ROOT CAUSES (code inspection)
1. **Header decorations unclipped** — `StudentHome.tsx` header renders two `FloatingDeco` blur blobs at `-right-10`/`-left-8` inside a header WITHOUT `overflow-hidden` → blobs extend past the viewport → page-level horizontal scroll.
2. **Header row can't shrink** — left cluster (logo + title) had no `min-w-0 flex-1`, right cluster (mic/shop/app-switcher/a11y/speech/logout icon buttons) no `shrink-0`; on 320–375px screens the row's min-content exceeded the viewport → pushed the page wider.
3. **RevisionCard weekly-recap row** — left text block had no `min-w-0 flex-1`, so long description pushed the "Start" button (→ `/student/game/revision-weekly?mode=test`, the "last test") off-screen.
4. No page-level horizontal-scroll guard anywhere.

## FIXES (3 files)
- `frontend/src/pages/Student/StudentHome.tsx`
  - Root div: `overflow-x-clip` (page-level guard; safe for fixed modals — no ancestor filter/transform).
  - Header: `overflow-hidden` (clips decorative blobs).
  - Header row: `w-full`; left cluster `min-w-0 flex-1`; title `truncate`; right cluster `shrink-0`; mic/shop/logout buttons tightened `px-2` on mobile (labels already hidden <sm).
- `frontend/src/components/RevisionCard.tsx` — weekly button row: left `min-w-0 flex-1`, right Start button `shrink-0`.
- `frontend/src/components/ReviewZone.tsx` — due-review action cluster `shrink-0` (left title already `min-w-0`).

## VERIFY
- `npx tsc --noEmit` — clean (exit 0).
- `npx vitest run` — 11 files, 117/117 pass.

## CHECKPOINTS
- 2026-09-03 22:38: repro via code inspection; identified 4 overflow sources on StudentHome.
- 2026-09-03 22:39: applied fixes to StudentHome.tsx + RevisionCard.tsx + ReviewZone.tsx.
- 2026-09-03 22:40: tsc clean; vitest 117/117 green.

**FINAL STATUS:** DONE — mobile horizontal-scroll on kids dashboard fixed (root clip + header compaction + RevisionCard/ReviewZone shrink guards). Changes uncommitted; awaiting MASTER push order. IDLE: queue empty (Q20–Q23 DONE; no QUEUED rows).