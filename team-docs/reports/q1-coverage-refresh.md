# NGEd-game 2027 — Q1 Coverage Refresh (post-session)

**Date:** 2026-09-03 (late) · **Author:** Buffy (worker) · **Supersedes the % numbers in** `ngeg-2027-overview-and-gap-plan-request.md` (validated same day, see `q1-bridge-validation-buffy.md`)
**Base:** `origin/main` @ `2792d25` · All numbers re-verified live this session.

---

## Headline

- **Overall program (Q1–Q4 2027): ~25%** (~17.5 of 71 roadmap weeks; Q1 essentially done, Q2 speech lane in progress)
- **Q1 2027 "The Brain": ~97% — DEPLOYED LIVE** on :8484 (was ~92% at the original overview)
- **Q2 2027 "The Voice": ~10–15% — speech lane (Q2-A/B/F) started** (slices 1–2 on main: `c4d3749` + `8989ebc`, live-verified `2838e59`); drawing (Q2-C/D/G) + portfolio (Q2-E) at 0%. Q3 + Q4: 0% (effort per roadmap: 21 + 15 + 20 weeks)

## Q1 gap board — moved this session

| Gap | Status at overview | Now |
|---|---|---|
| G1 v1-engine removal | marked DEFERRED (stale) | ✅ CLOSED (was `7234975`; verified in validation) |
| G2 streak localStorage migration | NO-OP verdict | ✅ CLOSED as NO-OP (single key verified) |
| G3 A17 contract gap-fill | CLOSED | ✅ stays closed |
| G4 LEVELS FE/BE mismatch | open XS | ✅ **CLOSED** (`0487f33`) — 14-entry parity + levelFromXp max-level bug fixed |
| G5 garden decoration rendering | open S | ✅ **CLOSED** (`0487f33`) — equipped decorations render in GardenScene |
| G7 Elite EduTech logo artwork | open XS | ⬜ BLOCKED on asset owner (no artwork file exists in repo) |
| G8 PAT in origin URL | open XS (ROOT) | ⬜ still open — ROOT revoke |
| G6 real-browser live-smoke (G-W2) | open M (QA) | ◐ informally covered (playwright verified goal/scenes/streak on live) — formal staff-account sign-off pending |

Bonus fixes shipped beyond the gap board: goal-submit scrim swallow (`3c4b2ba`), mobile picker below-the-fold (`5360ed9`), streak recording repointed to the real economy route — streaks now persist server-side (`bd7f3d8`, end-to-end DB-verified), new-student goal gating (`9a9270e`, Isa), streak banner + emotional copy EN/HA (`e99f699`, `34df723`).

## Q1 gates (re-verified this session)

- Backend full suite **476P/2F** (2 = garden-companion C-DEBT-01/02 documented baseline; pass standalone — flake only in-suite)
- Q1 sweep **94/94** · unified-login 11/11
- Frontend tsc clean · vitest **117/117** · build OK
- Auto-deploy verified live after every push (API active, /health 200, served bundle = local build)

## Unchanged cross-cutting coverage

- **Architecture:** single Express monolith; 0/7 target services; DB pool still 4
- **Tables:** **5/16** Q2+ tables done (kids_adaptive_state, kids_economy, kids_shop_items, kids_purchases + **kids_speech_logs** — inline CREATE in `kidsSpeech.js:21`); drawing/portfolio/collab tables not started
- **NERDC content:** ~30% vs 95% target
- **Performance targets:** unmeasured · **Monetization tiers:** unbuilt

## Q2 kickoff (per user order, this session)

Sequence per roadmap: **speech (Q2-A/B/F) → drawing (Q2-C/D/G) → portfolio (Q2-E)**. Dependencies on Q1 all satisfied: economy XP hooks live (and streak recording now genuinely persists), ADE per-lesson BKT in place for the portfolio skill map, SRE card scheduling as the template for speech/drawing items.

**Q2 speech slices 1–2 LANDED after this board was written** (see `q2-speech-slice2-live-verified.md`, live-verified on prod):
- `c4d3749` — slice 1: `speechAnalyzer.js` (wordSimilarity scoring + feedback bands), `POST /kids/speech/assess` + `GET /kids/speech/progress`, `kids_speech_logs` table, `q2-speech.test.js` 11/11.
- `8989ebc` — slice 2: `SpeechGame` component (Web Speech mic `en-NG` + typed fallback), `/student/speech` practice page, StudentHome 🎤 entry, `speech-letter/word/sentence` template registration (teacher-created speech games), 15 speech i18n keys EN + HA. Whisper API fallback wired but disabled unless `SPEECH_WHISPER_KEY` set.

Remaining speech lane: speech-story/count templates, Pronunciation Coach, ReadingTracker, in-engine 5-template assessment loop — then drawing (§2.6) + portfolio (§2.7).

---
*Next worker: update the gap table above as G6/G7/G8 close.*
