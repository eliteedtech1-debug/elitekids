# Q2 slice 2 — SpeechGame client + template registration (live-verified)

**Date:** 2026-09-03 (evening) · **Author:** Buffy (worker) · **Roadmap:** §2.5 Q2-A/B/F + GameCreator templates
**Commit:** `8989ebc` (pushed, auto-deployed) · Builds on slice 1: `c4d3749` (analyzer + endpoints + table)

## What landed

| Piece | File(s) | Notes |
|---|---|---|
| `SpeechGame` component | `frontend/src/components/SpeechGame.tsx` (new) | Web Speech API mic capture (`en-NG`, single-shot) → transcript POSTed to `/kids/speech/assess`; **typed fallback** (roadmap low-end-device path: unsupported browsers, mic-blocked, `not-allowed`); result card (score %, band message, pass/fail); per-item progress; cleanup on unmount |
| Speech practice page | `frontend/src/pages/Student/SpeechPractice.tsx` (new) + `App.tsx` route | Guarded `/student/speech?mode=letter|word|sentence`; starter packs until the game engine passes real lesson items |
| Header entry | `StudentHome.tsx` | 🎤 Speak button (desktop label + mobile icon) → `/student/speech` |
| Template registration | `backend/src/controllers/kids.js` (`VALID_TEMPLATES`), `backend/database/fix-template-enum.js`, `GameCreator.tsx` | `speech-letter` / `speech-word` / `speech-sentence` accepted end-to-end; teacher can now create speech games with expected_text prompts; enum script stays idempotent |
| i18n | `en.ts`, `en.json`, `ha.json` | 15 `speech.*` keys + `student.home.speak/speakDesc` (EN + HA); verified zero raw-key leaks in browser |
| Tests | — | slice-1 suite still green: `q2-speech.test.js` 11/11 |

## Bugs found and fixed during live verification

1. **`kidsSpeech.js` 500 on prod** — lazy require pointed at `../src/models` instead of `../models` (worked in jest unit tests because the analyzer is pure and the DB path was never exercised). Live browser E2E caught it via `SP_SERVER_ERROR`; fixed and redeployed in the same commit.
2. (Test-infra, documented) Targeted `scripts/run-tests.sh <file>` passthrough lacks `--forceExit`, so DB-backed suites hang on open handles; use `--forceExit` for targeted runs (full-suite branch already passes it).

## Live E2E proof (real browser, real student session)

Minted a Demo2 student token server-side (claims mirrored on `generateLoginToken`: `admission_no`, `school_id`, `user_type: 'student'` — note the strategy reads `user_type`, NOT `type`), drove `https://elitekids.com.ng/student/speech?mode=word` at 390×844:

- Prompt card renders "book"; no i18n key leaks
- Typed-fallback submit → **`POST /kids/speech/assess` → 200** with `{overall: 100, passed: true, band: "amazing", word_matches:[{expected:"book",heard:"book",similarity:1,hit:true}]}` (perfect transcript; mic capture itself needs a human — the typed path exercises the identical endpoint/payload)
- Result card + "Next one!" button render; **zero console errors**
- **DB write confirmed:** `elite_content.kids_speech_logs` 0 → 1 row (attempt logged for progress/portfolio)

## Gates

- Backend (`scripts/run-tests.sh`): **487P/2F** — the 2 are the documented garden-companion baseline; `kids-routes` full-run failure was order-dependent flake (passes isolated and in rerun)
- Frontend: tsc clean · vitest **117/117** · build OK · JSON dictionaries parse
- Deploy: API active, `/health` 200, dist rebuilt, fixed bundle served

## Ops notes for the next worker

- Test DB convention (user-confirmed): same creds as live; DB name = live name + `_test` suffix (`scripts/run-tests.sh` maps `DB_USERNAME/DB_PASSWORD` → `TEST_DB_*` automatically; `elite_kids_test` default already matches `elite_db` + `_test` naming pattern)
- Deploy pipeline prunes backend devDeps — restore with `npm install` (never `npm ci` under the live API) before running jest
- Next Q2 steps: drawing slice (C/D/G), then portfolio (E) consuming `kids_speech_logs`
