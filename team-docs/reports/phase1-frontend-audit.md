# EliteKids Frontend Audit Report
**Date:** 2026-08-26  
**Auditor:** openCode Worker  
**Scope:** `/root/elitekids-dev/frontend/src/`

---

## Executive Summary

The frontend is **functionally complete** with 40+ pages/components, 950+ i18n keys, and comprehensive backend API integration. However, there are several categories of issues ranging from critical to cosmetic.

---

## 1. BROKEN (Critical)

### 1.1 Missing Lazy Import Files
- **`/student/game/revision-weekly`** route defined in `RevisionCard.tsx:78` but NOT in `App.tsx` routes — `RevisionCard` navigates to a non-existent route.

### 1.2 Orphan Components (NOT imported in any active file)
| Component | Status |
|-----------|--------|
| `StudentFestival` | ✅ Imported in `StudentHome.tsx:34` |
| `BossBattleOverlay` | ✅ Imported in `StudentHome.tsx:24` |
| `ReviewZone` | ✅ Imported in `StudentHome.tsx:25` |
| `RevisionCard` | ✅ Imported in `StudentHome.tsx:23` |
| `TeacherBossRaid` | ✅ Imported in `TeacherArena.tsx:8` |
| `TeacherFestival` | ✅ Imported in `TeacherArena.tsx:9` |
| `TeacherQuickCreate` | ✅ Imported in `TeacherArena.tsx:10` |
| `ParentDashboard` | ⚠️ Only in `.bak-*` files — **NOT imported in any active file** |
| `MediaLibrary` | ✅ Imported in `MediaPicker.tsx:4` |
| `MediaPicker` | ✅ Imported in `GamePlay.tsx:27` |
| `CachedImg` | ✅ Imported in `AssetLibrary.tsx:17`, `GamePlay.tsx:30` |

**`ParentDashboard` is an orphan** — registered in routes but component never mounted.

### 1.3 ErrorBoundary Not Used
`ErrorBoundary` is imported in `App.tsx:9` but only wraps the app — **not used as route-level fallback**. Lazy-loaded routes will show blank screen on chunk load failure without a retry mechanism at route level.

---

## 2. INCOMPLETE

### 2.1 Backend Routes NOT in Frontend
| Backend Endpoint | Frontend Status |
|-----------------|-----------------|
| `POST /kids/parent/login` | ✅ `ParentDashboard.tsx` |
| `POST /kids/parent/register` | ✅ `ParentDashboard.tsx` |
| `GET /kids/parent/children` | ✅ `ParentChildren.tsx` |
| `GET /kids/parent/child/:adm/progress` | ✅ `ParentDashboard.tsx` |
| `GET /kids/parent/child/:adm/achievements` | ❌ **NO frontend call** |
| `GET /kids/parent/notifications` | ❌ **NO frontend call** |
| `POST /kids/parent/notifications/:id/read` | ❌ **NO frontend call** |
| `GET /kids/weekend-test` | ❌ **NO frontend page** |
| `GET /kids/push/public-key` | ❌ **NO frontend integration** |
| `POST /kids/push/subscribe` | ❌ **NO frontend integration** |
| `GET /kids/match-history` | ❌ **NO frontend page** |
| `GET /kids/match-history/rivalry` | ❌ **NO frontend page** |
| `GET /kids/match-history/stats` | ❌ **NO frontend page** |
| `GET /kids/adaptive/recommended` | ⚠️ Endpoint exists, no dedicated UI |
| `GET /kids/adaptive/due-reviews` | ⚠️ Uses `REVIEWS.DUE` in `ReviewZone.tsx` |
| `POST /kids/session/save` | ⚠️ Offline sync handles this |
| `GET /kids/session/resume` | ⚠️ Offline sync handles this |
| `DELETE /kids/session/:id` | ❌ **NO frontend call** |
| `GET /kids/garden` | ⚠️ `GardenScene.tsx` handles this |
| `POST /kids/garden/initialize` | ⚠️ `GardenScene.tsx` handles this |
| `POST /kids/garden/grow` | ⚠️ `GardenScene.tsx` handles this |
| `GET /kids/companion` | ⚠️ `CompanionSelect.tsx` handles this |
| `POST /kids/companion/choose` | ⚠️ `CompanionSelect.tsx` handles this |
| `POST /kids/companion/customize` | ⚠️ `CompanionSelect.tsx` handles this |
| `POST /kids/test-scores/convert` | ❌ **NO frontend call** |
| `GET /kids/revision/status` | ✅ `RevisionCard.tsx` |
| `GET /kids/revision/nudges` | ✅ `RevisionCard.tsx` |
| `GET /kids/revision/failed-items` | ✅ `RevisionCard.tsx` |
| `POST /kids/revision/failed` | ✅ `GamePlay.tsx` |
| `POST /kids/revision/retry-correct` | ✅ `GamePlay.tsx` |
| `GET /kids/revision/weekly` | ✅ `RevisionCard.tsx` |
| `GET /kids/voice-notes` | ❌ **NO frontend page** |
| `GET /kids/voice-notes/mine` | ❌ **NO frontend page** |
| `POST /kids/voice-notes` | ❌ **NO frontend page** |
| `GET /kids/voice-notes/:id/audio` | ❌ **NO frontend page** |

