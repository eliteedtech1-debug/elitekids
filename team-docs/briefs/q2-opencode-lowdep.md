# Q2 low-dependency leaf tasks — opencode (Q25 + Q26)

**Purpose:** Bring opencode onto Q2 with ZERO cross-lane blocking. Both tasks consume
already-live surface only — no waiting on the speech engine bridge (Q24), the drawing
recognition engine (Q2-C), or the portfolio lane. Self-dispatch in order (Q25 → Q26).

**Context:** Q2 speech slices 1–2 on main (`c4d3749`, `8989ebc`). Live endpoints:
- `POST /kids/speech/assess` — body `{ expected_text, transcript, mode, duration_ms, template }` → `{ overall, passed, band, message, word_accuracy, letter_accuracy, fluency }`
- `GET  /kids/speech/progress` — per-child progress rows (see `backend/src/controllers/kidsSpeech.js`)
- i18n: `frontend/src/lib/i18n/en.ts` + `locales/en.json` + `locales/ha.json` (all new keys must land in all three + `i18n.test.ts` coverage pattern)
- Existing voice practice UI to mirror: `frontend/src/components/SpeechGame.tsx`, `frontend/src/pages/Student/SpeechPractice.tsx` (route `/student/speech?mode=letter|word|sentence`)

---

## Q25 — Pronunciation Coach + ReadingTracker components (speech FE leaf)

**Goal:** Complete Q2-F (SpeechGame ✓ already; Pronunciation Coach + ReadingTracker missing).

- `frontend/src/components/PronunciationCoach.tsx` — per-item coach: shows a target word/phrase,
  kid attempts (mic via the SAME Web Speech pattern as SpeechGame — reuse `getRecognition()`
  pattern or extract it), POSTs to `/kids/speech/assess`, then renders banded feedback
  (word_accuracy / letter_accuracy / fluency) + "try again" vs "great" UX. Child-safe copy, big buttons.
- `frontend/src/components/ReadingTracker.tsx` — read-a-thon tracker: kid reads N sentences
  (letter/word/sentence packs), each graded via `/kids/speech/assess`; show per-item pass chips +
  total minutes read today + simple streak spark. Reads from `GET /kids/speech/progress` for the today-rollup.
- Wire both onto the student surface (`frontend/src/pages/Student/StudentHome.tsx` header or the
  SpeechPractice page as sub-tabs — pick the less intrusive; StudentHome header is already dense).
- i18n EN + HA, ~15–20 keys each. Vitest for any pure helpers (pack builders, accuracy→band mapping).

**Rules:**
- NO backend edits. If you need a response field that isn't returned, stop and note it — don't invent an endpoint.
- Do NOT modify `SpeechGame.tsx` semantics (Q24 owns its embedded-mode change; rebase after it merges if needed).
- Follow SpeechPractice's route/guard pattern; keep `en-NG` mic + typed fallback (low-end device path).

## Q26 — Drawing FE components (Q2-G, canvas leaf)

**Goal:** `DrawingCanvas`, `TracingGuide`, `DrawingFeedback` components — build them NOW so the
drawing lane (Q2-C/D) only adds recognition later. Pure browser Canvas 2D, zero backend, zero ML.

- `frontend/src/components/DrawingCanvas.tsx` — drawing surface (pointer events, stroke width/color,
  clear/undo, resize-safe; keep <canvas> sized by its container, DPR-aware). Props: `onStroke`, `disabled`.
- `frontend/src/components/TracingGuide.tsx` — overlay guide: trace letter/number/shape outlines
  (sample paths from a small built-in set: A–Z simple paths optional — start with a few shapes +
  digits 0–9), kid draws over the ghost line, proximity check = stroke-on-path % (pure geometry).
- `frontend/src/components/DrawingFeedback.tsx` — compare kid's strokes vs target (bounding-box
  IoU / stroke distance heuristic, deterministic, no ML) → star band 1–3 + emoji feedback + "try again".
- Put a demo/dev harness page under `/student/drawing?mode=demo` (canary template NOT required yet —
  teacher templates land with Q2-D). i18n EN + HA.
- Tests: pure helpers (path proximity, IoU) as vitest unit tests; component smoke via tsc.

**Rules:**
- NO TensorFlow.js, NO backend calls, NO new tables. Recognition engine + `/kids/drawing/*`
  endpoints are a separate later slice (Q2-C) — build components against a **local** result model.
- Keep every helper pure and exported so Q2-C can reuse scoring inputs later.

---

## Out of scope (do not touch)
- `frontend/src/pages/Student/GamePlay.tsx` engine bridge (Q24, Buffy).
- Speech/story/count template registration + enum migration (Q27 — hold until Q24 MERGED).
- Drawing recognition engine / endpoints (Q2-C/D later).
- Backend, DB, .env, deployment.

## Verify before reporting DONE
- `cd frontend && npx tsc --noEmit` clean · `npx vitest run` green (117 baseline + your new tests)
- i18n zero raw-key leaks (grep the keys you added in en/ha)
- Update your QUEUE rows to DONE + append final status line to `team-docs/reports/<your>-progress.md`.
