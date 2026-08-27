# E4 Freebuff Deliverables — Live Class Voice

> C7 docs/QA/content only. No app code modified.
> Date: 2026-08-24

---

## 1. Phase 0 QA Checklist — Voice Notes

### 1.1 Happy-Path End-to-End

| # | Step | Assertion | Pass/Fail |
|---|---|---|---|
| 1 | Staff logs in → navigates to Voice Notes | 🎙️ Record button visible, disabled when no class selected | |
| 2 | Staff selects class → taps Record | MediaRecorder starts (browser prompts mic permission) | |
| 3 | Staff records ≤90 s audio → taps Stop | Waveform preview plays back; duration badge shows ≤90 s | |
| 4 | Staff taps Send | Loading spinner; POST /kids/voice-notes returns 200 with `{note_id, title, recipients}` | |
| 5 | Push notification fires to each subscribed kid | Each kid's device shows: `🎙️ Message from Teacher — {title}` with tag `voice-note` | |
| 6 | Kid taps push notification | Opens StudentHome; "Voice Notes from Teacher" card appears with unread badge | |
| 7 | Kid taps ▶️ on note | Audio streams (HTTP 206 Range); played_at timestamp written in kids_voice_notes_log | |
| 8 | Staff panel shows delivery status | "Delivered to 23 students, 18 played" (log query) | |

### 1.2 Negative / Edge Cases

| # | Scenario | Expected | Pass/Fail |
|---|---|---|---|
| 9 | Upload >2 MB | 400 "Audio file must be ≤2 MB" | |
| 10 | Upload >90 s duration | 400 "Recording must be ≤90 seconds" | |
| 11 | Wrong mime type (e.g. .txt uploaded as audio) | 400 "Invalid audio format — please record a voice note" (magic-byte sniff) | |
| 12 | Student tries GET /kids/voice-notes/:id/audio (own class) | 200 streams audio | |
| 13 | Student tries GET /kids/voice-notes/:id/audio (different class in same school) | 403 or 404 | |
| 14 | Student from different school tries audio endpoint | 403 or 404 | |
| 15 | Unauthenticated GET /kids/voice-notes/:id/audio | 401 | |
| 16 | Staff sends note with no class selected (school-wide) | 200; push goes to ALL school's subscribed kids | |
| 17 | Kid has no push subscription | Note still created; delivery log shows "undelivered" | |
| 18 | Staff records exactly 90 s | 200 (boundary — accepted) | |
| 19 | Staff records 91 s | 400 (boundary — rejected) | |

### 1.3 Offline / Reconnection

| # | Scenario | Expected | Pass/Fail |
|---|---|---|---|
| 20 | Kid is offline when push fires | Push queued by browser; on reconnect kid sees notification | |
| 21 | Kid opens app while offline | "Voice Notes" card shows cached list; audio playback deferred until online | |
| 22 | Kid reconnects → taps play | Audio streams normally; played_at written | |
| 23 | Kid was offline, teacher deletes note before kid plays | Card disappears on next fetch; no stale playback | |

### 1.4 Delivery Log Integrity

| # | Scenario | Expected | Pass/Fail |
|---|---|---|---|
| 24 | After send, count rows in kids_voice_notes_log | Row count = number of students in class | |
| 25 | Same kid opens same note twice | played_at set on first open only (UNIQUE constraint prevents dup) | |
| 26 | Staff re-sends same note | New note row; new log rows (not merged with previous) | |

### 1.5 Phase 0 Gate Checks

| # | Gate | Evidence | Pass/Fail |
|---|---|---|---|
| 27 | Jest green vs baseline (zero NEW failures) | CI run log or local jest output | |
| 28 | Unauth audio fetch blocked | Test case #12-15 above | |
| 29 | >90 s upload rejected 400 | Test case #10, #19 | |
| 30 | Push fires once per note | Test case #5 + log check (no duplicates) | |
| 31 | Report written at team-docs/reports/e4-report.md | File exists | |

---

## 2. Teacher Guide — "Talking to Your Class from Home"

### What Are Voice Notes?

Voice Notes let you send short audio messages (up to 90 seconds) to your class. When you record and send a voice note, every student in the class receives a push notification on their device. They tap to listen — even if they're at home, in the market, or on the bus.

### How to Record a Voice Note

1. Open the EliteKids Staff Panel on your phone or laptop.
2. Select the class you want to speak to.
3. Tap the 🎙️ **Record** button.
4. Speak clearly — greet the class, explain today's homework, or give encouragement.
5. Tap **Stop** when done. You can preview before sending.
6. Tap **Send**. Done — your students will hear your voice within seconds.

### Tips for Great Voice Notes

- **Keep it short and warm.** 30–60 seconds is the sweet spot. Kids stay focused longer with brief messages.
- **Speak slowly and clearly.** Especially for younger children (Crèche, Nursery).
- **Use the student's names when possible.** "Hello Amara, Chidi, and the whole Primary 2 class!"
- **Record in a quiet space.** Background noise makes it hard for kids to hear.
- **Replay your own note** before sending to make sure it sounds right.

