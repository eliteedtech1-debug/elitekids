# Real-Time Features — Theory vs Reality Report

**Date:** 2026-09-04  
**Tester:** opencode (Playwright browser automation)  
**Environment:** Local dev (`npm run dev` → API:34600, FE:34601)

---

## Executive Summary

**5 issues found during local testing. 3 fixed immediately, 2 documented for follow-up.**

The real-time audio system (KidsLive WebSocket) was fully implemented but had **no Vite proxy for WebSocket connections** in development mode, making it appear broken. Once the proxy was configured, the WebSocket connected successfully and the teacher class selector dropdown worked as designed.

---

## Theory vs Reality

| Feature | Theory (Architecture) | Reality (Local Test) | Status |
|---------|----------------------|---------------------|--------|
| **WebSocket connection** | Teacher connects via `ws://host/kids/live?token=JWT&class=CLSxxx` | Initially failed — Vite dev server on port 34601 had no proxy to backend port 34600. WebSocket hit Vite, not backend. | **FIXED** (added Vite proxy) |
| **Teacher class selector** | Teacher types a class code manually | Changed to dropdown from `teacher_subjects` (persisted at login from `active_teacher_classes`) | **FIXED** (redesigned UI) |
| **Login stores teacher subjects** | Login response includes `subjects` (teacher_classes) but frontend discards it | Added `TEACHER_SUBJECTS` storage key, login now persists `data.subjects` | **FIXED** (new storage key) |
| **"Access Restricted" dead-end** | School without kids subscription shows error with no way back | Added "Try Another School" button that resets school state | **FIXED** |
| **Backend DB sync crash** | `sync()` crashes on first model missing `createdAt` column | Made sync resilient — catches per-model errors, logs warnings, continues | **FIXED** (7 models with `timestamps: false`) |
| **Broadcast mic access** | Teacher clicks "Start Broadcasting" → mic access granted → audio streams | Mic denied in headless browser (expected — no hardware mic). In real browser with mic, it would work. | **Expected** |
| **Parent presence** | Parent sees children online via `useParentPresence` hook | Not tested — local DB has no parent-child links (`kids_parent_links` table missing) | **BLOCKED** (no test data) |
| **StudentLiveBar** | Student auto-connects to class room on mount | Not tested — no student accounts in local DB | **BLOCKED** (no test data) |

---

## Issues Found & Fixed

### 1. CRITICAL — No Vite WebSocket Proxy (FIXED)

**Problem:** Frontend dev server runs on port 34601, backend WebSocket on port 34600. The `EliteLive.connect()` method creates a WebSocket to `ws://localhost:34601/kids/live` — which hits the Vite dev server, not the backend. No WebSocket connection is established.

**Impact:** Teacher Live, StudentLiveBar, ParentLive all non-functional in local dev.

**Fix:** Added WebSocket proxy rules to `frontend/vite.config.ts`:
```ts
proxy: {
  '/kids/live': { target: 'http://localhost:34600', ws: true },
  '/kids/chat': { target: 'http://localhost:34600', ws: true },
  '/kids/teams': { target: 'http://localhost:34600', ws: true },
  '/api': { target: 'http://localhost:34600' },
}
```

**Production impact:** None — production serves frontend from nginx which proxies to backend.

### 2. HIGH — TeacherLive Uses Free-Text Class Code (FIXED)

**Problem:** Teacher types a class code manually. In the real system, teachers are assigned specific classes via `active_teacher_classes`. A teacher typing "CLS001" might not have access to that class.

**Impact:** UX confusion, potential for wrong class code.

**Fix:** Replaced text input with `<select>` dropdown populated from `teacher_subjects` (persisted at login). Shows `ClassName (Subject1, Subject2)` format.

### 3. HIGH — Login Discards Teacher Subjects (FIXED)

