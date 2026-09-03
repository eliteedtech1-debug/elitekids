# Q1 Work Split — NGEd-game

**Date:** 2026-09-03
**SRS:** `team-docs/SRS-Q1-NGEd-game.md`

---

## Strategy: Parallel Tracks, No Blocking Dependencies

Every track below can start **immediately** because:
- Algorithms are pure functions (no DB, no API needed)
- Types depend only on the SRS contract (already written)
- Services depend only on algorithms (already written)
- Controllers depend only on services (already written)
- Frontend depends only on types + API constants (already written)

**No track waits for another to finish.** Integration happens at merge time.

---

## Track A: Backend Algorithms + Services + Controllers + Tests

**Worker:** opencode (current session)
**Files owned:** `backend/src/services/**`, `backend/src/controllers/kids*V2.js`, `backend/test/q1-*.test.js`

### Independent Tasks (can do NOW):

| # | Task | Depends On | Files |
|---|------|-----------|-------|
| A1 | BKT algorithm | Nothing | `backend/src/services/adaptiveEngine.js` |
| A2 | Elo rating system | Nothing | `backend/src/services/adaptiveEngine.js` |
| A3 | Struggle detection | Nothing | `backend/src/services/adaptiveEngine.js` |
| A4 | SM-2+ algorithm | Nothing | `backend/src/services/spacedRepetition.js` |
| A5 | XP calculation | Nothing | `backend/src/services/economyService.js` |
| A6 | Level calculation | Nothing | `backend/src/services/economyService.js` |
| A7 | Streak logic | Nothing | `backend/src/services/economyService.js` |
| A8 | Shop service | A5-A7 | `backend/src/services/shopService.js` |
| A9 | ADE controller (v2) | A1-A3 | `backend/src/controllers/kidsAdaptiveV2.js` |
| A10 | SRE controller (v2) | A4 | `backend/src/controllers/kidsSpacedRepV2.js` |
| A11 | Economy controller | A5-A7 | `backend/src/controllers/kidsEconomy.js` |
| A12 | Shop controller | A8 | `backend/src/controllers/kidsShop.js` |
| A13 | Route registration | A9-A12 | `backend/src/routes/kids.js` |
| A14 | ADE test suite | A1-A3, A9 | `backend/test/q1-ade.test.js` |
| A15 | SRE test suite | A4, A10 | `backend/test/q1-sre.test.js` |
| A16 | Economy test suite | A5-A7, A11 | `backend/test/q1-economy.test.js` |
| A17 | Integration tests | All above | `backend/test/q1-integration.test.js` |

### Dependency Chain:
```
A1,A2,A3 (parallel) → A9 → A14
A4 (independent)    → A10 → A15
A5,A6,A7 (parallel) → A8 → A12 → A16
                   → A11 → A16
A9,A10,A11,A12 → A13 → A17
```

---

## Track B: Database Migrations + Types

**Worker:** opencode (current session)
**Files owned:** `backend/database/q1-*.js`, `frontend/src/lib/types/adaptive.ts`, `frontend/src/lib/api/endpoints.ts` (additions)

### Independent Tasks (can do NOW):

| # | Task | Depends On | Files |
|---|------|-----------|-------|
| B1 | ADE v2 table DDL | Nothing | `backend/database/q1-ade-migration.js` |
| B2 | SRE v2 table DDL | Nothing | `backend/database/q1-sre-migration.js` |
| B3 | Economy tables DDL | Nothing | `backend/database/q1-economy-migration.js` |
| B4 | Alter existing tables | Nothing | `backend/database/q1-alter-tables.js` |
| B5 | Seed shop items | B3 | `backend/database/q1-seed-shop.js` |
| B6 | TypeScript types | Nothing | `frontend/src/lib/types/adaptive.ts` |
| B7 | API endpoint constants | Nothing | `frontend/src/lib/api/endpoints.ts` (additions) |
| B8 | Constants + levels | Nothing | `frontend/src/lib/utils/constants.ts` (additions) |

---

## Track C: Frontend Components