### 2.2 Frontend Endpoints NOT in Backend
| Frontend Endpoint | Backend Status |
|------------------|----------------|
| `ENDPOINTS.AUTH.LOGIN` → `POST /users/login` | ✅ Exists |
| `ENDPOINTS.AUTH.STUDENT_LOGIN` → `POST /students/login` | ✅ Exists |
| `ENDPOINTS.AUTH.PARENT_SIGNUP` → `POST /auth/parent-signup` | ✅ Exists |
| `ENDPOINTS.MEDIA.UPLOAD` → `POST /media/upload` | ✅ Exists |
| `ENDPOINTS.MEDIA.STATUS` → `GET /media/upload-status/:jobId` | ✅ Exists |
| `ENDPOINTS.MEDIA.LIST` → `GET /media/files` | ✅ Exists |
| `ENDPOINTS.MEDIA.DELETE` → `DELETE /media/files/:key` | ✅ Exists |
| `ENDPOINTS.MEDIA.PUZZLE_SPLIT` → `POST /media/puzzle-split` | ✅ Exists |
| `ENDPOINTS.MEDIA.OPEN_SOURCE_SAVE` → `POST /media/save-opensource` | ✅ Exists |
| `ENDPOINTS.MEDIA.OPEN_SOURCE_BATCH` → `POST /media/save-opensource-batch` | ✅ Exists |
| `ENDPOINTS.MEDIA.OPEN_SOURCE_ASSETS` → `GET /media/opensource-assets` | ✅ Exists |

### 2.3 API Client Mismatch
- Frontend `ENDPOINTS` object is comprehensive but some endpoints are **hardcoded strings** in components:
  - `TeacherFestival.tsx:42` → `apiClient.get('/kids/festival/active')` (not using `ENDPOINTS.FESTIVAL.ACTIVE`)
  - `TeacherFestival.tsx:45` → `apiClient.get('/kids/festival/history')` (not using `ENDPOINTS.FESTIVAL.HISTORY`)
  - `TeacherFestival.tsx:60` → `apiClient.post('/kids/festival/create', ...)` (not using `ENDPOINTS.FESTIVAL.CREATE`)
  - `StudentFestival.tsx:42` → `apiClient.get('/kids/festival/active')` (not using `ENDPOINTS.FESTIVAL.ACTIVE`)
  - `TeacherQuickCreate.tsx:44` → `apiClient.get('/kids/teacher/quizzes')` (not using `ENDPOINTS.QUICK_CREATE.LIST`)
  - `TeacherQuickCreate.tsx:60` → `apiClient.post('/kids/teacher/quizzes', ...)` (not using `ENDPOINTS.QUICK_CREATE.CREATE`)
  - `TeacherQuickCreate.tsx:84` → `apiClient.post('/kids/teacher/quizzes/${editingQuiz}/questions', ...)` (not using `ENDPOINTS.QUICK_CREATE.ADD_QUESTIONS`)
  - `TeacherQuickCreate.tsx:97` → `apiClient.post('/kids/teacher/quizzes/${id}/publish')` (not using `ENDPOINTS.QUICK_CREATE.PUBLISH`)
  - `TeacherQuickCreate.tsx:108` → `apiClient.post('/kids/teacher/quizzes/${id}/unpublish')` (not using `ENDPOINTS.QUICK_CREATE.UNPUBLISH`)
  - `TeacherQuickCreate.tsx:120` → `apiClient.delete('/kids/teacher/quizzes/${id}')` (not using `ENDPOINTS.QUICK_CREATE.DELETE`)
  - `ParentDashboard.tsx:27` → `apiClient.post('/kids/parent/login', ...)` (not using `ENDPOINTS.PARENT.LOGIN`)
  - `ParentDashboard.tsx:47` → `apiClient.post('/kids/parent/register', ...)` (not using `ENDPOINTS.PARENT.REGISTER`)
  - `ParentDashboard.tsx:69` → `apiClient.get('/kids/parent/child/${adm}/progress', ...)` (not using `ENDPOINTS.PARENT.CHILD_PROGRESS`)

