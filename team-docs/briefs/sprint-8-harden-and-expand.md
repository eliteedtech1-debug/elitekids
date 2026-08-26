# Sprint 8 Brief — Harden, Expand, Localize

**Date:** 2026-08-26
**Status:** READY FOR EXECUTION
**Blocking:** None (Tier 2 — no supervisor go needed)

## Context

EliteKids is feature-complete for E1–E6. i18n P0–P2 merged. Revision, NERDC, spaced repetition, adaptive difficulty all exist in code. Sprint 8 closes gaps, expands content, and finishes i18n — making the app production-ready for pilot schools.

## What We're Building

### S8-1: i18n P3 — Locale Files + RTL Foundation
**Why:** P0–P2 extracted strings into `t()` calls but locale files may be incomplete. RTL support needed for Arabic-influenced Nigerian schools.
**Acceptance criteria:**
- `src/lib/i18n/locales/en.json` contains ALL extracted keys (audit against dictionary)
- `src/lib/i18n/locales/ha.json` (Hausa) — starter file with top-50 student-facing strings
- RTL CSS utility class applied when locale demands it
- `npm run build` clean, zero missing-key warnings in dev mode
**Files touched:** `src/lib/i18n/`, `tailwind.config.*`, `src/App.tsx` (locale provider)
**Estimate:** 2-3 hours

### S8-2: Content Expansion — Animals/Numbers U5–U10 Ladder
**Why:** JP has 10-week ladder. Animals/Numbers still at U1–U4. Supervisor spec: 1 game/week/subject ≥5 items.
**Acceptance criteria:**
- Animals series: U5–U10 created via `createUnit` API pattern (6 new units, 18 new lessons)
- Numbers series: U5–U10 created (6 new units, 18 new lessons)
- Each unit: 3 games × ≥5 items (quiz, matching, drag-sort at minimum)
- GET /kids/curriculum shows full 10-week chain for all 3 subjects
- Seed script idempotent (safe rerun, upsert-by-id)
**Files touched:** NEW `team-docs/tools/s8-content-expand.js`, backend seed scripts
**Estimate:** 3-4 hours

### S8-3: kids_curriculum_points Renumber
**Why:** E1 coded points as PA-U{1..5}-{G1,G12...} but JP restructured to 10 units. Stale refs confuse debugging.
**Acceptance criteria:**
- SQL UPDATE script maps old PA-U{1..5} codes to current unit_number + game_index
- All 25 rows in kids_curriculum_points have valid, non-stale codes
- GET /kids/series/:id returns correct curriculum_points[] for JP
- Script idempotent, dry-run mode
**Files touched:** NEW `team-docs/tools/s8-renumber-points.js`
**Estimate:** 1 hour

### S8-4: Auth Hardening — series-domestications
**Why:** GET /kids/series-domestications is ungated read. Minor but should be requireStaff.
**Acceptance criteria:**
- Route adds requireStaff middleware
- Student unauthenticated → 401
- Student authenticated → 403
- Staff → 200 with data
**Files touched:** `backend/src/routes/kids.js` (1 line change)
**Estimate:** 15 minutes

### S8-5: Spaced Repetition Frontend Integration
**Why:** `kidsSpacedRep.js` (121 lines) exists on prod with routes `/kids/reviews/due`, `/kids/reviews/complete`, `/kids/reviews/stats` — but NO frontend component renders it.
**Acceptance criteria:**
- NEW `RevisionCard.tsx` or `SpacedReview.tsx` shows due reviews on StudentHome
- "Review Time!" card appears when reviews are due
- Tap → opens game in review mode
- Completion updates stats display
- i18n-ready (labelKey pattern)
**Files touched:** NEW `frontend/src/components/SpacedReview.tsx`, `StudentHome.tsx`
**Estimate:** 2-3 hours

### S8-6: Adaptive Difficulty Frontend
**Why:** `kidsAdaptive.js` (238 lines) exists with difficulty profiles — but GamePlay doesn't use adaptive profiles to adjust question difficulty.
**Acceptance criteria:**
- GamePlay fetches child's adaptive profile on load
- Questions sorted by current_difficulty level
- Easy questions first for struggling children, hard for advanced
- Difficulty adjusts after each game-complete (server-side logic exists)
**Files touched:** `frontend/src/pages/Student/GamePlay.tsx`, `backend/src/controllers/kidsAdaptive.js`
**Estimate:** 2-3 hours

## Build Order

```
S8-4 (auth hardening, 15min)
  → S8-3 (renumber, 1hr)
    → S8-1 (i18n P3, 2-3hr)
      → S8-5 (spaced rep frontend, 2-3hr)
        → S8-6 (adaptive frontend, 2-3hr)
          → S8-2 (content expansion, 3-4hr)
```

Auth first (trivial, removes debt). Renumber before content expansion (clean slate). i18n before new frontend components (build them i18n-native from start). Content expansion last (biggest, needs clean curriculum state).

## Gates

- `npm run build` (frontend) — zero errors
- `node --check` (all backend files) — zero errors
- `npm test` — baseline regression (9 pre-existing failures, zero NEW)
- Smoke: login → curriculum shows 10 weeks for all subjects → review card visible → adaptive difficulty adjusts

## Freebuff Tasks (C7 — docs/QA/content ONLY)

- QA checklist for S8-1: verify every `t()` key has a matching en.json entry
- QA checklist for S8-2: verify Animals/Numbers U5-U10 each have 3 games × ≥5 items
- Teacher guide update: "Spaced Repetition — how reviewed items resurface"
- Copy pass: review card copy, adaptive difficulty hints, locale file validation
