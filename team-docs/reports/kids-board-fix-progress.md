# KIDS BOARD FIX — progress (Buffy, 2026-09-03 late)

Brief (user): mobile play board scrollable/too much text → handle sequentially; "save goal not submitting"; "games no longer showing"; below-band games must read as REVIEW/REMEDIAL not current stage.

## REPRO (live, read-only probes)
- Kid = `DKG/1/0001` (Auwal Mustapha Usman, Pre Nursery, SCH/23) — 120 kids_progress rows, goal row (target 4, child, active).
- **No `kids_children` row for DKG/1/0001** — SMS-imported student (exists in elite_db.students, class 'Pre Nursery' → Creche band).
- `GET /kids/learning-path` → 403 `SUBSCRIPTION_REQUIRED` freemium gate (SCH/23 is not flagship, no kids_subscriptions row → freemium `daily_pick`). FE drops it silently → empty path + fake 0/1 goal.
- `POST /kids/goals/DKG%2F1%2F0001` → 200 (API fine). FE bug: saved goal kept only in `pathData.goal` (null when path 403'd) → card still shows 0/1 → reads as "save broken".
- Lessons list ceiling (`/kids/lessons`) also skipped when band unresolvable → imported kids see ALL bands (isolation leak).

## FIX PLAN
1. Backend: remove requireKidsEntitlement from learning-path (navigation read; game/scene content stays gated).
2. Backend: age-band fallback to elite_db.students row (class_name/class_code) when kids_children band unresolvable — path, goals (Creche detection), lessons ceiling.
3. FE GoalCard: self-owned goal state (direct GET when path goal absent; keep result after save; sync onUpdated).
4. FE i18n: below-band relation labels → Review / Mastered (EN + HA).
5. FE compact/sequential: ReviewZone one-line empty state; XPBar+StreakCounter collapsed behind stats-row tap.

## CHECKPOINTS
- 2026-09-03 Z: repro complete (above). Starting backend edits.
2026-09-03 22:00 TTS-EN: verified prior-session TTS-English decision fully landed (i18n store pins ttsLocale='en-NG', sound.ts speak() hardcodes lang='en' + EN-only voices, LanguageDemo speaks tEn(); 10/10 i18n tests pass). Fixed stale comment in OnboardingTour.tsx. No further TTS work needed.
2026-09-03 22:02 TTS-EN: removed unused tts field from LOCALES array (i18n/index.ts). tsc --noEmit clean, 117/117 frontend tests pass. UI audit: SpeechSettings (profile/speed/pitch/EN-only voice picker) and A11ySettings (visual toggles only) contain no TTS-language control — nothing implies TTS language is changeable. TTS-English work complete.
2026-09-03 22:07 TTS-EN sweep: grep across frontend/src for ha-NG/locale-based TTS lang — CLEAN. TTS lang sites: sound.ts speak() 'en' (pinned), SpeechGame rec.lang 'en-NG' + SpeechInput lang 'en-US' (speech RECOGNITION = microphone input, intentionally EN, unaffected by TTS decision), MediaLibrary 'en-US' fallback. Fixed stale header comment in i18n/index.ts (claimed sound.ts follows ttsLocale). tsc clean.
2026-09-03 22:08 IDLE:queue-empty — QUEUE.md has no QUEUED rows (Q1-Q23 all DONE/MERGED/VERIFIED; last row Q23 ParentDashboard fix pending deploy). Worker lane exhausted; awaiting MASTER dispatch. NOTE: working tree still holds uncommitted board-fix + TTS-EN changes (commit was ordered but interrupted; not pushed).
2026-09-03 22:15 COMMIT 3234a44 on main (NOT pushed): board-fix + TTS-EN, 23 files +697/-64. Verified: b3b-age-declaration 5/5, full backend 492/494 (2 garden failures PRE-EXISTING on clean main — stash test proved), FE tsc clean, vitest 117/117. Working tree clean. Awaiting MASTER push order.
2026-09-03 22:19 PUSH 8631e69 → origin/main (author+committer: ibagwai <ibagwai9@gmail.com>, amended per master order). Auto-deploy triggered (run-tests.sh → rebuild-frontend.sh → nginx). Deploy log: team-docs/reports/deploy-*.log