### When to Use Voice Notes

- **Morning greetings** — "Good morning, class! Today we're learning about animals."
- **Homework reminders** — "Don't forget to practice your letter sounds tonight!"
- **Encouragement** — "You all did amazing on yesterday's quiz. Keep it up!"
- **Weekend check-ins** — "Enjoy your weekend! Try to read one story before Monday."
- **Absent students** — "Amara, we missed you today! Here's what we covered…"

### Live Voice Rules (Phase 1 — When Available)

When Live Voice is turned on, you can broadcast to your class in real time:

- **Your voice goes out live** to every connected student in the class.
- Students can raise their hand (✋) to speak — you see a notification and can unmute them.
- **You control everything:** mute all, mute one, or remove someone from the live session.
- **No recording** — live sessions are private and not saved. What's said stays in the moment.
- Only unmute a child when their parent has consented (check your school's consent list).

### Etiquette

- Always greet the class before diving into content.
- Pause after asking a question — give kids time to think (or raise a hand in live mode).
- Never scold or single out a child publicly. Use private messages for discipline.
- End every session with encouragement: "Well done, everyone! See you tomorrow."

### 🔐 Consent & Privacy

> **Parental Consent Notice**
>
> Voice Notes and Live Voice are tools for teachers to communicate with students as part of learning activities at EliteKids. When you send a voice note, it is delivered to your class only and streamed through our secure servers — audio files are never publicly accessible.
>
> In Live Voice mode, your voice is broadcast in real time to the teacher and classmates in your class. Live sessions are **never recorded**. Your child's name may be spoken by the teacher during a session.
>
> By enrolling your child at an EliteKids school, you acknowledge that the school may use voice-based communication features as part of normal classroom instruction. If you have concerns, please speak with your school administrator.
>
> Your child's full name, admission number, or photo is **never shared** over voice features — only their first name and last initial (e.g. "Amara K.").

---

## 3. Copy Pass — Notifications, Empty-States, Consent

### 3.1 Push Notification Copy

| Context | Title | Body |
|---|---|---|
| Voice note sent (kid's device) | 🎙️ Message from Teacher | {teacher_first_name}: "{note_title}" |
| Voice note sent (school-wide, no class) | 🎙️ Message from Your Teacher | New voice message from {teacher_first_name} for everyone |
| Voice note from principal | 🎙️ Announcement from Principal | {note_title} |
| Voice note expiring (7-day TTL warning) | 🎙️ Voice note expiring soon | "Note_title" will be removed in 3 days. Listen now! |

### 3.2 Empty-State Copy

| Screen | Copy | Subtext |
|---|---|---|
| Student Home — no voice notes | 🎙️ No voice notes yet | Your teacher hasn't sent a message yet. Check back soon! |
| Student Home — all played | ✅ All caught up! | You've listened to all your teacher's messages. |
| Staff Panel — no class selected | Select a class to send a voice note | Choose the class you'd like to speak to from the dropdown above. |
| Staff Panel — no notes sent | 🎙️ Send your first voice note | Record a quick message — your students will love hearing from you! |
| Staff Panel — no playback data | Waiting for students to listen… | Playback data will appear here once students hear your note. |

### 3.3 Consent Paragraph (for school onboarding / parent info sheet)

> **🔐 Voice Features & Your Child's Privacy**
>
> EliteKids offers voice-based communication tools that allow teachers to send short audio messages to their class. These messages are:
>
> - **Delivered only to students in the class** — never publicly accessible.
> - **Streamed through encrypted servers** — audio files are not stored in public folders.
> - **Automatically expire after 7 days** unless the teacher re-sends them.
>
> In Live Voice mode (where available), a teacher may broadcast their voice in real time to the class. **Live sessions are never recorded.** Your child may be invited to speak (with your permission) — their full name is never displayed to other students; only their first name and last initial (e.g. "Chidi N.") is used.
>
> By enrolling your child at an EliteKids partner school, you consent to the use of these voice-based learning tools as part of classroom instruction. You may opt out by contacting your school administrator.
>
> **Your child's admission number, full name, and photo are never transmitted through voice features.**

### 3.4 Error Copy

| Error | User-facing message |
|---|---|
| File too large (>2 MB) | Audio file is too large. Please keep it under 2 MB (about 60 seconds). |
| Duration too long (>90 s) | Recording is too long. Please keep voice notes under 90 seconds. |
| Invalid format | Invalid audio format. Please use your device's microphone to record a voice note. |
| Network error on send | Couldn't send your voice note. Check your connection and try again. |
| Audio playback failed | Couldn't play this voice note. Try again or check your connection. |
| No mic permission | Microphone access is needed to record. Please allow microphone access in your browser settings. |

---

*E4 Freebuff deliverables — C7 docs/QA/content only. No app code modified.*
