# Phase 4 Roadmap Batch Plan — #2 #1 #3 #4 #6 #11

## Goal
Close the six highest-impact ECCE-roadmap items in one batch: reliable offline
progress (#2), NERDC curriculum alignment (#1), i18n-readiness seam (#3),
service-worker/sync hardening (#4), IndexedDB storage budget guard (#6), and
route-level performance (#11). Success = no silent data loss offline, Ministry-
auditable lessons, a translation seam, cache that can't fill a device, and a
<3s initial load.

## Files to Modify (planned)

| # | File | Change |
|---|------|--------|
| 1 | `frontend/src/pages/Student/GamePlay.tsx` | Route failed `submitProgress` POSTs through `offlineSync.enqueue` instead of `.catch(()=>{})` |
| 2 | `backend/src/controllers/kidsStreak.js` *(new)* + `backend/src/routes/kids.js` | Daily streak persistence endpoints (`GET/POST /kids/streak`) |
| 3 | `backend/src/models/KidLesson.js`, `backend/src/controllers/kids.js`, `backend/test/helpers/test-db.js` | Add `nerdc_code/nerdc_strand/nerdc_sub_strand` (C2: NULLable) |
| 4 | `frontend/src/App.tsx` | Lazy route-split GamePlay + teacher/admin pages (React.lazy + Suspense) |
| 5 | `frontend/src/lib/utils/storage-budget.ts` *(new)* + `frontend/src/lib/offline/content.ts`, `frontend/src/lib/utils/asset-cache.ts` | Quota guard (80% soft limit, 200MB hard ceiling, 50MB headroom) on all prefetch paths |
| 6 | `frontend/public/sw.js`, `frontend/src/lib/offline/sync.ts` | SW v3 + cache purge, background-sync nudge, progress-endpoint 10-retry cap with 7-step backoff |
| 7 | `frontend/src/lib/i18n/` *(new)* + `frontend/src/lib/utils/sound.ts` | Locale store + `t()` dictionary + TTS locale abstraction (en-NG default) |
| 8 | `frontend/src/pages/Login/Login.tsx`, `Dashboard/Dashboard.tsx`, `components/AdminNav.tsx`, `OfflineBanner.tsx`, `OfflineIndicator.tsx` | Reference string extraction via `t()` |

## Implementation Order
1. **#2 Offline Progress Fix** — wire submitProgress failure → sync queue; streak backend.
2. **#1 NERDC Code Layer** — schema + createLesson persistence (C1/C2-safe).
3. **#11 Perf** — App.tsx lazy routes; verify chunk split (emojiData already tree-shaken).
4. **#6 Storage Budget** — pure `evaluateBudget()` + unit tests, then wire prefetch paths.
5. **#4 SW & Sync** — SW v3 + background sync; sync.ts retry caps per E2 design.
6. **#3 i18n Readiness** — i18n module + TTS abstraction + reference extraction.

## Verification
- Frontend: `npm run build` (tsc + vite), `npm test` (vitest), `node scripts/check-bundle.mjs`.
- Backend: jest via `TEST_DB_USER/TEST_DB_PASSWORD` from `backend/.env` (kids-routes + curriculum suites).
- Perf: confirm main bundle drops (target <400KB) and GamePlay is a separate lazy chunk.

## Status
| # | Item | Status |
|---|------|--------|
| 2 | Offline Progress Fix | ✅ implemented (inherited uncommitted tree, verified) |
| 1 | NERDC Curriculum Code Layer | ✅ implemented (inherited, verified) |
| 11 | Perf Budget — lazy route-split | ✅ done — main bundle 520KB→363KB, GamePlay isolated 97.6KB |
| 6 | Storage Budget Mgmt | ✅ done — quota guard wired, 7 unit tests |
| 4 | SW & Sync Hardening | ✅ done — SW v3 + bg-sync + E2 retry caps |
| 3 | i18n-Readiness | ✅ seam done (module + TTS abstraction + reference extraction); ~200 strings remain across student/teacher/parent screens |

## Handoff
Progress/checkpoint log: `team-docs/reports/p4-roadmap-progress.md`.
