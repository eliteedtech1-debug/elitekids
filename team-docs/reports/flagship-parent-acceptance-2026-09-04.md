# Flagship Parent Acceptance — 2026-09-04

## Scope requested

Parent signup/onboarding, shared parent-child access, realtime performance, WebRTC/socket communication, parental sleep-time and play limits, Practice/Test mode controls and results, bulk/individual results, 365-day activity grid, streak/XP, and performance trend.

## Verification result

### Verified in this checkout

- Frontend Vitest: **226/226 passed**.
  - Activity grid/XP trend helpers: 8
  - Parent realtime contracts: 12
  - Teacher realtime contracts: 10
  - Collaboration socket contracts: 15
- Frontend production typecheck + Vite build: **passed**.
- Backend parent/signup/onboarding/children coverage: **64/64 passed**.
  - Flagship parent acceptance: 5
  - Auth, signup, children and onboarding: 59
- Backend parental controls + mode-lock hierarchy + flagship parent acceptance: **40/40 passed**.
  - Parental controls: 10
  - B1 mode-lock/regression: 25
  - Flagship parent acceptance: 5
- Backend parent Live + WebRTC signaling: **16/16 passed**.
- Backend changed-file syntax checks and staged diff whitespace checks: **passed**.

### Implemented parent experience

1. Parent dashboard now renders a dense parent-owned 365-day activity grid for every linked child.
2. Each child’s overview includes daily XP trend, totals, active days, best day and streak.
3. Bulk recent Practice/Test results are visible across children and link to individual detail.
4. Per-child controls expose daily play limits, allowed sleep/time windows, and Practice/Test mode locks.
5. Parent signup persists compatible shared `users` + `parents` records transactionally, normalizes phone numbers, rejects duplicate phones, and returns a unified ecosystem token.
6. Parent/child ownership checks are school-aware; onboarding, controls, results, activity, and mode-lock flows enforce role boundaries.
7. Deployment hooks install locked backend dev dependencies before the Jest acceptance gate, then prune test-only packages after verification.

### Acceptance decision

**Ready for the scoped parent acceptance gate.**

The backend Jest blocker is resolved by installing dev dependencies with `npm ci --include=dev` before tests. Runtime suites passed against the hermetic test database; no production database records were created and no deployment was performed during local verification.

The live production walkthrough remains a post-push operational check: confirm the deployed parent signup, linked-child dashboard, control enforcement, and parent↔child WebRTC flow using test credentials only.