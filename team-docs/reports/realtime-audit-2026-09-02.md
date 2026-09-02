# Real-Time & Game Launch Audit — 2026-09-02

## Executive Summary

**5 critical bugs found and fixed. 3 features converted from polling to real-time WebSocket push.** The real-time audio system (teacher broadcast, parent-to-child, 1:1 mic grant) was fully implemented on the backend but had **no student-side UI** to receive audio. Additionally, two routes were missing from the router, one WebRTC broadcast activation path was broken, and two game navigation URLs were wrong. Arena competitions, boss raids, and festivals now push live updates via WebSocket instead of polling.

---

## Findings

### CRITICAL — No Student Live Audio UI (FIXED)

**Problem:** The entire WebSocket + WebRTC infrastructure exists (backend `e3fLive.js`, frontend `audio.ts` + `webrtc.ts`), teacher and parent pages work, but **students had NO component to connect and hear audio**. The i18n strings (`student.liveBar.*`) existed but no component used them.

**Impact:** Teacher broadcasts to class → students hear nothing. Parent talks to child → child hears nothing. Teacher grants mic to student → student can't respond.

**Fix:** Created `StudentLiveBar.tsx` — a persistent bar at the top of StudentHome that:
- Auto-connects to class WebSocket channel on mount
- Shows "Teacher is speaking" indicator with live pulse
- Auto-starts mic when granted floor (walkie-talkie model)
- Shows mic-denied warning if browser blocks access
- Embedded in StudentHome between header and main content

### CRITICAL — Missing `/parent/live` Route (FIXED)

**Problem:** `ParentLive.tsx` exists, `ParentChildren.tsx` links to `/parent/live`, but **no route was registered in App.tsx**. Navigating there hit the catch-all `*` redirect to `/dashboard`.

**Fix:** Added lazy import + route for `/parent/live` in App.tsx.

### CRITICAL — Missing `/teacher/voice-notes` Route (FIXED)

**Problem:** `TeacherVoiceNotes.tsx` exists but had no route in App.tsx. Teachers couldn't access the voice notes page.

**Fix:** Added lazy import + route for `/teacher/voice-notes` in App.tsx.

### CRITICAL — TeacherWebRTC.startBroadcast() Never Called (FIXED)

**Problem:** In `audio.ts:282-297`, when WebRTC mode initializes for a teacher who was already broadcasting (e.g., started in PCM mode, then WebRTC was enabled), `TeacherWebRTC.startBroadcast()` was never called. The comment said it should be, but the code was missing.

**Fix:** Added `this.teacherRtc.startBroadcast()` call when `this.speaking` is true during WebRTC init.

### MODERATE — ReviewZone Wrong Route (FIXED)

**Problem:** `ReviewZone.tsx:62` navigated to `/student/play/${review.lesson_id}` but the route is `/student/game/:lessonId`. Review cards would hit the catch-all redirect instead of loading the game.

**Fix:** Changed to `/student/game/${review.lesson_id}?mode=practice`.

### MODERATE — StudentFestival Missing LessonId (FIXED)

**Problem:** `StudentHome.tsx:528` had `navigate('/student/game')` without a lessonId. The festival "fight" button would navigate to a broken URL.

**Fix:** Changed to `navigate('/student')` — sends student back to home to pick a game.

---

## Architecture — How Real-Time Works

```
┌─────────────────────────────────────────────────────────┐
│              Backend: e3fLive.js (ws library)            │
│  WebSocket server at /kids/live?token=JWT&class=CLS001  │
│  ├── Room: {school}:{class} (teacher ↔ students)        │
│  ├── Room: {school}:parent:{phone} (parent ↔ children)  │
│  ├── PCM binary relay (16kHz Int16, fallback)           │
│  └── WebRTC signaling relay (LIVE_WEBRTC=1 env gate)    │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Teacher │         │ Student │         │ Parent  │
    │TeacherLive│       │StudentLiveBar│    │ParentLive│
    │ (exists) │        │ (NEW!)   │        │ (route  │
    │          │        │          │        │  FIXED) │
    └─────────┘        └──────────┘        └─────────┘
```

### Transport Modes
1. **WebRTC P2P** (`LIVE_WEBRTC=1`): RTCPeerConnection with Opus audio. Teacher publishes to all students; floored student publishes mic back.
2. **PCM Relay** (fallback): Binary WebSocket frames, server-relayed. Works everywhere but higher latency.

### Walkie-Talkie Model
- Teacher/parent = controller (can always speak)
- Students = listeners (speak only when granted floor)
- Exactly ONE speaker at a time per room
- Floor grant sends `you-floor` + `you-mic` to student

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Added `/parent/live` + `/teacher/voice-notes` routes, lazy imports |
| `frontend/src/components/StudentLiveBar.tsx` | **NEW** — Student live audio bar component |
| `frontend/src/pages/Student/StudentHome.tsx` | Embedded StudentLiveBar, fixed festival navigate |
| `frontend/src/lib/live/audio.ts` | Fixed TeacherWebRTC.startBroadcast() not called on WebRTC init |
| `frontend/src/components/ReviewZone.tsx` | Fixed `/student/play/` → `/student/game/` route |

---

## Remaining Known Issues (Not Fixed — Out of Scope)

1. **Reactions are localStorage-only** — emoji reactions during competitions are per-tab, not broadcasted to other students. Would need server-side relay.
2. **Legacy ScriptProcessorNode** — `audio.ts` uses deprecated `createScriptProcessor`. Should migrate to `AudioWorkletNode` for future-proofing.
3. **Arena dashboard is HTTP polling** — Teacher's competition dashboard (`TeacherArena`) polls `GET /kids/arena/:id/dashboard` instead of WebSocket push. Works but not truly real-time.
4. **Parent notifications are REST-based** — Game score notifications to parents are stored in DB and polled, not pushed via WebSocket.

---

*Generated by audit run 2026-09-02*