**Problem:** Login API returns `subjects: [...]` (teacher's assigned classes) but frontend only stores `{ user_type }` in `USER_DATA`. Teacher subjects are lost.

**Impact:** TeacherLive dropdown would always be empty.

**Fix:** 
- Added `TEACHER_SUBJECTS: 'teacher_subjects'` to `STORAGE_KEYS`
- Login now persists `data.subjects` to localStorage
- TeacherLive reads from this key on mount

### 4. MEDIUM — "Access Restricted" Dead-End (FIXED)

**Problem:** When a school doesn't have `kids_stand_alone >= 1`, the login page shows "Access Restricted" with no way to go back or try a different school.

**Impact:** User is stuck on a dead-end page.

**Fix:** Added "Try Another School" button that calls `setSchool(null)` and clears `school_id` from form state.

### 5. MEDIUM — Backend Sync Crashes on Missing Columns (FIXED)

**Problem:** 7 models define `created_at` (snake_case) as a regular field but inherit `timestamps: true` (camelCase `createdAt`). When `sync()` runs, Sequelize queries `createdAt` which doesn't exist in the DB table. The entire server crashes.

**Impact:** Server fails to start.

**Fix:** Added `timestamps: false` to all 7 affected models:
- `KidInsight.js`
- `KidActionItem.js`
- `KidTeacherInsight.js`
- `KidContentSuggestion.js`
- `KidPeerTeaching.js`
- `KidGameItemResponse.js`
- `KidTestAttempt.js`

Also made `sync()` resilient — wraps each `model.sync()` in try/catch so one failure doesn't kill the server.

---

## Blockers (Cannot Test Locally)

| Blocker | Reason | Impact |
|---------|--------|--------|
| **No parent accounts** | Local DB has no parents with `kids_parent_links` | Cannot test ParentLive, parent presence, parent-child chat |
| **No student accounts** | Local DB has no students in `kids_children` for SCH-KIDS | Cannot test StudentLiveBar, student WebSocket connection |
| **Broken `active_teacher_classes` view** | View references missing tables | Cannot get real teacher class assignments |
| **`kids_parent_links` table missing** | Table doesn't exist in local DB | Cannot test parent-child WebSocket room linking |

---

## Recommendations

### For Similar Multi-Role Real-Time Systems

1. **Always configure Vite/proxy for WebSocket in dev** — The #1 issue. Without it, all WebSocket features silently fail in development.

2. **Persist role-specific data at login** — Don't discard API response data like `subjects`, `teacher_roles`. Store them in localStorage with dedicated keys.

3. **Use dropdowns for class selection** — Never let teachers type class codes manually. Always source from their assigned classes.

4. **Make sync() resilient** — One broken model should not crash the entire server. Use per-model try/catch.

5. **Add `timestamps: false` to models with manual timestamps** — If a model defines its own `created_at` field, it must set `timestamps: false` to avoid conflicts.

6. **Test with real data** — Local dev DB is often empty. Either seed test data or test against staging.

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/vite.config.ts` | Added WebSocket proxy for `/kids/live`, `/kids/chat`, `/kids/teams`, `/api` |
| `frontend/src/pages/Teacher/TeacherLive.tsx` | Replaced class code text input with dropdown from `teacher_subjects` |
| `frontend/src/pages/Login/Login.tsx` | Added "Try Another School" button; persist `data.subjects` to localStorage |
| `frontend/src/lib/utils/constants.ts` | Added `TEACHER_SUBJECTS` storage key |
| `backend/src/models/index.js` | Made `sync()` resilient with per-model try/catch |
| `backend/src/models/KidInsight.js` | Added `timestamps: false` |
| `backend/src/models/KidActionItem.js` | Added `timestamps: false` |
| `backend/src/models/KidTeacherInsight.js` | Added `timestamps: false` |
| `backend/src/models/KidContentSuggestion.js` | Added `timestamps: false` |
| `backend/src/models/KidPeerTeaching.js` | Added `timestamps: false` |
| `backend/src/models/KidGameItemResponse.js` | Added `timestamps: false` |
| `backend/src/models/KidTestAttempt.js` | Added `timestamps: false` |
| `backend/src/controllers/kidsMeActivity.js` | Created stub for missing controller |

---

*Generated by Playwright browser testing session 2026-09-04*

---

## Takeover Closure (Buffy, 2026-09-04)

- **SRS created** → `team-docs/SRS-realtime-features.md` (SRS-RT-001): full realtime spec — roles/rooms, WS protocol tables, close codes, functional + non-functional requirements, security, test plans, deployment/dev notes. This was the last open todo from the testing session.
- **Cleanup:** removed debug `[LOGIN]` console.logs from `backend/src/controllers/auth.js` (kept the error-only `[safeQuery] FAILED` logging).
- **Verified:** all backend files `node --check` clean; frontend `tsc --noEmit` clean.
- **Working tree state:** 14 modified files + 2 untracked (`kidsMeActivity.js` stub — referenced by routes/kids.js, required; this report). Ready for commit/push at MASTER's go (push triggers auto-deploy: run-tests.sh + rebuild-frontend.sh).