---

## 3. MISSING

### 3.1 Pages/Features
| Feature | Status |
|---------|--------|
| Weekend Challenge page | ❌ Backend ready, no frontend |
| Push Notification integration | ❌ Backend ready, no frontend |
| Match History page | ❌ Backend ready, no frontend |
| Voice Notes UI | ❌ Backend ready, no frontend |
| Parent Notifications | ❌ Backend ready, no frontend |
| Parent Achievements | ❌ Backend ready, no frontend |
| Adaptive Profile page | ❌ Backend ready, no frontend |

### 3.2 i18n Keys
All i18n keys used in components appear to have corresponding translations in `en.ts`. No missing keys detected.

---

## 4. ORPHAN (Unused Components)

| File | Status |
|------|--------|
| `src/components/ParentDashboard.tsx` | ⚠️ **ORPHAN** — Not imported in any active file |
| `src/components/GameEngine/README.md` | ⚠️ Documentation only — no component files |
| `src/pages/Student/StudentHome.tsx.bak-e3o` | 🗑️ Backup file |
| `src/pages/Student/StudentHome.tsx.bak-e3f2` | 🗑️ Backup file |
| `src/pages/Student/StudentHome.tsx.bak-e3flive` | 🗑️ Backup file |
| `src/pages/Student/StudentHome.tsx.bak-e3farena` | 🗑️ Backup file |
| `src/pages/Student/StudentHome.tsx.bak-e3fpush` | 🗑️ Backup file |
| `src/pages/Student/StudentHome.tsx.bak-e4` | 🗑️ Backup file |
| `src/pages/Student/GamePlay.tsx.bak-e3o` | 🗑️ Backup file |
| `src/pages/Student/GamePlay.tsx.bak-e3f2` | 🗑️ Backup file |
| `src/pages/Student/GamePlay.tsx.bak-e3flive` | 🗑️ Backup file |
| `src/pages/Student/GamePlay.tsx.bak-e3farena` | 🗑️ Backup file |
| `src/App.tsx.bak-e3farena` | 🗑️ Backup file |
| `src/App.tsx.bak-e3flive` | 🗑️ Backup file |
| `src/App.tsx.bak-e4` | 🗑️ Backup file |
| `src/main.tsx.bak-e3o` | 🗑️ Backup file |

---

## 5. I18N

### 5.1 Coverage
- **950+ translation keys** in `en.ts`
- All components use `t()` or `tN()` consistently
- No hardcoded user-facing strings detected (except in `.bak-*` files)

### 5.2 Issues
- **Hardcoded strings in components:**
  - `AdminNav.tsx:42` → `"Elite Kids"` (should be `t('brand.name')`)
  - `AdminNav.tsx:79` → `"Sign out"` (should be `t('nav.signOut')`)
  - `MediaLibrary.tsx:335` → `"Media Library 🎨"` (should be `t('mediaLibrary.title')`)
  - `MediaLibrary.tsx:393` → `"No results for \"${search}\""` (should use `t()` with interpolation)
  - `BossBattleOverlay.tsx:119` → `"Ancient Guardian"` (should be `t('bossBattle.defaultGuardian')`)

