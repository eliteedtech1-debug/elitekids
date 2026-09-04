# Software Requirements Specification — Real-Time Features (KidsLive)

**Document ID:** SRS-RT-001
**Version:** 1.0.0
**Date:** 2026-09-04
**Author:** opencode testing session → Buffy (takeover, docs)
**Status:** DRAFT — companion to `reports/realtime-theory-vs-reality-2026-09-04.md`
**Applies to:** EliteKids (elite-kids), backend `:8484` / `:34600`, frontend `:34601`

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Architecture](#2-architecture)
3. [Roles & Rooms](#3-roles--rooms)
4. [WebSocket Protocol](#4-websocket-protocol)
5. [Functional Requirements](#5-functional-requirements)
6. [Frontend Components](#6-frontend-components)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Error Handling & Edge Cases](#8-error-handling--edge-cases)
9. [Security & Privacy](#9-security--privacy)
10. [Test Plans](#10-test-plans)
11. [Deployment & Dev Notes](#11-deployment--dev-notes)

---

## 1. Overview & Scope

### 1.1 Purpose

This SRS defines the requirements for EliteKids' real-time layer, code-named
**KidsLive**: live teacher→class audio, parent↔child presence and audio,
parent↔child text chat, and real-time game events (arena scores, boss raid HP,
festival HP, reactions). It is the single reference for how the WebSocket hubs
behave, who may join which room, and what the browser clients must do.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Teacher → class live audio (1-way default) | Recording / playback of live sessions |
| Walkie-talkie floor control (per-child mic grant) | Voice notes (async, E4-P0 — separate feature) |
| WebRTC P2P audio (opt-in `LIVE_WEBRTC=1`) | Video streaming |
| Parent↔child presence (online status) | Push notifications (separate `e3fPush.js`) |
| Parent live audio broadcast to own children | Cross-school / cross-class broadcasts |
| Parent↔child text chat (persisted) | Group chat, media attachments |
| Real-time game events (arena / raid / festival / reactions) | Offline-first sync (Q4) |
| Collaboration WebSocket (`/kids/teams/ws`, Q3) | Content marketplace (Q4) |

### 1.3 Existing Implementation Map

| Component | File | Status |
|-----------|------|--------|
| KidsLive WS hub (audio + presence + events) | `backend/src/controllers/e3fLive.js` | LIVE |
| Chat WS + REST (persisted messages) | `backend/src/sockets/chat.js`, `controllers/kidsChat.js` | LIVE |
| Collaboration WS (teams) | `backend/src/sockets/collaboration.js` | Q3 (RUNNING) |
| Client transport (PCM + WebRTC) | `frontend/src/lib/live/audio.ts` | LIVE |
| WebRTC peer classes | `frontend/src/lib/live/webrtc.ts` | LIVE |
| Singleton connection | `frontend/src/lib/live/connection.ts` | LIVE |
| Event bus | `frontend/src/lib/live/events.ts` | LIVE |
| Parent presence hook | `frontend/src/lib/live/useParentPresence.ts` | LIVE |
| Student live bar | `frontend/src/components/StudentLiveBar.tsx` | LIVE |
| Teacher console | `frontend/src/pages/Teacher/TeacherLive.tsx` | LIVE |
| Parent console | `frontend/src/pages/Parent/ParentLive.tsx` | LIVE |

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node/Express)                     │
│  e3fLive.attach(server) → ws WebSocketServer (noServer)        │
│  Rooms: Map<roomKey, {conns, speaker, speakerTimer,            │
│                      pendingOffers}>                           │
│  Room keys:  <schoolId>:<classCode>                            │
│              <schoolId>:parent:<+234...phone>                  │
│  ── upgrade handler claims /kids-live and /kids/live only      │
│  ── chat + collaboration sockets attach separately             │
└──────────────┬──────────────────────────┬──────────────────────┘
               │  WSS (nginx / Vite proxy)│
┌──────────────▼──────────┐   ┌───────────▼─────────────────────┐
│  TEACHER / PARENT       │   │  STUDENT                        │
│  role=teacher|parent    │   │  role=student                   │
│  = controller           │   │  = listener                     │
│  • broadcast mic        │   │  • hears controller             │
│  • grant/revoke floor   │   │  • replies when floored         │
│  • WebRTC offers        │   │  • auto-joins parent rooms       │
│  TeacherLive/ParentLive │   │  StudentLiveBar (StudentHome)    │
└─────────────────────────┘   └──────────────────────────────────┘
```

### 2.1 Design Decisions (ADRs)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-01 | Walkie-talkie model: exactly ONE speaker at a time, controller-preempted | Avoids chaos in a nursery classroom; teacher always wins |
| ADR-02 | Room key = `school:class` / `school:parent:phone` | Multi-tenant isolation; parents scoped to own children |
| ADR-03 | Two transports: PCM relay (always) + WebRTC (opt-in) | PCM works behind any nginx; WebRTC for low latency when TURN available |
| ADR-04 | `noServer` WebSocketServer + manual `upgrade` claim | Coexists with socket.io (chat) and collaboration hubs on one HTTP server |
| ADR-05 | JWT verified locally via HMAC (`verifyJwt`) in the hub | No DB lookup per frame; `ws` lib has no built-in auth |
| ADR-06 | Server resolves student→parent rooms from DB at connect | Client needs zero room config; works across role tokens |
| ADR-07 | Presence pushed on every join/leave (`presence` frames) | Polling removed; UI toasts react to diffs client-side |
| ADR-08 | Parent tokens carry `user_type: parent` — resolved from `parents.user_id → phone` when phone absent | Shared EliteSMS `/users/login` tokens lack phone claim |

---

## 3. Roles & Rooms

### 3.1 Role Rules

| Role | Joins | Can speak freely | Can grant floor | Transport |
|------|-------|------------------|-----------------|-----------|
| Teacher | `<school>:<class>` (via `?class=`) | ✅ | ✅ | PCM + WebRTC |
| Parent | `<school>:parent:<phone>` (auto) | ✅ (own room) | ✅ (own room) | PCM + WebRTC |
| Student | `<school>:<class>` + every linked `<school>:parent:<phone>` (auto) | ❌ until floored | ❌ | PCM + WebRTC |

### 3.2 Student Parent-Room Resolution (server side, on connect)

Two sources, unioned by normalized phone (`^0` → `+234`, no spaces, lowercase):

1. `kids_parent_links` where `child_admission_no = :adm AND verified = 1` (kids-owned mapping)
2. Shared EliteSMS canonical link: `students.parent_id / guardian_id → parents.parent_id → parents.phone`

A student therefore appears "online" to every guardian they are linked to, and
a parent sees ALL their linked children in one room.

### 3.3 Capacity

- `ROOM_CAPACITY = 60` connections per room; join beyond capacity → close `4004 room-full`.
- `maxPayload = 16 * 1024` bytes (one PCM chunk or one signaling frame).

---

## 4. WebSocket Protocol

Endpoint: `wss://host/kids/live?token=JWT[&class=CLSxxxx]`
(also accepts legacy path `/kids-live`; teacher/staff MUST pass `class=`.)

### 4.1 Server → Client

| Type | Payload | Meaning |
|------|---------|---------|
| `welcome` | `{role, floor, live, you:{name}, online[], webrtc:bool, iceServers?}` | On connect; client negotiates transport |
| `presence` | `{online:[{adm,name,role,floor}]}` | Roster changed (join/leave/floor) |
| `live` | `{on}` | A controller is in the room (teacher speaking available) |
| `floor` | `{adm, on}` | Roster change for controllers (child gained/lost floor) |
| `you-floor` | `{on}` | Personal floor grant/revoke to a student |
| `you-mic` | `{on}` | WebRTC: student add/remove mic track |
| `webrtc-start` | `{from}` | Controller began broadcasting → children create PCs |
| `webrtc-stop` | `{from}` | Controller stopped broadcasting → children tear down PCs |
| `webrtc-offer` | `{from, sdp}` | Relay: controller SDP offer → child |
| `webrtc-answer` | `{from, sdp}` | Relay: child SDP answer → controller |
| `webrtc-ice` | `{from, candidate}` | Relay: ICE candidate (both directions) |
| `arena-score` | `{competitionId, childAdmissionNo, score, mode, ts}` | Live leaderboard event |
| `raid-hp` | `{raidId, guardianSlug, guardianName, guardianEmoji, currentHp, maxHp, defeated, damagedBy, ts}` | Boss raid HP update |
| `festival-hp` | `{festivalId, ..., allDefeated, ...}` | Festival guardian HP update |
| `reaction` | `{emoji, from, ts}` | Emoji relay (class-scoped) |
| `parent-notification` | `{notification:{...}}` | Push-style notification to parent room |
| binary frame | Int16 PCM @16kHz mono (~2048 samples) | Legacy relay audio |

### 4.2 Client → Server

| Type | Sender | Payload | Meaning |
|------|--------|---------|---------|
| `floor` | teacher/parent | `{adm, on}` | Grant/revoke a child's mic |
| `webrtc-offer` | teacher/parent | `{to, sdp}` | Offer to a specific child |
| `webrtc-answer` | student | `{sdp}` | Answer to the pending offerer |
| `webrtc-ice` | any | `{to?, candidate}` | ICE candidate (controller→child needs `to`) |
| `webrtc-start` / `webrtc-stop` | teacher/parent | `{}` | Begin/end broadcast |
| `reaction` | any | `{emoji, classCode?}` | Send reaction (targeted or room-wide) |
| binary frame | controller OR floored student | PCM chunk | Audio data |

### 4.3 Close Codes

| Code | Reason | Meaning |
|------|--------|---------|
| 4001 | `unauthorized` | JWT missing/invalid/expired |
| 4002 | `no-class` | Student has no `class_code` |
| 4003 | `class-required` | Teacher joined without `?class=` |
| 4004 | `room-full` | Room at capacity (60) |
| 4005 | `no-phone` | Parent phone unresolvable |
| 1011 | `error` | Unhandled connection error |

---

## 5. Functional Requirements

### 5.1 Teacher Live Broadcast (FR-01)

- **FR-01.1** Teacher selects a class from a dropdown of their assigned classes (`teacher_subjects`, persisted at login) — never free-text.
- **FR-01.2** Teacher joins `?class=CLSxxxx`; students in that class room see "Teacher is speaking" via `live`/`presence` frames.
- **FR-01.3** Broadcast starts on mic grant (`startSpeaking`); PCM fallback relays chunks; WebRTC publishes one Opus stream to all children.
- **FR-01.4** Teacher may mute/unmute any online child via `floor {adm, on}`.
- **FR-01.5** Teacher leaving cleans up the room (room deleted when empty).

### 5.2 Walkie-Talkie Floor Control (FR-02)

- **FR-02.1** Only the controller (teacher/parent) grants floor.
- **FR-02.2** Exactly one student speaker per room; a new floored student preempts the current one (server: `r.speaker` guard + 2s inactivity timeout).
- **FR-02.3** Floored student auto-starts mic (`you-floor` + `you-mic`); revoke stops mic immediately.
- **FR-02.4** Mic permission denial is surfaced (browser permission prompt) without crashing the bar.

### 5.3 Parent Presence (FR-03)

- **FR-03.1** `useParentPresence` opens a background KidsLive connection using the **parent token** (`PARENT_TOKEN` > `STUDENT_TOKEN` > `AUTH_TOKEN`, role-decoded).
- **FR-03.2** Roster diffing toasts "X is now online" / "A child went offline" (first presence skipped — no diff baseline).
- **FR-03.3** Parent dashboard badge/indicator reflects `onlineAdms` in real time.
- **FR-03.4** Parent and student sessions may coexist in one browser (separate tokens, separate connections).

### 5.4 Parent Live Audio (FR-04)

- **FR-04.1** ParentLive connects WITHOUT `class=` — server derives the parent room from JWT + `parents` table.
- **FR-04.2** Parent broadcasts to all their children at once, and grants/revokes floor per child.
- **FR-04.3** Children roster shows online children with live floor state.

### 5.5 Parent↔Child Text Chat (FR-05)

- **FR-05.1** Messages persist to `kids_chat_messages` (elite_content).
- **FR-05.2** Parent-scoped read: parent must own the child via `kids_parent_links` (403 otherwise).
- **FR-05.3** REST: `GET /kids/chat/:adm/messages?limit=&before=` · `POST /kids/chat/:adm/read` · `GET /kids/chat/:adm/unread`.
- **FR-05.4** Schema created idempotently (`ensureSchema`, CREATE TABLE IF NOT EXISTS).

### 5.6 Real-Time Game Events (FR-06)

- **FR-06.1** Arena scores push `arena-score` to the class room (no polling).
- **FR-06.2** Boss raids push `raid-hp`; festivals push `festival-hp` (incl. `allDefeated`).
- **FR-06.3** Reactions relay `reaction` either class-targeted or to all the sender's rooms.

### 5.7 Shared Broadcast API (FR-07)

- **FR-07.1** Other controllers push via `broadcastToClass(schoolId, classCode, msg)` and `broadcastToParent(schoolId, phone, msg)` without importing the hub internals.

---

## 6. Frontend Components

| Component | Route / Mount | Purpose |
|-----------|---------------|---------|
| `TeacherLive.tsx` | `/teacher/live` | Class dropdown + broadcast + floor roster |
| `ParentLive.tsx` | `/parent/live` | Broadcast to children + per-child mic |
| `StudentLiveBar.tsx` | Top of `StudentHome` | Teacher-speaking indicator, floor state, online count |
| `useParentPresence.ts` | Parent dashboard | Background presence + toasts |
| `getLiveConnection()` | singleton | One shared EliteLive across routes; `disconnectLive()` on logout |
| `liveEvents` | pub/sub | Decouples hub from UI (arena/raid/festival/reaction/floor/teacher-live) |

Dev note: `EliteLive` connects to `ws(s)://host/kids/live` — in local dev the
Vite server MUST proxy `/kids/live` (+ `/kids/chat`, `/kids/teams`, `/api`) to
the backend with `ws: true`, or every WebSocket silently fails (the #1 issue
found in the theory-vs-reality test session).

---

## 7. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Room capacity | 60 conns/room |
| NFR-02 | Payload size | ≤16 KB/frame |
| NFR-03 | Presence propagation | ≤1 s after join/leave |
| NFR-04 | PCM audio | 16 kHz mono Int16, ~128 ms chunks, 120 ms jitter lead |
| NFR-05 | Reconnect | Client auto-reconnect every 5 s until user leaves |
| NFR-06 | Idle speaker cleanup | Speaker released after 2 s silence |
| NFR-07 | Graceful degradation | No WebRTC/TURN → PCM relay still works; `ws` module missing → hub disabled with warning, REST unaffected |

---

## 8. Error Handling & Edge Cases

| Case | Behavior |
|------|----------|
| Invalid/expired JWT | Close 4001 before joining any room |
| Student without class | Close 4002 |
| Teacher without `?class=` | Close 4003 |
| Room full | Close 4004 |
| Parent phone unresolvable | Close 4005 |
| `kids_parent_links` missing (schema not deployed) | Catch, fall back to shared `parents`/`students` link |
| Missing `parent_id` columns in shared DB | Catch, presence limited to kids-owned links |
| Mic denied in browser | UI warning state; `startSpeaking()` returns false |
| Mic permission revoked mid-session | Track stop, keep connection |
| Network drop | Client `onclose` → status `error` → reconnect timer (5 s) |
| PCM chunk for a non-floored student | Server drops (no relay) |
| Malformed JSON control frame | Silently ignored |
| One broken subscriber in `liveEvents` | try/catch per listener — never breaks the hub loop |
| Chat table missing | `ensureSchema` creates it on demand |

---

## 9. Security & Privacy

1. **Auth:** every frame requires a valid HS256 JWT (`JWT_SECRET_KEY`), verified locally with `crypto.timingSafeEqual` signature comparison.
2. **Scoping:** a connection may only receive from rooms it joined; student floor grants only come from controllers in the same room; WebRTC answers route only to the pending offerer (no cross-room leak).
3. **Sanitization:** names sanitized (`First L.` format); no admission numbers beyond the child's own in the welcome; presence exposes `adm` (admission no) to co-members of the class/parent room — acceptable per existing roster UI, but see recommendation R-1.
4. **Parent chat ownership:** REST chat endpoints verify `kids_parent_links` before serving a child's messages (403 otherwise).
5. **Phone handling:** parent room keys use normalized `+234` phone; phones are never sent in protocol frames (only `adm`, `name`, `role`, `floor`).
6. **TURN credentials** (`TURN_USER`/`TURN_PASS`) are distributed inside `welcome.iceServers` to authenticated clients only, and only when `LIVE_WEBRTC=1`.

---

## 10. Test Plans

### 10.1 Protocol Tests (backend, ws client harness)

| ID | Test | Expected |
|----|------|----------|
| WS-T01 | Connect with bad token | close 4001 |
| WS-T02 | Teacher connect without class | close 4003 |
| WS-T03 | Teacher + student join same class | student receives `welcome` with `role:student`, presence shows both |
| WS-T04 | Teacher grants floor | student receives `you-floor:true`; presence shows `floor:true` |
| WS-T05 | Two floored students | second grant preempts first (server speaker guard) |
| WS-T06 | Student binary frame without floor | not relayed |
| WS-T07 | Teacher binary frame | relayed to all students |
| WS-T08 | Student with parent link joins | appears in parent's room presence |
| WS-T09 | Room at 60 conns | 61st closes 4004 |
| WS-T10 | WebRTC offer → answer → ICE | relayed to correct peers only |

### 10.2 Browser Tests (Playwright)

| ID | Test | Status |
|----|------|--------|
| BR-T01 | Vite dev proxy: WS connects on :34601 | ✅ FIXED (proxy added) |
| BR-T02 | TeacherLive class dropdown populated from `teacher_subjects` | ✅ FIXED |
| BR-T03 | Login persists `subjects` to `TEACHER_SUBJECTS` | ✅ FIXED |
| BR-T04 | "Try Another School" resets blocked school state | ✅ FIXED |
| BR-T05 | Backend boots despite missing `createdAt` columns | ✅ FIXED (7 models `timestamps:false` + resilient sync) |
| BR-T06 | Parent sees child online (needs linked parent+child rows) | ⚠️ BLOCKED locally (no test data) |
| BR-T07 | Mic broadcast (needs real mic) | ⚠️ Expected (headless denies) |

### 10.3 Companion Artifacts

- Theory vs reality report: `team-docs/reports/realtime-theory-vs-reality-2026-09-04.md`
- Earlier audit (Aug 2): `team-docs/reports/realtime-audit-2026-09-02.md`

---

## 11. Deployment & Dev Notes

1. **Prod:** nginx terminates TLS, proxies `/kids/live` etc. with `proxy_set_header Upgrade/Connection` + `proxy_read_timeout` — WSS flows through same-origin.
2. **Local dev:** `npm run dev` (root) starts API `:34600` + Vite `:34601`; Vite proxies WS per §6 dev note.
3. **WebRTC is opt-in:** set `LIVE_WEBRTC=1` + `TURN_URLS`/`TURN_USER`/`TURN_PASS`/`STUN_URLS` (coturn on `:3478` is already active per E4/Q18). Without it, PCM relay carries audio.
4. **DB:** no hub schema required for audio/presence (rooms are in-memory); chat uses `kids_chat_messages` (auto-created); parent linking uses existing `kids_parent_links` + shared `parents`/`students`.

---

## Recommendations (from test session)

- **R-1 (privacy hardening):** consider emitting a per-connection opaque `pid` instead of raw `adm` in `presence`/`floor` frames, mapping to admission numbers server-side only where an authorized consumer needs them.
- **R-2:** migrate `createScriptProcessor` (PCM capture) to `AudioWorkletNode` for future-proofing (flagged in Aug audit).
- **R-3:** add a heartbeat/ping-pong to drop dead connections faster (presence accuracy).
- **R-4:** seed local dev with a linked parent + student (via `kids_parent_links`) so FR-03/FR-04 browser tests are runnable locally.
- **R-5:** unit tests for `verifyJwt`, `normPhone`, and room preemption logic (pure functions extracted from the hub).

---

*SRS-RT-001 — real-time features. Companion to the 2026-09-04 theory-vs-reality test report.*