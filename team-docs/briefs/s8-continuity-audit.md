# S8-CONTINUITY: Audit and Wire Orphaned Components + Incomplete Features

**Date:** 2026-08-26
**Assigned:** fb-review (docs/QA/audit — C7: never app code)
**Status:** RUNNING
**Sprint:** 8

## Context

Network outages, power cuts, and session breaks left features half-wired. This task audits what exists but isn't connected, produces a wiring plan, and verifies backend completeness.

## FINDINGS FROM OPCODELINE AUDIT (2026-08-26)

### Orphan Frontend Components (exist but never imported by any parent)
1. **BossBattleOverlay.tsx** — boss battle overlay (E6 feature). Has routes, has backend (kidsBoss.js). Needs: StudentHome or GamePlay import.
2. **MediaPicker.tsx** — media picker component. Needs: TeacherQuickCreate or GameCreator import.
3. **OfflineIndicator.tsx** — offline status indicator. Needs: StudentHome or App.tsx import.
4. **ParentDashboard.tsx** — parent dashboard view. Needs: App.tsx router or parent page.
5. **ReviewZone.tsx** — review zone component. Needs: StudentHome or GamePlay import.
6. **StickerButton.tsx** — sticker/reward button. Needs: GamePlay or teacher interface.

### Backend Routes That Exist But May Lack Frontend
-  +  +  (spaced rep) — 3 routes, NO frontend component
-  (6 routes) — RevisionCard.tsx EXISTS and is imported
-  — exists in kidsAdaptive.js, 6 routes
-  — 5 routes, StudentFestival.tsx exists
-  — 3 routes, check if frontend exists

## YOUR TASK

### Step 1: Verify each orphan component
For each of the 6 orphan components:
- Read the file, confirm it's complete (not a stub)
- Check if it SHOULD be imported somewhere (does it have a clear parent?)
- Write verdict: WIRES-NEEDED / IS-STUB / DEPRECATED

### Step 2: Backend completeness check
For each of the 6 spaced-rep/adaptive/revision routes:
- Verify the controller function exists and is non-trivial (>20 lines)
- Verify the route is registered in kids.js
- Check if a corresponding frontend component exists
- Write verdict: FRONTEND-NEEDED / FULLY-WIRED / PARTIAL

### Step 3: Write the wiring plan
Produce team-docs/reports/s8-continuity-wiring-plan.md with:
- Table of all orphan components + their intended parent
- Table of all backend routes + their frontend status
- Priority order for wiring (most impactful first)
- Which items need opencode (app code) vs which are docs-only

### Step 4: Smoke test existing wired features
- Login as dkg/1/0001 → StudentHome loads
- Check if RevisionCard renders (revision is wired)
- Check if festival card renders
- Check if any orphan components cause console errors
- Write results to team-docs/reports/s8-continuity-smoke.md

## GATES
- wiring-plan.md exists and is complete
- smoke report exists with pass/fail for each check
- NO app code changes (C7 — audit only)
- Checkpoint after every step

## EVIDENCE
All output → team-docs/reports/s8-continuity-*.md
