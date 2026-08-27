# E4 Brief — Live Class Voice (teacher ↔ remote students)

Context: EliteKids platform (/var/www/html/elite-kids; React/Vite frontend, Express backend :8484 behind nginx at https://elitekids.com.ng). Goal: when students are OFF school premises, teachers can speak to the whole class live — 1-way broadcast by default; teacher can unmute an individual child in real time for 2-way. Two phases; ship Phase 0 fast on rails that already exist (E3f-PUSH web-push infra: controllers/e3fPush.js, kids_push_subscriptions).
Execution: autonomous agent works STEPS in order on the VPS; after every STEP append `[CHECKPOINT HH:MMZ] <done>` to `team-docs/reports/e4-progress.md`.

## PHASE 0 — Async Voice Notes (no realtime deps)

1. **STEP 1 — Schema + storage.**
   Additive DDL in `elite_content` (CREATE IF NOT EXISTS pattern like E3f-PUSH):
   `kids_voice_notes` (id PK, school_id, class_code VARCHAR(20) NULL, staff_user_id, audio_path VARCHAR(255), duration_s SMALLINT, title VARCHAR(120), created_at) and
   `kids_voice_notes_log` (note_id FK-ish, child_admission_no, delivered_at, played_at NULL, UNIQUE(note_id, child_admission_no)).
   Audio files land in a non-web-root spool served through an auth-gated streaming route (NEVER public static). Cap duration ≤90s server-side.
   CHECKPOINT appended.

2. **STEP 2 — Staff record endpoint.**
   POST /kids/voice-notes (requireStaff): accepts webm/opus upload (multer memory storage, magic-byte sniff, ≤2MB), stores file, inserts row, then reuses E3f-PUSH send pipeline to blast `{title:"🎙️ Message from Teacher", body:title, url:'/student', tag:'voice-note'}` to subscribed kids of that class/school. Delivery logged.
   GET /kids/voice-notes/:id/audio (auth student, class-scoped guard) streams bytes w/ Range support; marks played_at on first byte.
   CHECKPOINT appended.

3. **STEP 3 — Frontends.**
   Staff panel: 🎙️ record button (MediaRecorder, opus), preview, send-to-class. StudentHome: "Voice Notes from Teacher" card listing unread notes w/ ▶️ playback (tap = user gesture, satisfies autoplay policy).
   tsc clean; vite build rc=0.
   CHECKPOINT appended.

4. **STEP 4 — Tests + smoke.**
   Jest: upload validation (bad mime rejected), authz (student outside class → 403/404), delivery log rows created. Extend phone-smoke harness pattern if cheap. Report → `team-docs/reports/e4-report.md`.
   CHECKPOINT appended.

## PHASE 1 — Realtime Broadcast WebRTC (start ONLY after supervisor go)

5. **STEP 5 — Socket layer.**
   socket.io on elite-kids :8484 (same HTTP server); nginx location /socket.io w/ upgrade headers. JWT-auth handshake (reuse passport secret). Rooms: `school:{id}`, `class:{code}`. Presence map in RAM. Env gate LIVE_VOICE=off by default.

6. **STEP 6 — Signaling + topology.**
   TOPOLOGY (cheap by design): teacher publishes ONE Opus-mono ~32kbps stream → all joined kids subscribe. Child taps ✋ → teacher panel shows hands → grant mic → THAT child publishes; teacher subscribes (spotlight optional: whole class subscribes to child stream too). Revoke = stop tracks.
   Moderation: teacher-only controls mute-all / mute-one / remove. No recording (privacy default). Parental-consent note added to docs.
   CHECKPOINT appended.

7. **STEP 7 — TURN + smoke.**
   coturn install is ROOT-ACTIONS-REQUIRED (human-only): ports 3478/5349 + UDP relay range. Until then document "works on non-CGNAT only". Smoke: 2 headless browsers (teacher+kid) exchange audio via loopback; hand-raise→grant→audio flows; revoke mutes. Evidence screenshots + report append.

## FREEBUFF TASKS (C7 — docs/QA/content ONLY, never app code)
- QA checklist for Phase 0 (record→send→push arrives→plays; offline kid gets note on next login).
- Teacher guide doc: "Talking to your class from home" (voice notes + live rules, etiquette, consent blurb).
- Copy pass: notification titles/bodies, empty-states, 🔐 consent paragraph.

## GATES
- Phase 0: jest green vs baseline (zero NEW failures); unauth audio fetch blocked; >90s upload rejected 400; push fires once per note; report written.
- Phase 1: LIVE_VOICE off = zero sockets listening; smoke transcript shows grant/revoke cycle; no admission_no ever emitted over sockets (first-name+last-initial only).

## RULES
- Work only under /var/www/html/elite-kids (+ /etc/nginx only for the socket.io location block, backup first).
- Never print secrets/tokens/.env values. No git commit/push. Additive-only schema.
- If any gate fails twice, STOP → `team-docs/reports/e4-obstacles.md`.