### 5.3 Missing Locale
- Only `en` locale exists — no `en-NG` or other locales despite `i18n.ts` supporting it

---

## 6. UX

### 6.1 Missing Route-Level Error Boundaries
- Lazy-loaded routes don't have individual error boundaries
- `ErrorBoundary` only wraps the entire app — chunk load failures will show blank screen

### 6.2 Missing Loading States
- `StudentCurriculumPanel.tsx` — no skeleton loading, just spinner
- `StudentLeaderboardPanel.tsx` — no skeleton loading, just spinner
- `TeacherBossRaid.tsx` — no skeleton loading, just spinner

### 6.3 Missing Offline Support
- `GamePlay.tsx` has comprehensive offline support
- `StudentArenaPanel.tsx` — NO offline support (polls every 15s)
- `StudentFestival.tsx` — NO offline support (polls every 15s)
- `BossBattleOverlay.tsx` — NO offline support (polls every 15s)
- `StudentLiveBar.tsx` — NO offline support (WebSocket only)

### 6.4 Missing Accessibility
- `A11ySettings.tsx` exists but not verified if integrated into all pages
- No ARIA labels on many interactive elements

### 6.5 Missing Mobile Optimization
- No touch gesture support for arena pull interactions
- No swipe navigation between tabs

---

## 7. API_MISMATCH