**Worker:** opencode (future session, after A+B merge)
**Files owned:** `frontend/src/components/XP*.tsx`, `frontend/src/components/Shop.tsx`, etc.

### Independent Tasks (can do NOW, types are ready):

| # | Task | Depends On | Files |
|---|------|-----------|-------|
| C1 | XPBar component | B6 | `frontend/src/components/XPBar.tsx` |
| C2 | StreakCounter component | B6 | `frontend/src/components/StreakCounter.tsx` |
| C3 | MasteryGlow component | B6 | `frontend/src/components/MasteryGlow.tsx` |
| C4 | StruggleAlert component | B6 | `frontend/src/components/StruggleAlert.tsx` |
| C5 | LevelUpOverlay component | B6 | `frontend/src/components/LevelUpOverlay.tsx` |
| C6 | ReviewDueBadge component | B6 | `frontend/src/components/ReviewDueBadge.tsx` |
| C7 | Shop component | B6 | `frontend/src/components/Shop.tsx` |
| C8 | Economy helpers | B6 | `frontend/src/lib/game/economy.ts` |
| C9 | Adaptive helpers | B6 | `frontend/src/lib/game/adaptive.ts` |

---

## Track D: Integration (AFTER A+B merge)

**Worker:** opencode (future session)
**Files owned:** modified existing files

| # | Task | Depends On |
|---|------|-----------|
| D1 | GamePlay.tsx integration | A9, A11, B7 |
| D2 | StudentHome.tsx integration | A11, C1, C2 |
| D3 | ReviewZone.tsx upgrade | A10, C6 |
| D4 | ParentDashboard.tsx upgrade | A9, C3 |
| D5 | Full test pass | All above |

---

## Current Session Plan

I will execute **Track A + Track B** in this session:

1. **Algorithm services** (A1-A7) — pure functions, no DB
2. **TypeScript types** (B6-B8) — type definitions
3. **Database migrations** (B1-B5) — DDL scripts
4. **Controllers** (A9-A12) — wire algorithms to Express
5. **Route registration** (A13) — add routes to kids.js
6. **Test suites** (A14-A17) — Jest tests
7. **Frontend components** (C1-C9) — React components

**Then commit everything.** Track D is a separate session after merge.

---

## Merge Strategy

```
main (current)
  │
  ├── commit: "feat(q1): ADE + SRE + Economy algorithms, services, types, migrations"
  │     ├── backend/src/services/adaptiveEngine.js
  │     ├── backend/src/services/spacedRepetition.js
  │     ├── backend/src/services/economyService.js
  │     ├── backend/src/services/shopService.js
  │     ├── backend/src/controllers/kidsAdaptiveV2.js
  │     ├── backend/src/controllers/kidsSpacedRepV2.js
  │     ├── backend/src/controllers/kidsEconomy.js
  │     ├── backend/src/controllers/kidsShop.js
  │     ├── backend/src/routes/kids.js (modified)
  │     ├── backend/database/q1-*.js
  │     ├── backend/test/q1-*.test.js
  │     ├── frontend/src/lib/types/adaptive.ts
  │     ├── frontend/src/lib/api/endpoints.ts (modified)
  │     ├── frontend/src/lib/utils/constants.ts (modified)
  │     ├── frontend/src/components/XPBar.tsx
  │     ├── frontend/src/components/StreakCounter.tsx
  │     ├── frontend/src/components/MasteryGlow.tsx
  │     ├── frontend/src/components/StruggleAlert.tsx
  │     ├── frontend/src/components/LevelUpOverlay.tsx
  │     ├── frontend/src/components/ReviewDueBadge.tsx
  │     ├── frontend/src/components/Shop.tsx
  │     ├── frontend/src/lib/game/economy.ts
  │     └── frontend/src/lib/game/adaptive.ts
  │
  └── NEXT SESSION: Track D integration
        ├── frontend/src/pages/Student/GamePlay.tsx (modified)
        ├── frontend/src/pages/Student/StudentHome.tsx (modified)
        ├── frontend/src/components/ReviewZone.tsx (modified)
        └── backend/test/q1-integration.test.js
```

---

*Status: READY TO EXECUTE*