### 7.1 Frontend → Backend Route Comparison
| Frontend Endpoint | Backend Route | Match |
|------------------|---------------|-------|
| `AUTH.LOGIN` → `POST /users/login` | `POST /users/login` | ✅ |
| `AUTH.STUDENT_LOGIN` → `POST /students/login` | `POST /students/login` | ✅ |
| `AUTH.PARENT_SIGNUP` → `POST /auth/parent-signup` | `POST /auth/parent-signup` | ✅ |
| `SCHOOL.DETAILS` → `GET /schools/get-details` | `GET /schools/get-details` | ✅ |
| `SCHOOL.CHECK_SHORTNAME` → `GET /schools/check-shortname` | `GET /schools/check-shortname` | ✅ |
| `CHILDREN.LIST` → `GET /kids/children` | `GET /kids/children` | ✅ |
| `CHILDREN.CREATE` → `POST /kids/children` | `POST /kids/children` | ✅ |
| `CHILDREN.CREATE_FOR_PARENT` → `POST /kids/children/create-for-parent` | `POST /kids/children/create-for-parent` | ✅ |
| `CHILDREN.LINK` → `POST /kids/children/link` | `POST /kids/children/link` | ✅ |
| `CHILDREN.DETAIL` → `GET /kids/children/detail` | `GET /kids/children/detail` | ✅ |
| `CHILDREN.UPDATE` → `PUT /kids/children/detail` | `PUT /kids/children/detail` | ✅ |
| `CHILDREN.DELETE` → `DELETE /kids/children/detail` | `DELETE /kids/children/detail` | ✅ |
| `LESSONS.LIST` → `GET /kids/lessons` | `GET /kids/lessons` | ✅ |
| `LESSONS.CREATE` → `POST /kids/lessons` | `POST /kids/lessons` | ✅ |
| `LESSONS.CREATE_MANUAL` → `POST /kids/lessons/manual` | `POST /kids/lessons/manual` | ✅ |
| `LESSONS.GAME` → `GET /kids/lessons/:id/game` | `GET /kids/lessons/:id/game` | ✅ |
| `LESSONS.SCENES` → `GET /kids/lessons/:id/scenes` | `GET /kids/lessons/:id/scenes` | ✅ |
| `LESSONS.APPROVE` → `POST /kids/lessons/:id/approve` | `POST /kids/lessons/:id/approve` | ✅ |
| `GENERATION_JOBS.LIST` → `GET /kids/generation-jobs` | `GET /kids/generation-jobs` | ✅ |
| `GENERATION_JOBS.DETAIL` → `GET /kids/generation-jobs/:id` | `GET /kids/generation-jobs/:id` | ✅ |
| `PROGRESS.COMPLETE` → `POST /kids/progress/game-complete` | `POST /kids/progress/game-complete` | ✅ |
| `PROGRESS.SYNC_BATCH` → `POST /kids/sync/batch` | `POST /kids/sync/batch` | ✅ |
| `PROGRESS.CHILD` → `GET /kids/progress/child` | `GET /kids/progress/child` | ✅ |
| `PROGRESS.PUZZLE_DIFFICULTY` → `GET /kids/progress/puzzle-difficulty` | `GET /kids/progress/puzzle-difficulty` | ✅ |
| `APPROVALS.LIST` → `GET /kids/approvals` | `GET /kids/approvals` | ✅ |
| `APPROVALS.DECIDE` → `POST /kids/approvals/:id/decide` | `POST /kids/approvals/:id/decide` | ✅ |
| `SERIES.CREATE` → `POST /kids/series` | `POST /kids/series` | ✅ |
| `SERIES.LIST` → `GET /kids/series` | `GET /kids/series` | ✅ |
| `SERIES.DETAIL` → `GET /kids/series/:id` | `GET /kids/series/:id` | ✅ |
| `CURRICULUM.LIST` → `GET /kids/curriculum` | `GET /kids/curriculum` | ✅ |
| `SERIES.CREATE_UNIT` → `POST /kids/series/:id/units` | `POST /kids/series/:id/units` | ✅ |
| `SERIES.UPDATE_UNIT` → `PUT /kids/series/:id/units/:unitId` | `PUT /kids/series/:id/units/:unitId` | ✅ |
| `UNIT.LOCK_STATUS` → `GET /kids/units/:id/lock-status` | `GET /kids/units/:id/lock-status` | ✅ |
| `UNIT.SUGGESTED_MODE` → `GET /kids/lessons/:id/suggested-mode` | `GET /kids/lessons/:id/suggested-mode` | ✅ |
| `UNIT.NEXT_UP` → `GET /kids/lessons/:id/next-up` | `GET /kids/lessons/:id/next-up` | ✅ |
| `ONBOARDING.STATUS` → `GET /kids/onboarding/status` | `GET /kids/onboarding/status` | ✅ |
| `ONBOARDING.COMPLETE` → `POST /kids/onboarding/complete` | `POST /kids/onboarding/complete` | ✅ |
| `RETRY.TEST_COMPLETE` → `POST /kids/retry/test-complete` | `POST /kids/retry/test-complete` | ✅ |
| `RETRY.STATUS` → `GET /kids/retry/status` | `GET /kids/retry/status` | ✅ |
| `RETRY.TEACHER_FLAGS` → `GET /kids/retry/teacher-flags` | `GET /kids/retry/teacher-flags` | ✅ |
| `TRACKING.ITEM_RESPONSE` → `POST /kids/tracking/item-response` | `POST /kids/tracking/item-response` | ✅ |
| `TRACKING.SESSION_SNAPSHOT` → `POST /kids/tracking/session-snapshot` | `POST /kids/tracking/session-snapshot` | ✅ |
| `TRACKING.PROGRESS` → `GET /kids/tracking/progress` | `GET /kids/tracking/progress` | ✅ |
| `TRACKING.DIGEST` → `GET /kids/tracking/digest` | `GET /kids/tracking/digest` | ✅ |
| `GARDEN.GET` → `GET /kids/garden` | `GET /kids/garden` | ✅ |
| `GARDEN.INITIALIZE` → `POST /kids/garden/initialize` | `POST /kids/garden/initialize` | ✅ |
| `GARDEN.GROW` → `POST /kids/garden/grow` | `POST /kids/garden/grow` | ✅ |
| `COMPANION.GET` → `GET /kids/companion` | `GET /kids/companion` | ✅ |
| `COMPANION.CHOOSE` → `POST /kids/companion/choose` | `POST /kids/companion/choose` | ✅ |
| `COMPANION.CUSTOMIZE` → `POST /kids/companion/customize` | `POST /kids/companion/customize` | ✅ |
| `SESSION.SAVE` → `POST /kids/session/save` | `POST /kids/session/save` | ✅ |
| `SESSION.RESUME` → `GET /kids/session/resume` | `GET /kids/session/resume` | ✅ |
| `SESSION.DELETE` → `DELETE /kids/session/:id` | `DELETE /kids/session/:id` | ✅ |
| `LIBRARY.LIST` → `GET /kids/library` | `GET /kids/library` | ✅ |
| `LIBRARY.DETAIL` → `GET /kids/library/:id` | `GET /kids/library/:id` | ✅ |
| `LIBRARY.ASSIGN` → `POST /kids/library/assign` | `POST /kids/library/assign` | ✅ |
| `LIBRARY.CUSTOMIZE` → `POST /kids/library/customize` | `POST /kids/library/customize` | ✅ |
| `LIBRARY.VARIANTS` → `GET /kids/variants` | `GET /kids/variants` | ✅ |
| `MODE_LOCK.GET` → `GET /kids/mode-lock` | `GET /kids/mode-lock` | ✅ |
| `MODE_LOCK.LIST` → `GET /kids/mode-locks` | `GET /kids/mode-locks` | ✅ |
| `MODE_LOCK.SET` → `POST /kids/mode-lock` | `POST /kids/mode-lock` | ✅ |
| `MODE_LOCK.REMOVE` → `DELETE /kids/mode-lock` | `DELETE /kids/mode-lock` | ✅ |
| `MODE_LOCK.CONVERT_SCORES` → `POST /kids/test-scores/convert` | `POST /kids/test-scores/convert` | ✅ |
| `PARENTAL.GET` → `GET /kids/parental-controls` | `GET /kids/parental-controls` | ✅ |
| `PARENTAL.SET` → `POST /kids/parental-controls` | `POST /kids/parental-controls` | ✅ |
| `PARENTAL.CHECK` → `GET /kids/parental-controls/check` | `GET /kids/parental-controls/check` | ✅ |
| `ARENA.ACTIVE` → `GET /kids/arena/active` | `GET /kids/arena/active` | ✅ |
| `ARENA.CREATE` → `POST /kids/arena/create` | `POST /kids/arena/create` | ✅ |
| `ARENA.LIST` → `GET /kids/arena/list` | `GET /kids/arena/list` | ✅ |
| `ARENA.END` → `POST /kids/arena/:id/end` | `POST /kids/arena/:id/end` | ✅ |
| `ARENA.GAMES` → `GET /kids/arena/:id/games` | `GET /kids/arena/:id/games` | ✅ |
| `ARENA.SET_GAMES` → `POST /kids/arena/:id/games` | `POST /kids/arena/:id/games` | ✅ |
| `ARENA.DASHBOARD` → `GET /kids/arena/:id/dashboard` | `GET /kids/arena/:id/dashboard` | ✅ |
| `ARENA.START` → `POST /kids/arena/:id/participants/start` | `POST /kids/arena/:id/participants/start` | ✅ |
| `ARENA.PROGRESS` → `POST /kids/arena/:id/participants/progress` | `POST /kids/arena/:id/participants/progress` | ✅ |
| `BOSS.RAID_ACTIVE` → `GET /kids/boss/raid/active` | `GET /kids/boss/raid/active` | ✅ |
| `BOSS.RAID_CREATE` → `POST /kids/boss/raid/create` | `POST /kids/boss/raid/create` | ✅ |
| `BOSS.RAIDS` → `GET /kids/boss/raids` | `GET /kids/boss/raids` | ✅ |
| `BOSS.RAID_DASHBOARD` → `GET /kids/boss/raid/:id/dashboard` | `GET /kids/boss/raid/:id/dashboard` | ✅ |
| `BOSS.SUBMIT_DAMAGE` → `POST /kids/boss/raid/:id/damage` | `POST /kids/boss/raid/:id/damage` | ✅ |
| `BOSS.SET_GAMES` → `POST /kids/boss/raid/:id/games` | `POST /kids/boss/raid/:id/games` | ✅ |
| `BOSS.GUARDIANS` → `GET /kids/boss/guardians` | `GET /kids/boss/guardians` | ✅ |
| `ADAPTIVE.PROFILE` → `GET /kids/adaptive/profile` | `GET /kids/adaptive/profile` | ✅ |
| `ADAPTIVE.UPDATE` → `POST /kids/adaptive/update` | `POST /kids/adaptive/update` | ✅ |
| `ADAPTIVE.RECOMMENDED` → `GET /kids/adaptive/recommended` | `GET /kids/adaptive/recommended` | ✅ |
| `ADAPTIVE.DUE_REVIEWS` → `GET /kids/adaptive/due-reviews` | `GET /kids/adaptive/due-reviews` | ✅ |
| `REVIEWS.DUE` → `GET /kids/reviews/due` | `GET /kids/reviews/due` | ✅ |
| `REVIEWS.COMPLETE` → `POST /kids/reviews/complete` | `POST /kids/reviews/complete` | ✅ |
| `REVIEWS.STATS` → `GET /kids/reviews/stats` | `GET /kids/reviews/stats` | ✅ |
| `REVISION.STATUS` → `GET /kids/revision/status` | `GET /kids/revision/status` | ✅ |
| `REVISION.NUDGES` → `GET /kids/revision/nudges` | `GET /kids/revision/nudges` | ✅ |
| `REVISION.FAILED_ITEMS` → `GET /kids/revision/failed-items` | `GET /kids/revision/failed-items` | ✅ |
| `REVISION.RECORD_FAILED` → `POST /kids/revision/failed` | `POST /kids/revision/failed` | ✅ |
| `REVISION.MARK_RETRY_CORRECT` → `POST /kids/revision/retry-correct` | `POST /kids/revision/retry-correct` | ✅ |
| `REVISION.WEEKLY` → `GET /kids/revision/weekly` | `GET /kids/revision/weekly` | ✅ |
| `FESTIVAL.ACTIVE` → `GET /kids/festival/active` | `GET /kids/festival/active` | ✅ |
| `FESTIVAL.CREATE` → `POST /kids/festival/create` | `POST /kids/festival/create` | ✅ |
| `FESTIVAL.DAMAGE` → `POST /kids/festival/:id/damage` | `POST /kids/festival/:id/damage` | ✅ |
| `FESTIVAL.HISTORY` → `GET /kids/festival/history` | `GET /kids/festival/history` | ✅ |
| `FESTIVAL.GUARDIANS` → `GET /kids/festival/guardians` | `GET /kids/festival/guardians` | ✅ |
| `QUICK_CREATE.CREATE` → `POST /kids/teacher/quizzes` | `POST /kids/teacher/quizzes` | ✅ |
| `QUICK_CREATE.LIST` → `GET /kids/teacher/quizzes` | `GET /kids/teacher/quizzes` | ✅ |
| `QUICK_CREATE.QUESTIONS` → `GET /kids/teacher/quizzes/:id/questions` | `GET /kids/teacher/quizzes/:id/questions` | ✅ |
| `QUICK_CREATE.ADD_QUESTIONS` → `POST /kids/teacher/quizzes/:id/questions` | `POST /kids/teacher/quizzes/:id/questions` | ✅ |
| `QUICK_CREATE.PUBLISH` → `POST /kids/teacher/quizzes/:id/publish` | `POST /kids/teacher/quizzes/:id/publish` | ✅ |
| `QUICK_CREATE.UNPUBLISH` → `POST /kids/teacher/quizzes/:id/unpublish` | `POST /kids/teacher/quizzes/:id/unpublish` | ✅ |
| `QUICK_CREATE.DELETE` → `DELETE /kids/teacher/quizzes/:id` | `DELETE /kids/teacher/quizzes/:id` | ✅ |
| `ANALYTICS.OVERVIEW` → `GET /kids/analytics/overview` | `GET /kids/analytics/overview` | ✅ |
| `ANALYTICS.CLASSES` → `GET /kids/analytics/classes` | `GET /kids/analytics/classes` | ✅ |
| `ANALYTICS.STRUGGLING` → `GET /kids/analytics/struggling` | `GET /kids/analytics/struggling` | ✅ |
| `ANALYTICS.GAMES` → `GET /kids/analytics/games` | `GET /kids/analytics/games` | ✅ |
| `ANALYTICS.LEADERBOARD` → `GET /kids/analytics/leaderboard` | `GET /kids/analytics/leaderboard` | ✅ |
| `LEADERBOARD.BOARD` → `GET /kids/leaderboard` | `GET /kids/leaderboard` | ✅ |
| `LEADERBOARD.ME` → `GET /kids/leaderboard/me` | `GET /kids/leaderboard/me` | ✅ |
| `LEADERBOARD.BADGES` → `GET /kids/badges` | `GET /kids/badges` | ✅ |
| `NERDC.REPORT` → `GET /kids/nerdc/report` | `GET /kids/nerdc/report` | ✅ |
| `LIVE.PUBLIC_KEY` → `GET /kids/push/public-key` | `GET /kids/push/public-key` | ✅ |
| `LIVE.SUBSCRIBE` → `POST /kids/push/subscribe` | `POST /kids/push/subscribe` | ✅ |
| `PARENT.LOGIN` → `POST /kids/parent/login` | `POST /kids/parent/login` | ✅ |
| `PARENT.REGISTER` → `POST /kids/parent/register` | `POST /kids/parent/register` | ✅ |
| `PARENT.CHILDREN` → `GET /kids/parent/children` | `GET /kids/parent/children` | ✅ |
| `PARENT.CHILD_PROGRESS` → `GET /kids/parent/child/:adm/progress` | `GET /kids/parent/child/:adm/progress` | ✅ |
| `PARENT.ACTIVITIES` → `GET /kids/parent/activities` | `GET /kids/parent/activities` | ✅ |
| `MEDIA.UPLOAD` → `POST /media/upload` | `POST /media/upload` | ✅ |
| `MEDIA.STATUS` → `GET /media/upload-status/:jobId` | `GET /media/upload-status/:jobId` | ✅ |
| `MEDIA.LIST` → `GET /media/files` | `GET /media/files` | ✅ |
| `MEDIA.DELETE` → `DELETE /media/files/:key` | `DELETE /media/files/:key` | ✅ |
| `MEDIA.PUZZLE_SPLIT` → `POST /media/puzzle-split` | `POST /media/puzzle-split` | ✅ |
| `MEDIA.OPEN_SOURCE_SAVE` → `POST /media/save-opensource` | `POST /media/save-opensource` | ✅ |
| `MEDIA.OPEN_SOURCE_BATCH` → `POST /media/save-opensource-batch` | `POST /media/save-opensource-batch` | ✅ |
| `MEDIA.OPEN_SOURCE_ASSETS` → `GET /media/opensource-assets` | `GET /media/opensource-assets` | ✅ |

**All defined frontend endpoints match backend routes.** No mismatches found.

---

## 8. Summary

| Category | Count | Severity |
|----------|-------|----------|
| BROKEN | 2 | 🔴 Critical |
| INCOMPLETE | 7 | 🟡 Medium |
| MISSING | 7 | 🟡 Medium |
| ORPHAN | 1 | 🟢 Low |
| I18N | 5 | 🟢 Low |
| UX | 5 | 🟡 Medium |
| API_MISMATCH | 0 | ✅ Clean |

### Top Priority Fixes
1. **Fix `ParentDashboard` orphan** — Either import it or remove from routes
2. **Add missing features** — Weekend Challenge, Push Notifications, Match History, Voice Notes, Parent Notifications
3. **Add route-level error boundaries** for lazy-loaded routes
4. **Replace hardcoded strings** with i18n keys
5. **Clean up backup files** (`.bak-*`)
6. **Add offline support** to arena/festival/live components
7. **Add skeleton loading** to major panels
